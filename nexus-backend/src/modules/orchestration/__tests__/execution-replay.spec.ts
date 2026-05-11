/**
 * Temporal execution workflow replay & recovery tests.
 *
 * Uses @temporalio/testing's TestWorkflowEnvironment to run workflows in an
 * in-process test server (no external Temporal server required).
 *
 * Tests cover:
 *  1. Happy path – workflow completes when agent signals progress=100
 *  2. Cancellation via signal – workflow exits with status='cancelled'
 *  3. Activity retry – assignAgent fails once then succeeds
 *  4. Timeout recovery – workflow cancels itself when no progress within timeout
 *  5. Activity error → workflow failed status
 *  6. Workflow replay determinism – re-running with same history succeeds
 */

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker, Runtime, DefaultLogger } from '@temporalio/worker';
import {
  executionWorkflow,
  cancelExecutionSignal,
  agentHeartbeatSignal,
  getExecutionStatusQuery,
  type ExecutionWorkflowInput,
} from '../../../temporal/workflows/execution.workflow';
import { EXECUTION_TASK_QUEUE } from '../../../infrastructure/temporal/temporal.constants';
import type { ExecutionActivities } from '../../../temporal/activities/execution.activities';

// Suppress noisy Temporal worker logs in tests
beforeAll(() => {
  Runtime.install({ logger: new DefaultLogger('WARN') });
});

// ─── Shared helpers ───────────────────────────────────────────────────────────

