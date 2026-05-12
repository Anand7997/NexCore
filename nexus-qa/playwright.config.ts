import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for NexCore QA – Phase 5 Web/API Verification.
 *
 * Test targets:
 *   chromium  – primary browser; runs first in CI
 *   firefox   – cross-browser verification
 *   webkit    – cross-browser verification (Safari engine)
 *
 * Artifacts:
 *   - HTML report    → playwright-report/
 *   - JSON results   → playwright-report/results.json
 *   - JUnit XML      → playwright-report/junit.xml
 *   - Screenshots    → playwright-artifacts/<test>/<browser>/
 *   - Traces         → captured on first retry (or always in CI)
 *   - HAR            → per-test, captured when 'recordHar' fixture is used
 */
export default defineConfig({
  testDir: './tests',
  // Use the Playwright-specific tsconfig so @nestjs/common resolves to the
  // local shim and NestJS service files can be imported without the full
  // @nestjs/common package being installed in nexus-qa.
  tsconfig: './playwright.tsconfig.json',
  fullyParallel: true,
  /* Fail the build on test.only left in source in CI */
  forbidOnly: !!process.env.CI,
  /* Retry twice on CI to absorb flakiness */
  retries: process.env.CI ? 2 : 0,
  /* Limit workers on CI to avoid resource exhaustion */
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['junit', { outputFile: 'playwright-report/junit.xml' }],
    ['list'],
  ],

  use: {
    /* Base URL for page.goto('/demo') calls */
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',

    /* Capture trace on first retry; always on CI */
    trace: process.env.CI ? 'on' : 'on-first-retry',

    /* Screenshot only on failure */
    screenshot: 'only-on-failure',

    /* Video retained when a test fails */
    video: 'retain-on-failure',

    /* Viewport */
    viewport: { width: 1280, height: 720 },

    /* Locale */
    locale: 'en-US',

    /* Extra HTTP headers sent with every request */
    extraHTTPHeaders: { 'x-nexus-test': '1' },
  },

  /* Artifact output directory */
  outputDir: 'playwright-artifacts',

  projects: [
    /* ── Chromium (runs first) ── */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--disable-web-security'] },
      },
    },

    /* ── Firefox ── */
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    /* ── WebKit / Safari ── */
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* ── Mobile viewports (optional; disabled in CI by default) ── */
    ...(process.env.INCLUDE_MOBILE
      ? [
          {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 5'] },
          },
          {
            name: 'mobile-safari',
            use: { ...devices['iPhone 13'] },
          },
        ]
      : []),
  ],

  /* Dev server – reused when already running outside CI */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
