import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EnterpriseController } from './enterprise.controller';
import { AuditRetentionService } from './audit-retention.service';
import { PolicyService } from './policy.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [EnterpriseController],
  providers: [AuditRetentionService, PolicyService],
  exports: [AuditRetentionService, PolicyService],
})
export class EnterpriseModule {}
