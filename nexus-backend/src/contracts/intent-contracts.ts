/**
 * Intent layer contracts for NexCore.
 *
 * Business intent sits above platform execution adapters. These types describe
 * what a user means to accomplish and how that intent maps to adapter-specific
 * node contracts per platform. Execution engines consume compiled nodes – not
 * raw intents – so adapters remain isolated from business logic.
 *
 * Schema versioning follows MAJOR.MINOR:
 *   - Same MAJOR  → backward-compatible (new optional fields only)
 *   - New MAJOR   → breaking change; consumers must migrate
 */

// ── Schema version ───────────────────────────────────────────────────────────

export const INTENT_SCHEMA_VERSION = '1.0' as const;
export type IntentSchemaVersion = `${number}.${number}`;

// ── Platform keys ─────────────────────────────────────────────────────────────

export type ExecutionPlatformKey =
  | 'web'
  | 'android'
  | 'ios'
  | 'desktop'
  | 'api'
  | 'db';

export const EXECUTION_PLATFORM_KEYS: readonly ExecutionPlatformKey[] = [
  'web',
  'android',
  'ios',
  'desktop',
  'api',
  'db',
] as const;

// ── Support status ────────────────────────────────────────────────────────────

export type IntentSupportStatus = 'supported' | 'partial' | 'unsupported';

// ── Platform mapping ──────────────────────────────────────────────────────────

/** Describes how a single intent maps to a specific platform adapter. */
export interface IntentPlatformMapping {
  /** Whether the platform fully, partially, or cannot execute this intent. */
  status: IntentSupportStatus;
  /** The adapter plugin that handles execution (e.g. 'playwright-web'). */
  adapter: string;
  /** Compiled node type emitted for the execution engine. Null if unsupported. */
  nodeType: string | null;
  /** Human-readable explanation of status (especially for partial/unsupported). */
  reason: string;
  /** Parameter names that must be present for the intent to compile. */
  requiredParams: readonly string[];
}

// ── Intent definition ─────────────────────────────────────────────────────────

/** A single versioned business intent definition. */
export interface IntentDefinition {
  /** Dot-namespaced identifier (e.g. 'nav.open', 'form.fill'). */
  intentId: string;
  /** Short display label. */
  label: string;
  /** Grouping category (navigation, interaction, assertion, data, service, db). */
  category: string;
  /** Human-readable description of what this intent does. */
  description: string;
  /** Platform-keyed mapping contracts. */
  mappings: Record<ExecutionPlatformKey, IntentPlatformMapping>;
  /** Schema version of this intent definition. */
  schemaVersion: IntentSchemaVersion;
}

// ── Compiler input / output ───────────────────────────────────────────────────

/** A single intent step as authored in the workflow builder. */
export interface IntentStep {
  intent: string;
  label?: string;
  params?: Record<string, unknown>;
}

/** A compiled node ready for dispatch to a platform execution adapter. */
export interface CompiledNode {
  nodeKey: string;
  type: string;
  label: string;
  description: string;
  config: Record<string, unknown>;
  intent: string;
  adapter: string;
}

/** Compilation diagnostics for a single step. */
export interface CompilationIssue {
  stepIndex: number;
  intent: string;
  reason: string;
}

/** Missing required parameter report. */
export interface MissingParamIssue {
  stepIndex: number;
  intent: string;
  params: string[];
}

/** Full result returned by the intent compiler. */
export interface IntentCompilationResult {
  /** True only when no unsupported, partial, or missing-param issues exist. */
  valid: boolean;
  /** Schema version used for compilation. */
  schemaVersion: IntentSchemaVersion;
  platform: ExecutionPlatformKey;
  compiledNodes: CompiledNode[];
  unsupported: CompilationIssue[];
  partial: CompilationIssue[];
  missingParams: MissingParamIssue[];
}

// ── Compiler API request / response ──────────────────────────────────────────

export interface CompileIntentPlanRequest {
  platform: ExecutionPlatformKey;
  steps: IntentStep[];
  /** Optional client-declared schema version for compatibility check. */
  clientSchemaVersion?: IntentSchemaVersion;
}

export interface IntentCapabilityMatrixRow {
  intent: string;
  feature: string;
  category: string;
  description: string;
  web: IntentSupportStatus;
  android: IntentSupportStatus;
  ios: IntentSupportStatus;
  desktop: IntentSupportStatus;
  api: IntentSupportStatus;
  db: IntentSupportStatus;
}

export interface IntentCapabilityMatrix {
  schemaVersion: IntentSchemaVersion;
  platforms: readonly ExecutionPlatformKey[];
  capabilities: IntentCapabilityMatrixRow[];
}

// ── Schema compatibility ──────────────────────────────────────────────────────

export type CompatibilityResult =
  | { compatible: true }
  | { compatible: false; reason: string; requiredAction: 'migrate' | 'upgrade-client' };
