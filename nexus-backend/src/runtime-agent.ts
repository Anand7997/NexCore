import { connect, NatsConnection, StringCodec, Subscription } from 'nats';
import { createContext, Script } from 'vm';
import { setTimeout as delay } from 'timers/promises';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const AGENT_NAME = process.env.AGENT_NAME ?? `runtime-agent-${process.pid}-${Date.now()}`;
const AGENT_CAPABILITIES = JSON.parse(process.env.AGENT_CAPABILITIES ?? '[]') as string[];
const MAX_CONCURRENCY = Number(process.env.AGENT_MAX_CONCURRENCY ?? 2);
const POLL_INTERVAL_MS = Number(process.env.AGENT_POLL_INTERVAL_MS ?? 5000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.AGENT_HEARTBEAT_INTERVAL_MS ?? 10_000);

const sc = StringCodec();
const COMMAND_SUBJECT_PREFIX = 'runtime.commands';
const EVENT_SUBJECT = 'runtime.events';

interface RuntimeAgentRegistration {
  tenantId?: string;
  name: string;
  capabilities: string[];
  maxConcurrency?: number;
  labels?: Record<string, string>;
}

interface RuntimeAgentView {
  id: string;
  tenantId: string;
  name: string;
  status: 'idle' | 'ready' | 'busy' | 'offline';
  capabilities: string[];
  activeLeases: number;
  maxConcurrency: number;
  lastHeartbeatAt?: string;
}

type RuntimeAgentCommandType = 'startExecution' | 'cancelExecution' | 'renewLease';

interface RuntimeAgentCommand {
  id: string;
  agentId: string;
  executionId: string;
  type: RuntimeAgentCommandType;
  payload: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

type RuntimeAgentEventType =
  | 'execution.progress'
  | 'execution.completed'
  | 'execution.failed'
  | 'agent.heartbeat'
  | 'agent.registered'
  | 'agent.offline';

interface RuntimeAgentEvent {
  eventId: string;
  agentId: string;
  executionId?: string;
  type: RuntimeAgentEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}

class RuntimeJobSandbox {
  private readonly context: Record<string, unknown>;

  constructor(private readonly command: RuntimeAgentCommand, private readonly publishProgress: (progress: number, detail: string) => Promise<void>) {
    this.context = createContext({
      console: {
        log: (...args: unknown[]) => this.publishProgress(0, `log:${args.join(' ')}`),
        info: (...args: unknown[]) => this.publishProgress(0, `info:${args.join(' ')}`),
        warn: (...args: unknown[]) => this.publishProgress(0, `warn:${args.join(' ')}`),
        error: (...args: unknown[]) => this.publishProgress(0, `error:${args.join(' ')}`),
      },
      payload: command.payload,
      publishProgress: async (progress: number, detail: string) => {
        await this.publishProgress(progress, detail);
      },
      sleep: async (ms: number) => {
        await delay(ms);
      },
    });
  }

  async run(): Promise<Record<string, unknown>> {
    const script = new Script(`
      (async () => {
        await publishProgress(15, 'initializing sandbox');
        await sleep(100);
        await publishProgress(35, 'validating payload');
        await sleep(100);
        await publishProgress(65, 'executing job');
        await sleep(150);
        await publishProgress(90, 'finalizing');
        return {
          success: true,
          executionId: payload.executionId,
          detail: 'Sandboxed runtime complete',
        };
      })();
    `, { filename: `job-${this.command.id}.js` });

    const result = await script.runInContext(this.context, { timeout: 10_000 });
    return result as Record<string, unknown>;
  }
}

class RuntimeAgent {
  private agentId: string | null = null;
  private nc: NatsConnection | null = null;
  private commandSubscription: Subscription | null = null;
  private isActive = true;
  private activeCommands = new Set<string>();

  async start(): Promise<void> {
    const view = await this.registerAgent();
    this.agentId = view.id;
    await this.connectNats();
    await this.publishAgentEvent('agent.registered', { status: view.status });
    this.startHeartbeatLoop();
    this.startCommandPollingLoop();
  }

