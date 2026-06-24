import { PlatformRuntimeValidatorService } from './platform-runtime-validator.service';

describe('PlatformRuntimeValidatorService', () => {
  const service = new PlatformRuntimeValidatorService();

  describe('capability advertising stays in sync with the python plugin', () => {
    test.each(['select_option', 'assert_visible'])(
      'android readiness reports no missing capability for %s',
      async (capability) => {
        const result = await service.validatePlatformReadiness('android', [capability]);
        expect(result.missingCapabilities).toEqual([]);
      },
    );

    test.each(['select_option', 'assert_visible'])(
      'ios readiness reports no missing capability for %s',
      async (capability) => {
        const result = await service.validatePlatformReadiness('ios', [capability]);
        expect(result.missingCapabilities).toEqual([]);
      },
    );

    test('unknown capability is flagged as missing', async () => {
      const result = await service.validatePlatformReadiness('android', ['teleport']);
      expect(result.missingCapabilities).toEqual(['teleport']);
      expect(result.ready).toBe(false);
    });
  });

  describe('readiness shape', () => {
    test('validateAll returns a readiness level for every platform', async () => {
      const summary = await service.validateAll();
      for (const status of [summary.android, summary.ios, summary.desktop]) {
        expect(['ready', 'configured', 'partial', 'unavailable']).toContain(status.readiness);
      }
      expect(typeof summary.allReady).toBe('boolean');
      expect(typeof summary.validatedAt).toBe('string');
    });

    test('android status carries server + device diagnostics on a bare machine', async () => {
      const status = await service.validateAndroid();
      expect(status.platform).toBe('android');
      expect(Array.isArray(status.devices)).toBe(true);
      expect(Array.isArray(status.diagnostics)).toBe(true);
    });
  });
});
