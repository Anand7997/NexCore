/**
 * Intent mapping contract tests.
 *
 * Verifies that every intent in the registry declares a mapping entry for
 * all supported platforms and that adapter keys are non-empty strings.
 * These tests guard the registry against accidental breakage when new
 * intents or platforms are added.
 */
import { INTENT_REGISTRY, listIntents } from '../intent-registry';
import { EXECUTION_PLATFORM_KEYS, INTENT_SCHEMA_VERSION } from '../../../contracts/intent-contracts';
import type { ExecutionPlatformKey } from '../../../contracts/intent-contracts';

describe('Intent registry mapping contracts', () => {
  const intents = listIntents();
  const platforms: readonly ExecutionPlatformKey[] = EXECUTION_PLATFORM_KEYS;

  it('contains at least one registered intent', () => {
    expect(intents.length).toBeGreaterThan(0);
  });

  it('every intent carries the current schema version', () => {
    for (const intent of intents) {
      expect(intent.schemaVersion).toBe(INTENT_SCHEMA_VERSION);
    }
  });

  describe.each(intents.map((i) => [i.intentId, i] as const))(
    'intent: %s',
    (_intentId, intent) => {
      it('has a non-empty intentId, label, category, and description', () => {
        expect(intent.intentId.trim()).toBeTruthy();
        expect(intent.label.trim()).toBeTruthy();
        expect(intent.category.trim()).toBeTruthy();
        expect(intent.description.trim()).toBeTruthy();
      });

      it('uses dot-namespace format for intentId', () => {
        expect(intent.intentId).toMatch(/^[a-z]+\.[a-z_]+$/);
      });

      it('has a mapping for every platform', () => {
        for (const platform of platforms) {
          expect(intent.mappings[platform]).toBeDefined();
        }
      });

      describe.each(platforms.map((p) => [p] as const))('platform: %s', (platform) => {
        const mapping = intent.mappings[platform];

        it('has a valid status', () => {
          expect(['supported', 'partial', 'unsupported']).toContain(mapping.status);
        });

        it('has a non-empty adapter key', () => {
          expect(typeof mapping.adapter).toBe('string');
          expect(mapping.adapter.trim()).toBeTruthy();
        });

        it('has a non-null nodeType when supported', () => {
          if (mapping.status === 'supported') {
            expect(mapping.nodeType).toBeTruthy();
          }
        });

        it('has a null nodeType when unsupported', () => {
          if (mapping.status === 'unsupported') {
            expect(mapping.nodeType).toBeNull();
          }
        });

        it('has a non-empty reason when partial or unsupported', () => {
          if (mapping.status !== 'supported') {
            expect(mapping.reason.trim()).toBeTruthy();
          }
        });

        it('requiredParams is an array', () => {
          expect(Array.isArray(mapping.requiredParams)).toBe(true);
        });
      });
    },
  );
});

// ── Platform-specific contract coverage ─────────────────────────────────────

describe('Web platform mapping contracts', () => {
  const webIntents = listIntents().filter(
    (i) => i.mappings.web.status === 'supported',
  );

  it('all supported web intents use playwright-web adapter', () => {
    for (const intent of webIntents) {
      expect(intent.mappings.web.adapter).toBe('playwright-web');
    }
  });

  it('all supported web intents emit a web.* node type', () => {
    for (const intent of webIntents) {
      expect(intent.mappings.web.nodeType).toMatch(/^web\./);
    }
  });
});

describe('Mobile (Android) mapping contracts', () => {
  const androidIntents = listIntents().filter(
    (i) => i.mappings.android.status === 'supported',
  );

  it('all supported android intents use appium-android adapter', () => {
    for (const intent of androidIntents) {
      expect(intent.mappings.android.adapter).toBe('appium-android');
    }
  });

  it('all supported android intents emit a mobile.* node type', () => {
    for (const intent of androidIntents) {
      expect(intent.mappings.android.nodeType).toMatch(/^mobile\./);
    }
  });
});

