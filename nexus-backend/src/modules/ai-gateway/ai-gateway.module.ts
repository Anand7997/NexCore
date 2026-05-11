import { Module } from '@nestjs/common';
import { AiGatewayController } from './ai-gateway.controller';
import { AiGatewayService } from './ai-gateway.service';
import { AiNatsService } from './ai-nats.service';
import { AiInvestigationGateway } from './ai-investigation.gateway';

@Module({
  controllers: [AiGatewayController],
  providers: [AiNatsService, AiInvestigationGateway, AiGatewayService],
  exports: [AiGatewayService, AiNatsService],
})
export class AiGatewayModule {}
