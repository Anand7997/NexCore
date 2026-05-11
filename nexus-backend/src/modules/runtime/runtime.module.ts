import { Module } from '@nestjs/common';
import { RuntimeController } from './runtime.controller';
import { RuntimeNatsService } from './runtime-nats.service';
import { RuntimeSchedulerService } from './runtime-scheduler.service';

@Module({
  controllers: [RuntimeController],
  providers: [RuntimeNatsService, RuntimeSchedulerService],
  exports: [RuntimeSchedulerService],
})
export class RuntimeModule {}
