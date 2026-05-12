/**
 * Durable DAG execution workflow.
 *
 * Replaces the Python ExecutionEngine's asyncio background task with a
 * Temporal-owned, fully durable workflow.  Process crashes, worker restarts,
 * and transient DB failures are all handled by Temporal replay — no executions
 * can be silently lost.
 *
 * Design constraints (Temporal workflow rules):
 *  - NO Node.js I/O built-ins (fs, net, crypto, …)
 *  - NO NestJS or Express imports
 *  - All I/O goes through activity proxies
 *  - All randomness / time must use @temporalio/workflow utilities
 *  - Helper functions below are pure computation — no side effects
 */
import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  sleep,
  log,
  isCancellation,
} from '@temporalio/workflow';
import type { DagActivities, DagNode, DagEdge } from '../activities/dag.activities';
import type { ExecutionActivities } from '../activities/execution.activities';
import type { ExecutionStatus } from '../../contracts/execution-contracts';

// ─── Pure DAG helpers (no I/O — safe for Temporal deterministic replay) ───────

function getPredecessors(edges: DagEdge[], nodeKey: string): string[] {
  return edges.filter((e) => e.target === nodeKey).map((e) => e.source);
}

/**
 * Returns node keys that are structurally ready (all predecessors have been
 * processed) and have not yet been processed themselves.
 */
function getReadyNodes(
  nodes: DagNode[],
  edges: DagEdge[],
  processed: Set<string>,
): string[] {
  return nodes
    .map((n) => n.key)
    .filter((key) => {
      if (processed.has(key)) return false;
      return getPredecessors(edges, key).every((p) => processed.has(p));
    });
}

/**
 * Exponential backoff in milliseconds, matching the Python RetryPolicy formula:
 *   delay = min(backoffBase * 2^(attempt-1), maxDelay)  ± optional jitter
 *
 * Jitter is omitted here — the workflow is deterministic, so we use the base
 * formula only.  Real jitter is provided by Temporal's own retry settings.
 */
function calcBackoffMs(attempt: number, backoffBase: number, maxDelay: number): number {
  const delaySec = Math.min(backoffBase * Math.pow(2, attempt - 1), maxDelay);
  return Math.round(delaySec * 1000);
}

// ─── Signals / Queries ────────────────────────────────────────────────────────

export const cancelDagExecutionSignal = defineSignal<[{ reason?: string }]>(
  'cancelDagExecution',
);

export const getDagExecutionStatusQuery = defineQuery<ExecutionStatus>(
  'getDagExecutionStatus',
);

// ─── I/O contract ─────────────────────────────────────────────────────────────

export interface DagExecutionWorkflowInput {
  executionId: string;
  tenantId: string;
  platform: string;
  workflowDefinitionId: string;
  variables: Record<string, unknown>;
}

export interface DagExecutionWorkflowResult {
  executionId: string;
  status: ExecutionStatus;
  completedAt: string;
}

// ─── Activity proxies ─────────────────────────────────────────────────────────

// Fast, idempotent DB operations — short timeout, aggressive retry.
const {
  loadDagDefinition,
  initializeExecutionNodes,
  setNodeStatus,
  setNodeCompleted,
  incrementNodeAttempt,
  addTimelineEntry,
  saveVariableSnapshot,
} = proxyActivities<DagActivities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '1s',
    maximumInterval: '30s',
    backoffCoefficient: 2,
    maximumAttempts: 5,
    nonRetryableErrorTypes: ['NotFoundError', 'ValidationError'],
  },
});

// Long-running node execution — heartbeat-based, up to 2 h per node.
const { executeNode } = proxyActivities<DagActivities>({
  startToCloseTimeout: '2 hours',
  heartbeatTimeout: '30 seconds',
  retry: {
    initialInterval: '2s',
    maximumInterval: '60s',
    backoffCoefficient: 2,
    maximumAttempts: 1, // Business-level retries are driven by the workflow loop below.
    nonRetryableErrorTypes: ['NotFoundError', 'ValidationError'],
  },
});

// Execution-level status mutations.
const {
  markExecutionRunning,
  markExecutionComplete,
  markExecutionFailed,
  markExecutionCancelled,
} = proxyActivities<ExecutionActivities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});

// ─── Per-node execution with business-level retry ─────────────────────────────
// Defined at module scope so it participates in the deterministic replay bundle.

