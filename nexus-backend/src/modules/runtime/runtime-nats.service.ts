import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, NatsConnection, StringCodec, Subscription } from 'nats';
import type { RuntimeAgentCommand, RuntimeAgentEvent } from '../../contracts/execution-contracts';

const sc = StringCodec();
const COMMAND_SUBJECT_PREFIX = 'runtime.commands';
const EVENT_SUBJECT = 'runtime.events';

type EventListener = (event: RuntimeAgentEvent) => void;

export interface RuntimeNatsClient {
  publishCommand(agentId: string, command: RuntimeAgentCommand): Promise<boolean>;
  publishEvent(event: RuntimeAgentEvent): Promise<boolean>;
  onEvent(listener: EventListener): void;
}

@Injectable()
export class RuntimeNatsService implements RuntimeNatsClient, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RuntimeNatsService.name);
  private nc: NatsConnection | null = null;
  private eventSubscription: Subscription | null = null;
  private readonly eventListeners: EventListener[] = [];

  async onModuleInit(): Promise<void> {
    const natsUrl = process.env.NATS_URL ?? 'nats://localhost:4222';
    try {
      this.nc = await connect({ servers: natsUrl });
      this.logger.log(`Connected to NATS at ${natsUrl}`);
      await this.subscribeEvents();
    } catch (err) {
      this.logger.warn(`NATS unavailable (${natsUrl}) — runtime commands will use HTTP fallback. ${err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.eventSubscription?.unsubscribe();
      await this.nc?.drain();
    } catch {
      // best effort
    }
  }

  async publishCommand(agentId: string, command: RuntimeAgentCommand): Promise<boolean> {
    if (!this.nc) {
      this.logger.warn('NATS not connected — runtime command %s not published', command.id);
      return false;
    }
    const subject = `${COMMAND_SUBJECT_PREFIX}.${agentId}`;
    this.nc.publish(subject, sc.encode(JSON.stringify(command)));
    this.logger.debug('Published runtime command %s to %s', command.id, subject);
    return true;
  }

  async publishEvent(event: RuntimeAgentEvent): Promise<boolean> {
    if (!this.nc) {
      this.logger.warn('NATS not connected — runtime event %s not published', event.eventId);
      return false;
    }
    this.nc.publish(EVENT_SUBJECT, sc.encode(JSON.stringify(event)));
    this.logger.debug('Published runtime event %s', event.eventId);
    return true;
  }

  onEvent(listener: EventListener): void {
    this.eventListeners.push(listener);
  }

  private async subscribeEvents(): Promise<void> {
    if (!this.nc) return;
    this.eventSubscription = this.nc.subscribe(EVENT_SUBJECT);
    (async () => {
      for await (const msg of this.eventSubscription!) {
        try {
          const event: RuntimeAgentEvent = JSON.parse(sc.decode(msg.data));
          this.logger.debug('Received runtime event %s from agent %s', event.eventId, event.agentId);
          for (const listener of this.eventListeners) {
            listener(event);
          }
        } catch (err) {
          this.logger.error('Failed to parse runtime event from NATS: %s', err);
        }
      }
    })().catch((err) => this.logger.error('NATS runtime event subscription failed: %s', err));
  }
}
