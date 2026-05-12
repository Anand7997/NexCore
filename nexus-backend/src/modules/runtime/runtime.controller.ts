import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type {
  ExecutionPlatform,
  RuntimeAgentCommand,
  RuntimeAgentEvent,
  RuntimeAgentRegistration,
} from '../../contracts/execution-contracts';
import { RuntimeSchedulerService } from './runtime-scheduler.service';

@Controller('runtime')
export class RuntimeController {
  constructor(private readonly scheduler: RuntimeSchedulerService) {}

  @Post('agents')
  async registerAgent(@Body() command: RuntimeAgentRegistration) {
    return this.scheduler.registerAgent(command);
  }

  @Post('agents/:agentId/heartbeat')
  async heartbeat(@Param('agentId') agentId: string) {
    return this.scheduler.heartbeat(agentId);
  }

  @Post('agents/:agentId/renew')
  async renewLease(@Param('agentId') agentId: string) {
    return this.scheduler.renewLease(agentId);
  }

  @Get('agents/:agentId/commands')
  async getCommands(@Param('agentId') agentId: string): Promise<RuntimeAgentCommand[]> {
    return this.scheduler.getPendingCommands(agentId);
  }

  @Post('agents/:agentId/events')
  async publishEvent(
    @Param('agentId') agentId: string,
    @Body() event: RuntimeAgentEvent,
  ) {
    return this.scheduler.publishAgentEvent(agentId, event);
  }

  @Get('agents')
  async listAgents() {
    return this.scheduler.listAgents();
  }

  @Post('queue')
  async enqueueJob(
    @Body()
    command: {
      tenantId?: string;
      executionId: string;
      platform: ExecutionPlatform;
      requiredCapabilities: string[];
      variables?: Record<string, unknown>;
    },
  ) {
    return this.scheduler.enqueue({ ...command, tenantId: command.tenantId ?? 'default' });
  }

  @Get('queue')
  async listQueue() {
    return this.scheduler.listQueue();
  }
}
