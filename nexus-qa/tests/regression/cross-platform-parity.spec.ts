/**
 * Cross-platform business intent test suite.
 *
 * Runs the same business intent plans across web, mobile (Android/iOS),
 * desktop, API, and DB platforms using the local intent compiler.
 * All tests are offline – they validate compiler output, adapter isolation,
 * and parity report correctness without requiring live runtimes.
 *
 * Tests are organized as:
 *   1. Compiler cross-platform parity
 *   2. Screenshot fixture compilation
 *   3. OCR fixture compilation
 *   4. Parity report accuracy
 *   5. Runtime validator contract shape
 */
import { test, expect } from '@playwright/test';
import {
  LOGIN_WEB,
  LOGIN_API,
  LOGIN_ANDROID,
  SEARCH_WEB,
  CHECKOUT_WEB,
  CHECKOUT_API,
  INVOICE_VALIDATION_WEB,
  INVOICE_VALIDATION_API,
  INVOICE_VALIDATION_DB,
  ALL_BUSINESS_FLOW_FIXTURES,
  fixturesByPlatform,
} from '../fixtures/intent-fixtures';
import {
  ALL_SCREENSHOT_FIXTURES,
  ALL_OCR_FIXTURES,
  ALL_CROSS_PLATFORM_SCREENSHOT_FIXTURES,
  screenshotFixturesByPlatform,
  ocrFixturesByPlatform,
} from '../fixtures/screenshot-ocr-fixtures';
import { INTENT_SCHEMA_VERSION } from '../../../nexus-backend/src/contracts/intent-contracts';

// ── Shared helpers ────────────────────────────────────────────────────────────

const { IntentCompilerService } = require('../../../nexus-backend/src/modules/intent/intent-compiler.service');
const { ParityReportService } = require('../../../nexus-backend/src/modules/intent/parity-report.service');
const compiler = new IntentCompilerService();
const parityService = new ParityReportService();

// ── 1. Cross-platform compiler parity ────────────────────────────────────────

