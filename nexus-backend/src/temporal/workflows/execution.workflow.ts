/**
 * Temporal execution workflow.
 *
 * This file MUST remain pure Temporal workflow code:
 * - No Node.js built-ins that perform I/O (fs, net, http, …)
 * - No NestJS / Express imports
 * - Non-deterministic operations must go through activity proxies
 */
import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  log,
  CancelledFailure,
  isCancellation,
} from '@temporalio/workflow';
import type { ExecutionActivities } from '../activities/execution.activities';
import type { ExecutionStatus } from '../../contracts/execution-contracts';

// ─── Signals ────────────────────────────────────────────────────────────────

export const cancelExecutionSignal = defineSignal<[{ reason?: string }]>(
  'cancelExecution',
);

export const agentHeartbeatSignal = defineSignal<[{ progress?: number }]>(
  'agentHeartbeat',
);

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getExecutionStatusQuery = defineQuery<ExecutionStatus>(
  'getExecutionStatus',
);

// ─── I/O contract ────────────────────────────────────────────────────────────

export interface ExecutionWorkflowInput {
  executionId: string;
  tenantId: string;
  platform: string;
  workflowDefinitionId: string;
  requiredCapabilities: string[];
  variables: Record<string, unknown>;
}

export interface ExecutionWorkflowResult {
  executionId: string;
  status: ExecutionStatus;
  agentId?: string;
  completedAt: string;
}

// ─── Activity proxy ──────────────────────────────────────────────────────────

const {
  assignAgent,
  releaseAgent,
  markExecutionRunning,
  markExecutionComplete,
  markExecutionFailed,
  markExecutionCancelled,
} = proxyActivities<ExecutionActivities>({
  startToCloseTimeout: '10 minutes',
  scheduleToCloseTimeout: '1 hour',
  retry: {
    initialInterval: '1s',
    maximumInterval: '30s',
    backoffCoefficient: 2,
    maximumAttempts: 5,
    nonRetryableErrorTypes: ['NotFoundError', 'ValidationError'],
  },
});

// ─── Workflow ─────────────────────────────────────────────────────────────────

export async function executionWorkflow(
  input: ExecutionWorkflowInput,
): Promise<ExecutionWorkflowResult> {
  let status: ExecutionStatus = 'queued';
  let cancelRequested = false;
  let cancelReason: string | undefined;
  let heartbeatProgress = 0;

  setHandler(cancelExecutionSignal, ({ reason } = {}) => {
    cancelRequested = true;
    cancelReason = reason;
    log.info('Cancellation signal received', { executionId: input.executionId, reason });
  });

  setHandler(agentHeartbeatSignal, ({ progress = 0 } = {}) => {
    heartbeatProgress = progress;
  });

  setHandler(getExecutionStatusQuery, () => status);

  try {
    // ── Phase 1: Assign an agent ─────────────────────────────────────────────
    log.info('Assigning agent', { executionId: input.executionId });
    const agentId = await assignAgent({
      executionId: input.executionId,
      tenantId: input.tenantId,
      platform: input.platform,
      requiredCapabilities: input.requiredCapabilities,
    });

    // Check cancellation before we start real work
    if (cancelRequested) {
      await releaseAgent({ executionId: input.executionId, agentId });
      await markExecutionCancelled({ executionId: input.executionId, reason: cancelReason });
      status = 'cancelled';
      return { executionId: input.executionId, status, agentId, completedAt: new Date().toISOString() };
    }

    // ── Phase 2: Mark running ────────────────────────────────────────────────
    status = 'running';
    await markExecutionRunning({ executionId: input.executionId, agentId });
    log.info('Execution running', { executionId: input.executionId, agentId });

    // ── Phase 3: Wait for agent completion or cancellation (up to 55 min) ───
    // The agent signals heartbeat/progress; the workflow waits for completion
    // signal or a cancellation request. In a real system the agent would signal
    // back with a result; here we simulate a timeout-based wait.
    const completed = await condition(
      () => cancelRequested || heartbeatProgress >= 100,
      '55 minutes',
    );

    if (!completed || cancelRequested) {
      // Timed out or cancelled during execution
      await releaseAgent({ executionId: input.executionId, agentId });
      await markExecutionCancelled({ executionId: input.executionId, reason: cancelRequested ? cancelReason : 'timeout' });
      status = 'cancelled';
      return { executionId: input.executionId, status, agentId, completedAt: new Date().toISOString() };
    }

    // ── Phase 4: Mark complete ───────────────────────────────────────────────
    await releaseAgent({ executionId: input.executionId, agentId });
    await markExecutionComplete({ executionId: input.executionId });
    status = 'success';
    log.info('Execution complete', { executionId: input.executionId });
    return { executionId: input.executionId, status, agentId, completedAt: new Date().toISOString() };
  } catch (err) {
    if (isCancellation(err)) {
      // Workflow itself was cancelled by the Temporal server (e.g. workflow.cancel())
      await markExecutionCancelled({ executionId: input.executionId, reason: 'temporal-cancellation' }).catch(() => {});
      status = 'cancelled';
      throw err; // re-throw so Temporal records the cancellation
    }
    log.error('Execution failed', { executionId: input.executionId, err });
    await markExecutionFailed({ executionId: input.executionId, error: String(err) }).catch(() => {});
    status = 'failed';
    throw err;
  }
}
