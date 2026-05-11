import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { CurrentPrincipal, type Principal as PrincipalType } from '../../common/auth/principal.decorator';
import type { StartExecutionCommand, CancelExecutionCommand } from '../../contracts/execution-contracts';
import { OrchestrationService } from './orchestration.service';

@Controller('orchestration')
export class OrchestrationController {
  constructor(private readonly orchestration: OrchestrationService) {}

  @Post('executions')
  startExecution(
    @Body() command: StartExecutionCommand,
    @CurrentPrincipal() principal: PrincipalType,
  ) {
    return this.orchestration.startExecution(command, principal);
  }

  @Get('executions')
  listExecutions() {
    return this.orchestration.listExecutions();
  }

  @Get('executions/:id')
  async getExecution(@Param('id') id: string) {
    const run = await this.orchestration.getExecution(id);
    if (!run) throw new NotFoundException();
    return run;
  }

  @Get('executions/:id/status')
  getExecutionStatus(@Param('id') id: string) {
    return this.orchestration.getExecutionStatus(id);
  }

  @Post('executions/:id/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  cancelExecution(
    @Param('id') id: string,
    @Body() cmd: CancelExecutionCommand,
  ) {
    return this.orchestration.cancelExecution(id, cmd);
  }

  @Post('executions/:id/heartbeat')
  @HttpCode(HttpStatus.ACCEPTED)
  agentHeartbeat(
    @Param('id') id: string,
    @Body('progress', ParseIntPipe) progress: number,
  ) {
    return this.orchestration.sendAgentHeartbeat(id, progress);
  }
}

