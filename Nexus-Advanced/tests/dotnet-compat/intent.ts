export const INTENT_SCHEMA_VERSION = '1.0.0';
export const EXECUTION_PLATFORM_KEYS = ['web', 'api', 'android', 'ios', 'desktop'] as const;

export type ExecutionPlatformKey = (typeof EXECUTION_PLATFORM_KEYS)[number];
export type IntentSchemaVersion = typeof INTENT_SCHEMA_VERSION;
export interface IntentStep {
  intent?: string;
  type?: string;
  name?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface IntentCompilationResult {
  schemaVersion: string;
  platform: ExecutionPlatformKey;
  nodes: Array<Record<string, unknown>>;
  warnings: string[];
}

export const businessFlowFixtures = {
  smoke: [
    { intent: 'navigate', parameters: { url: 'https://example.test' } },
    { intent: 'click', parameters: { selector: '#submit' } },
  ],
};

export class IntentCompilerService {
  compileIntentPlan(request: { platform: ExecutionPlatformKey; steps: IntentStep[]; clientSchemaVersion?: string }): IntentCompilationResult {
    return {
      schemaVersion: INTENT_SCHEMA_VERSION,
      platform: request.platform,
      nodes: request.steps.map((step, index) => ({
        id: `node_${index + 1}`,
        platform: request.platform,
        intent: step.intent ?? step.type ?? step.name ?? 'unknown',
        parameters: step.parameters ?? {},
        order: index + 1,
      })),
      warnings: [],
    };
  }
}

export class ParityReportService {
  generate() {
    return {
      schemaVersion: INTENT_SCHEMA_VERSION,
      platforms: EXECUTION_PLATFORM_KEYS,
      gaps: [],
    };
  }

  coverageSummary() {
    return { coveragePercent: 100, supportedPlatforms: EXECUTION_PLATFORM_KEYS.length };
  }
}

export class PlatformRuntimeValidatorService {
  validateAll() {
    return Promise.resolve({ status: 'ready' });
  }

  validatePlatformReadiness(platform: 'android' | 'ios' | 'desktop', requiredCapabilities: string[] = []) {
    return Promise.resolve({ platform, ready: true, requiredCapabilities, missingCapabilities: [] });
  }
}
