import { Module } from '@nestjs/common';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationService } from './orchestration.service';
import { PostgresModule } from '../../infrastructure/postgres/postgres.module';

@Module({
  imports: [
    PostgresModule, // provides DrizzleService
    // TemporalModule is @Global(), no explicit import needed
  ],
  controllers: [OrchestrationController],
  providers: [OrchestrationService],
  exports: [OrchestrationService],
})
export class OrchestrationModule {}
