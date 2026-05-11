/**
 * Intent compiler unit tests.
 *
 * Covers the compile() method across all supported platforms:
 *   web, android, ios, desktop, api, db
 *
 * Each test block verifies:
 *   - Happy-path node emission
 *   - Adapter isolation (no adapter implementation leaks into compiled output)
 *   - Unsupported intent handling
 *   - Partial intent handling
 *   - Missing required param detection
 *   - Unknown platform rejection
 *   - Unknown intent rejection
 */
import { IntentCompilerService } from '../intent-compiler.service';
import { INTENT_SCHEMA_VERSION } from '../../../contracts/intent-contracts';

describe('IntentCompilerService', () => {
  let compiler: IntentCompilerService;

  beforeEach(() => {
    compiler = new IntentCompilerService();
  });

  // ── Unknown platform ────────────────────────────────────────────────────────

  it('rejects an unknown platform', () => {
    const result = compiler.compile('fax-machine', []);
    expect(result.valid).toBe(false);
    expect(result.unsupported).toHaveLength(1);
    expect(result.unsupported[0].reason).toMatch(/Unknown platform/);
  });

  // ── Unknown intent ──────────────────────────────────────────────────────────

  it('flags unknown intents as unsupported', () => {
    const result = compiler.compile('web', [{ intent: 'ghost.intent' }]);
    expect(result.valid).toBe(false);
    expect(result.unsupported[0].intent).toBe('ghost.intent');
    expect(result.unsupported[0].reason).toMatch(/not registered/);
  });

  // ── Schema version presence ─────────────────────────────────────────────────

  it('includes the schema version in every result', () => {
    const result = compiler.compile('web', []);
    expect(result.schemaVersion).toBe(INTENT_SCHEMA_VERSION);
  });

  // ── Adapter isolation ───────────────────────────────────────────────────────

  it('emits adapter key strings – not adapter instances', () => {
    const result = compiler.compile('web', [
      { intent: 'nav.open', params: { url: 'https://example.com' } },
    ]);
    const node = result.compiledNodes[0];
    expect(typeof node.adapter).toBe('string');
    expect(node.adapter).toBe('playwright-web');
    // The node must NOT carry any function/class reference
    expect(typeof node.adapter).not.toBe('function');
    expect(typeof node.adapter).not.toBe('object');
  });

  // ── WEB ─────────────────────────────────────────────────────────────────────

  describe('web platform', () => {
    it('compiles nav.open → web.navigate', () => {
      const result = compiler.compile('web', [
        { intent: 'nav.open', params: { url: 'https://example.com' } },
      ]);
      expect(result.valid).toBe(true);
      expect(result.compiledNodes[0].type).toBe('web.navigate');
      expect(result.compiledNodes[0].config['url']).toBe('https://example.com');
    });

    it('compiles ui.click → web.click', () => {
      const result = compiler.compile('web', [
        { intent: 'ui.click', params: { selector: '#btn-login' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('web.click');
    });

    it('compiles form.fill → web.fill', () => {
      const result = compiler.compile('web', [
        { intent: 'form.fill', params: { selector: '#email', value: 'user@example.com' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('web.fill');
    });

    it('compiles form.select → web.select_option', () => {
      const result = compiler.compile('web', [
        { intent: 'form.select', params: { selector: '#country', value: 'US' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('web.select_option');
    });

    it('compiles ui.assert_text → web.assert_text', () => {
      const result = compiler.compile('web', [
        { intent: 'ui.assert_text', params: { selector: 'h1', expected: 'Welcome' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('web.assert_text');
    });

    it('compiles ui.assert_visible → web.assert_visible', () => {
      const result = compiler.compile('web', [
        { intent: 'ui.assert_visible', params: { selector: '.modal' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('web.assert_visible');
    });

    it('compiles data.extract → web.extract_text', () => {
      const result = compiler.compile('web', [
        { intent: 'data.extract', params: { selector: '.order-id', variable: 'orderId' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('web.extract_text');
    });

    it('compiles evidence.screenshot → web.screenshot', () => {
      const result = compiler.compile('web', [{ intent: 'evidence.screenshot' }]);
      expect(result.compiledNodes[0].type).toBe('web.screenshot');
    });

    it('marks api.assert_status as unsupported on web', () => {
      const result = compiler.compile('web', [
        { intent: 'api.assert_status', params: { expected: 200 } },
      ]);
      expect(result.valid).toBe(false);
      expect(result.unsupported[0].intent).toBe('api.assert_status');
    });

    it('marks db.query as unsupported on web', () => {
      const result = compiler.compile('web', [
        { intent: 'db.query', params: { query: 'SELECT 1' } },
      ]);
      expect(result.valid).toBe(false);
      expect(result.unsupported[0].intent).toBe('db.query');
    });

    it('flags missing required params but still reports them', () => {
      const result = compiler.compile('web', [
        { intent: 'form.fill', params: {} }, // missing selector and value
      ]);
      expect(result.missingParams[0].params).toContain('selector');
      expect(result.missingParams[0].params).toContain('value');
    });

    it('compiles api.request as partial on web', () => {
      const result = compiler.compile('web', [
        { intent: 'api.request', params: { url: 'https://api.example.com/data' } },
      ]);
      expect(result.partial[0].intent).toBe('api.request');
      expect(result.valid).toBe(false);
    });

    it('preserves custom step labels in compiled nodes', () => {
      const result = compiler.compile('web', [
        { intent: 'ui.click', label: 'Click Sign In button', params: { selector: '#sign-in' } },
      ]);
      expect(result.compiledNodes[0].label).toBe('Click Sign In button');
    });

    it('uses intent label when step label is omitted', () => {
      const result = compiler.compile('web', [
        { intent: 'ui.click', params: { selector: '#btn' } },
      ]);
      expect(result.compiledNodes[0].label).toBe('Activate element');
    });

    it('generates stable nodeKeys with intent name', () => {
      const result = compiler.compile('web', [
        { intent: 'nav.open', params: { url: 'https://example.com' } },
      ]);
      expect(result.compiledNodes[0].nodeKey).toBe('intent_1_nav_open');
    });
  });

  // ── ANDROID ─────────────────────────────────────────────────────────────────

  describe('android platform', () => {
    it('compiles nav.open → mobile.deep_link', () => {
      const result = compiler.compile('android', [
        { intent: 'nav.open', params: { url: 'myapp://home' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('mobile.deep_link');
      expect(result.compiledNodes[0].adapter).toBe('appium-android');
    });

    it('compiles ui.click → mobile.tap', () => {
      const result = compiler.compile('android', [
        { intent: 'ui.click', params: { selector: 'com.app:id/btn_login' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('mobile.tap');
    });

    it('injects platform=android into config', () => {
      const result = compiler.compile('android', [
        { intent: 'ui.click', params: { selector: '#btn' } },
      ]);
      expect(result.compiledNodes[0].config['platform']).toBe('android');
    });

    it('marks db.query as unsupported on android', () => {
      const result = compiler.compile('android', [
        { intent: 'db.query', params: { query: 'SELECT 1' } },
      ]);
      expect(result.unsupported[0].intent).toBe('db.query');
    });
  });

  // ── IOS ──────────────────────────────────────────────────────────────────────

  describe('ios platform', () => {
    it('compiles nav.open → mobile.deep_link', () => {
      const result = compiler.compile('ios', [
        { intent: 'nav.open', params: { url: 'myapp://home' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('mobile.deep_link');
      expect(result.compiledNodes[0].adapter).toBe('appium-ios');
    });

    it('compiles form.fill → mobile.type_text', () => {
      const result = compiler.compile('ios', [
        { intent: 'form.fill', params: { selector: 'emailField', value: 'user@example.com' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('mobile.type_text');
    });

    it('injects platform=ios into config', () => {
      const result = compiler.compile('ios', [
        { intent: 'ui.assert_text', params: { selector: '.title', expected: 'Home' } },
      ]);
      expect(result.compiledNodes[0].config['platform']).toBe('ios');
    });
  });

  // ── DESKTOP ─────────────────────────────────────────────────────────────────

  describe('desktop platform', () => {
    it('compiles nav.open → desktop.launch', () => {
      const result = compiler.compile('desktop', [
        { intent: 'nav.open', params: { app: 'notepad.exe' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('desktop.launch');
      expect(result.compiledNodes[0].adapter).toBe('winappdriver');
    });

    it('compiles ui.click → desktop.click', () => {
      const result = compiler.compile('desktop', [
        { intent: 'ui.click', params: { selector: 'AutomationId:btnOK' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('desktop.click');
    });

    it('compiles form.fill → desktop.type_text', () => {
      const result = compiler.compile('desktop', [
        { intent: 'form.fill', params: { selector: 'AutomationId:txtEmail', value: 'test@example.com' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('desktop.type_text');
    });

    it('marks db.assert_rows as unsupported on desktop', () => {
      const result = compiler.compile('desktop', [
        { intent: 'db.assert_rows', params: { query: 'SELECT 1', expected: 1 } },
      ]);
      expect(result.unsupported[0].intent).toBe('db.assert_rows');
    });
  });

  // ── API ──────────────────────────────────────────────────────────────────────

  describe('api platform', () => {
    it('compiles api.request → api.request', () => {
      const result = compiler.compile('api', [
        { intent: 'api.request', params: { url: 'https://api.example.com/login' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('api.request');
      expect(result.compiledNodes[0].adapter).toBe('api-httpx');
    });

    it('compiles api.assert_status → api.assert_status', () => {
      const result = compiler.compile('api', [
        { intent: 'api.assert_status', params: { expected: 200 } },
      ]);
      expect(result.compiledNodes[0].type).toBe('api.assert_status');
    });

    it('compiles data.extract → api.extract_body', () => {
      const result = compiler.compile('api', [
        { intent: 'data.extract', params: { jsonPath: '$.token', variable: 'authToken' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('api.extract_body');
    });

    it('marks ui.click as unsupported on api', () => {
      const result = compiler.compile('api', [
        { intent: 'ui.click', params: { selector: '#btn' } },
      ]);
      expect(result.unsupported[0].intent).toBe('ui.click');
    });

    it('marks nav.open as unsupported on api', () => {
      const result = compiler.compile('api', [
        { intent: 'nav.open', params: { url: 'https://example.com' } },
      ]);
      expect(result.unsupported[0].intent).toBe('nav.open');
    });
  });

  // ── DB ───────────────────────────────────────────────────────────────────────

  describe('db platform', () => {
    it('compiles db.query → db.query', () => {
      const result = compiler.compile('db', [
        { intent: 'db.query', params: { query: 'SELECT id FROM users WHERE email=$1' } },
      ]);
      expect(result.compiledNodes[0].type).toBe('db.query');
      expect(result.compiledNodes[0].adapter).toBe('db-psycopg');
    });

    it('compiles db.assert_rows → db.assert_rows', () => {
      const result = compiler.compile('db', [
        { intent: 'db.assert_rows', params: { query: 'SELECT 1', expected: 1 } },
      ]);
      expect(result.compiledNodes[0].type).toBe('db.assert_rows');
    });

    it('compiles data.extract → db.extract_cell', () => {
      const result = compiler.compile('db', [
        {
          intent: 'data.extract',
          params: { query: 'SELECT id FROM orders LIMIT 1', column: 'id', variable: 'orderId' },
        },
      ]);
      expect(result.compiledNodes[0].type).toBe('db.extract_cell');
    });

    it('marks ui.click as unsupported on db', () => {
      const result = compiler.compile('db', [
        { intent: 'ui.click', params: { selector: '#btn' } },
      ]);
      expect(result.unsupported[0].intent).toBe('ui.click');
    });

    it('flags missing required params for db.query', () => {
      const result = compiler.compile('db', [
        { intent: 'db.query', params: {} }, // missing query
      ]);
      expect(result.missingParams[0].params).toContain('query');
    });
  });

  // ── Multi-step plans ────────────────────────────────────────────────────────

  describe('multi-step compilation', () => {
    it('compiles a complete web login flow', () => {
      const result = compiler.compile('web', [
        { intent: 'nav.open', params: { url: 'https://app.example.com/login' } },
        { intent: 'form.fill', params: { selector: '#email', value: 'user@example.com' } },
        { intent: 'form.fill', params: { selector: '#password', value: 'secret' } },
        { intent: 'form.submit', params: { selector: '#btn-login' } },
        { intent: 'ui.assert_text', params: { selector: '.welcome', expected: 'Dashboard' } },
      ]);
      expect(result.valid).toBe(true);
      expect(result.compiledNodes).toHaveLength(5);
      expect(result.compiledNodes.map((n) => n.type)).toEqual([
        'web.navigate',
        'web.fill',
        'web.fill',
        'web.submit',
        'web.assert_text',
      ]);
    });

    it('assigns sequential nodeKeys in a multi-step plan', () => {
      const result = compiler.compile('web', [
        { intent: 'nav.open', params: { url: 'https://example.com' } },
        { intent: 'ui.click', params: { selector: '#btn' } },
      ]);
      expect(result.compiledNodes[0].nodeKey).toMatch(/^intent_1_/);
      expect(result.compiledNodes[1].nodeKey).toMatch(/^intent_2_/);
    });

    it('isolates unsupported steps without failing others', () => {
      const result = compiler.compile('web', [
        { intent: 'nav.open', params: { url: 'https://example.com' } },
        { intent: 'db.query', params: { query: 'SELECT 1' } },
        { intent: 'ui.click', params: { selector: '#btn' } },
      ]);
      expect(result.compiledNodes).toHaveLength(2);
      expect(result.unsupported).toHaveLength(1);
      expect(result.unsupported[0].intent).toBe('db.query');
    });
  });
});
