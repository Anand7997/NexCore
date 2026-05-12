import { BadRequestException } from '@nestjs/common';
import { IntentCompilerService } from '../intent-compiler.service';
import { IntentService } from '../intent.service';
import { SchemaCompatibilityService } from '../schema-compatibility.service';
import { INTENT_SCHEMA_VERSION } from '../../../contracts/intent-contracts';

describe('IntentService', () => {
  let service: IntentService;

  beforeEach(() => {
    service = new IntentService(
      new IntentCompilerService(),
      new SchemaCompatibilityService(),
    );
  });

  it('returns a schema manifest with version history', () => {
    const manifest = service.schemaManifest();
    expect(manifest.currentVersion).toBe(INTENT_SCHEMA_VERSION);
    expect(manifest.versions.some((version) => version.status === 'current')).toBe(true);
    expect(manifest.versions.some((version) => version.version === '0.9')).toBe(true);
    expect(manifest.compatibilityPolicy).toMatch(/Same major versions/);
  });

  it('returns a migration guide for legacy schemas', () => {
    const manifest = service.schemaManifest();
    expect(manifest.migrationGuide['0.9 -> 1.0']).toContain('NestJS');
  });

  it('accepts the current client schema version during compilation', () => {
    const result = service.compileIntentPlan({
      platform: 'web',
      clientSchemaVersion: INTENT_SCHEMA_VERSION,
      steps: [{ intent: 'nav.open', params: { url: 'https://example.com' } }],
    });

    expect(result.valid).toBe(true);
    expect(result.schemaVersion).toBe(INTENT_SCHEMA_VERSION);
  });

  it('rejects incompatible legacy major versions during compilation', () => {
    expect(() =>
      service.compileIntentPlan({
        platform: 'web',
        clientSchemaVersion: '0.9',
        steps: [{ intent: 'nav.open', params: { url: 'https://example.com' } }],
      }),
    ).toThrow(BadRequestException);
  });
});
