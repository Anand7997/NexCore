/**
 * Screenshot and OCR validation fixtures for Phase 8.
 *
 * These fixtures define intent plans that capture screenshots and perform
 * OCR-based text assertions across web, mobile, and desktop platforms.
 *
 * Structure:
 *   - ScreenshotFixture: captures a screenshot + asserts visual state
 *   - OcrValidationFixture: captures + asserts text content via OCR
 *   - CrossPlatformScreenshotFixture: same flow run across multiple platforms
 */

import type { IntentStep, ExecutionPlatformKey } from '../../../nexus-backend/src/contracts/intent-contracts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScreenshotFixture {
  id: string;
  name: string;
  platform: ExecutionPlatformKey;
  /** Steps to reach the screen state before capture */
  navigationSteps: IntentStep[];
  /** The screenshot capture step */
  screenshotStep: IntentStep;
  /** Optional post-screenshot assertion steps */
  assertionSteps: IntentStep[];
}

export interface OcrValidationFixture {
  id: string;
  name: string;
  description: string;
  platform: ExecutionPlatformKey;
  /** Steps that set up the screen state */
  setupSteps: IntentStep[];
  /** Screenshot capture (evidence.screenshot intent) */
  captureStep: IntentStep;
  /**
   * OCR assertion steps: ui.assert_text on a selector that the OCR engine
   * exposes as a virtual element. On web this is a real DOM selector; on
   * mobile/desktop it is the closest accessible text node.
   */
  ocrAssertions: Array<{
    description: string;
    step: IntentStep;
  }>;
}

export interface CrossPlatformScreenshotFixture {
  id: string;
  name: string;
  /** Platforms this fixture is expected to run on */
  platforms: readonly ExecutionPlatformKey[];
  /** Steps shared across platforms (platform-neutral intent ids only) */
  sharedSteps: IntentStep[];
  /** Platform-specific overrides for navigation */
  platformOverrides: Partial<Record<ExecutionPlatformKey, IntentStep[]>>;
}

// ── Screenshot fixtures ───────────────────────────────────────────────────────

export const LOGIN_PAGE_SCREENSHOT_WEB: ScreenshotFixture = {
  id: 'screenshot.login.web',
  name: 'Login page screenshot (web)',
  platform: 'web',
  navigationSteps: [
    { intent: 'nav.open', params: { url: 'https://app.nexcore.io/login' } },
  ],
  screenshotStep: { intent: 'evidence.screenshot', label: 'Login page initial state' },
  assertionSteps: [
    {
      intent: 'ui.assert_visible',
      label: 'Email field visible',
      params: { selector: '[data-testid="email-input"]' },
    },
    {
      intent: 'ui.assert_visible',
      label: 'Password field visible',
      params: { selector: '[data-testid="password-input"]' },
    },
  ],
};

export const LOGIN_PAGE_SCREENSHOT_ANDROID: ScreenshotFixture = {
  id: 'screenshot.login.android',
  name: 'Login screen screenshot (Android)',
  platform: 'android',
  navigationSteps: [
    { intent: 'nav.open', params: { url: 'nexcore://login' } },
  ],
  screenshotStep: { intent: 'evidence.screenshot', label: 'Android login screen' },
  assertionSteps: [
    {
      intent: 'ui.assert_visible',
      label: 'Email field visible',
      params: { selector: 'com.nexcore.app:id/input_email' },
    },
  ],
};

export const DASHBOARD_SCREENSHOT_WEB: ScreenshotFixture = {
  id: 'screenshot.dashboard.web',
  name: 'Dashboard screenshot after login (web)',
  platform: 'web',
  navigationSteps: [
    { intent: 'nav.open', params: { url: 'https://app.nexcore.io/login' } },
    { intent: 'form.fill', params: { selector: '[data-testid="email-input"]', value: 'qa@nexcore.io' } },
    { intent: 'form.fill', params: { selector: '[data-testid="password-input"]', value: 'P@ssw0rd!' } },
    { intent: 'form.submit', params: { selector: '[data-testid="login-submit"]' } },
    { intent: 'ui.assert_visible', params: { selector: '[data-testid="dashboard-heading"]' } },
  ],
  screenshotStep: { intent: 'evidence.screenshot', label: 'Dashboard post-login' },
  assertionSteps: [
    {
      intent: 'ui.assert_text',
      params: { selector: '[data-testid="dashboard-heading"]', expected: 'Dashboard' },
    },
  ],
};

