/**
 * Intent service.
 *
 * Orchestrates the intent registry, compiler, and schema compatibility checks.
 * All business intent operations go through this service so controllers and
 * other modules never interact with registry or compiler internals directly.
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import type {
  CompileIntentPlanRequest,
  IntentCompilationResult,
  IntentCapabilityMatrix,
  IntentCapabilityMatrixRow,
  IntentDefinition,
  IntentSchemaManifest,
} from '../../contracts/intent-contracts';
import { EXECUTION_PLATFORM_KEYS, INTENT_SCHEMA_VERSION } from '../../contracts/intent-contracts';
import { listIntents } from './intent-registry';
import { IntentCompilerService } from './intent-compiler.service';
import { SchemaCompatibilityService } from './schema-compatibility.service';

@Injectable()
export class IntentService {
  constructor(
    private readonly compiler: IntentCompilerService,
    private readonly compat: SchemaCompatibilityService,
  ) {}

  /** Returns all registered intent definitions. */
  listIntents(): IntentDefinition[] {
    return listIntents();
  }

  /** Returns the platform capability matrix across all registered intents. */
  buildCapabilityMatrix(): IntentCapabilityMatrix {
    const rows: IntentCapabilityMatrixRow[] = listIntents().map((intent) => ({
      intent: intent.intentId,
      feature: intent.label,
      category: intent.category,
      description: intent.description,
      web: intent.mappings.web.status,
      android: intent.mappings.android.status,
      ios: intent.mappings.ios.status,
      desktop: intent.mappings.desktop.status,
      api: intent.mappings.api.status,
      db: intent.mappings.db.status,
    }));

    return {
      schemaVersion: INTENT_SCHEMA_VERSION,
      platforms: EXECUTION_PLATFORM_KEYS,
      capabilities: rows,
    };
  }

  /**
   * Compile an intent plan for a target platform.
   *
   * Optionally validates schema version compatibility when the caller declares
   * `clientSchemaVersion`. Throws 400 when versions are incompatible.
   */
  compileIntentPlan(request: CompileIntentPlanRequest): IntentCompilationResult {
    if (request.clientSchemaVersion) {
      const compat = this.compat.check(request.clientSchemaVersion);
      if (!compat.compatible) {
        throw new BadRequestException(
          `Intent schema version incompatible: ${compat.reason}`,
        );
      }
    }

    return this.compiler.compile(request.platform, request.steps ?? []);
  }

  /** Returns the schema compatibility migration guide. */
  migrationGuide(): Record<string, string> {
    return this.compat.migrationGuide();
  }

  schemaManifest(): IntentSchemaManifest {
    return this.compat.manifest();
  }
}