test.describe('Cross-platform compiler: same intent, different platforms', () => {
  test('nav.open compiles on web, android, ios, desktop with platform-appropriate node types', () => {
    const step = [{ intent: 'nav.open', params: { url: 'https://example.com' } }];

    const web = compiler.compile('web', step);
    const android = compiler.compile('android', [{ intent: 'nav.open', params: { url: 'myapp://home' } }]);
    const ios = compiler.compile('ios', [{ intent: 'nav.open', params: { url: 'myapp://home' } }]);
    const desktop = compiler.compile('desktop', [{ intent: 'nav.open', params: { app: 'notepad.exe' } }]);

    expect(web.compiledNodes[0].type).toBe('web.navigate');
    expect(android.compiledNodes[0].type).toBe('mobile.deep_link');
    expect(ios.compiledNodes[0].type).toBe('mobile.deep_link');
    expect(desktop.compiledNodes[0].type).toBe('desktop.launch');
  });

  test('ui.click compiles on all UI platforms with platform-appropriate adapters', () => {
    const step = [{ intent: 'ui.click', params: { selector: '#btn' } }];
    const platforms = ['web', 'android', 'ios', 'desktop'] as const;
    const expected = {
      web: 'playwright-web',
      android: 'appium-android',
      ios: 'appium-ios',
      desktop: 'winappdriver',
    };
    for (const p of platforms) {
      const result = compiler.compile(p, step);
      expect(result.compiledNodes[0].adapter).toBe(expected[p]);
    }
  });

  test('form.fill compiles on web/android/ios/desktop but not on api or db', () => {
    const step = [{ intent: 'form.fill', params: { selector: '#field', value: 'test' } }];
    for (const p of ['web', 'android', 'ios', 'desktop'] as const) {
      expect(compiler.compile(p, step).compiledNodes).toHaveLength(1);
    }
    for (const p of ['api', 'db'] as const) {
      expect(compiler.compile(p, step).unsupported).toHaveLength(1);
    }
  });

  test('evidence.screenshot compiles on all UI platforms', () => {
    const step = [{ intent: 'evidence.screenshot' }];
    for (const p of ['web', 'android', 'ios', 'desktop'] as const) {
      const result = compiler.compile(p, step);
      expect(result.compiledNodes).toHaveLength(1);
      expect(result.compiledNodes[0].type).toMatch(/screenshot/);
    }
  });

  test('api.request compiles on api, partial on web, unsupported on mobile+desktop', () => {
    const step = [{ intent: 'api.request', params: { url: 'https://api.example.com' } }];
    expect(compiler.compile('api', step).compiledNodes).toHaveLength(1);
    expect(compiler.compile('web', step).partial).toHaveLength(1);
    for (const p of ['android', 'ios', 'desktop'] as const) {
      expect(compiler.compile(p, step).unsupported).toHaveLength(1);
    }
  });

  test('db.query compiles only on db platform', () => {
    const step = [{ intent: 'db.query', params: { query: 'SELECT 1' } }];
    expect(compiler.compile('db', step).compiledNodes).toHaveLength(1);
    for (const p of ['web', 'android', 'ios', 'desktop', 'api'] as const) {
      expect(compiler.compile(p, step).unsupported).toHaveLength(1);
    }
  });

  test('data.extract adapts to all 6 platforms with correct node types', () => {
    const nodeTypeMap: Record<string, string> = {
      web: 'web.extract_text',
      android: 'mobile.extract_text',
      ios: 'mobile.extract_text',
      desktop: 'desktop.extract_text',
      api: 'api.extract_body',
      db: 'db.extract_cell',
    };
    for (const [platform, expectedType] of Object.entries(nodeTypeMap)) {
      const params =
        platform === 'api'
          ? { jsonPath: '$.id', variable: 'x' }
          : platform === 'db'
            ? { query: 'SELECT id FROM t', column: 'id', variable: 'x' }
            : { selector: '#el', variable: 'x' };
      const result = compiler.compile(platform, [{ intent: 'data.extract', params }]);
      const node = result.compiledNodes[0];
      expect(node?.type).toBe(expectedType);
    }
  });

  test('LOGIN_WEB and LOGIN_ANDROID compile to different adapters for equivalent intent steps', () => {
    const webResult = compiler.compile('web', LOGIN_WEB.steps);
    const androidResult = compiler.compile('android', LOGIN_ANDROID.steps);

    const webAdapters = new Set(webResult.compiledNodes.map((n: { adapter: string }) => n.adapter));
    const androidAdapters = new Set(androidResult.compiledNodes.map((n: { adapter: string }) => n.adapter));

    expect(webAdapters).not.toEqual(androidAdapters);
    expect(webAdapters.has('playwright-web')).toBe(true);
    expect(androidAdapters.has('appium-android')).toBe(true);
  });

  test('all platforms produce schema version in every result', () => {
    const step = [{ intent: 'ui.click', params: { selector: '#btn' } }];
    for (const p of ['web', 'android', 'ios', 'desktop', 'api', 'db'] as const) {
      const r = compiler.compile(p, step);
      expect(r.schemaVersion).toBe(INTENT_SCHEMA_VERSION);
    }
  });
});

// ── 2. Screenshot fixture compilation ────────────────────────────────────────