export const ORDER_CONFIRMATION_SCREENSHOT_WEB: ScreenshotFixture = {
  id: 'screenshot.order-confirmation.web',
  name: 'Order confirmation screenshot (web)',
  platform: 'web',
  navigationSteps: [
    { intent: 'nav.open', params: { url: 'https://app.nexcore.io/orders/ord-test-001/confirmation' } },
    { intent: 'ui.assert_visible', params: { selector: '[data-testid="order-confirmation"]' } },
  ],
  screenshotStep: { intent: 'evidence.screenshot', label: 'Order confirmation state' },
  assertionSteps: [
    {
      intent: 'ui.assert_text',
      params: { selector: '[data-testid="order-confirmation"]', expected: 'Order confirmed' },
    },
    {
      intent: 'ui.assert_visible',
      params: { selector: '[data-testid="order-id"]' },
    },
  ],
};

export const DESKTOP_APP_SCREENSHOT: ScreenshotFixture = {
  id: 'screenshot.desktop.notepad',
  name: 'Desktop app screenshot (Notepad)',
  platform: 'desktop',
  navigationSteps: [
    {
      intent: 'nav.open',
      params: { app: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App' },
    },
  ],
  screenshotStep: { intent: 'evidence.screenshot', label: 'Notepad initial state' },
  assertionSteps: [],
};

// ── OCR validation fixtures ───────────────────────────────────────────────────

export const OCR_LOGIN_SUCCESS_WEB: OcrValidationFixture = {
  id: 'ocr.login-success.web',
  name: 'OCR: Dashboard heading after login (web)',
  description: 'Logs in and uses OCR-backed text assertion to verify the Dashboard heading.',
  platform: 'web',
  setupSteps: [
    { intent: 'nav.open', params: { url: 'https://app.nexcore.io/login' } },
    { intent: 'form.fill', params: { selector: '[data-testid="email-input"]', value: 'qa@nexcore.io' } },
    { intent: 'form.fill', params: { selector: '[data-testid="password-input"]', value: 'P@ssw0rd!' } },
    { intent: 'form.submit', params: { selector: '[data-testid="login-submit"]' } },
  ],
  captureStep: { intent: 'evidence.screenshot', label: 'OCR capture: post-login' },
  ocrAssertions: [
    {
      description: 'Dashboard heading is visible',
      step: {
        intent: 'ui.assert_text',
        params: { selector: '[data-testid="dashboard-heading"]', expected: 'Dashboard' },
      },
    },
    {
      description: 'User menu is visible',
      step: {
        intent: 'ui.assert_visible',
        params: { selector: '[data-testid="user-menu"]' },
      },
    },
  ],
};

export const OCR_SEARCH_RESULTS_WEB: OcrValidationFixture = {
  id: 'ocr.search-results.web',
  name: 'OCR: Search results list (web)',
  description: 'Performs a search and validates result titles through OCR-backed text assertion.',
  platform: 'web',
  setupSteps: [
    { intent: 'nav.open', params: { url: 'https://app.nexcore.io/products' } },
    { intent: 'form.fill', params: { selector: '[data-testid="search-input"]', value: 'automation' } },
    { intent: 'ui.click', params: { selector: '[data-testid="search-btn"]' } },
    { intent: 'ui.assert_visible', params: { selector: '[data-testid="results-list"]' } },
  ],
  captureStep: { intent: 'evidence.screenshot', label: 'OCR capture: search results' },
  ocrAssertions: [
    {
      description: 'Results heading visible',
      step: {
        intent: 'ui.assert_visible',
        params: { selector: '[data-testid="results-list"]' },
      },
    },
    {
      description: 'First result title contains search term',
      step: {
        intent: 'ui.assert_text',
        params: { selector: '[data-testid="result-0-title"]', expected: 'automation' },
      },
    },
  ],
};

export const OCR_INVOICE_ANDROID: OcrValidationFixture = {
  id: 'ocr.invoice.android',
  name: 'OCR: Invoice status on Android',
  description: 'Opens the invoice detail screen and validates status label via OCR-backed Appium assertion.',
  platform: 'android',
  setupSteps: [
    { intent: 'nav.open', params: { url: 'nexcore://invoices/inv-test-001' } },
  ],
  captureStep: { intent: 'evidence.screenshot', label: 'OCR capture: invoice detail (Android)' },
  ocrAssertions: [
    {
      description: 'Invoice status shows Paid',
      step: {
        intent: 'ui.assert_text',
        params: { selector: 'com.nexcore.app:id/label_invoice_status', expected: 'Paid' },
      },
    },
    {
      description: 'Invoice total is visible',
      step: {
        intent: 'ui.assert_visible',
        params: { selector: 'com.nexcore.app:id/label_invoice_total' },
      },
    },
  ],
};

export const OCR_DESKTOP_WINDOW_TITLE: OcrValidationFixture = {
  id: 'ocr.desktop.window-title',
  name: 'OCR: Desktop window title (Notepad)',
  description: 'Launches Notepad and asserts the window title bar text via WinAppDriver OCR-backed assertion.',
  platform: 'desktop',
  setupSteps: [
    { intent: 'nav.open', params: { app: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App' } },
  ],
  captureStep: { intent: 'evidence.screenshot', label: 'OCR capture: Notepad window' },
  ocrAssertions: [
    {
      description: 'Title bar contains Notepad',
      step: {
        intent: 'ui.assert_text',
        params: { selector: 'Name:Untitled - Notepad', expected: 'Notepad' },
      },
    },
  ],
};

// ── Cross-platform screenshot fixtures ────────────────────────────────────────

export const CROSS_PLATFORM_LOGIN_SCREENSHOT: CrossPlatformScreenshotFixture = {
  id: 'cross.screenshot.login',
  name: 'Login screenshot across web + android + ios',
  platforms: ['web', 'android', 'ios'],
  sharedSteps: [
    { intent: 'evidence.screenshot', label: 'Login screen capture' },
  ],
  platformOverrides: {
    web: [
      { intent: 'nav.open', params: { url: 'https://app.nexcore.io/login' } },
      { intent: 'ui.assert_visible', params: { selector: '[data-testid="email-input"]' } },
    ],
    android: [
      { intent: 'nav.open', params: { url: 'nexcore://login' } },
      { intent: 'ui.assert_visible', params: { selector: 'com.nexcore.app:id/input_email' } },
    ],
    ios: [
      { intent: 'nav.open', params: { url: 'nexcore://login' } },
      { intent: 'ui.assert_visible', params: { selector: 'emailTextField' } },
    ],
  },
};

export const CROSS_PLATFORM_CHECKOUT_SCREENSHOT: CrossPlatformScreenshotFixture = {
  id: 'cross.screenshot.checkout',
  name: 'Checkout confirmation screenshot across web + android',
  platforms: ['web', 'android'],
  sharedSteps: [
    { intent: 'evidence.screenshot', label: 'Checkout confirmation capture' },
  ],
  platformOverrides: {
    web: [
      { intent: 'nav.open', params: { url: 'https://app.nexcore.io/checkout/confirmation' } },
      { intent: 'ui.assert_text', params: { selector: '[data-testid="order-confirmation"]', expected: 'Order confirmed' } },
    ],
    android: [
      { intent: 'nav.open', params: { url: 'nexcore://checkout/confirmation' } },
      { intent: 'ui.assert_text', params: { selector: 'com.nexcore.app:id/label_order_status', expected: 'Order confirmed' } },
    ],
  },
};

// ── Fixture index ─────────────────────────────────────────────────────────────

export const ALL_SCREENSHOT_FIXTURES: readonly ScreenshotFixture[] = [
  LOGIN_PAGE_SCREENSHOT_WEB,
  LOGIN_PAGE_SCREENSHOT_ANDROID,
  DASHBOARD_SCREENSHOT_WEB,
  ORDER_CONFIRMATION_SCREENSHOT_WEB,
  DESKTOP_APP_SCREENSHOT,
];

export const ALL_OCR_FIXTURES: readonly OcrValidationFixture[] = [
  OCR_LOGIN_SUCCESS_WEB,
  OCR_SEARCH_RESULTS_WEB,
  OCR_INVOICE_ANDROID,
  OCR_DESKTOP_WINDOW_TITLE,
];

export const ALL_CROSS_PLATFORM_SCREENSHOT_FIXTURES: readonly CrossPlatformScreenshotFixture[] = [
  CROSS_PLATFORM_LOGIN_SCREENSHOT,
  CROSS_PLATFORM_CHECKOUT_SCREENSHOT,
];

export function screenshotFixturesByPlatform(platform: ExecutionPlatformKey): ScreenshotFixture[] {
  return ALL_SCREENSHOT_FIXTURES.filter((f) => f.platform === platform);
}

export function ocrFixturesByPlatform(platform: ExecutionPlatformKey): OcrValidationFixture[] {
  return ALL_OCR_FIXTURES.filter((f) => f.platform === platform);
}
