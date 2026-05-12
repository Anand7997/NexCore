/**
 * DAG orchestration activities.
 *
 * All DB mutations for the node-level execution lifecycle live here.
 * Activities are retried by Temporal on transient failures; non-retryable
 * errors (NotFoundError, ValidationError) are thrown with those names so the
 * workflow proxy's nonRetryableErrorTypes list skips futile retries.
 */
import { Context } from '@temporalio/activity';
import { and, eq } from 'drizzle-orm';
import type { NexusDb } from '../../infrastructure/postgres/drizzle.service';
import {
  executionRuns,
  executionNodes,
  executionTimeline,
  workflows,
  runtimeAgents,
} from '../../infrastructure/postgres/schema';
import { prefixedId } from '../../common/ids/id.util';

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface NodeRetryPolicy {
  maxAttempts: number;
  backoffBase: number;
  maxDelay: number;
  jitter: boolean;
}

export interface DagNode {
  key: string;
  label: string;
  type: string;
  config: Record<string, unknown>;
  retryPolicy: NodeRetryPolicy;
  timeoutSeconds: number;
}

export interface DagEdge {
  source: string;
  target: string;
}

export interface DagDefinition {
  nodes: DagNode[];
  edges: DagEdge[];
  initialVariables: Record<string, unknown>;
}

export interface NodeExecutionResult {
  success: boolean;
  output: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

// ─── Activity input types ─────────────────────────────────────────────────────

export interface LoadDagInput {
  executionId: string;
}

export interface InitNodesInput {
  executionId: string;
  nodes: DagNode[];
}

export interface SetNodeStatusInput {
  executionId: string;
  nodeKey: string;
  status: string;
  error?: string;
}

export interface SetNodeCompletedInput {
  executionId: string;
  nodeKey: string;
  durationMs: number;
  output: Record<string, unknown>;
}

export interface IncrementAttemptInput {
  executionId: string;
  nodeKey: string;
}

export interface TimelineInput {
  executionId: string;
  nodeKey: string;
  phase: string;
  metadata?: Record<string, unknown>;
}

export interface VariableSnapshotInput {
  executionId: string;
  nodeKey: string;
  variables: Record<string, unknown>;
}

export interface ExecuteNodeInput {
  executionId: string;
  tenantId: string;
  platform: string;
  nodeKey: string;
  nodeLabel: string;
  nodeType: string;
  config: Record<string, unknown>;
  timeoutSeconds: number;
  attempt: number;
  variables: Record<string, unknown>;
}

// ─── Activity interface (used by workflow proxy) ──────────────────────────────

export interface DagActivities {
  loadDagDefinition(input: LoadDagInput): Promise<DagDefinition>;
  initializeExecutionNodes(input: InitNodesInput): Promise<void>;
  setNodeStatus(input: SetNodeStatusInput): Promise<void>;
  setNodeCompleted(input: SetNodeCompletedInput): Promise<void>;
  incrementNodeAttempt(input: IncrementAttemptInput): Promise<void>;
  addTimelineEntry(input: TimelineInput): Promise<void>;
  saveVariableSnapshot(input: VariableSnapshotInput): Promise<void>;
  executeNode(input: ExecuteNodeInput): Promise<NodeExecutionResult>;
}

// ─── Activity factory ─────────────────────────────────────────────────────────

export function createDagActivities(db: NexusDb): DagActivities {
  return {
    /**
     * Load the workflow's node/edge graph from the workflow definition JSON.
     * Falls back to an empty DAG if the workflow has no definition (immediately
     * succeeds in the workflow loop).
     */
    async loadDagDefinition({ executionId }): Promise<DagDefinition> {
      Context.current().heartbeat({ phase: 'loading-dag' });

      const [run] = await db
        .select()
        .from(executionRuns)
        .where(eq(executionRuns.id, executionId))
        .limit(1);

      if (!run) {
        throw Object.assign(new Error(`Execution ${executionId} not found`), {
          name: 'NotFoundError',
        });
      }

      const [workflow] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, run.workflowId))
        .limit(1);

      if (!workflow) {
        throw Object.assign(new Error(`Workflow ${run.workflowId} not found`), {
          name: 'NotFoundError',
        });
      }

      const def = (workflow.definition ?? {}) as Record<string, unknown>;
      const rawNodes = (def['nodes'] as unknown[]) ?? [];
      const rawEdges = (def['edges'] as unknown[]) ?? [];

      const nodes: DagNode[] = rawNodes.map((n) => {
        const node = n as Record<string, unknown>;
        const rp = ((node['retryPolicy'] ?? node['retry_policy']) as Record<string, unknown>) ?? {};
        return {
          key: String(node['key'] ?? node['id'] ?? ''),
          label: String(node['label'] ?? node['name'] ?? node['key'] ?? ''),
          type: String(node['type'] ?? node['nodeType'] ?? 'action'),
          config: ((node['config'] as Record<string, unknown>) ?? {}),
          retryPolicy: {
            maxAttempts: Number(rp['maxAttempts'] ?? rp['max_attempts'] ?? 3),
            backoffBase: Number(rp['backoffBase'] ?? rp['backoff_base'] ?? 1.5),
            maxDelay: Number(rp['maxDelay'] ?? rp['max_delay'] ?? 30),
            jitter: Boolean(rp['jitter'] ?? true),
          },
          timeoutSeconds: Number(node['timeoutSeconds'] ?? node['timeout_seconds'] ?? 60),
        };
      });

      const edges: DagEdge[] = rawEdges.map((e) => {
        const edge = e as Record<string, unknown>;
        return {
          source: String(edge['source'] ?? edge['from'] ?? ''),
          target: String(edge['target'] ?? edge['to'] ?? ''),
        };
      });

      return { nodes, edges, initialVariables: (run.variables ?? {}) };
    },

