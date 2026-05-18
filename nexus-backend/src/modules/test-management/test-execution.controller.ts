/**
 * TestExecutionController.
 *
 * REST endpoints for managing test executions and their results.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TestExecutionService } from './test-execution.service';
import { CurrentPrincipal } from '../../common/auth/principal.decorator';
import type { Principal } from '../../common/auth/principal.decorator';
import type {
  TestExecutionView,
  TestExecutionResultView,
  StartExecutionCommand,
  UpdateResultCommand,
} from '../../contracts/test-contracts';

@Controller('test-management/executions')
export class TestExecutionController {
  constructor(private readonly service: TestExecutionService) {}

  @Post()
  async startExecution(
    @Body() command: StartExecutionCommand,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestExecutionView> {
    return this.service.startExecution(command, principal);
  }

  @Get()
  async listExecutions(
    @Query('projectId') projectId: string | undefined,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestExecutionView[]> {
    return this.service.listExecutions(principal, projectId);
  }

  @Get(':id')
  async getExecution(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ execution: TestExecutionView; results: TestExecutionResultView[] }> {
    return this.service.getExecution(id, principal);
  }

  @Post(':id/cancel')
  async cancelExecution(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestExecutionView> {
    return this.service.cancelExecutionByCommand(id, principal);
  }

  @Get(':id/timeline')
  async getTimeline(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TestExecutionResultView[]> {
    return this.service.getExecutionTimeline(id, principal);
  }

  @Patch(':id/results/:resultId')
  async updateResult(
    @Param('id') id: string,
    @Param('resultId') resultId: string,
    @Body() command: UpdateResultCommand,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ execution: TestExecutionView; result: TestExecutionResultView }> {
    return this.service.updateResult(id, resultId, command, principal);
  }
}