  private async registerAgent(): Promise<RuntimeAgentView> {
    const registration: RuntimeAgentRegistration = {
      name: AGENT_NAME,
      capabilities: AGENT_CAPABILITIES.length ? AGENT_CAPABILITIES : ['any'],
      maxConcurrency: MAX_CONCURRENCY,
      tenantId: process.env.TENANT_ID,
      labels: {
        os: process.platform,
      },
    };

    const response = await fetch(`${BACKEND_URL}/runtime/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registration),
    });
    if (!response.ok) {
      throw new Error(`Agent registration failed: ${response.statusText}`);
    }
    return (await response.json()) as RuntimeAgentView;
  }

  private async connectNats(): Promise<void> {
    try {
      this.nc = await connect({ servers: NATS_URL });
      const subject = `${COMMAND_SUBJECT_PREFIX}.${this.agentId}`;
      this.commandSubscription = this.nc.subscribe(subject);
      this.listenNatsCommands();
      console.log(`Connected to NATS and subscribed to ${subject}`);
    } catch (err) {
      console.warn(`NATS connection failed (${NATS_URL}), falling back to polling.`, err);
    }
  }

  private async listenNatsCommands(): Promise<void> {
    if (!this.commandSubscription) return;
    for await (const msg of this.commandSubscription) {
      const command = JSON.parse(sc.decode(msg.data)) as RuntimeAgentCommand;
      await this.handleCommand(command);
    }
  }

  private startHeartbeatLoop(): void {
    setInterval(async () => {
      if (!this.agentId) return;
      await this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private startCommandPollingLoop(): void {
    setInterval(async () => {
      if (!this.agentId) return;
      await this.pollForCommands();
    }, POLL_INTERVAL_MS);
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.agentId) return;
    try {
      await fetch(`${BACKEND_URL}/runtime/agents/${this.agentId}/heartbeat`, { method: 'POST' });
      await this.publishAgentEvent('agent.heartbeat', { status: 'heartbeat' });
    } catch (err) {
      console.warn('Heartbeat failed, attempting to re-register', err);
      await this.registerAgent().then((view) => {
        this.agentId = view.id;
      });
    }
  }

  private async pollForCommands(): Promise<void> {
    if (!this.agentId || this.nc) return;
    try {
      const response = await fetch(`${BACKEND_URL}/runtime/agents/${this.agentId}/commands`);
      if (!response.ok) return;
      const commands = (await response.json()) as RuntimeAgentCommand[];
      for (const command of commands) {
        await this.handleCommand(command);
      }
    } catch (err) {
      console.warn('Command polling failed', err);
    }
  }

  private async handleCommand(command: RuntimeAgentCommand): Promise<void> {
    if (this.activeCommands.has(command.id)) return;
    this.activeCommands.add(command.id);
    try {
      console.log(`Received command ${command.id} (${command.type})`);
      if (command.type === 'startExecution') {
        await this.executeStartCommand(command);
      }
    } finally {
      this.activeCommands.delete(command.id);
    }
  }

  private async executeStartCommand(command: RuntimeAgentCommand): Promise<void> {
    const sandbox = new RuntimeJobSandbox(command, async (progress, detail) => {
      await this.publishAgentEvent('execution.progress', { executionId: command.executionId, progress, detail });
    });

    try {
      await sandbox.run();
      await this.publishAgentEvent('execution.completed', { executionId: command.executionId, detail: 'Execution completed successfully' });
    } catch (err) {
      await this.publishAgentEvent('execution.failed', { executionId: command.executionId, detail: String(err) });
    }
  }

  private async publishAgentEvent(type: RuntimeAgentEventType, payload: Record<string, unknown>): Promise<void> {
    const event: RuntimeAgentEvent = {
      eventId: `event_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      agentId: this.agentId ?? 'unknown',
      executionId: payload.executionId as string | undefined,
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    if (this.nc) {
      this.nc.publish(EVENT_SUBJECT, sc.encode(JSON.stringify(event)));
      return;
    }

    try {
      await fetch(`${BACKEND_URL}/runtime/agents/${event.agentId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch {
      // if HTTP fallback also fails, drop the event after logging
      console.warn('Failed to publish runtime event via HTTP fallback');
    }
  }
}

(async () => {
  const agent = new RuntimeAgent();
  try {
    await agent.start();
    console.log('Runtime agent online:', AGENT_NAME);
  } catch (error) {
    console.error('Runtime agent failed to start', error);
    process.exit(1);
  }
})();
