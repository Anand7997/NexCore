/**
 * TestManagementController.
 *
 * REST endpoints for managing projects, modules, test cases, and test suites.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TestManagementService } from './test-management.service';
import { CurrentPrincipal } from '../../common/auth/principal.decorator';
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

@Controller('test-management')
export class TestManagementController {
  constructor(private readonly service: TestManagementService) {}

  // ═════════════════════════════════════════════════════════════════════════════════
  //  Projects
  // ═════════════════════════════════════════════════════════════════════════════════

  @Post('projects')
  async createProject(
    @Body() dto: CreateProjectDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProjectView> {
    return this.service.createProject(dto, principal);
  }

  @Get('projects')
  async listProjects(
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProjectView[]> {
    return this.service.listProjects(principal);
  }

  @Get('projects/:id')
  async getProject(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProjectView> {
    return this.service.getProject(id, principal);
  }

  @Patch('projects/:id')
  async updateProject(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProjectView> {
    return this.service.updateProject(id, dto, principal);
  }

  @Delete('projects/:id')
  async deleteProject(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    return this.service.deleteProject(id, principal);
  }

  // ═════════════════════════════════════════════════════════════════════════════════
  //  Modules
  // ═════════════════════════════════════════════════════════════════════════════════

  @Post('projects/:projectId/modules')
  async createModule(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectModuleDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProjectModuleView> {
    return this.service.createModule(projectId, dto, principal);
  }

  @Get('projects/:projectId/modules')
  async listModules(
    @Param('projectId') projectId: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProjectModuleView[]> {
    return this.service.listModulesByProject(projectId, principal);
  }

  @Get('modules/:id')
  async getModule(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProjectModuleView> {
    return this.service.getModule(id, principal);
  }

  @Patch('modules/:id')
  async updateModule(
    @Param('id') id: string,
    @Body() dto: UpdateProjectModuleDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProjectModuleView> {
    return this.service.updateModule(id, dto, principal);
  }

  @Delete('modules/:id')
  async deleteModule(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    return this.service.deleteModule(id, principal);
  }


  // ═════════════════════════════════════════════════════════════════════════════════
  //  Test Cases
  // ═════════════════════════════════════════════════════════════════════════════════

  @Post('projects/:projectId/test-cases')
  async createTestCase(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTestCaseDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestCaseView> {
    return this.service.createTestCase(projectId, dto, principal);
  }

  @Get('projects/:projectId/test-cases')
  async listTestCases(
    @Param('projectId') projectId: string,
    @Query() query: ListTestCasesQuery,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestCaseView[]> {
    return this.service.listTestCasesByProject(projectId, query, principal);
  }

  @Get('test-cases/:id')
  async getTestCase(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestCaseView> {
    return this.service.getTestCase(id, principal);
  }

  @Patch('test-cases/:id')
  async updateTestCase(
    @Param('id') id: string,
    @Body() dto: UpdateTestCaseDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestCaseView> {
    return this.service.updateTestCase(id, dto, principal);
  }

  @Delete('test-cases/:id')
  async deleteTestCase(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    return this.service.deleteTestCase(id, principal);
  }

  // ═════════════════════════════════════════════════════════════════════════════════
  //  Test Suites
  // ═════════════════════════════════════════════════════════════════════════════════

  @Post('projects/:projectId/test-suites')
  async createTestSuite(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTestSuiteDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestSuiteView> {
    return this.service.createTestSuite(projectId, dto, principal);
  }

  @Get('projects/:projectId/test-suites')
  async listTestSuites(
    @Param('projectId') projectId: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestSuiteView[]> {
    return this.service.listTestSuitesByProject(projectId, principal);
  }

  @Get('test-suites/:id')
  async getTestSuite(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestSuiteView> {
    return this.service.getTestSuite(id, principal);
  }

  @Patch('test-suites/:id')
  async updateTestSuite(
    @Param('id') id: string,
    @Body() dto: UpdateTestSuiteDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestSuiteView> {
    return this.service.updateTestSuite(id, dto, principal);
  }

  @Delete('test-suites/:id')
  async deleteTestSuite(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    return this.service.deleteTestSuite(id, principal);
  }

  // ═════════════════════════════════════════════════════════════════════════════════
  //  Suite Cases (associations)
  // ═════════════════════════════════════════════════════════════════════════════════

  @Post('test-suites/:suiteId/cases')
  async addCasesToSuite(
    @Param('suiteId') suiteId: string,
    @Body() dto: AddCasesToSuiteDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestSuiteCaseView[]> {
    return this.service.addCasesToSuite(suiteId, dto, principal);
  }

  @Delete('test-suites/:suiteId/cases/:testCaseId')
  async removeCaseFromSuite(
    @Param('suiteId') suiteId: string,
    @Param('testCaseId') testCaseId: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    return this.service.removeCaseFromSuite(suiteId, testCaseId, principal);
  }
}
