import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EnterpriseController } from './enterprise.controller';
import { AuditRetentionService } from './audit-retention.service';
import { PolicyService } from './policy.service';
import { S3StorageService } from '../../infrastructure/storage/s3-storage.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [EnterpriseController],
  providers: [AuditRetentionService, PolicyService, S3StorageService],
  exports: [AuditRetentionService, PolicyService, S3StorageService],
})
export class EnterpriseModule {}
