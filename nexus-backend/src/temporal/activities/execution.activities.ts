import { Context } from '@temporalio/activity';
import { eq } from 'drizzle-orm';
import type { NexusDb } from '../../infrastructure/postgres/drizzle.service';
import { executionRuns, runtimeAgents, runtimeLeases } from '../../infrastructure/postgres/schema';
import { prefixedId } from '../../common/ids/id.util';

// ─── Input/output types ───────────────────────────────────────────────────────

export interface AssignAgentInput {
  executionId: string;
  tenantId: string;
  platform: string;
  requiredCapabilities: string[];
}

export interface ReleaseAgentInput {
  executionId: string;
  agentId: string;
}

export interface MarkRunningInput {
  executionId: string;
  agentId: string;
}

export interface MarkCompleteInput {
  executionId: string;
}

export interface MarkFailedInput {
  executionId: string;
  error: string;
}

export interface MarkCancelledInput {
  executionId: string;
  reason?: string;
}

// ─── Activity interface (used by workflow proxy) ──────────────────────────────

export interface ExecutionActivities {
  assignAgent(input: AssignAgentInput): Promise<string>;
  releaseAgent(input: ReleaseAgentInput): Promise<void>;
  markExecutionRunning(input: MarkRunningInput): Promise<void>;
  markExecutionComplete(input: MarkCompleteInput): Promise<void>;
  markExecutionFailed(input: MarkFailedInput): Promise<void>;
  markExecutionCancelled(input: MarkCancelledInput): Promise<void>;
}

// ─── Activity factory ─────────────────────────────────────────────────────────

/**
 * Creates bound activity implementations that close over a DB handle.
 * Called once in the worker bootstrap.
 */
export function createExecutionActivities(db: NexusDb): ExecutionActivities {
  return {
    /**
     * Find an available agent matching the required capabilities and platform,
     * claim a lease, and return the agent ID.
     */
    async assignAgent(input: AssignAgentInput): Promise<string> {
      Context.current().heartbeat({ phase: 'assigning-agent' });

      // Find idle agents with matching capabilities
      const candidates = await db
        .select()
        .from(runtimeAgents)
        .where(eq(runtimeAgents.tenantId, input.tenantId));

      const agent = candidates.find((a) => {
        if (a.activeLeases >= a.maxConcurrency) return false;
        const caps = new Set<string>(a.capabilities as string[]);
        return input.requiredCapabilities.every((c) => caps.has(c) || caps.has('any'));
      });

      if (!agent) {
        // No agent available – retry will be handled by Temporal
        throw Object.assign(new Error('No available agent for capabilities'), {
          name: 'NoAgentAvailableError',
        });
      }

      // Acquire lease
      await db
        .update(runtimeAgents)
        .set({
          activeLeases: agent.activeLeases + 1,
          status: agent.activeLeases + 1 >= agent.maxConcurrency ? 'busy' : 'idle',
        })
        .where(eq(runtimeAgents.id, agent.id));

      await db.insert(runtimeLeases).values({
        id: prefixedId('lease'),
        tenantId: input.tenantId,
        executionId: input.executionId,
        agentId: agent.id,
        status: 'active',
        metadata: {},
      });

      return agent.id;
    },

    /**
     * Release the lease and decrement the agent's active lease counter.
     */
    async releaseAgent(input: ReleaseAgentInput): Promise<void> {
      Context.current().heartbeat({ phase: 'releasing-agent' });

      await db
        .update(runtimeLeases)
        .set({ status: 'released', releasedAt: new Date() })
        .where(eq(runtimeLeases.executionId, input.executionId));

      const [agent] = await db
        .select()
        .from(runtimeAgents)
        .where(eq(runtimeAgents.id, input.agentId))
        .limit(1);

      if (agent) {
        const newLeases = Math.max(0, agent.activeLeases - 1);
        await db
          .update(runtimeAgents)
          .set({
            activeLeases: newLeases,
            status: newLeases === 0 ? 'idle' : 'busy',
          })
          .where(eq(runtimeAgents.id, agent.id));
      }
    },

    async markExecutionRunning(input: MarkRunningInput): Promise<void> {
      await db
        .update(executionRuns)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(executionRuns.id, input.executionId));
    },

    async markExecutionComplete(input: MarkCompleteInput): Promise<void> {
      await db
        .update(executionRuns)
        .set({ status: 'success', completedAt: new Date() })
        .where(eq(executionRuns.id, input.executionId));
    },

    async markExecutionFailed(input: MarkFailedInput): Promise<void> {
      await db
        .update(executionRuns)
        .set({ status: 'failed', completedAt: new Date() })
        .where(eq(executionRuns.id, input.executionId));
    },

    async markExecutionCancelled(input: MarkCancelledInput): Promise<void> {
      await db
        .update(executionRuns)
        .set({ status: 'cancelled', completedAt: new Date() })
        .where(eq(executionRuns.id, input.executionId));
    },
  };
}