    /**
     * Upsert one execution_nodes row per DAG node.
     * Idempotent — safe to call on workflow replay.
     */
    async initializeExecutionNodes({ executionId, nodes }): Promise<void> {
      Context.current().heartbeat({ phase: 'initializing-nodes', count: nodes.length });

      for (const node of nodes) {
        const [existing] = await db
          .select({ id: executionNodes.id })
          .from(executionNodes)
          .where(
            and(
              eq(executionNodes.executionId, executionId),
              eq(executionNodes.nodeKey, node.key),
            ),
          )
          .limit(1);

        if (!existing) {
          await db.insert(executionNodes).values({
            id: prefixedId('enode'),
            executionId,
            nodeKey: node.key,
            nodeLabel: node.label,
            nodeType: node.type,
            status: 'created',
          });
        }
      }
    },

    async setNodeStatus({ executionId, nodeKey, status, error }): Promise<void> {
      await db
        .update(executionNodes)
        .set({
          status,
          ...(error !== undefined ? { error } : {}),
          ...(status === 'running' ? { startedAt: new Date() } : {}),
        })
        .where(
          and(
            eq(executionNodes.executionId, executionId),
            eq(executionNodes.nodeKey, nodeKey),
          ),
        );
    },

    async setNodeCompleted({ executionId, nodeKey, durationMs, output }): Promise<void> {
      await db
        .update(executionNodes)
        .set({ status: 'completed', completedAt: new Date(), durationMs, output })
        .where(
          and(
            eq(executionNodes.executionId, executionId),
            eq(executionNodes.nodeKey, nodeKey),
          ),
        );
    },

    async incrementNodeAttempt({ executionId, nodeKey }): Promise<void> {
      const [node] = await db
        .select({ attemptCount: executionNodes.attemptCount })
        .from(executionNodes)
        .where(
          and(
            eq(executionNodes.executionId, executionId),
            eq(executionNodes.nodeKey, nodeKey),
          ),
        )
        .limit(1);

      if (node) {
        await db
          .update(executionNodes)
          .set({ attemptCount: node.attemptCount + 1 })
          .where(
            and(
              eq(executionNodes.executionId, executionId),
              eq(executionNodes.nodeKey, nodeKey),
            ),
          );
      }
    },

