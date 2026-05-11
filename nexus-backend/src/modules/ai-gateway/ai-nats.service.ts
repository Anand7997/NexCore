import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { connect, NatsConnection, Subscription, StringCodec } from 'nats';
import type { AiWorkerJob, AiWorkerResult } from '../../contracts/ai-worker-contracts';

const sc = StringCodec();

const SUBJECT_JOBS = 'ai.jobs';
const SUBJECT_RESULTS = 'ai.results';
const SUBJECT_PROGRESS = 'ai.progress';

export type ResultListener = (result: AiWorkerResult) => void;
export type ProgressListener = (event: AiProgressEvent) => void;

export interface AiProgressEvent {
  jobId: string;
  step: string;
  progress: number;
  detail: string;
}

@Injectable()
export class AiNatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiNatsService.name);
  private nc: NatsConnection | null = null;
  private resultSub: Subscription | null = null;
  private progressSub: Subscription | null = null;
  private readonly resultListeners: ResultListener[] = [];
  private readonly progressListeners: ProgressListener[] = [];

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const natsUrl = process.env.NATS_URL ?? 'nats://localhost:4222';
    try {
      this.nc = await connect({ servers: natsUrl });
      this.logger.log(`NATS connected: ${natsUrl}`);
      await this._subscribeResults();
      await this._subscribeProgress();
    } catch (err) {
      this.logger.warn(`NATS unavailable (${natsUrl}) — AI jobs will use REST fallback. ${err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.resultSub?.unsubscribe();
      await this.progressSub?.unsubscribe();
      await this.nc?.drain();
    } catch {
      // best effort
    }
  }

  // ── Publishing ─────────────────────────────────────────────────────────────

  async publishJob(job: AiWorkerJob): Promise<boolean> {
    if (!this.nc) {
      this.logger.warn('NATS not connected — job %s not dispatched', job.id);
      return false;
    }
    this.nc.publish(SUBJECT_JOBS, sc.encode(JSON.stringify(job)));
    this.logger.debug('Published AI job %s to NATS subject %s', job.id, SUBJECT_JOBS);
    return true;
  }

  // ── Listener registration ─────────────────────────────────────────────────

  onResult(listener: ResultListener): void {
    this.resultListeners.push(listener);
  }

  onProgress(listener: ProgressListener): void {
    this.progressListeners.push(listener);
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  private async _subscribeResults(): Promise<void> {
    if (!this.nc) return;
    this.resultSub = this.nc.subscribe(SUBJECT_RESULTS);
    (async () => {
      for await (const msg of this.resultSub!) {
        try {
          const result: AiWorkerResult = JSON.parse(sc.decode(msg.data));
          this.logger.debug('Received AI result for job %s via NATS', result.jobId);
          for (const fn of this.resultListeners) fn(result);
        } catch (err) {
          this.logger.error('Failed to parse NATS result message: %s', err);
        }
      }
    })().catch((err) => this.logger.error('NATS results subscription error: %s', err));
  }

  private async _subscribeProgress(): Promise<void> {
    if (!this.nc) return;
    this.progressSub = this.nc.subscribe(SUBJECT_PROGRESS);
    (async () => {
      for await (const msg of this.progressSub!) {
        try {
          const event: AiProgressEvent = JSON.parse(sc.decode(msg.data));
          for (const fn of this.progressListeners) fn(event);
        } catch {
          // ignore malformed progress messages
        }
      }
    })().catch((err) => this.logger.error('NATS progress subscription error: %s', err));
  }
}