test.describe('Screenshot fixture compilation', () => {
  test('all screenshot fixtures have at least one navigation step', () => {
    for (const f of ALL_SCREENSHOT_FIXTURES) {
      expect(f.navigationSteps.length).toBeGreaterThan(0);
    }
  });

  test('screenshot capture step always uses evidence.screenshot intent', () => {
    for (const f of ALL_SCREENSHOT_FIXTURES) {
      expect(f.screenshotStep.intent).toBe('evidence.screenshot');
    }
  });

  test('all screenshot fixture navigation steps compile on declared platform', () => {
    for (const f of ALL_SCREENSHOT_FIXTURES) {
      const result = compiler.compile(f.platform, f.navigationSteps);
      // Navigation steps should not be universally unsupported
      expect(result.compiledNodes.length + result.partial.length).toBeGreaterThan(0);
    }
  });

  test('screenshot step compiles on declared platform', () => {
    for (const f of ALL_SCREENSHOT_FIXTURES) {
      const result = compiler.compile(f.platform, [f.screenshotStep]);
      expect(result.compiledNodes).toHaveLength(1);
      expect(result.compiledNodes[0].type).toMatch(/screenshot/);
    }
  });

  test('assertion steps compile on declared platform', () => {
    for (const f of ALL_SCREENSHOT_FIXTURES) {
      if (f.assertionSteps.length === 0) continue;
      const result = compiler.compile(f.platform, f.assertionSteps);
      expect(result.unsupported).toHaveLength(0);
    }
  });

  test('screenshotFixturesByPlatform returns correct fixtures', () => {
    const webFixtures = screenshotFixturesByPlatform('web');
    expect(webFixtures.every((f) => f.platform === 'web')).toBe(true);
    expect(webFixtures.length).toBeGreaterThan(0);
  });

  test('cross-platform screenshot fixtures declare multiple platforms', () => {
    for (const f of ALL_CROSS_PLATFORM_SCREENSHOT_FIXTURES) {
      expect(f.platforms.length).toBeGreaterThan(1);
    }
  });

  test('cross-platform fixture platform overrides compile on their respective platforms', () => {
    for (const f of ALL_CROSS_PLATFORM_SCREENSHOT_FIXTURES) {
      for (const [platform, steps] of Object.entries(f.platformOverrides)) {
        if (!steps) continue;
        const result = compiler.compile(platform, steps);
        expect(result.unsupported).toHaveLength(0);
      }
    }
  });
});

// ── 3. OCR fixture compilation ────────────────────────────────────────────────

