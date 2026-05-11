import { Injectable, Logger } from '@nestjs/common';
import { prefixedId } from '../../common/ids/id.util';
import type { Principal } from '../../common/auth/principal.decorator';
import type {
  AiJobType,
  AiWorkerJob,
  AiWorkerResult,
  EvidenceBundle,
} from '../../contracts/ai-worker-contracts';
import { AiNatsService } from './ai-nats.service';
import { AiInvestigationGateway } from './ai-investigation.gateway';

type StoredJob = AiWorkerJob & {
  status: 'queued' | 'dispatched' | 'completed' | 'failed';
  result?: AiWorkerResult;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly jobs = new Map<string, StoredJob>();

  constructor(
    private readonly nats: AiNatsService,
    private readonly wsGateway: AiInvestigationGateway,
  ) {
    // Wire NATS result ingestion into the service store and WS broadcast
    this.nats.onResult((result) => {
      this.ingestResult(result);
      this.wsGateway.broadcastResult(result);
    });
  }

  // ── Job creation ──────────────────────────────────────────────────────────

  async createJob(
    type: AiJobType,
    evidence: EvidenceBundle,
    principal: Principal,
  ): Promise<StoredJob> {
    const now = new Date().toISOString();
    const job: StoredJob = {
      id: prefixedId('aijob'),
      tenantId: principal.tenantId ?? 'default',
      type,
      evidence,
      policy: {
        allowWorkflowMutation: false,
        requireHumanApproval: true,
      },
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);

    // Dispatch to Python worker via NATS; status stays 'queued' on NATS failure
    const dispatched = await this.nats.publishJob(job);
    if (dispatched) {
      job.status = 'dispatched';
      job.updatedAt = new Date().toISOString();
      this.logger.log('AI job %s dispatched via NATS (type=%s)', job.id, type);
    } else {
      this.logger.warn(
        'AI job %s could not be dispatched — NATS unavailable. Submit result manually via POST /ai/results.',
        job.id,
      );
    }
    return job;
  }

  // ── Result ingestion ──────────────────────────────────────────────────────

  ingestResult(result: AiWorkerResult): StoredJob | undefined {
    const job = this.jobs.get(result.jobId);
    if (!job) {
      this.logger.warn('Received result for unknown job %s — ignoring', result.jobId);
      return undefined;
    }
    job.status = result.status;
    job.result = this._validateResult(result);
    job.updatedAt = new Date().toISOString();
    this.logger.log(
      'AI job %s ingested result (status=%s confidence=%.2f)',
      result.jobId,
      result.status,
      result.confidence,
    );
    return job;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getJob(id: string): StoredJob | undefined {
    return this.jobs.get(id);
  }

  listJobs(): StoredJob[] {
    return [...this.jobs.values()].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    );
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private _validateResult(result: AiWorkerResult): AiWorkerResult {
    return {
      ...result,
      confidence: Math.max(0, Math.min(1, result.confidence)),
      findings: result.findings ?? [],
      recommendations: result.recommendations ?? [],
    };
  }
}
