import { RuntimeSchedulerService } from './runtime-scheduler.service';
import type { RuntimeAgentCommand, RuntimeAgentEvent } from '../../contracts/execution-contracts';

class StubRuntimeNatsService {
  public publishedCommands: RuntimeAgentCommand[] = [];
  public publishedEvents: RuntimeAgentEvent[] = [];
  private listeners: Array<(event: RuntimeAgentEvent) => void> = [];

  async publishCommand(agentId: string, command: RuntimeAgentCommand): Promise<boolean> {
    this.publishedCommands.push(command);
    return true;
  }

  async publishEvent(event: RuntimeAgentEvent): Promise<boolean> {
    this.publishedEvents.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
    return true;
  }

  onEvent(listener: (event: RuntimeAgentEvent) => void): void {
    this.listeners.push(listener);
  }
}

const createScheduler = () => new RuntimeSchedulerService(new StubRuntimeNatsService());

describe('RuntimeSchedulerService', () => {
  test('schedules thousands of queued jobs without blocking the API', async () => {
    const scheduler = createScheduler();
    const agentCount = 50;
    const jobs = 2000;

    for (let i = 0; i < agentCount; i += 1) {
      await scheduler.registerAgent({
        tenantId: 'default',
        name: `agent-${i}`,
        capabilities: ['any'],
        maxConcurrency: 4,
      });
    }

    const startMs = Date.now();
    for (let i = 0; i < jobs; i += 1) {
      await scheduler.enqueue({
        executionId: `exec-${i}`,
        tenantId: 'default',
        platform: 'web',
        requiredCapabilities: ['any'],
      });
    }
    const elapsedMs = Date.now() - startMs;

    expect(elapsedMs).toBeLessThan(5000);
    const queue = await scheduler.listQueue();
    expect(queue.length).toBe(jobs);
    expect(queue.filter((item) => item.status === 'dispatched').length).toBe(agentCount * 4);
  });

  test('recovers active leases when an agent becomes stale', async () => {
    const scheduler = createScheduler();
    const agent = await scheduler.registerAgent({
      tenantId: 'default',
      name: 'recover-agent',
      capabilities: ['any'],
      maxConcurrency: 1,
    });

    await scheduler.enqueue({
      executionId: 'recover-me',
      tenantId: 'default',
      platform: 'web',
      requiredCapabilities: ['any'],
    });

    const agents = await scheduler.listAgents();
    const localAgent = agents.find((item) => item.id === agent.id)!;
    localAgent.lastHeartbeatAt = new Date(Date.now() - 60_000).toISOString();

    await scheduler['sweepStaleAgents']();
    const queue = await scheduler.listQueue();
    expect(queue.some((item) => item.executionId === 'recover-me' && item.status === 'queued')).toBe(true);
  });
});
