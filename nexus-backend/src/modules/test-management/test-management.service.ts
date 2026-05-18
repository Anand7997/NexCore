/**
 * TestManagementService.
 *
 * Provides CRUD operations for projects, modules, test cases, and test suites.
 * All scoped to a tenant obtained from the Principal.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { prefixedId } from '../../common/ids/id.util';
import { DrizzleService } from '../../infrastructure/postgres/drizzle.service';
import {
  projects,
  projectModules,
  testCases,
  testSuites,
  testSuiteCases,
} from '../../infrastructure/postgres/schema';
import type { Principal } from '../../common/auth/principal.decorator';
import type {
  ProjectView,
  ProjectModuleView,
  TestCaseView,
  TestSuiteView,
  TestSuiteCaseView,
  CreateProjectDto,
  UpdateProjectDto,
  CreateProjectModuleDto,
  UpdateProjectModuleDto,
  CreateTestCaseDto,
  UpdateTestCaseDto,
  CreateTestSuiteDto,
  UpdateTestSuiteDto,
  AddCasesToSuiteDto,
  ListTestCasesQuery,
} from '../../contracts/test-contracts';

function tenantIdOf(p: Principal): string {
  return p.tenantId ?? 'default';
}

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

// ─── Mappers ───────────────────────────────────────────────────────────────────────────

function mapProject(row: typeof projects.$inferSelect): ProjectView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    status: row.status,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function mapModule(row: typeof projectModules.$inferSelect): ProjectModuleView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    testingTypes: row.testingTypes as string[],
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function mapTestCase(row: typeof testCases.$inferSelect): TestCaseView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    moduleId: row.moduleId,
    name: row.name,
    description: row.description,
    platform: row.platform as TestCaseView['platform'],
    intentId: row.intentId,
    config: row.config as Record<string, unknown>,
    steps: row.steps as unknown[],
    expectedResult: row.expectedResult,
    status: row.status as TestCaseView['status'],
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function mapSuite(row: typeof testSuites.$inferSelect): TestSuiteView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    platform: row.platform,
    config: row.config as Record<string, unknown>,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function mapSuiteCase(
  row: typeof testSuiteCases.$inferSelect,
): TestSuiteCaseView {
  return {
    id: row.id,
    suiteId: row.suiteId,
    testCaseId: row.testCaseId,
    sortOrder: row.sortOrder,
    createdAt: toIso(row.createdAt)!,
  };
}

@Injectable()
export class TestManagementService {
  constructor(
    private readonly drizzle: DrizzleService,
    @InjectPinoLogger(TestManagementService.name)
    private readonly logger: PinoLogger,
  ) {}


  // ═══════════════════════════════════════════════════════════════════════════════════
  //  Projects
  // ═══════════════════════════════════════════════════════════════════════════════════

  async createProject(
    dto: CreateProjectDto,
    principal: Principal,
  ): Promise<ProjectView> {
    const tenantId = tenantIdOf(principal);
    const id = prefixedId('proj');
    const now = new Date();

    const [row] = await this.drizzle.db
      .insert(projects)
      .values({
        id,
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        status: 'active',
        metadata: (dto.metadata ?? {}) as Record<string, unknown>,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    this.logger.info({ projectId: id, tenantId }, 'Project created');
    return mapProject(row);
  }

  async listProjects(principal: Principal): Promise<ProjectView[]> {
    const tenantId = tenantIdOf(principal);
    const rows = await this.drizzle.db
      .select()
      .from(projects)
      .where(
        and(eq(projects.tenantId, tenantId), eq(projects.status, 'active')),
      )
      .orderBy(desc(projects.createdAt));

    return rows.map(mapProject);
  }

  async getProject(
    id: string,
    principal: Principal,
  ): Promise<ProjectView> {
    const tenantId = tenantIdOf(principal);
    const [row] = await this.drizzle.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)));

    if (!row) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return mapProject(row);
  }

  async updateProject(
    id: string,
    dto: UpdateProjectDto,
    principal: Principal,
  ): Promise<ProjectView> {
    const tenantId = tenantIdOf(principal);
    await this.getProject(id, principal);

    const patch: Partial<typeof projects.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.metadata !== undefined)
      patch.metadata = dto.metadata as Record<string, unknown>;

    const [row] = await this.drizzle.db
      .update(projects)
      .set(patch)
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
      .returning();

    this.logger.info({ projectId: id, tenantId }, 'Project updated');
    return mapProject(row);
  }

  async deleteProject(id: string, principal: Principal): Promise<void> {
    await this.getProject(id, principal);

    const tenantId = tenantIdOf(principal);
    await this.drizzle.db
      .update(projects)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)));

    this.logger.info({ projectId: id, tenantId }, 'Project soft-deleted');
  }


  // ═══════════════════════════════════════════════════════════════════════════════════
  //  Modules
  // ═══════════════════════════════════════════════════════════════════════════════════

  async createModule(
    projectId: string,
    dto: CreateProjectModuleDto,
    principal: Principal,
  ): Promise<ProjectModuleView> {
    const tenantId = tenantIdOf(principal);
    await this.getProject(projectId, principal);

    const id = prefixedId('mod');
    const now = new Date();

    try {
      const [row] = await this.drizzle.db
        .insert(projectModules)
        .values({
          id,
          tenantId,
          projectId,
          name: dto.name,
          description: dto.description ?? null,
          testingTypes: (dto.testingTypes ?? []) as string[],
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      this.logger.info({ moduleId: id, projectId }, 'Module created');
      return mapModule(row);
    } catch (err: any) {
      if (err?.constraint === 'test_project_modules_pid_name_uidx' || err?.code === '23505') {
        throw new BadRequestException(
          `Module with name "${dto.name}" already exists in this project`,
        );
      }
      throw err;
    }
  }

  async listModulesByProject(
    projectId: string,
    principal: Principal,
  ): Promise<ProjectModuleView[]> {
    const tenantId = tenantIdOf(principal);
    const rows = await this.drizzle.db
      .select()
      .from(projectModules)
      .where(
        and(
          eq(projectModules.projectId, projectId),
          eq(projectModules.tenantId, tenantId),
        ),
      )
      .orderBy(desc(projectModules.createdAt));

    return rows.map(mapModule);
  }

  async getModule(id: string, principal: Principal): Promise<ProjectModuleView> {
    const tenantId = tenantIdOf(principal);
    const [row] = await this.drizzle.db
      .select()
      .from(projectModules)
      .where(and(eq(projectModules.id, id), eq(projectModules.tenantId, tenantId)));

    if (!row) {
      throw new NotFoundException(`Module ${id} not found`);
    }
    return mapModule(row);
  }

  async updateModule(
    id: string,
    dto: UpdateProjectModuleDto,
    principal: Principal,
  ): Promise<ProjectModuleView> {
    const tenantId = tenantIdOf(principal);
    await this.getModule(id, principal);

    const patch: Partial<typeof projectModules.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.testingTypes !== undefined)
      patch.testingTypes = dto.testingTypes as string[];

    try {
      const [row] = await this.drizzle.db
        .update(projectModules)
        .set(patch)
        .where(and(eq(projectModules.id, id), eq(projectModules.tenantId, tenantId)))
        .returning();

      this.logger.info({ moduleId: id }, 'Module updated');
      return mapModule(row);
    } catch (err: any) {
      if (err?.constraint === 'test_project_modules_pid_name_uidx' || err?.code === '23505') {
        throw new BadRequestException(
          `Module with name "${dto.name}" already exists in this project`,
        );
      }
      throw err;
    }
  }

  async deleteModule(id: string, principal: Principal): Promise<void> {
    const tenantId = tenantIdOf(principal);
    await this.getModule(id, principal);

    await this.drizzle.db
      .delete(projectModules)
      .where(and(eq(projectModules.id, id), eq(projectModules.tenantId, tenantId)));

    this.logger.info({ moduleId: id }, 'Module deleted');
  }


  // ═══════════════════════════════════════════════════════════════════════════════════
  //  Test Cases
  // ═══════════════════════════════════════════════════════════════════════════════════

  async createTestCase(
    projectId: string,
    dto: CreateTestCaseDto,
    principal: Principal,
  ): Promise<TestCaseView> {
    const tenantId = tenantIdOf(principal);
    await this.getProject(projectId, principal);

    const id = prefixedId('tc');
    const now = new Date();

    const [row] = await this.drizzle.db
      .insert(testCases)
      .values({
        id,
        tenantId,
        projectId,
        moduleId: dto.moduleId,
        name: dto.name,
        description: dto.description ?? null,
        platform: dto.platform,
        intentId: dto.intentId ?? null,
        config: (dto.config ?? {}) as Record<string, unknown>,
        steps: (dto.steps ?? []) as unknown[],
        expectedResult: dto.expectedResult ?? null,
        status: dto.status ?? 'draft',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    this.logger.info({ testCaseId: id, projectId }, 'TestCase created');
    return mapTestCase(row);
  }

  async listTestCasesByProject(
    projectId: string,
    filters?: ListTestCasesQuery,
    principal?: Principal,
  ): Promise<TestCaseView[]> {
    const conditions = [eq(testCases.projectId, projectId)];
    if (principal) {
      conditions.push(eq(testCases.tenantId, tenantIdOf(principal)));
    }
    if (filters?.moduleId) {
      conditions.push(eq(testCases.moduleId, filters.moduleId));
    }
    if (filters?.platform) {
      conditions.push(eq(testCases.platform, filters.platform));
    }

    const rows = await this.drizzle.db
      .select()
      .from(testCases)
      .where(and(...conditions))
      .orderBy(desc(testCases.createdAt));

    return rows.map(mapTestCase);
  }

  async listTestCasesByModule(
    moduleId: string,
    principal: Principal,
  ): Promise<TestCaseView[]> {
    const tenantId = tenantIdOf(principal);
    const rows = await this.drizzle.db
      .select()
      .from(testCases)
      .where(
        and(eq(testCases.moduleId, moduleId), eq(testCases.tenantId, tenantId)),
      )
      .orderBy(desc(testCases.createdAt));

    return rows.map(mapTestCase);
  }

  async getTestCase(id: string, principal: Principal): Promise<TestCaseView> {
    const tenantId = tenantIdOf(principal);
    const [row] = await this.drizzle.db
      .select()
      .from(testCases)
      .where(and(eq(testCases.id, id), eq(testCases.tenantId, tenantId)));

    if (!row) {
      throw new NotFoundException(`TestCase ${id} not found`);
    }
    return mapTestCase(row);
  }

  async updateTestCase(
    id: string,
    dto: UpdateTestCaseDto,
    principal: Principal,
  ): Promise<TestCaseView> {
    const tenantId = tenantIdOf(principal);
    await this.getTestCase(id, principal);

    const patch: Partial<typeof testCases.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.platform !== undefined) patch.platform = dto.platform;
    if (dto.moduleId !== undefined) patch.moduleId = dto.moduleId;
    if (dto.intentId !== undefined) patch.intentId = dto.intentId;
    if (dto.config !== undefined)
      patch.config = dto.config as Record<string, unknown>;
    if (dto.steps !== undefined) patch.steps = dto.steps as unknown[];
    if (dto.expectedResult !== undefined)
      patch.expectedResult = dto.expectedResult;
    if (dto.status !== undefined) patch.status = dto.status;

    const [row] = await this.drizzle.db
      .update(testCases)
      .set(patch)
      .where(and(eq(testCases.id, id), eq(testCases.tenantId, tenantId)))
      .returning();

    this.logger.info({ testCaseId: id }, 'TestCase updated');
    return mapTestCase(row);
  }

  async deleteTestCase(id: string, principal: Principal): Promise<void> {
    const tenantId = tenantIdOf(principal);
    await this.getTestCase(id, principal);

    await this.drizzle.db
      .delete(testCases)
      .where(and(eq(testCases.id, id), eq(testCases.tenantId, tenantId)));

    this.logger.info({ testCaseId: id }, 'TestCase deleted');
  }


  // ═══════════════════════════════════════════════════════════════════════════════════
  //  Test Suites
  // ═══════════════════════════════════════════════════════════════════════════════════

  async createTestSuite(
    projectId: string,
    dto: CreateTestSuiteDto,
    principal: Principal,
  ): Promise<TestSuiteView> {
    const tenantId = tenantIdOf(principal);
    await this.getProject(projectId, principal);

    const id = prefixedId('suite');
    const now = new Date();

    const [row] = await this.drizzle.db
      .insert(testSuites)
      .values({
        id,
        tenantId,
        projectId,
        name: dto.name,
        description: dto.description ?? null,
        platform: dto.platform ?? null,
        config: (dto.config ?? {}) as Record<string, unknown>,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    this.logger.info({ suiteId: id, projectId }, 'TestSuite created');
    return mapSuite(row);
  }

  async listTestSuitesByProject(
    projectId: string,
    principal: Principal,
  ): Promise<TestSuiteView[]> {
    const tenantId = tenantIdOf(principal);
    const rows = await this.drizzle.db
      .select()
      .from(testSuites)
      .where(
        and(eq(testSuites.projectId, projectId), eq(testSuites.tenantId, tenantId)),
      )
      .orderBy(desc(testSuites.createdAt));

    return rows.map(mapSuite);
  }

  async getTestSuite(
    id: string,
    principal: Principal,
  ): Promise<TestSuiteView> {
    const tenantId = tenantIdOf(principal);
    const [row] = await this.drizzle.db
      .select()
      .from(testSuites)
      .where(and(eq(testSuites.id, id), eq(testSuites.tenantId, tenantId)));

    if (!row) {
      throw new NotFoundException(`TestSuite ${id} not found`);
    }
    return mapSuite(row);
  }

  async updateTestSuite(
    id: string,
    dto: UpdateTestSuiteDto,
    principal: Principal,
  ): Promise<TestSuiteView> {
    const tenantId = tenantIdOf(principal);
    await this.getTestSuite(id, principal);

    const patch: Partial<typeof testSuites.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.platform !== undefined) patch.platform = dto.platform;
    if (dto.config !== undefined)
      patch.config = dto.config as Record<string, unknown>;

    const [row] = await this.drizzle.db
      .update(testSuites)
      .set(patch)
      .where(and(eq(testSuites.id, id), eq(testSuites.tenantId, tenantId)))
      .returning();

    this.logger.info({ suiteId: id }, 'TestSuite updated');
    return mapSuite(row);
  }

  async deleteTestSuite(id: string, principal: Principal): Promise<void> {
    const tenantId = tenantIdOf(principal);
    await this.getTestSuite(id, principal);

    await this.drizzle.db
      .delete(testSuiteCases)
      .where(eq(testSuiteCases.suiteId, id));

    await this.drizzle.db
      .delete(testSuites)
      .where(and(eq(testSuites.id, id), eq(testSuites.tenantId, tenantId)));

    this.logger.info({ suiteId: id }, 'TestSuite deleted');
  }


  // ═══════════════════════════════════════════════════════════════════════════════════
  //  Suite Cases (associations)
  // ═══════════════════════════════════════════════════════════════════════════════════

  async addCasesToSuite(
    suiteId: string,
    dto: AddCasesToSuiteDto,
    principal: Principal,
  ): Promise<TestSuiteCaseView[]> {
    const tenantId = tenantIdOf(principal);
    await this.getTestSuite(suiteId, principal);

    const existingCases = await this.drizzle.db
      .select()
      .from(testSuiteCases)
      .where(eq(testSuiteCases.suiteId, suiteId))
      .orderBy(desc(testSuiteCases.sortOrder));

    let nextSortOrder =
      existingCases.length > 0 ? existingCases[0].sortOrder + 1 : 0;

    const now = new Date();
    const rows: (typeof testSuiteCases.$inferSelect)[] = [];

    for (const testCaseId of dto.testCaseIds) {
      await this.getTestCase(testCaseId, principal);

      try {
        const id = prefixedId('tsc');
        const [row] = await this.drizzle.db
          .insert(testSuiteCases)
          .values({
            id,
            tenantId,
            suiteId,
            testCaseId,
            sortOrder: nextSortOrder++,
            createdAt: now,
          })
          .returning();
        rows.push(row);
      } catch (err: any) {
        if (err?.constraint === 'test_suite_cases_sid_tcid_uidx' || err?.code === '23505') {
          this.logger.warn(
            { suiteId, testCaseId },
            'TestCase already in suite, skipping',
          );
          continue;
        }
        throw err;
      }
    }

    this.logger.info(
      { suiteId, count: rows.length },
      'Cases added to suite',
    );
    return rows.map(mapSuiteCase);
  }

  async removeCaseFromSuite(
    suiteId: string,
    testCaseId: string,
    principal: Principal,
  ): Promise<void> {
    const tenantId = tenantIdOf(principal);
    await this.getTestSuite(suiteId, principal);

    await this.drizzle.db
      .delete(testSuiteCases)
      .where(
        and(
          eq(testSuiteCases.suiteId, suiteId),
          eq(testSuiteCases.testCaseId, testCaseId),
          eq(testSuiteCases.tenantId, tenantId),
        ),
      );

    this.logger.info({ suiteId, testCaseId }, 'Case removed from suite');
  }

  async listSuiteCases(
    suiteId: string,
    principal: Principal,
  ): Promise<{ suiteCase: TestSuiteCaseView; testCase: TestCaseView }[]> {
    const tenantId = tenantIdOf(principal);
    await this.getTestSuite(suiteId, principal);

    const rows = await this.drizzle.db
      .select()
      .from(testSuiteCases)
      .where(
        and(
          eq(testSuiteCases.suiteId, suiteId),
          eq(testSuiteCases.tenantId, tenantId),
        ),
      )
      .orderBy(testSuiteCases.sortOrder);

    const caseIds = rows.map((r) => r.testCaseId);

    const tcRows = await this.drizzle.db
      .select()
      .from(testCases)
      .where(and(inArray(testCases.id, caseIds), eq(testCases.tenantId, tenantId)));

    const tcMap = new Map(tcRows.map((r) => [r.id, r]));

    return rows.map((sc) => ({
      suiteCase: mapSuiteCase(sc),
      testCase: tcMap.get(sc.testCaseId)
        ? mapTestCase(tcMap.get(sc.testCaseId)!)
        : (null as unknown as TestCaseView),
    }));
  }
}
