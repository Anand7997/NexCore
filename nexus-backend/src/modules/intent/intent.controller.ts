import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type {
  CompileIntentPlanRequest,
  ExecutionPlatformKey,
  IntentStep,
  IntentSchemaVersion,
} from '../../contracts/intent-contracts';
import { EXECUTION_PLATFORM_KEYS } from '../../contracts/intent-contracts';
import type { PlatformReadinessRequest } from '../../contracts/platform-runtime-contracts';
import { IntentService } from './intent.service';
import { ParityReportService } from './parity-report.service';
import { PlatformRuntimeValidatorService } from './platform-runtime-validator.service';

/** DTO – validated at runtime by NestJS pipes */
class CompileIntentPlanDto implements CompileIntentPlanRequest {
  platform!: ExecutionPlatformKey;
  steps!: IntentStep[];
  clientSchemaVersion?: IntentSchemaVersion;
}

class PlatformReadinessDto implements PlatformReadinessRequest {
  platform!: 'android' | 'ios' | 'desktop';
  requiredCapabilities?: string[];
}

@Controller('intent')
export class IntentController {
  constructor(
    private readonly intentService: IntentService,
    private readonly parityReport: ParityReportService,
    private readonly runtimeValidator: PlatformRuntimeValidatorService,
  ) {}

  /**
   * GET /intent/catalog
   * Returns all registered intent definitions with platform mapping contracts.
   */
  @Get('catalog')
  getCatalog() {
    return { intents: this.intentService.listIntents() };
  }

  /**
   * GET /intent/capability-matrix
   * Returns the full platform × intent capability matrix.
   */
  @Get('capability-matrix')
  getCapabilityMatrix() {
    return this.intentService.buildCapabilityMatrix();
  }

  /**
   * GET /intent/platforms
   * Returns the list of supported platform keys.
   */
  @Get('platforms')
  getPlatforms() {
    return { platforms: EXECUTION_PLATFORM_KEYS };
  }

  /**
   * GET /intent/schema
   * Returns the current schema manifest and compatibility policy.
   */
  @Get('schema')
  getSchemaManifest() {
    return this.intentService.schemaManifest();
  }

  /**
   * GET /intent/schema/migration-guide
   * Returns migration guidance for schema version upgrades.
   */
  @Get('schema/migration-guide')
  getMigrationGuide() {
    return { migrations: this.intentService.migrationGuide() };
  }

  /**
   * POST /intent/compile
   * Compiles an ordered intent plan into platform-specific execution nodes.
   *
   * Body: { platform, steps, clientSchemaVersion? }
   */
  @Post('compile')
  @HttpCode(HttpStatus.OK)
  compileIntentPlan(@Body() body: CompileIntentPlanDto) {
    if (!body.platform) {
      throw new BadRequestException('platform is required.');
    }
    if (!Array.isArray(body.steps)) {
      throw new BadRequestException('steps must be an array.');
    }
    return this.intentService.compileIntentPlan(body);
  }

  // ── Parity reports ──────────────────────────────────────────────────────────

  /**
   * GET /intent/parity-report
   * Full cross-platform parity report: every intent × every platform.
   */
  @Get('parity-report')
  getParityReport() {
    return this.parityReport.generate();
  }

  /**
   * GET /intent/parity-report/summary
   * Lightweight coverage summary for dashboards.
   */
  @Get('parity-report/summary')
  getParityReportSummary() {
    return this.parityReport.coverageSummary();
  }

  // ── Runtime validation ──────────────────────────────────────────────────────

  /**
   * GET /intent/runtime/validate
   * Validate Appium (Android + iOS) and WinAppDriver availability.
   */
  @Get('runtime/validate')
  async validateAllRuntimes() {
    return this.runtimeValidator.validateAll();
  }

  /**
   * GET /intent/runtime/validate/:platform
   * Validate a specific platform runtime (android | ios | desktop).
   */
  @Get('runtime/validate/:platform')
  async validatePlatformRuntime(@Param('platform') platform: string) {
    const valid = ['android', 'ios', 'desktop'];
    if (!valid.includes(platform)) {
      throw new BadRequestException(
        `platform must be one of: ${valid.join(', ')}`,
      );
    }
    return this.runtimeValidator.validatePlatformReadiness(
      platform as 'android' | 'ios' | 'desktop',
    );
  }

  /**
   * POST /intent/runtime/readiness
   * Check platform readiness with required capability assertions.
   *
   * Body: { platform, requiredCapabilities? }
   */
  @Post('runtime/readiness')
  @HttpCode(HttpStatus.OK)
  async checkPlatformReadiness(@Body() body: PlatformReadinessDto) {
    const valid = ['android', 'ios', 'desktop'];
    if (!valid.includes(body.platform)) {
      throw new BadRequestException(`platform must be one of: ${valid.join(', ')}`);
    }
    return this.runtimeValidator.validatePlatformReadiness(
      body.platform,
      body.requiredCapabilities ?? [],
    );
  }
}
