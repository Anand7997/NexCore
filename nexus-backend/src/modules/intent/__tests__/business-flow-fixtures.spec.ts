import { IntentCompilerService } from '../intent-compiler.service';
import { INTENT_SCHEMA_VERSION } from '../../../contracts/intent-contracts';
import {
  ALL_BUSINESS_FLOW_FIXTURES,
  CHECKOUT_WEB,
  LOGIN_API,
  LOGIN_WEB,
  fixturesByCategory,
  fixturesByPlatform,
} from '../fixtures/business-flow.fixtures';

describe('Business flow fixtures', () => {
  let compiler: IntentCompilerService;

  beforeEach(() => {
    compiler = new IntentCompilerService();
  });

  it('contains the production validation fixture catalog', () => {
    expect(ALL_BUSINESS_FLOW_FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  it('keeps fixture ids unique', () => {
    const ids = ALL_BUSINESS_FLOW_FIXTURES.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('filters fixtures by category', () => {
    const authFixtures = fixturesByCategory('auth');
    expect(authFixtures.length).toBeGreaterThan(0);
    expect(authFixtures.every((fixture) => fixture.category === 'auth')).toBe(true);
  });

  it('filters fixtures by platform', () => {
    const apiFixtures = fixturesByPlatform('api');
    expect(apiFixtures.length).toBeGreaterThan(0);
    expect(apiFixtures.every((fixture) => fixture.supportedPlatforms.includes('api'))).toBe(
      true,
    );
  });

  for (const fixture of ALL_BUSINESS_FLOW_FIXTURES) {
    for (const platform of fixture.supportedPlatforms) {
      it(`${fixture.id} compiles cleanly on ${platform}`, () => {
        const result = compiler.compile(platform, fixture.steps);
        expect(result.valid).toBe(true);
        expect(result.schemaVersion).toBe(INTENT_SCHEMA_VERSION);
        expect(result.platform).toBe(platform);
        expect(result.compiledNodes.length).toBeGreaterThan(0);
        expect(result.unsupported).toHaveLength(0);
        expect(result.partial).toHaveLength(0);
        expect(result.missingParams).toHaveLength(0);
      });
    }
  }

  it('rejects a web flow on api when it contains web-only intents', () => {
    const result = compiler.compile('api', LOGIN_WEB.steps);
    expect(result.valid).toBe(false);
    expect(result.unsupported.some((issue) => issue.intent === 'nav.open')).toBe(true);
  });

  it('rejects an api flow on web when it contains api-only intents', () => {
    const result = compiler.compile('web', LOGIN_API.steps);
    expect(result.valid).toBe(false);
    expect(
      result.unsupported.some((issue) => issue.intent === 'api.assert_status'),
    ).toBe(true);
  });

  it('reports desktop-specific missing params when a web flow is forced onto desktop', () => {
    const result = compiler.compile('desktop', CHECKOUT_WEB.steps);
    expect(result.valid).toBe(false);
    expect(result.missingParams.length).toBeGreaterThan(0);
  });
});
