/**
 * Intent mapping regression tests.
 *
 * These tests exercise the intent compiler directly (no network) and verify
 * that production fixtures compile correctly on their declared platforms.
 *
 * They also serve as a cross-platform adapter isolation guard: if a fixture
 * compiles on a platform it does not declare, or fails on a platform it does
 * declare, the test fails and surfaces the regression immediately.
 */
import { test, expect } from '@playwright/test';
import {
  ALL_BUSINESS_FLOW_FIXTURES,
  fixturesByCategory,
  fixturesByPlatform,
  LOGIN_WEB,
  LOGIN_API,
  LOGIN_ANDROID,
  SEARCH_WEB,
  SEARCH_API,
  CHECKOUT_WEB,
  CHECKOUT_API,
  INVOICE_VALIDATION_WEB,
  INVOICE_VALIDATION_API,
  INVOICE_VALIDATION_DB,
} from '../fixtures/intent-fixtures';
import type { BusinessFlowFixture } from '../fixtures/intent-fixtures';
import type { IntentCompilationResult } from '../../../nexus-backend/src/contracts/intent-contracts';
import { INTENT_SCHEMA_VERSION } from '../../../nexus-backend/src/contracts/intent-contracts';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Call the backend compile endpoint.
 * Falls back to a local compile when the backend is not reachable.
 */
