import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NexusDb } from '../../infrastructure/postgres/drizzle.service';
import { DrizzleService } from '../../infrastructure/postgres/drizzle.service';
import { prefixedId } from '../../common/ids/id.util';
import type {
  ExecutionPlatform,
  RuntimeAgentCommand,
  RuntimeAgentEvent,
  RuntimeAgentRegistration,
  RuntimeAgentView,
} from '../../contracts/execution-contracts';
import { runtimeAgents, runtimeLeases, executionRuns } from '../../infrastructure/postgres/schema';
import type { RuntimeNatsClient } from './runtime-nats.service';
import { RuntimeNatsService } from './runtime-nats.service';

export interface QueueItem {
  executionId: string;
  tenantId: string;
  platform: ExecutionPlatform;
  requiredCapabilities: string[];
  variables?: Record<string, unknown>;
  assignedAgentId?: string;
  status: 'queued' | 'dispatched';
}

@Injectable()
export class RuntimeSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RuntimeSchedulerService.name);
  private readonly agents = new Map<string, RuntimeAgentView>();
  private readonly queue = new Map<string, QueueItem>();
  private readonly commands = new Map<string, RuntimeAgentCommand[]>();
  private healthTimer?: NodeJS.Timeout;
  private readonly staleAgentTimeoutMs = 30_000;
  private readonly healthSweepIntervalMs = 10_000;

  constructor(
    private readonly nats: RuntimeNatsClient,
    @Optional() private readonly drizzle?: DrizzleService,
  ) {}

  get db(): NexusDb | undefined {
    return this.drizzle?.db;
  }

  async onModuleInit(): Promise<void> {
    if (this.db) {
      await this.bootstrapAgents();
    }
    this.nats.onEvent((event) => this.handleAgentEvent(event));
    this.healthTimer = setInterval(() => this.sweepStaleAgents().catch((err) => this.logger.warn(err)), this.healthSweepIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }
  }

  async registerAgent(command: RuntimeAgentRegistration): Promise<RuntimeAgentView> {
    const tenantId = command.tenantId ?? 'default';
    const now = new Date().toISOString();
    let id = prefixedId('agent');
    const agent: RuntimeAgentView = {
      id,
      tenantId,
      name: command.name,
      status: 'idle',
      capabilities: command.capabilities,
      activeLeases: 0,
      maxConcurrency: command.maxConcurrency ?? 1,
      lastHeartbeatAt: now,
    };

    if (this.db) {
      const existing = await this.db
        .select()
        .from(runtimeAgents)
        .where(
          and(eq(runtimeAgents.name, command.name), eq(runtimeAgents.tenantId, tenantId)),
        )
        .limit(1);

      if (existing.length > 0) {
        const row = existing[0];
        id = row.id;
        agent.id = id;
        agent.activeLeases = row.activeLeases;
        agent.maxConcurrency = row.maxConcurrency;
        await this.db
          .update(runtimeAgents)
          .set({ status: 'ready', activeLeases: row.activeLeases, lastHeartbeatAt: new Date() })
          .where(eq(runtimeAgents.id, id));
      } else {
        await this.db.insert(runtimeAgents).values({
          id,
          tenantId,
          name: command.name,
          status: 'ready',
          capabilities: command.capabilities,
          activeLeases: 0,
          maxConcurrency: agent.maxConcurrency,
          lastHeartbeatAt: new Date(),
        });
      }
    }

    this.agents.set(agent.id, agent);
    this.commands.set(agent.id, []);
    await this.assignQueuedItems();
    return agent;
  }

  async heartbeat(agentId: string): Promise<RuntimeAgentView | undefined> {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    agent.lastHeartbeatAt = new Date().toISOString();
    if (agent.status === 'offline') {
      agent.status = 'ready';
    }

    if (this.db) {
      await this.db
        .update(runtimeAgents)
        .set({ lastHeartbeatAt: new Date(), status: agent.status })
        .where(eq(runtimeAgents.id, agentId));
    }

    await this.assignQueuedItems();
    return agent;
  }

  async renewLease(agentId: string): Promise<RuntimeAgentView | undefined> {
    const result = await this.heartbeat(agentId);
    if (result) {
      this.logger.debug('Lease renewed for agent %s', agentId);
    }
    return result;
  }

  async getPendingCommands(agentId: string): Promise<RuntimeAgentCommand[]> {
    const pending = this.commands.get(agentId) ?? [];
    const now = new Date();
    const valid = pending.filter((command) => new Date(command.expiresAt) > now);
    this.commands.set(agentId, []);
    return valid;
  }

  async publishAgentEvent(agentId: string, event: RuntimeAgentEvent): Promise<{ ok: boolean }> {
    const payload = {
      ...event,
      agentId,
      eventId: event.eventId ?? prefixedId('event'),
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    await this.nats.publishEvent(payload);
    await this.handleAgentEvent(payload);
    return { ok: true };
  }

  async enqueue(item: Omit<QueueItem, 'status'>): Promise<QueueItem> {
    const queueItem: QueueItem = { ...item, status: 'queued' };
    this.queue.set(queueItem.executionId, queueItem);
    await this.assignQueuedItems();
    return queueItem;
  }

  async listAgents(): Promise<RuntimeAgentView[]> {
    return [...this.agents.values()];
  }

  async listQueue(): Promise<QueueItem[]> {
    return [...this.queue.values()];
  }

  private async bootstrapAgents(): Promise<void> {
    if (!this.db) return;
    const rows = await this.db.select().from(runtimeAgents);
    for (const row of rows) {
      const agent: RuntimeAgentView = {
        id: row.id,
        tenantId: row.tenantId,
        name: row.name,
        status: row.status as RuntimeAgentView['status'],
        capabilities: row.capabilities as string[],
        activeLeases: row.activeLeases,
        maxConcurrency: row.maxConcurrency,
        lastHeartbeatAt: row.lastHeartbeatAt?.toISOString(),
      };
      this.agents.set(agent.id, agent);
      this.commands.set(agent.id, []);
    }
  }

  private async assignQueuedItems(): Promise<void> {
    for (const item of this.queue.values()) {
      if (item.status !== 'queued') continue;
      const agent = this.findAvailableAgent(item.requiredCapabilities);
      if (!agent) continue;
      await this.dispatchExecution(item, agent);
    }
  }

  private findAvailableAgent(requiredCapabilities: string[]): RuntimeAgentView | undefined {
    return [...this.agents.values()].find((candidate) => {
      if (candidate.status === 'offline') return false;
      if (candidate.activeLeases >= candidate.maxConcurrency) return false;
      const capabilities = new Set(candidate.capabilities);
      return requiredCapabilities.every((capability) => capabilities.has(capability) || capabilities.has('any'));
    });
  }

  private async dispatchExecution(item: QueueItem, agent: RuntimeAgentView): Promise<void> {
    const command: RuntimeAgentCommand = {
      id: prefixedId('command'),
      agentId: agent.id,
      executionId: item.executionId,
      type: 'startExecution',
      payload: {
        executionId: item.executionId,
        platform: item.platform,
        variables: item.variables ?? {},
        requiredCapabilities: item.requiredCapabilities,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    item.status = 'dispatched';
    item.assignedAgentId = agent.id;
    agent.activeLeases += 1;
    agent.status = agent.activeLeases >= agent.maxConcurrency ? 'busy' : 'ready';

    if (this.db) {
      await this.db
        .update(runtimeAgents)
        .set({ activeLeases: agent.activeLeases, status: agent.status })
        .where(eq(runtimeAgents.id, agent.id));

      await this.db.insert(runtimeLeases).values({
        id: prefixedId('lease'),
        tenantId: item.tenantId,
        executionId: item.executionId,
        agentId: agent.id,
        status: 'active',
        metadata: { requiredCapabilities: item.requiredCapabilities },
      });
    }

    const existing = this.commands.get(agent.id) ?? [];
    existing.push(command);
    this.commands.set(agent.id, existing);
    await this.nats.publishCommand(agent.id, command);
  }

  private async handleAgentEvent(event: RuntimeAgentEvent): Promise<void> {
    if (event.type === 'execution.completed' || event.type === 'execution.failed') {
      await this.releaseLease(event.agentId, event.executionId);
    }

    if (event.type === 'agent.heartbeat') {
      await this.heartbeat(event.agentId).catch(() => undefined);
    }
  }

  private async releaseLease(agentId: string, executionId?: string): Promise<void> {
    if (!executionId) return;
    if (!this.db) return;

    const [lease] = await this.db
      .select()
      .from(runtimeLeases)
      .where(
        and(
          eq(runtimeLeases.agentId, agentId),
          eq(runtimeLeases.executionId, executionId),
          eq(runtimeLeases.status, 'active'),
        ),
      )
      .limit(1);

    if (!lease) return;

    await this.db
      .update(runtimeLeases)
      .set({ status: 'released', releasedAt: new Date() })
      .where(eq(runtimeLeases.id, lease.id));

    const agent = this.agents.get(agentId);
    if (agent) {
      agent.activeLeases = Math.max(0, agent.activeLeases - 1);
      agent.status = agent.activeLeases === 0 ? 'ready' : 'busy';
      await this.db
        .update(runtimeAgents)
        .set({ activeLeases: agent.activeLeases, status: agent.status })
        .where(eq(runtimeAgents.id, agent.id));
    }

    await this.assignQueuedItems();
  }

  private async sweepStaleAgents(): Promise<void> {
    const now = Date.now();
    for (const agent of [...this.agents.values()]) {
      const lastHeartbeat = new Date(agent.lastHeartbeatAt ?? 0).getTime();
      if (agent.status !== 'offline' && now - lastHeartbeat > this.staleAgentTimeoutMs) {
        this.logger.warn('Agent %s is stale, recovering leases', agent.id);
        await this.markAgentOffline(agent.id);
      }
    }
  }

  private async markAgentOffline(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.status = 'offline';

    if (this.db) {
      await this.db.update(runtimeAgents).set({ status: 'offline' }).where(eq(runtimeAgents.id, agentId));
      const leases = await this.db
        .select()
        .from(runtimeLeases)
        .where(and(eq(runtimeLeases.agentId, agentId), eq(runtimeLeases.status, 'active')));

      for (const lease of leases) {
        const requiredCapabilities = (lease.metadata as { requiredCapabilities?: string[] })?.requiredCapabilities ?? ['any'];
        const [execution] = await this.db
          .select()
          .from(executionRuns)
          .where(eq(executionRuns.id, lease.executionId))
          .limit(1);

        await this.db
          .update(runtimeLeases)
          .set({ status: 'abandoned', releasedAt: new Date() })
          .where(eq(runtimeLeases.id, lease.id));

        this.queue.set(lease.executionId, {
          executionId: lease.executionId,
          tenantId: lease.tenantId,
          platform: (execution?.platform as ExecutionPlatform) ?? 'web',
          requiredCapabilities,
          status: 'queued',
        });
      }
    } else {
      for (const item of this.queue.values()) {
        if (item.assignedAgentId === agentId && item.status === 'dispatched') {
          item.status = 'queued';
          item.assignedAgentId = undefined;
        }
      }
    }

    agent.activeLeases = 0;
    await this.assignQueuedItems();
  }
}