describe('Mobile (iOS) mapping contracts', () => {
  const iosIntents = listIntents().filter(
    (i) => i.mappings.ios.status === 'supported',
  );

  it('all supported ios intents use appium-ios adapter', () => {
    for (const intent of iosIntents) {
      expect(intent.mappings.ios.adapter).toBe('appium-ios');
    }
  });
});

describe('Desktop mapping contracts', () => {
  const desktopIntents = listIntents().filter(
    (i) => i.mappings.desktop.status === 'supported',
  );

  it('all supported desktop intents use winappdriver adapter', () => {
    for (const intent of desktopIntents) {
      expect(intent.mappings.desktop.adapter).toBe('winappdriver');
    }
  });

  it('all supported desktop intents emit a desktop.* node type', () => {
    for (const intent of desktopIntents) {
      expect(intent.mappings.desktop.nodeType).toMatch(/^desktop\./);
    }
  });
});

describe('API mapping contracts', () => {
  const apiIntents = listIntents().filter(
    (i) => i.mappings.api.status === 'supported',
  );

  it('all supported api intents use api-httpx adapter', () => {
    for (const intent of apiIntents) {
      expect(intent.mappings.api.adapter).toBe('api-httpx');
    }
  });

  it('all supported api intents emit an api.* node type', () => {
    for (const intent of apiIntents) {
      expect(intent.mappings.api.nodeType).toMatch(/^api\./);
    }
  });
});

describe('DB mapping contracts', () => {
  const dbIntents = listIntents().filter(
    (i) => i.mappings.db.status === 'supported',
  );

  it('all supported db intents use db-psycopg adapter', () => {
    for (const intent of dbIntents) {
      expect(intent.mappings.db.adapter).toBe('db-psycopg');
    }
  });

  it('all supported db intents emit a db.* node type', () => {
    for (const intent of dbIntents) {
      expect(intent.mappings.db.nodeType).toMatch(/^db\./);
    }
  });
});

// ── Schema compatibility tests ───────────────────────────────────────────────

describe('SchemaCompatibilityService', () => {
  // Import here to keep tests co-located with mapping tests
  const { SchemaCompatibilityService } = require('../schema-compatibility.service');
  let svc: InstanceType<typeof SchemaCompatibilityService>;

  beforeEach(() => {
    svc = new SchemaCompatibilityService();
  });

  it('accepts the current schema version as compatible', () => {
    const result = svc.check(INTENT_SCHEMA_VERSION);
    expect(result.compatible).toBe(true);
  });

  it('accepts older minor version as compatible', () => {
    // Assuming server is 1.0, client 1.0 (same major) is fine
    const result = svc.check('1.0');
    expect(result.compatible).toBe(true);
  });

  it('rejects a different major version', () => {
    const result = svc.check('2.0');
    expect(result.compatible).toBe(false);
    expect(result.requiredAction).toBeDefined();
  });

  it('rejects a malformed version string', () => {
    const result = svc.check('v1' as any);
    expect(result.compatible).toBe(false);
  });

  it('rejects a client version ahead of the server', () => {
    // Server is 1.0, client claims 1.99
    const result = svc.check('1.99');
    expect(result.compatible).toBe(false);
    expect(result.requiredAction).toBe('upgrade-client');
  });

  it('returns a migration guide with at least one entry', () => {
    const guide = svc.migrationGuide();
    expect(Object.keys(guide).length).toBeGreaterThan(0);
  });
});

// ── INTENT_REGISTRY direct lookup ────────────────────────────────────────────

describe('INTENT_REGISTRY direct lookup', () => {
  it('returns undefined for unknown intent ids', () => {
    expect(INTENT_REGISTRY.get('does.not.exist')).toBeUndefined();
  });

  it('contains nav.open', () => {
    expect(INTENT_REGISTRY.has('nav.open')).toBe(true);
  });

  it('contains db.query', () => {
    expect(INTENT_REGISTRY.has('db.query')).toBe(true);
  });

  it('contains api.request', () => {
    expect(INTENT_REGISTRY.has('api.request')).toBe(true);
  });
});