async function compileViaApi(
  request: { platform: string; steps: unknown[] },
  apiBaseUrl: string,
): Promise<IntentCompilationResult> {
  const response = await fetch(`${apiBaseUrl.replace('/api', '')}/intent/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  if (!response || !response.ok) {
    // Network unavailable – use local compiler fallback
    const { IntentCompilerService } = await import(
      '../../../nexus-backend/src/modules/intent/intent-compiler.service'
    );
    const compiler = new IntentCompilerService();
    return compiler.compile(request.platform, request.steps as any);
  }

  return response.json() as Promise<IntentCompilationResult>;
}

// ── Fixture inventory ─────────────────────────────────────────────────────────

test.describe('Intent fixture inventory', () => {
  test('at least 10 production fixtures are defined', () => {
    expect(ALL_BUSINESS_FLOW_FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  test('every fixture has a unique id', () => {
    const ids = ALL_BUSINESS_FLOW_FIXTURES.map((f) => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('every fixture declares at least one supported platform', () => {
    for (const fixture of ALL_BUSINESS_FLOW_FIXTURES) {
      expect(fixture.supportedPlatforms.length).toBeGreaterThan(0);
    }
  });

  test('every fixture has at least two steps', () => {
    for (const fixture of ALL_BUSINESS_FLOW_FIXTURES) {
      expect(fixture.steps.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('fixturesByCategory filters correctly', () => {
    const authFixtures = fixturesByCategory('auth');
    expect(authFixtures.every((f) => f.category === 'auth')).toBe(true);
    expect(authFixtures.length).toBeGreaterThan(0);
  });

  test('fixturesByPlatform filters correctly', () => {
    const webFixtures = fixturesByPlatform('web');
    expect(webFixtures.every((f) => f.supportedPlatforms.includes('web'))).toBe(true);
    expect(webFixtures.length).toBeGreaterThan(0);
  });
});

// ── Local compiler compilation tests ─────────────────────────────────────────

test.describe('Local compiler – business flow fixtures', () => {
  // Import synchronously via require so we can use the compiler in pure unit tests
  // without needing the NestJS DI container.
  const { IntentCompilerService } = require('../../../nexus-backend/src/modules/intent/intent-compiler.service');
  const compiler = new IntentCompilerService();

  function assertCleanCompilation(fixture: BusinessFlowFixture, platform: string) {
    const result = compiler.compile(platform, fixture.steps);
    expect(result.schemaVersion).toBe(INTENT_SCHEMA_VERSION);
    expect(result.platform).toBe(platform);
    expect(result.compiledNodes.length).toBeGreaterThan(0);
    expect(result.unsupported).toHaveLength(0);
    // Partial is allowed for fixtures (api.request on web is partial by design)
    // but there should be no missing required params
    expect(result.missingParams).toHaveLength(0);
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  test('LOGIN_WEB compiles cleanly on web', () => {
    assertCleanCompilation(LOGIN_WEB, 'web');
  });

  test('LOGIN_API compiles cleanly on api', () => {
    assertCleanCompilation(LOGIN_API, 'api');
  });

  test('LOGIN_ANDROID compiles cleanly on android', () => {
    assertCleanCompilation(LOGIN_ANDROID, 'android');
  });

  test('LOGIN_WEB does not compile on api (nav.open is unsupported)', () => {
    const result = compiler.compile('api', LOGIN_WEB.steps);
    expect(result.valid).toBe(false);
    const unsupportedIntents = result.unsupported.map((u: { intent: string }) => u.intent);
    expect(unsupportedIntents).toContain('nav.open');
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  test('SEARCH_WEB compiles cleanly on web', () => {
    assertCleanCompilation(SEARCH_WEB, 'web');
  });

  test('SEARCH_API compiles cleanly on api', () => {
    assertCleanCompilation(SEARCH_API, 'api');
  });

  // ── Checkout ───────────────────────────────────────────────────────────────

  test('CHECKOUT_WEB compiles cleanly on web', () => {
    assertCleanCompilation(CHECKOUT_WEB, 'web');
  });

  test('CHECKOUT_API compiles cleanly on api', () => {
    assertCleanCompilation(CHECKOUT_API, 'api');
  });

  test('CHECKOUT_WEB does not compile on desktop (form.fill missing desktop nodes would be ok, but nav.open → desktop requires app param)', () => {
    // nav.open on desktop requires 'app' param; fixture only provides 'url'
    const result = compiler.compile('desktop', CHECKOUT_WEB.steps);
    expect(result.missingParams.length).toBeGreaterThan(0);
  });

  // ── Invoice validation ─────────────────────────────────────────────────────

  test('INVOICE_VALIDATION_WEB compiles cleanly on web', () => {
    assertCleanCompilation(INVOICE_VALIDATION_WEB, 'web');
  });

  test('INVOICE_VALIDATION_API compiles cleanly on api', () => {
    assertCleanCompilation(INVOICE_VALIDATION_API, 'api');
  });

  test('INVOICE_VALIDATION_DB compiles cleanly on db', () => {
    assertCleanCompilation(INVOICE_VALIDATION_DB, 'db');
  });

  test('INVOICE_VALIDATION_DB does not compile on web', () => {
    const result = compiler.compile('web', INVOICE_VALIDATION_DB.steps);
    expect(result.valid).toBe(false);
    expect(result.unsupported.length).toBeGreaterThan(0);
  });

  // ── Adapter isolation assertions ───────────────────────────────────────────

  test('compiled nodes carry adapter keys as strings, never objects', () => {
    const result = compiler.compile('web', LOGIN_WEB.steps);
    for (const node of result.compiledNodes) {
      expect(typeof node.adapter).toBe('string');
      expect(node.adapter.trim()).toBeTruthy();
    }
  });

  test('compiled nodes for web login all use playwright-web adapter', () => {
    const result = compiler.compile('web', LOGIN_WEB.steps);
    for (const node of result.compiledNodes) {
      expect(node.adapter).toBe('playwright-web');
    }
  });

  test('compiled nodes for api login all use api-httpx adapter', () => {
    const result = compiler.compile('api', LOGIN_API.steps);
    for (const node of result.compiledNodes) {
      expect(node.adapter).toBe('api-httpx');
    }
  });

  test('compiled nodes for android login all use appium-android adapter', () => {
    const result = compiler.compile('android', LOGIN_ANDROID.steps);
    for (const node of result.compiledNodes) {
      expect(node.adapter).toBe('appium-android');
    }
  });

  test('compiled nodes for db invoice validation all use db-psycopg adapter', () => {
    const result = compiler.compile('db', INVOICE_VALIDATION_DB.steps);
    for (const node of result.compiledNodes) {
      expect(node.adapter).toBe('db-psycopg');
    }
  });

  // ── nodeKey uniqueness within a plan ──────────────────────────────────────

  test('every compiled node in a plan has a unique nodeKey', () => {
    const result = compiler.compile('web', CHECKOUT_WEB.steps);
    const keys = result.compiledNodes.map((n: { nodeKey: string }) => n.nodeKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  // ── Schema version ────────────────────────────────────────────────────────

  test('all compilation results include the current schema version', () => {
    for (const fixture of ALL_BUSINESS_FLOW_FIXTURES) {
      for (const platform of fixture.supportedPlatforms) {
        const result = compiler.compile(platform, fixture.steps);
        expect(result.schemaVersion).toBe(INTENT_SCHEMA_VERSION);
      }
    }
  });
});

// ── Platform cross-compile isolation tests ───────────────────────────────────

test.describe('Platform adapter isolation', () => {
  const { IntentCompilerService } = require('../../../nexus-backend/src/modules/intent/intent-compiler.service');
  const compiler = new IntentCompilerService();

  const uiOnlyFixtures = [LOGIN_WEB, SEARCH_WEB, CHECKOUT_WEB, INVOICE_VALIDATION_WEB];

  for (const fixture of uiOnlyFixtures) {
    test(`${fixture.id} is invalid on db platform`, () => {
      const result = compiler.compile('db', fixture.steps);
      // Web-only flows contain nav.open / ui.click etc. which are unsupported on db
      expect(result.unsupported.length).toBeGreaterThan(0);
    });
  }

  const apiOnlyFixtures = [LOGIN_API, SEARCH_API, CHECKOUT_API, INVOICE_VALIDATION_API];

  for (const fixture of apiOnlyFixtures) {
    test(`${fixture.id} is invalid on web platform`, () => {
      const result = compiler.compile('web', fixture.steps);
      // api.assert_status and many api.* intents are unsupported on web
      expect(result.unsupported.length).toBeGreaterThan(0);
    });
  }
});
