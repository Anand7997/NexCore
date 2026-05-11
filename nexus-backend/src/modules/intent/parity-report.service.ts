/**
 * Platform parity report service.
 *
 * Generates cross-platform intent support reports that show:
 *   - Which intents compile cleanly on every platform ("universal")
 *   - Which intents have gaps (supported on some, not others)
 *   - Per-intent breakdown with adapter and node type details
 *   - Per-platform coverage percentages
 *
 * The service consumes the intent registry and compiler – it never imports
 * adapter implementations directly.
 */
import { Injectable } from '@nestjs/common';
import { listIntents } from './intent-registry';
import {
  EXECUTION_PLATFORM_KEYS,
  INTENT_SCHEMA_VERSION,
} from '../../contracts/intent-contracts';
import type { ExecutionPlatformKey, IntentSupportStatus } from '../../contracts/intent-contracts';

// ── Report types ──────────────────────────────────────────────────────────────

export interface IntentParityRow {
  intentId: string;
  label: string;
  category: string;
  description: string;
  /** Support status per platform */
  platforms: Record<ExecutionPlatformKey, IntentSupportStatus>;
  /** Adapter key per platform */
  adapters: Record<ExecutionPlatformKey, string>;
  /** Compiled node type per platform (null = unsupported) */
  nodeTypes: Record<ExecutionPlatformKey, string | null>;
  /** True when supported/partial on every platform */
  isUniversal: boolean;
  /** Platforms where this intent is fully supported */
  supportedOn: ExecutionPlatformKey[];
  /** Platforms where this intent is partial */
  partialOn: ExecutionPlatformKey[];
  /** Platforms where this intent is not supported */
  unsupportedOn: ExecutionPlatformKey[];
}

export interface PlatformCoverage {
  platform: ExecutionPlatformKey;
  total: number;
  supported: number;
  partial: number;
  unsupported: number;
  /** 0–100, partial counts as 0.5 */
  coveragePct: number;
  /** Adapter key for this platform */
  adapter: string;
}

export interface IntentParityReport {
  schemaVersion: typeof INTENT_SCHEMA_VERSION;
  generatedAt: string;
  platforms: readonly ExecutionPlatformKey[];
  intents: IntentParityRow[];
  /** Intents fully supported on all platforms */
  universalIntents: string[];
  /** Intents with at least one platform gap */
  gapIntents: string[];
  /** Intents unsupported on mobile+desktop but supported on web/api */
  webApiOnly: string[];
  /** Coverage breakdown per platform */
  platformCoverage: PlatformCoverage[];
  /** Overall cross-platform coverage pct (avg of platform scores) */
  overallCoveragePct: number;
}

// ── Primary adapter key per platform (for coverage display) ──────────────────
const PLATFORM_PRIMARY_ADAPTER: Record<ExecutionPlatformKey, string> = {
  web: 'playwright-web',
  android: 'appium-android',
  ios: 'appium-ios',
  desktop: 'winappdriver',
  api: 'api-httpx',
  db: 'db-psycopg',
};

@Injectable()
export class ParityReportService {
  /**
   * Generate the full parity report over all registered intents.
   */
  generate(): IntentParityReport {
    const allIntents = listIntents();
    const rows: IntentParityRow[] = [];

    for (const intent of allIntents) {
      const platforms: Record<string, IntentSupportStatus> = {};
      const adapters: Record<string, string> = {};
      const nodeTypes: Record<string, string | null> = {};
      const supportedOn: ExecutionPlatformKey[] = [];
      const partialOn: ExecutionPlatformKey[] = [];
      const unsupportedOn: ExecutionPlatformKey[] = [];

      for (const p of EXECUTION_PLATFORM_KEYS) {
        const mapping = intent.mappings[p];
        platforms[p] = mapping.status;
        adapters[p] = mapping.adapter;
        nodeTypes[p] = mapping.nodeType;
        if (mapping.status === 'supported') supportedOn.push(p);
        else if (mapping.status === 'partial') partialOn.push(p);
        else unsupportedOn.push(p);
      }

      rows.push({
        intentId: intent.intentId,
        label: intent.label,
        category: intent.category,
        description: intent.description,
        platforms: platforms as Record<ExecutionPlatformKey, IntentSupportStatus>,
        adapters: adapters as Record<ExecutionPlatformKey, string>,
        nodeTypes: nodeTypes as Record<ExecutionPlatformKey, string | null>,
        isUniversal: unsupportedOn.length === 0,
        supportedOn,
        partialOn,
        unsupportedOn,
      });
    }

    const total = rows.length;

    // ── Platform coverage ────────────────────────────────────────────────────
    const platformCoverage: PlatformCoverage[] = EXECUTION_PLATFORM_KEYS.map((p) => {
      const supported = rows.filter((r) => r.platforms[p] === 'supported').length;
      const partial = rows.filter((r) => r.platforms[p] === 'partial').length;
      const unsupported = rows.filter((r) => r.platforms[p] === 'unsupported').length;
      const coveragePct = total > 0 ? Math.round(((supported + partial * 0.5) / total) * 100) : 0;
      return {
        platform: p,
        total,
        supported,
        partial,
        unsupported,
        coveragePct,
        adapter: PLATFORM_PRIMARY_ADAPTER[p],
      };
    });

    const universalIntents = rows.filter((r) => r.isUniversal).map((r) => r.intentId);
    const gapIntents = rows.filter((r) => !r.isUniversal).map((r) => r.intentId);
    const webApiOnly = rows
      .filter(
        (r) =>
          (r.platforms.web === 'supported' || r.platforms.api === 'supported') &&
          r.platforms.android === 'unsupported' &&
          r.platforms.ios === 'unsupported' &&
          r.platforms.desktop === 'unsupported',
      )
      .map((r) => r.intentId);

    const overallCoveragePct =
      platformCoverage.length > 0
        ? Math.round(
            platformCoverage.reduce((sum, p) => sum + p.coveragePct, 0) /
              platformCoverage.length,
          )
        : 0;

    return {
      schemaVersion: INTENT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      platforms: EXECUTION_PLATFORM_KEYS,
      intents: rows,
      universalIntents,
      gapIntents,
      webApiOnly,
      platformCoverage,
      overallCoveragePct,
    };
  }

  /**
   * Returns only the coverage summary (lighter payload for dashboards).
   */
  coverageSummary(): Pick<
    IntentParityReport,
    'platformCoverage' | 'overallCoveragePct' | 'universalIntents' | 'gapIntents' | 'webApiOnly' | 'generatedAt'
  > {
    const r = this.generate();
    return {
      platformCoverage: r.platformCoverage,
      overallCoveragePct: r.overallCoveragePct,
      universalIntents: r.universalIntents,
      gapIntents: r.gapIntents,
      webApiOnly: r.webApiOnly,
      generatedAt: r.generatedAt,
    };
  }
}