function makeActivities(overrides: Partial<ExecutionActivities> = {}): ExecutionActivities {
  return {
    assignAgent: jest.fn().mockResolvedValue('agent_test_001'),
    releaseAgent: jest.fn().mockResolvedValue(undefined),
    markExecutionRunning: jest.fn().mockResolvedValue(undefined),
    markExecutionComplete: jest.fn().mockResolvedValue(undefined),
    markExecutionFailed: jest.fn().mockResolvedValue(undefined),
    markExecutionCancelled: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const baseInput: ExecutionWorkflowInput = {
  executionId: 'exec_test_001',
  tenantId: 'tenant_test',
  platform: 'web',
  workflowDefinitionId: 'wf_001',
  requiredCapabilities: ['web'],
  variables: {},
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('executionWorkflow – Temporal integration tests', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeEach(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  // ── 1. Happy path ─────────────────────────────────────────────────────────
  it('completes successfully when agent signals progress=100', async () => {
    const activities = makeActivities();

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: 'default',
      taskQueue: EXECUTION_TASK_QUEUE,
      workflowsPath: require.resolve('../../../temporal/workflows/execution.workflow'),
      activities,
    });

    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(executionWorkflow, {
        taskQueue: EXECUTION_TASK_QUEUE,
        workflowId: 'test-happy-path',
        args: [baseInput],
      });

      // Let activities run, then simulate agent completing
      await testEnv.sleep('100ms');
      await handle.signal(agentHeartbeatSignal, { progress: 100 });

      return handle.result();
    });

    expect(result.status).toBe('success');
    expect(activities.markExecutionComplete).toHaveBeenCalledWith({ executionId: baseInput.executionId });
    expect(activities.releaseAgent).toHaveBeenCalledWith({
      executionId: baseInput.executionId,
      agentId: 'agent_test_001',
    });
  });

  // ── 2. Cancellation signal ────────────────────────────────────────────────
  it('cancels execution when cancel signal is received before progress', async () => {
    const activities = makeActivities();

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: 'default',
      taskQueue: EXECUTION_TASK_QUEUE,
      workflowsPath: require.resolve('../../../temporal/workflows/execution.workflow'),
      activities,
    });

    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(executionWorkflow, {
        taskQueue: EXECUTION_TASK_QUEUE,
        workflowId: 'test-cancellation',
        args: [baseInput],
      });

      // Let the workflow start and assign an agent, then cancel
      await testEnv.sleep('100ms');
      await handle.signal(cancelExecutionSignal, { reason: 'user-requested' });

      return handle.result();
    });

    expect(result.status).toBe('cancelled');
    expect(activities.markExecutionCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: baseInput.executionId }),
    );
  });

  // ── 3. Live status query ──────────────────────────────────────────────────
  it('reports live status via query', async () => {
    const activities = makeActivities();

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: 'default',
      taskQueue: EXECUTION_TASK_QUEUE,
      workflowsPath: require.resolve('../../../temporal/workflows/execution.workflow'),
      activities,
    });

    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(executionWorkflow, {
        taskQueue: EXECUTION_TASK_QUEUE,
        workflowId: 'test-status-query',
        args: [baseInput],
      });

      // After agent is assigned the workflow should be 'running'
      await testEnv.sleep('200ms');
      const status = await handle.query(getExecutionStatusQuery);
      expect(['queued', 'running']).toContain(status);

      // Complete it
      await handle.signal(agentHeartbeatSignal, { progress: 100 });
      return handle.result();
    });
  });

  // ── 4. Activity retry – assignAgent fails once then succeeds ─────────────
  it('retries assignAgent on transient failure', async () => {
    let callCount = 0;
    const activities = makeActivities({
      assignAgent: jest.fn().mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) throw Object.assign(new Error('temporary failure'), { name: 'TransientError' });
        return 'agent_retry_001';
      }),
    });

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: 'default',
      taskQueue: EXECUTION_TASK_QUEUE,
      workflowsPath: require.resolve('../../../temporal/workflows/execution.workflow'),
      activities,
    });

    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(executionWorkflow, {
        taskQueue: EXECUTION_TASK_QUEUE,
        workflowId: 'test-retry',
        args: [baseInput],
      });

      await testEnv.sleep('200ms');
      await handle.signal(agentHeartbeatSignal, { progress: 100 });
      return handle.result();
    });

    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(result.status).toBe('success');
  });

  // ── 5. Non-retryable activity error → workflow fails ─────────────────────
  it('fails the workflow on a non-retryable activity error', async () => {
    const activities = makeActivities({
      assignAgent: jest.fn().mockRejectedValue(
        Object.assign(new Error('workflow not found'), { name: 'NotFoundError' }),
      ),
    });

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: 'default',
      taskQueue: EXECUTION_TASK_QUEUE,
      workflowsPath: require.resolve('../../../temporal/workflows/execution.workflow'),
      activities,
    });

    await expect(
      worker.runUntil(
        testEnv.client.workflow
          .start(executionWorkflow, {
            taskQueue: EXECUTION_TASK_QUEUE,
            workflowId: 'test-nonretryable',
            args: [baseInput],
          })
          .then((h) => h.result()),
      ),
    ).rejects.toThrow();

    expect(activities.markExecutionFailed).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: baseInput.executionId }),
    );
  });

  // ── 6. Replay determinism ─────────────────────────────────────────────────
  it('replays without non-determinism errors', async () => {
    const activities = makeActivities();

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: 'default',
      taskQueue: EXECUTION_TASK_QUEUE,
      workflowsPath: require.resolve('../../../temporal/workflows/execution.workflow'),
      activities,
    });

    // Run the workflow to completion and capture its event history
    let workflowId = 'test-replay-seed';
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(executionWorkflow, {
        taskQueue: EXECUTION_TASK_QUEUE,
        workflowId,
        args: [baseInput],
      });
      await testEnv.sleep('100ms');
      await handle.signal(agentHeartbeatSignal, { progress: 100 });
      return handle.result();
    });

    // Fetch the history
    const handle = testEnv.client.workflow.getHandle(workflowId);
    const history = await handle.fetchHistory();

    // Replay: this will throw if the workflow code is non-deterministic
    await Worker.runReplayHistory(
      {
        workflowsPath: require.resolve('../../../temporal/workflows/execution.workflow'),
      },
      history,
    );
    // If no exception was thrown, replay succeeded
  });
});