    async addTimelineEntry({ executionId, nodeKey, phase, metadata }): Promise<void> {
      await db.insert(executionTimeline).values({
        id: prefixedId('tl'),
        executionId,
        nodeKey,
        phase,
        metadata: metadata ?? {},
      });
    },

    async saveVariableSnapshot({ executionId, nodeKey, variables }): Promise<void> {
      await db.insert(executionTimeline).values({
        id: prefixedId('tl'),
        executionId,
        nodeKey,
        phase: 'variable_snapshot',
        metadata: { variables },
      });
    },

    /**
     * Execute a single workflow node.
     *
     * Production path: dispatch to a registered runtime agent via NATS and poll
     * the DB until the agent writes back a result.
     *
     * Current path (simulation): synthesise a realistic result with configurable
     * delay and failure rate so the full DAG traversal works end-to-end without
     * requiring live agents.  This mirrors the Python NodeSimulator exactly.
     *
     * To swap in real agent dispatch, replace the simulation block with:
     *   1. Publish a `node.dispatch` NATS message with the execution envelope.
     *   2. Poll `executionNodes` where status IN ('completed','failed') until
     *      the agent writes back, heartbeating every 5s.
     *   3. Return the persisted result.
     */
    async executeNode({
      executionId,
      tenantId,
      nodeKey,
      nodeLabel,
      nodeType,
      config,
      timeoutSeconds,
      attempt,
      variables,
    }): Promise<NodeExecutionResult> {
      const ctx = Context.current();
      ctx.heartbeat({ phase: 'start', nodeKey, attempt });

      const startTime = Date.now();

      // Check for a capable registered agent (for future real-dispatch path)
      const agents = await db
        .select({ id: runtimeAgents.id, capabilities: runtimeAgents.capabilities })
        .from(runtimeAgents)
        .where(eq(runtimeAgents.tenantId, tenantId));

      const hasCapableAgent = agents.some((a) => {
        const caps = new Set<string>(a.capabilities as string[]);
        return caps.has(nodeType) || caps.has('any');
      });

      // ── Simulation path ────────────────────────────────────────────────────
      // Pull delay / failure-rate from node config; defaults mirror the Python
      // NodeSimulator so existing demo workflows behave identically.
      const baseDelayMs = Number(config['simulatedDelayMs'] ?? config['delay_ms'] ?? 600);
      const failureRate = Number(config['simulatedFailureRate'] ?? config['failure_rate'] ?? 0.05);
      const jitterMs = Math.floor(Math.random() * 400);
      const totalDelayMs = Math.min(baseDelayMs + jitterMs, timeoutSeconds * 1000 - 100);

      // Sleep in 5s heartbeat chunks so Temporal can detect stalled activities.
      const chunkMs = 5_000;
      let elapsed = 0;
      while (elapsed < totalDelayMs) {
        const waitMs = Math.min(chunkMs, totalDelayMs - elapsed);
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        elapsed += waitMs;
        ctx.heartbeat({ phase: 'executing', nodeKey, attempt, progressMs: elapsed, hasCapableAgent });
      }

      const durationMs = Date.now() - startTime;

      if (Math.random() < failureRate) {
        return {
          success: false,
          output: {},
          error: `[${nodeType}] Simulated failure — node "${nodeLabel}" attempt ${attempt}`,
          durationMs,
        };
      }

      return {
        success: true,
        output: {
          nodeKey,
          nodeType,
          nodeLabel,
          attempt,
          simulatedAt: new Date().toISOString(),
          ...((config['outputTemplate'] as Record<string, unknown>) ?? {}),
          // Propagate a subset of shared variables so downstream nodes receive context.
          inheritedVariables: variables,
        },
        durationMs,
      };
    },
  };
}
