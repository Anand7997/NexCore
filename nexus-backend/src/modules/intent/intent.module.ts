import { Module } from '@nestjs/common';
import { IntentController } from './intent.controller';
import { IntentService } from './intent.service';
import { IntentCompilerService } from './intent-compiler.service';
import { SchemaCompatibilityService } from './schema-compatibility.service';
import { ParityReportService } from './parity-report.service';
import { PlatformRuntimeValidatorService } from './platform-runtime-validator.service';

@Module({
  controllers: [IntentController],
  providers: [
    IntentService,
    IntentCompilerService,
    SchemaCompatibilityService,
    ParityReportService,
    PlatformRuntimeValidatorService,
  ],
  exports: [IntentService, IntentCompilerService, ParityReportService, PlatformRuntimeValidatorService],
})
export class IntentModule {}