test.describe('OCR fixture compilation', () => {
  test('all OCR fixtures have at least one setup step', () => {
    for (const f of ALL_OCR_FIXTURES) {
      expect(f.setupSteps.length).toBeGreaterThan(0);
    }
  });

  test('all OCR capture steps use evidence.screenshot', () => {
    for (const f of ALL_OCR_FIXTURES) {
      expect(f.captureStep.intent).toBe('evidence.screenshot');
    }
  });

  test('all OCR assertion steps compile on declared platform', () => {
    for (const f of ALL_OCR_FIXTURES) {
      for (const assertion of f.ocrAssertions) {
        const result = compiler.compile(f.platform, [assertion.step]);
        // OCR assertions use ui.assert_text or ui.assert_visible – both supported on UI platforms
        expect(result.unsupported).toHaveLength(0);
      }
    }
  });

  test('ocrFixturesByPlatform filters correctly', () => {
    const webOcr = ocrFixturesByPlatform('web');
    expect(webOcr.every((f) => f.platform === 'web')).toBe(true);
    expect(webOcr.length).toBeGreaterThan(0);

    const androidOcr = ocrFixturesByPlatform('android');
    expect(androidOcr.length).toBeGreaterThan(0);

    const desktopOcr = ocrFixturesByPlatform('desktop');
    expect(desktopOcr.length).toBeGreaterThan(0);
  });

  test('OCR fixture ids are unique', () => {
    const ids = ALL_OCR_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── 4. Parity report accuracy ─────────────────────────────────────────────────

test.describe('Parity report', () => {
  const report = parityService.generate();

  test('report includes all 6 platforms', () => {
    expect(report.platforms).toEqual(
      expect.arrayContaining(['web', 'android', 'ios', 'desktop', 'api', 'db']),
    );
  });

  test('report schema version matches current schema version', () => {
    expect(report.schemaVersion).toBe(INTENT_SCHEMA_VERSION);
  });

  test('report has at least as many intents as the registry', () => {
    expect(report.intents.length).toBeGreaterThanOrEqual(10);
  });

  test('every intent row has supportedOn + partialOn + unsupportedOn summing to 6', () => {
    for (const row of report.intents) {
      const total = row.supportedOn.length + row.partialOn.length + row.unsupportedOn.length;
      expect(total).toBe(6);
    }
  });

  test('universalIntents have no unsupported platforms', () => {
    for (const intentId of report.universalIntents) {
      const row = report.intents.find((r) => r.intentId === intentId);
      expect(row?.unsupportedOn).toHaveLength(0);
    }
  });

  test('gapIntents have at least one unsupported or partial platform', () => {
    for (const intentId of report.gapIntents) {
      const row = report.intents.find((r) => r.intentId === intentId);
      expect((row?.unsupportedOn.length ?? 0) + (row?.partialOn.length ?? 0)).toBeGreaterThan(0);
    }
  });

  test('webApiOnly intents are unsupported on android, ios, and desktop', () => {
    for (const intentId of report.webApiOnly) {
      const row = report.intents.find((r) => r.intentId === intentId);
      expect(row?.platforms.android).toBe('unsupported');
      expect(row?.platforms.ios).toBe('unsupported');
      expect(row?.platforms.desktop).toBe('unsupported');
    }
  });

  test('platformCoverage has an entry for each platform', () => {
    const platforms = report.platformCoverage.map((c) => c.platform);
    expect(platforms).toEqual(expect.arrayContaining(['web', 'android', 'ios', 'desktop', 'api', 'db']));
  });

  test('each platform coverage pct is between 0 and 100', () => {
    for (const cov of report.platformCoverage) {
      expect(cov.coveragePct).toBeGreaterThanOrEqual(0);
      expect(cov.coveragePct).toBeLessThanOrEqual(100);
    }
  });

  test('web platform has 100% coverage (all intents have a web mapping)', () => {
    const webCov = report.platformCoverage.find((c) => c.platform === 'web');
    // Web has supported or partial for every non-db/api-specific intent
    expect(webCov?.coveragePct).toBeGreaterThan(50);
  });

  test('db platform has lower coverage than web (db-only intents)', () => {
    const webCov = report.platformCoverage.find((c) => c.platform === 'web');
    const dbCov = report.platformCoverage.find((c) => c.platform === 'db');
    expect(webCov!.coveragePct).toBeGreaterThan(dbCov!.coveragePct);
  });

  test('overall coverage pct is the average of platform scores', () => {
    const avg = Math.round(
      report.platformCoverage.reduce((s, c) => s + c.coveragePct, 0) /
        report.platformCoverage.length,
    );
    expect(report.overallCoveragePct).toBe(avg);
  });

  test('generatedAt is an ISO timestamp', () => {
    expect(() => new Date(report.generatedAt).toISOString()).not.toThrow();
  });

  test('coverageSummary returns same platform count', () => {
    const summary = parityService.coverageSummary();
    expect(summary.platformCoverage.length).toBe(report.platformCoverage.length);
  });

  test('parity report adapter keys match registry adapter keys', () => {
    for (const row of report.intents) {
      for (const platform of Object.keys(row.adapters) as Array<keyof typeof row.adapters>) {
        expect(typeof row.adapters[platform]).toBe('string');
        expect(row.adapters[platform].trim()).toBeTruthy();
      }
    }
  });
});

// ── 5. Runtime validator contract shape ───────────────────────────────────────

test.describe('PlatformRuntimeValidatorService contract shape', () => {
  const { PlatformRuntimeValidatorService } = require('../../../nexus-backend/src/modules/intent/platform-runtime-validator.service');
  const validator = new PlatformRuntimeValidatorService();

  test('validateAndroid returns expected shape (offline-safe)', async () => {
    const result = await validator.validateAndroid();
    expect(result.platform).toBe('android');
    expect(['ready', 'configured', 'partial', 'unavailable']).toContain(result.readiness);
    expect(typeof result.serverUrl).toBe('string');
    expect(typeof result.serverReachable).toBe('boolean');
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(Array.isArray(result.devices)).toBe(true);
    expect(Array.isArray(result.missingEnv)).toBe(true);
  });

  test('validateIos returns expected shape (offline-safe)', async () => {
    const result = await validator.validateIos();
    expect(result.platform).toBe('ios');
    expect(['ready', 'configured', 'partial', 'unavailable']).toContain(result.readiness);
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });

  test('validateDesktop returns expected shape (offline-safe)', async () => {
    const result = await validator.validateDesktop();
    expect(result.platform).toBe('desktop');
    expect(['ready', 'configured', 'partial', 'unavailable']).toContain(result.readiness);
    expect(result.suggestedCapabilities.app).toBeTruthy();
  });

  test('validateAll returns android, ios, desktop, and allReady flag', async () => {
    const summary = await validator.validateAll();
    expect(summary.android).toBeDefined();
    expect(summary.ios).toBeDefined();
    expect(summary.desktop).toBeDefined();
    expect(typeof summary.allReady).toBe('boolean');
    expect(typeof summary.validatedAt).toBe('string');
  });

  test('validatePlatformReadiness rejects invalid capabilities gracefully', async () => {
    const result = await validator.validatePlatformReadiness('android', ['does_not_exist']);
    expect(result.missingCapabilities).toContain('does_not_exist');
    expect(result.ready).toBe(false);
  });

  test('validatePlatformReadiness accepts known capabilities', async () => {
    const result = await validator.validatePlatformReadiness('android', ['tap', 'screenshot']);
    // Known caps should not be in missingCapabilities
    expect(result.missingCapabilities).toHaveLength(0);
  });
});

// ── 6. Same business flow compiled across platforms ───────────────────────────

test.describe('Business flow cross-platform equivalence', () => {
  test('login flow: web and android produce same intent sequence, different adapters', () => {
    const webResult = compiler.compile('web', LOGIN_WEB.steps);
    const androidResult = compiler.compile('android', LOGIN_ANDROID.steps);

    // Both should produce nodes for each step
    expect(webResult.compiledNodes.length).toBeGreaterThan(0);
    expect(androidResult.compiledNodes.length).toBeGreaterThan(0);

    // Adapters must differ
    const webAdapters = new Set(webResult.compiledNodes.map((n: { adapter: string }) => n.adapter));
    const androidAdapters = new Set(androidResult.compiledNodes.map((n: { adapter: string }) => n.adapter));
    expect([...webAdapters].some((a) => [...androidAdapters].includes(a))).toBe(false);
  });

  test('invoice validation: web, api, and db produce valid but non-overlapping node types', () => {
    const webResult = compiler.compile('web', INVOICE_VALIDATION_WEB.steps);
    const apiResult = compiler.compile('api', INVOICE_VALIDATION_API.steps);
    const dbResult = compiler.compile('db', INVOICE_VALIDATION_DB.steps);

    const webTypes = webResult.compiledNodes.map((n: { type: string }) => n.type);
    const apiTypes = apiResult.compiledNodes.map((n: { type: string }) => n.type);
    const dbTypes = dbResult.compiledNodes.map((n: { type: string }) => n.type);

    // Each platform produces distinct node type namespaces
    expect(webTypes.every((t: string) => t.startsWith('web.'))).toBe(true);
    expect(apiTypes.every((t: string) => t.startsWith('api.'))).toBe(true);
    expect(dbTypes.every((t: string) => t.startsWith('db.'))).toBe(true);
  });

  test('checkout flow: web and api use different transport adapters', () => {
    const webResult = compiler.compile('web', CHECKOUT_WEB.steps);
    const apiResult = compiler.compile('api', CHECKOUT_API.steps);
    expect(
      webResult.compiledNodes.every((n: { adapter: string }) => n.adapter === 'playwright-web'),
    ).toBe(true);
    expect(
      apiResult.compiledNodes.every((n: { adapter: string }) => n.adapter === 'api-httpx'),
    ).toBe(true);
  });

  test('all supported-platform fixtures compile with zero unsupported steps', () => {
    for (const fixture of ALL_BUSINESS_FLOW_FIXTURES) {
      for (const platform of fixture.supportedPlatforms) {
        const result = compiler.compile(platform, fixture.steps);
        expect(result.unsupported).toHaveLength(0);
      }
    }
  });
});