async function runNodeWithRetry(
  nodeKey: string,
  node: DagNode,
  input: DagExecutionWorkflowInput,
  variables: Record<string, unknown>,
): Promise<{ success: boolean; output: Record<string, unknown> }> {
  const { maxAttempts, backoffBase, maxDelay } = node.retryPolicy;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await incrementNodeAttempt({ executionId: input.executionId, nodeKey });
    await setNodeStatus({ executionId: input.executionId, nodeKey, status: 'running' });
    await addTimelineEntry({
      executionId: input.executionId,
      nodeKey,
      phase: 'started',
      metadata: { attempt },
    });

    log.info('Executing node', { executionId: input.executionId, nodeKey, attempt });

    const result = await executeNode({
      executionId: input.executionId,
      tenantId: input.tenantId,
      platform: input.platform,
      nodeKey,
      nodeLabel: node.label,
      nodeType: node.type,
      config: node.config,
      timeoutSeconds: node.timeoutSeconds,
      attempt,
      variables,
    });

    if (result.success) {
      await setNodeCompleted({
        executionId: input.executionId,
        nodeKey,
        durationMs: result.durationMs,
        output: result.output,
      });
      await addTimelineEntry({
        executionId: input.executionId,
        nodeKey,
        phase: 'completed',
        metadata: { durationMs: result.durationMs },
      });
      log.info('Node completed', { executionId: input.executionId, nodeKey, durationMs: result.durationMs });
      return { success: true, output: result.output };
    }

    // Node failed this attempt
    const willRetry = attempt < maxAttempts;
    log.warn('Node failed', {
      executionId: input.executionId,
      nodeKey,
      attempt,
      willRetry,
      error: result.error,
    });

    if (!willRetry) {
      await setNodeStatus({
        executionId: input.executionId,
        nodeKey,
        status: 'failed',
        error: result.error,
      });
      await addTimelineEntry({
        executionId: input.executionId,
        nodeKey,
        phase: 'failed',
        metadata: { error: result.error, attempts: attempt },
      });
      return { success: false, output: {} };
    }

    // Back-off before next attempt using Temporal's deterministic sleep.
    const delayMs = calcBackoffMs(attempt, backoffBase, maxDelay);
    await setNodeStatus({ executionId: input.executionId, nodeKey, status: 'retrying' });
    await addTimelineEntry({
      executionId: input.executionId,
      nodeKey,
      phase: 'retrying',
      metadata: { nextAttempt: attempt + 1, delayMs },
    });
    await sleep(delayMs);
  }

  // Defensive: maxAttempts exhausted without returning inside the loop.
  return { success: false, output: {} };
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export async function dagExecutionWorkflow(
  input: DagExecutionWorkflowInput,
): Promise<DagExecutionWorkflowResult> {
  let status: ExecutionStatus = 'queued';
  let cancelRequested = false;
  let cancelReason: string | undefined;

  setHandler(cancelDagExecutionSignal, ({ reason } = {}) => {
    cancelRequested = true;
    cancelReason = reason;
    log.info('Cancel signal received', { executionId: input.executionId, reason });
  });

  setHandler(getDagExecutionStatusQuery, () => status);

  try {
    // ── Phase 1: Load DAG ────────────────────────────────────────────────────
    log.info('Loading DAG definition', { executionId: input.executionId });
    const dag = await loadDagDefinition({ executionId: input.executionId });

    if (dag.nodes.length === 0) {
      // Empty workflow — trivially complete.
      await markExecutionComplete({ executionId: input.executionId });
      status = 'success';
      log.info('Empty workflow — immediately complete', { executionId: input.executionId });
      return { executionId: input.executionId, status, completedAt: new Date().toISOString() };
    }

    // ── Phase 2: Initialise node tracking rows ───────────────────────────────
    await initializeExecutionNodes({ executionId: input.executionId, nodes: dag.nodes });

    // Queue every node before traversal so the legal lifecycle is preserved:
    // created → queued → running (mirrors Python ExecutionEngine._traverse)
    await Promise.all(
      dag.nodes.map((n) =>
        Promise.all([
          setNodeStatus({ executionId: input.executionId, nodeKey: n.key, status: 'queued' }),
          addTimelineEntry({ executionId: input.executionId, nodeKey: n.key, phase: 'queued' }),
        ]),
      ),
    );

    // ── Phase 3: Mark execution running ─────────────────────────────────────
    status = 'running';
    await markExecutionRunning({ executionId: input.executionId, agentId: 'temporal-dag' });
    log.info('DAG execution running', {
      executionId: input.executionId,
      nodes: dag.nodes.length,
      edges: dag.edges.length,
    });

    // ── Phase 4: DAG traversal ───────────────────────────────────────────────
    // Shared variable context — propagated between nodes as each wave completes.
    let variables: Record<string, unknown> = { ...input.variables, ...dag.initialVariables };

    // Track which nodes have been fully resolved (success, fail, or skip).
    const completed = new Set<string>(); // nodes whose execution succeeded
    const actuallyFailed = new Set<string>(); // nodes that failed after all retries
    const processed = new Set<string>(); // completed | actuallyFailed | skipped

    while (processed.size < dag.nodes.length) {
      if (cancelRequested) break;

      const ready = getReadyNodes(dag.nodes, dag.edges, processed);

      if (ready.length === 0) {
        // No progress possible — DAG is exhausted or a cycle slipped through.
        log.warn('No ready nodes — DAG traversal stalled', {
          executionId: input.executionId,
          processed: processed.size,
          total: dag.nodes.length,
        });
        break;
      }

      // Partition ready nodes: those whose predecessor failed must be skipped.
      const skippable: string[] = [];
      const runnable: string[] = [];

      for (const key of ready) {
        const preds = getPredecessors(dag.edges, key);
        if (preds.some((p) => actuallyFailed.has(p) || (processed.has(p) && !completed.has(p)))) {
          skippable.push(key);
        } else {
          runnable.push(key);
        }
      }

      // Skip nodes with failed/skipped predecessors in parallel.
      if (skippable.length > 0) {
        await Promise.all(
          skippable.map(async (key) => {
            await setNodeStatus({ executionId: input.executionId, nodeKey: key, status: 'skipped' });
            await addTimelineEntry({
              executionId: input.executionId,
              nodeKey: key,
              phase: 'skipped',
              metadata: { reason: 'Predecessor failed or was skipped' },
            });
            processed.add(key);
            log.info('Node skipped', { executionId: input.executionId, nodeKey: key });
          }),
        );
      }

      if (runnable.length === 0) continue;

      // Execute the current wave of ready nodes concurrently.
      // Promise.all is safe here — Temporal replays all promises deterministically.
      const waveResults = await Promise.all(
        runnable.map((key) => {
          const node = dag.nodes.find((n) => n.key === key)!;
          return runNodeWithRetry(key, node, input, variables);
        }),
      );

      // Integrate results and propagate variable context.
      for (let i = 0; i < runnable.length; i++) {
        const key = runnable[i];
        const result = waveResults[i];
        processed.add(key);

        if (result.success) {
          completed.add(key);
          const outputKeys = Object.keys(result.output);
          if (outputKeys.length > 0) {
            variables = { ...variables, ...result.output };
            await saveVariableSnapshot({
              executionId: input.executionId,
              nodeKey: key,
              variables: result.output,
            });
          }
        } else {
          actuallyFailed.add(key);
        }
      }
    }

    // ── Phase 5: Finalise ────────────────────────────────────────────────────
    if (cancelRequested) {
      await markExecutionCancelled({ executionId: input.executionId, reason: cancelReason });
      status = 'cancelled';
    } else if (actuallyFailed.size > 0) {
      await markExecutionFailed({
        executionId: input.executionId,
        error: `${actuallyFailed.size} node(s) failed: ${[...actuallyFailed].join(', ')}`,
      });
      status = 'failed';
    } else {
      await markExecutionComplete({ executionId: input.executionId });
      status = 'success';
    }

    log.info('DAG execution complete', { executionId: input.executionId, status });
    return { executionId: input.executionId, status, completedAt: new Date().toISOString() };
  } catch (err) {
    if (isCancellation(err)) {
      await markExecutionCancelled({
        executionId: input.executionId,
        reason: 'temporal-cancellation',
      }).catch(() => {});
      status = 'cancelled';
      throw err;
    }
    log.error('DAG execution failed with unexpected error', { executionId: input.executionId, err });
    await markExecutionFailed({
      executionId: input.executionId,
      error: String(err),
    }).catch(() => {});
    status = 'failed';
    throw err;
  }
}
