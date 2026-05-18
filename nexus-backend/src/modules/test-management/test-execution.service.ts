/**
 * TestExecutionService.
 *
 * Manages test execution lifecycle including state machine transitions.
 *
 * STATE MACHINE:
 *   Execution: pending → queued → running → [completed | failed | cancelled]
 *   Results:   pending → running → [passed | failed | skipped | error]
 *
 * Once an execution reaches completed/failed/cancelled, no further
 * transitions are allowed.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { and, desc, eq } from 'drizzle-orm';
import { prefixedId } from '../../common/ids/id.util';
import { DrizzleService } from '../../infrastructure/postgres/drizzle.service';
import {
  testExecutions,
  testExecutionResults,
  testSuiteCases,
  testCases as testCasesSchema,
  testSuites,
} from '../../infrastructure/postgres/schema';
import type { Principal } from '../../common/auth/principal.decorator';
import type {
  TestExecutionView,
  TestExecutionResultView,
  TestExecutionProgressEvent,
  StartExecutionCommand,
  UpdateResultCommand,
  ExecutionStatus,
  TestExecutionResultStatus,
} from '../../contracts/test-contracts';

function tenantIdOf(p: Principal): string {
  return p.tenantId ?? 'default';
}

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

// ─── Valid execution state transitions ───────────────────────────────────────────────

const EXECUTION_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  pending: ['queued'],
  queued: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

const RESULT_TRANSITIONS: Record<TestExecutionResultStatus, TestExecutionResultStatus[]> = {
  pending: ['running'],
  running: ['passed', 'failed', 'skipped', 'error'],
  passed: [],
  failed: [],
  skipped: [],
  error: [],
};

// ─── Mappers ─────────────────────────────────────────────────────────────────────────

function mapExecution(
  row: typeof testExecutions.$inferSelect,
): TestExecutionView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    suiteId: row.suiteId,
    projectId: row.projectId,
    name: row.name,
    status: row.status as ExecutionStatus,
    platform: row.platform,
    config: row.config as Record<string, unknown> | null,
    totalTests: row.totalTests,
    passedTests: row.passedTests,
    failedTests: row.failedTests,
    skippedTests: row.skippedTests,
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function mapExecutionResult(
  row: typeof testExecutionResults.$inferSelect,
): TestExecutionResultView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    executionId: row.executionId,
    testCaseId: row.testCaseId,
    testCaseName: row.testCaseName,
    suiteId: row.suiteId,
    status: row.status as TestExecutionResultStatus,
    platform: row.platform,
    intentId: row.intentId,
    durationMs: row.durationMs,
    error: row.error,
    screenshotUrls: row.screenshotUrls as string[] | null,
    logs: row.logs,
    attempts: row.attempts,
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt)!,
  };
}

@Injectable()
export class TestExecutionService {
  constructor(
    private readonly drizzle: DrizzleService,
    @InjectPinoLogger(TestExecutionService.name)
    private readonly logger: PinoLogger,
  ) {}


  // ═══════════════════════════════════════════════════════════════════════════════════
  //  Start Execution
  // ═══════════════════════════════════════════════════════════════════════════════════

  async startExecution(
    command: StartExecutionCommand,
    principal: Principal,
  ): Promise<TestExecutionView> {
    const tenantId = tenantIdOf(principal);

    const [suiteRow] = await this.drizzle.db
      .select()
      .from(testSuites)
      .where(and(eq(testSuites.id, command.suiteId), eq(testSuites.tenantId, tenantId)));

    if (!suiteRow) {
      throw new NotFoundException(`TestSuite ${command.suiteId} not found`);
    }

    const suiteCaseRows = await this.drizzle.db
      .select()
      .from(testSuiteCases)
      .where(
        and(
          eq(testSuiteCases.suiteId, command.suiteId),
          eq(testSuiteCases.tenantId, tenantId),
        ),
      )
      .orderBy(testSuiteCases.sortOrder);

    if (suiteCaseRows.length === 0) {
      throw new BadRequestException(
        `TestSuite ${command.suiteId} has no test cases`,
      );
    }

    const testCaseIds = suiteCaseRows.map((r) => r.testCaseId);
    const testCaseRows = await this.drizzle.db
      .select()
      .from(testCasesSchema)
      .where(
        and(
          eq(testCasesSchema.tenantId, tenantId),
          ...testCaseIds.map((id) => eq(testCasesSchema.id, id)),
        ),
      );

    const tcMap = new Map(testCaseRows.map((r) => [r.id, r]));
    const now = new Date();
    const executionId = prefixedId('exec');
    const platform = command.platform ?? suiteRow.platform ?? 'web';

    const [execution] = await this.drizzle.db
      .insert(testExecutions)
      .values({
        id: executionId,
        tenantId,
        suiteId: command.suiteId,
        projectId: suiteRow.projectId,
        name: `Execution of ${suiteRow.name}`,
        status: 'queued',
        platform,
        config: (command.config ?? suiteRow.config) as Record<string, unknown> | null,
        totalTests: suiteCaseRows.length,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const resultValues = suiteCaseRows.map((sc) => {
      const tc = tcMap.get(sc.testCaseId);
      return {
        id: prefixedId('eres'),
        tenantId,
        executionId,
        testCaseId: sc.testCaseId,
        testCaseName: tc?.name ?? 'Unknown',
        suiteId: command.suiteId,
        status: 'pending' as TestExecutionResultStatus,
        platform,
        intentId: tc?.intentId ?? null,
        attempts: 0,
        startedAt: null,
        completedAt: null,
        createdAt: now,
      };
    });

    if (resultValues.length > 0) {
      await this.drizzle.db.insert(testExecutionResults).values(resultValues);
    }

    this.logger.info({ executionId, suiteId: command.suiteId }, 'Execution started');
    return mapExecution(execution);
  }


  // ═══════════════════════════════════════════════════════════════════════════════════
  //  Get Execution
  // ═══════════════════════════════════════════════════════════════════════════════════

  async getExecution(
    id: string,
    principal: Principal,
  ): Promise<{ execution: TestExecutionView; results: TestExecutionResultView[] }> {
    const tenantId = tenantIdOf(principal);
    const [execution] = await this.drizzle.db
      .select()
      .from(testExecutions)
      .where(and(eq(testExecutions.id, id), eq(testExecutions.tenantId, tenantId)));

    if (!execution) {
      throw new NotFoundException(`Execution ${id} not found`);
    }

    const results = await this.drizzle.db
      .select()
      .from(testExecutionResults)
      .where(
        and(
          eq(testExecutionResults.executionId, id),
          eq(testExecutionResults.tenantId, tenantId),
        ),
      )
      .orderBy(testExecutionResults.createdAt);

    return {
      execution: mapExecution(execution),
      results: results.map(mapExecutionResult),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  //  List Executions
  // ═══════════════════════════════════════════════════════════════════════════════════

  async listExecutions(
    principal: Principal,
    projectId?: string,
  ): Promise<TestExecutionView[]> {
    const tenantId = tenantIdOf(principal);
    const conditions = [eq(testExecutions.tenantId, tenantId)];
    if (projectId) {
      conditions.push(eq(testExecutions.projectId, projectId));
    }

    const rows = await this.drizzle.db
      .select()
      .from(testExecutions)
      .where(and(...conditions))
      .orderBy(desc(testExecutions.createdAt));

    return rows.map(mapExecution);
  }


  // ═══════════════════════════════════════════════════════════════════════════════════
  //  Update Individual Result
  // ═══════════════════════════════════════════════════════════════════════════════════

  async updateResult(
    executionId: string,
    resultId: string,
    command: UpdateResultCommand,
    principal: Principal,
  ): Promise<{ execution: TestExecutionView; result: TestExecutionResultView }> {
    const tenantId = tenantIdOf(principal);

    const [execution] = await this.drizzle.db
      .select()
      .from(testExecutions)
      .where(and(eq(testExecutions.id, executionId), eq(testExecutions.tenantId, tenantId)));

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    if (execution.status === 'completed' || execution.status === 'failed' || execution.status === 'cancelled') {
      throw new BadRequestException(
        `Execution ${executionId} is already ${execution.status}, cannot update results`,
      );
    }

    const [resultRow] = await this.drizzle.db
      .select()
      .from(testExecutionResults)
      .where(
        and(
          eq(testExecutionResults.id, resultId),
          eq(testExecutionResults.executionId, executionId),
          eq(testExecutionResults.tenantId, tenantId),
        ),
      );

    if (!resultRow) {
      throw new NotFoundException(
        `Result ${resultId} not found in execution ${executionId}`,
      );
    }

    const allowed = RESULT_TRANSITIONS[resultRow.status as TestExecutionResultStatus] ?? [];
    if (!allowed.includes(command.status)) {
      throw new BadRequestException(
        `Invalid result status transition: ${resultRow.status} → ${command.status}. ` +
        `Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const now = new Date();
    const resultPatch: Partial<typeof testExecutionResults.$inferInsert> = {
      status: command.status,
    };
    if (command.durationMs !== undefined) resultPatch.durationMs = command.durationMs;
    if (command.error !== undefined) resultPatch.error = command.error;
    if (command.screenshotUrls !== undefined)
      resultPatch.screenshotUrls = command.screenshotUrls as string[];
    if (command.logs !== undefined) resultPatch.logs = command.logs;
    if (command.attempts !== undefined) resultPatch.attempts = command.attempts;

    if (command.status === 'running' && !resultRow.startedAt) {
      resultPatch.startedAt = now;
    }
    if (['passed', 'failed', 'skipped', 'error'].includes(command.status)) {
      resultPatch.completedAt = now;
    }

    const [updatedResult] = await this.drizzle.db
      .update(testExecutionResults)
      .set(resultPatch)
      .where(
        and(
          eq(testExecutionResults.id, resultId),
          eq(testExecutionResults.executionId, executionId),
        ),
      )
      .returning();

    let executionPatch: Partial<typeof testExecutions.$inferInsert> = {
      updatedAt: now,
    };

    if (execution.status === 'queued' && command.status === 'running') {
      executionPatch.status = 'running';
    }

    const allResults = await this.drizzle.db
      .select()
      .from(testExecutionResults)
      .where(
        and(
          eq(testExecutionResults.executionId, executionId),
          eq(testExecutionResults.tenantId, tenantId),
        ),
      );

    const totals = {
      totalTests: allResults.length,
      passedTests: allResults.filter((r) => r.status === 'passed').length,
      failedTests: allResults.filter((r) => r.status === 'failed').length,
      skippedTests: allResults.filter((r) => r.status === 'skipped').length,
    };

    executionPatch.totalTests = totals.totalTests;
    executionPatch.passedTests = totals.passedTests;
    executionPatch.failedTests = totals.failedTests;
    executionPatch.skippedTests = totals.skippedTests;

    const [updatedExecution] = await this.drizzle.db
      .update(testExecutions)
      .set(executionPatch)
      .where(and(eq(testExecutions.id, executionId), eq(testExecutions.tenantId, tenantId)))
      .returning();

    this.logger.info(
      { executionId, resultId, status: command.status },
      'Result updated',
    );

    return {
      execution: mapExecution(updatedExecution),
      result: mapExecutionResult(updatedResult),
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════════════
  //  Complete / Fail / Cancel Execution
  // ═══════════════════════════════════════════════════════════════════════════════════

  async completeExecution(
    executionId: string,
    principal: Principal,
  ): Promise<TestExecutionView> {
    return this.transitionExecution(executionId, 'completed', principal);
  }

  async failExecution(
    executionId: string,
    error?: string,
    principal?: Principal,
  ): Promise<TestExecutionView> {
    const p = principal ?? { sub: 'system', roles: [], tenantId: 'default' };
    return this.transitionExecution(executionId, 'failed', p, error);
  }

  async cancelExecution(
    executionId: string,
    principal: Principal,
  ): Promise<TestExecutionView> {
    return this.transitionExecution(executionId, 'cancelled', principal);
  }

  async cancelExecutionByCommand(
    executionId: string,
    principal: Principal,
  ): Promise<TestExecutionView> {
    this.logger.info({ executionId }, 'Cancel execution requested');
    return this.cancelExecution(executionId, principal);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  //  Get Execution Timeline
  // ═══════════════════════════════════════════════════════════════════════════════════

  async getExecutionTimeline(
    executionId: string,
    principal: Principal,
  ): Promise<TestExecutionResultView[]> {
    const tenantId = tenantIdOf(principal);
    await this.getExecution(executionId, principal);

    const results = await this.drizzle.db
      .select()
      .from(testExecutionResults)
      .where(
        and(
          eq(testExecutionResults.executionId, executionId),
          eq(testExecutionResults.tenantId, tenantId),
        ),
      )
      .orderBy(testExecutionResults.createdAt);

    return results.map(mapExecutionResult);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  //  Internal: State machine transition
  // ═══════════════════════════════════════════════════════════════════════════════════

  private async transitionExecution(
    executionId: string,
    targetStatus: ExecutionStatus,
    principal: Principal,
    error?: string,
  ): Promise<TestExecutionView> {
    const tenantId = tenantIdOf(principal);

    const [execution] = await this.drizzle.db
      .select()
      .from(testExecutions)
      .where(and(eq(testExecutions.id, executionId), eq(testExecutions.tenantId, tenantId)));

    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    const currentStatus = execution.status as ExecutionStatus;
    const allowed = EXECUTION_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Invalid execution status transition: ${currentStatus} → ${targetStatus}. ` +
        `Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const now = new Date();
    const patch: Partial<typeof testExecutions.$inferInsert> = {
      status: targetStatus,
      updatedAt: now,
    };

    if (targetStatus === 'running' && !execution.startedAt) {
      patch.startedAt = now;
    }
    if (['completed', 'failed', 'cancelled'].includes(targetStatus)) {
      patch.completedAt = now;
    }

    const [updated] = await this.drizzle.db
      .update(testExecutions)
      .set(patch)
      .where(and(eq(testExecutions.id, executionId), eq(testExecutions.tenantId, tenantId)))
      .returning();

    this.logger.info(
      { executionId, from: currentStatus, to: targetStatus },
      'Execution status transitioned',
    );

    return mapExecution(updated);
  }
}
