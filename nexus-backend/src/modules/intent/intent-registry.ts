/**
 * Business intent registry.
 *
 * The canonical source of intent definitions for nexus-backend.
 * Each intent maps to platform-specific execution adapter contracts.
 * Execution adapters (Playwright, Appium, WinAppDriver, httpx, psycopg)
 * are referenced by adapter key only – they are NOT imported here,
 * keeping business intent isolated from adapter implementation.
 */
import type {
  IntentDefinition,
  ExecutionPlatformKey,
  IntentPlatformMapping,
} from '../../contracts/intent-contracts';
import { INTENT_SCHEMA_VERSION } from '../../contracts/intent-contracts';

// ── Helper ────────────────────────────────────────────────────────────────────

function m(
  status: IntentPlatformMapping['status'],
  adapter: string,
  nodeType: string | null,
  reason: string,
  requiredParams: readonly string[] = [],
): IntentPlatformMapping {
  return { status, adapter, nodeType, reason, requiredParams };
}

function def(
  intentId: string,
  label: string,
  category: string,
  description: string,
  web: IntentPlatformMapping,
  android: IntentPlatformMapping,
  ios: IntentPlatformMapping,
  desktop: IntentPlatformMapping,
  api: IntentPlatformMapping,
  db: IntentPlatformMapping,
): IntentDefinition {
  return {
    intentId,
    label,
    category,
    description,
    mappings: { web, android, ios, desktop, api, db },
    schemaVersion: INTENT_SCHEMA_VERSION,
  };
}

// ── Registry ──────────────────────────────────────────────────────────────────

const UNSUPPORTED_PLATFORM = (platform: string, adapter: string): IntentPlatformMapping =>
  m('unsupported', adapter, null, `Not applicable on the ${platform} platform.`);

