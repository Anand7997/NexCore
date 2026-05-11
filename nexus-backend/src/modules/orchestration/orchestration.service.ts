import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { WorkflowNotFoundError } from '@temporalio/client';
import { prefixedId } from '../../common/ids/id.util';
import type { Principal } from '../../common/auth/principal.decorator';
import type {
  StartExecutionCommand,
  ExecutionRunView,
  CancelExecutionCommand,
  ExecutionStatus,
} from '../../contracts/execution-contracts';
import { DrizzleService } from '../../infrastructure/postgres/drizzle.service';
import { executionRuns } from '../../infrastructure/postgres/schema';
import { TemporalClientService } from '../../infrastructure/temporal/temporal-client.service';
import { EXECUTION_TASK_QUEUE } from '../../infrastructure/temporal/temporal.constants';
import {
  executionWorkflow,
  cancelExecutionSignal,
  agentHeartbeatSignal,
  getExecutionStatusQuery,
} from '../../temporal/workflows/execution.workflow';

@Injectable()
export class OrchestrationService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly temporal: TemporalClientService,
    @InjectPinoLogger(OrchestrationService.name)
    private readonly logger: PinoLogger,
  ) {}

  async startExecution(
    command: StartExecutionCommand,
    principal: Principal,
  ): Promise<ExecutionRunView> {
    const id = prefixedId('exec');
    const tenantId = principal.tenantId ?? 'default';
    const temporalWorkflowId = `exec-${id}`;

    // Persist initial record before starting the workflow so we have a row to
    // update with the Temporal run ID once the handle is returned.
    await this.drizzle.db.insert(executionRuns).values({
      id,
      tenantId,
      workflowId: command.workflowId,
      platform: command.platform,
      status: 'queued',
      variables: command.variables ?? {},
      temporalWorkflowId,
    });

    // Start the Temporal workflow
    const handle = await this.temporal.client.workflow.start(executionWorkflow, {
      taskQueue: EXECUTION_TASK_QUEUE,
      workflowId: temporalWorkflowId,
      args: [
        {
          executionId: id,
          tenantId,
          platform: command.platform,
          workflowDefinitionId: command.workflowId,
          requiredCapabilities: command.requiredCapabilities ?? [command.platform],
          variables: command.variables ?? {},
        },
      ],
    });

    // Persist the Temporal run ID (first run ID, useful for replay)
    await this.drizzle.db
      .update(executionRuns)
      .set({ temporalRunId: handle.firstExecutionRunId })
      .where(eq(executionRuns.id, id));

    this.logger.info(
      { executionId: id, temporalWorkflowId, runId: handle.firstExecutionRunId },
      'Execution workflow started',
    );

    return {
      id,
      workflowId: command.workflowId,
      platform: command.platform,
      status: 'queued',
      variables: command.variables ?? {},
      temporalWorkflowId,
      temporalRunId: handle.firstExecutionRunId,
      createdAt: new Date().toISOString(),
    };
  }

  async cancelExecution(id: string, cmd: CancelExecutionCommand = {}): Promise<void> {
    const run = await this.getExecutionRecord(id);
    if (!run.temporalWorkflowId) {
      throw new NotFoundException(`Execution ${id} has no associated Temporal workflow`);
    }
    try {
      const handle = this.temporal.getWorkflowHandle(run.temporalWorkflowId);
      await handle.signal(cancelExecutionSignal, { reason: cmd.reason });
      this.logger.info({ executionId: id, reason: cmd.reason }, 'Cancel signal sent');
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        throw new NotFoundException(`Workflow for execution ${id} not found`);
      }
      throw err;
    }
  }

  async getExecutionStatus(id: string): Promise<ExecutionStatus> {
    const run = await this.getExecutionRecord(id);
    if (!run.temporalWorkflowId) {
      return run.status as ExecutionStatus;
    }
    try {
      const handle = this.temporal.getWorkflowHandle(run.temporalWorkflowId);
      return await handle.query(getExecutionStatusQuery);
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        // Workflow already completed – return DB status
        return run.status as ExecutionStatus;
      }
      throw err;
    }
  }

  async sendAgentHeartbeat(id: string, progress: number): Promise<void> {
    const run = await this.getExecutionRecord(id);
    if (!run.temporalWorkflowId) {
      throw new NotFoundException(`Execution ${id} has no associated Temporal workflow`);
    }
    const handle = this.temporal.getWorkflowHandle(run.temporalWorkflowId);
    await handle.signal(agentHeartbeatSignal, { progress });
  }

  async listExecutions(): Promise<ExecutionRunView[]> {
    const rows = await this.drizzle.db.select().from(executionRuns);
    return rows.map(this.toView);
  }

  async getExecution(id: string): Promise<ExecutionRunView> {
    const run = await this.getExecutionRecord(id);
    return this.toView(run);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async getExecutionRecord(id: string) {
    const [run] = await this.drizzle.db
      .select()
      .from(executionRuns)
      .where(eq(executionRuns.id, id))
      .limit(1);
    if (!run) throw new NotFoundException(`Execution ${id} not found`);
    return run;
  }

  private toView(row: typeof executionRuns.$inferSelect): ExecutionRunView {
    return {
      id: row.id,
      workflowId: row.workflowId,
      platform: row.platform as ExecutionRunView['platform'],
      status: row.status as ExecutionRunView['status'],
      variables: row.variables as Record<string, unknown>,
      temporalWorkflowId: row.temporalWorkflowId ?? undefined,
      temporalRunId: row.temporalRunId ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

