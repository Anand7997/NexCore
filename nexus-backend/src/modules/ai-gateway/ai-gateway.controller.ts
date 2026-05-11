import { Body, Controller, Get, Param, NotFoundException, Post } from '@nestjs/common';
import { CurrentPrincipal, type Principal as PrincipalType } from '../../common/auth/principal.decorator';
import type { AiJobType, AiWorkerResult, EvidenceBundle } from '../../contracts/ai-worker-contracts';
import { AiGatewayService } from './ai-gateway.service';

interface CreateAiJobRequest {
  type: AiJobType;
  evidence: EvidenceBundle;
}

@Controller('ai')
export class AiGatewayController {
  constructor(private readonly aiGateway: AiGatewayService) {}

  @Post('jobs')
  createJob(@Body() body: CreateAiJobRequest, @CurrentPrincipal() principal: PrincipalType) {
    return this.aiGateway.createJob(body.type, body.evidence, principal);
  }

  @Get('jobs')
  listJobs() {
    return this.aiGateway.listJobs();
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    const job = this.aiGateway.getJob(id);
    if (!job) throw new NotFoundException(`AI job ${id} not found`);
    return job;
  }

  @Post('results')
  ingestResult(@Body() body: AiWorkerResult) {
    return this.aiGateway.ingestResult(body);
  }
}