export const INTENT_REGISTRY: ReadonlyMap<string, IntentDefinition> = new Map([
  // ── Navigation ─────────────────────────────────────────────────────────────
  [
    'nav.open',
    def(
      'nav.open',
      'Open destination',
      'navigation',
      'Navigate to a URL, route, screen, or app view.',
      m('supported', 'playwright-web', 'web.navigate', 'Maps directly to browser navigation.', ['url']),
      m('supported', 'appium-android', 'mobile.deep_link', 'Opens an Android deep link through Appium.', ['url']),
      m('supported', 'appium-ios', 'mobile.deep_link', 'Opens an iOS universal link through Appium.', ['url']),
      m('supported', 'winappdriver', 'desktop.launch', 'Launches a desktop application via WinAppDriver.', ['app']),
      UNSUPPORTED_PLATFORM('api', 'api-httpx'),
      UNSUPPORTED_PLATFORM('db', 'db-psycopg'),
    ),
  ],

  // ── UI interaction ─────────────────────────────────────────────────────────
  [
    'ui.click',
    def(
      'ui.click',
      'Activate element',
      'interaction',
      'Click, tap, or invoke a visible interactive element.',
      m('supported', 'playwright-web', 'web.click', 'Uses selector-based DOM interaction.', ['selector']),
      m('supported', 'appium-android', 'mobile.tap', 'Uses Appium element lookup and tap.', ['selector']),
      m('supported', 'appium-ios', 'mobile.tap', 'Uses Appium element lookup and tap.', ['selector']),
      m('supported', 'winappdriver', 'desktop.click', 'Uses WinAppDriver element click.', ['selector']),
      UNSUPPORTED_PLATFORM('api', 'api-httpx'),
      UNSUPPORTED_PLATFORM('db', 'db-psycopg'),
    ),
  ],

  [
    'form.fill',
    def(
      'form.fill',
      'Fill field',
      'interaction',
      'Enter text into a field or control.',
      m('supported', 'playwright-web', 'web.fill', 'Uses selector plus value.', ['selector', 'value']),
      m('supported', 'appium-android', 'mobile.type_text', 'Uses Appium send keys.', ['selector', 'value']),
      m('supported', 'appium-ios', 'mobile.type_text', 'Uses Appium send keys.', ['selector', 'value']),
      m('supported', 'winappdriver', 'desktop.type_text', 'Uses WinAppDriver send keys.', ['selector', 'value']),
      UNSUPPORTED_PLATFORM('api', 'api-httpx'),
      UNSUPPORTED_PLATFORM('db', 'db-psycopg'),
    ),
  ],

  [
    'form.select',
    def(
      'form.select',
      'Select option',
      'interaction',
      'Choose an option from a dropdown or list control.',
      m('supported', 'playwright-web', 'web.select_option', 'Uses Playwright selectOption.', ['selector', 'value']),
      m('supported', 'appium-android', 'mobile.select_option', 'Taps dropdown then option element.', ['selector', 'value']),
      m('supported', 'appium-ios', 'mobile.select_option', 'Uses picker wheel or tap interaction.', ['selector', 'value']),
      m('supported', 'winappdriver', 'desktop.select_option', 'Uses WinAppDriver ComboBox interaction.', ['selector', 'value']),
      UNSUPPORTED_PLATFORM('api', 'api-httpx'),
      UNSUPPORTED_PLATFORM('db', 'db-psycopg'),
    ),
  ],

  [
    'form.submit',
    def(
      'form.submit',
      'Submit form',
      'interaction',
      'Submit a form or trigger the primary action of the current screen.',
      m('supported', 'playwright-web', 'web.submit', 'Clicks the submit button or triggers form submission.', ['selector']),
      m('supported', 'appium-android', 'mobile.tap', 'Taps the submit button element.', ['selector']),
      m('supported', 'appium-ios', 'mobile.tap', 'Taps the submit button element.', ['selector']),
      m('supported', 'winappdriver', 'desktop.click', 'Clicks the submit/OK button.', ['selector']),
      UNSUPPORTED_PLATFORM('api', 'api-httpx'),
      UNSUPPORTED_PLATFORM('db', 'db-psycopg'),
    ),
  ],

  // ── Assertions ─────────────────────────────────────────────────────────────
  [
    'ui.assert_text',
    def(
      'ui.assert_text',
      'Assert visible text',
      'assertion',
      'Verify that expected text appears in the active interface.',
      m('supported', 'playwright-web', 'web.assert_text', 'Uses selector, expected text, and match mode.', ['selector', 'expected']),
      m('supported', 'appium-android', 'mobile.assert_text', 'Reads Appium element text.', ['selector', 'expected']),
      m('supported', 'appium-ios', 'mobile.assert_text', 'Reads Appium element text.', ['selector', 'expected']),
      m('supported', 'winappdriver', 'desktop.assert_text', 'Reads WinAppDriver element text.', ['selector', 'expected']),
      UNSUPPORTED_PLATFORM('api', 'api-httpx'),
      UNSUPPORTED_PLATFORM('db', 'db-psycopg'),
    ),
  ],

  [
    'ui.assert_visible',
    def(
      'ui.assert_visible',
      'Assert element visible',
      'assertion',
      'Verify that a UI element is present and visible on screen.',
      m('supported', 'playwright-web', 'web.assert_visible', 'Checks element visibility in DOM.', ['selector']),
      m('supported', 'appium-android', 'mobile.assert_visible', 'Checks Appium element is displayed.', ['selector']),
      m('supported', 'appium-ios', 'mobile.assert_visible', 'Checks Appium element is displayed.', ['selector']),
      m('supported', 'winappdriver', 'desktop.assert_visible', 'Checks WinAppDriver element is visible.', ['selector']),
      UNSUPPORTED_PLATFORM('api', 'api-httpx'),
      UNSUPPORTED_PLATFORM('db', 'db-psycopg'),
    ),
  ],

  [
    'api.assert_status',
    def(
      'api.assert_status',
      'Assert HTTP status',
      'assertion',
      'Verify the HTTP response status code matches the expectation.',
      UNSUPPORTED_PLATFORM('web', 'playwright-web'),
      UNSUPPORTED_PLATFORM('android', 'appium-android'),
      UNSUPPORTED_PLATFORM('ios', 'appium-ios'),
      UNSUPPORTED_PLATFORM('desktop', 'winappdriver'),
      m('supported', 'api-httpx', 'api.assert_status', 'Compares actual HTTP status to expected value.', ['expected']),
      UNSUPPORTED_PLATFORM('db', 'db-psycopg'),
    ),
  ],

  [
    'db.assert_rows',
    def(
      'db.assert_rows',
      'Assert DB row count',
      'assertion',
      'Verify that a SQL query returns the expected number of rows.',
      UNSUPPORTED_PLATFORM('web', 'playwright-web'),
      UNSUPPORTED_PLATFORM('android', 'appium-android'),
      UNSUPPORTED_PLATFORM('ios', 'appium-ios'),
      UNSUPPORTED_PLATFORM('desktop', 'winappdriver'),
      UNSUPPORTED_PLATFORM('api', 'api-httpx'),
      m('supported', 'db-psycopg', 'db.assert_rows', 'Executes SQL and compares row count.', ['query', 'expected']),
    ),
  ],

  // ── Data ───────────────────────────────────────────────────────────────────
  [
    'data.extract',
    def(
      'data.extract',
      'Extract data',
      'data',
      'Capture a value from the current response or interface into execution context.',
      m('supported', 'playwright-web', 'web.extract_text', 'Extracts DOM text into a named variable.', ['selector', 'variable']),
      m('supported', 'appium-android', 'mobile.extract_text', 'Extracts Android element text.', ['selector', 'variable']),
      m('supported', 'appium-ios', 'mobile.extract_text', 'Extracts iOS element text.', ['selector', 'variable']),
      m('supported', 'winappdriver', 'desktop.extract_text', 'Extracts desktop control text.', ['selector', 'variable']),
      m('supported', 'api-httpx', 'api.extract_body', 'Extracts a JSON path from response body.', ['jsonPath', 'variable']),
      m('supported', 'db-psycopg', 'db.extract_cell', 'Extracts a single cell value from a query result.', ['query', 'column', 'variable']),
    ),
  ],

  // ── Evidence ───────────────────────────────────────────────────────────────
  [
    'evidence.screenshot',
    def(
      'evidence.screenshot',
      'Capture screenshot',
      'evidence',
      'Attach a screenshot artifact to the execution timeline.',
      m('supported', 'playwright-web', 'web.screenshot', 'Captures browser viewport or full page.'),
      m('supported', 'appium-android', 'mobile.screenshot', 'Captures current Android device screen.'),
      m('supported', 'appium-ios', 'mobile.screenshot', 'Captures current iOS device screen.'),
      m('supported', 'winappdriver', 'desktop.screenshot', 'Captures the current desktop session screen.'),
      UNSUPPORTED_PLATFORM('api', 'api-httpx'),
      UNSUPPORTED_PLATFORM('db', 'db-psycopg'),
    ),
  ],

  // ── API service ────────────────────────────────────────────────────────────
  [
    'api.request',
    def(
      'api.request',
      'Run API request',
      'service',
      'Execute an HTTP request as part of the business flow.',
      m('partial', 'playwright-web', 'web.api_request', 'Runs via Playwright network intercept; limited auth support.', ['url']),
      UNSUPPORTED_PLATFORM('android', 'appium-android'),
      UNSUPPORTED_PLATFORM('ios', 'appium-ios'),
      UNSUPPORTED_PLATFORM('desktop', 'winappdriver'),
      m('supported', 'api-httpx', 'api.request', 'Full HTTP request with auth, headers, body, and assertions.', ['url']),
      UNSUPPORTED_PLATFORM('db', 'db-psycopg'),
    ),
  ],

  // ── Database ───────────────────────────────────────────────────────────────
  [
    'db.query',
    def(
      'db.query',
      'Execute SQL query',
      'db',
      'Run a SQL query and store results in the execution context.',
      UNSUPPORTED_PLATFORM('web', 'playwright-web'),
      UNSUPPORTED_PLATFORM('android', 'appium-android'),
      UNSUPPORTED_PLATFORM('ios', 'appium-ios'),
      UNSUPPORTED_PLATFORM('desktop', 'winappdriver'),
      UNSUPPORTED_PLATFORM('api', 'api-httpx'),
      m('supported', 'db-psycopg', 'db.query', 'Executes parameterised SQL via psycopg3.', ['query']),
    ),
  ],
]);

/**
 * Look up an intent definition by id.
 * Returns undefined when the intent is not registered.
 */
export function getIntent(intentId: string): IntentDefinition | undefined {
  return INTENT_REGISTRY.get(intentId);
}

/** Returns all registered intent definitions as an array. */
export function listIntents(): IntentDefinition[] {
  return Array.from(INTENT_REGISTRY.values());
}
