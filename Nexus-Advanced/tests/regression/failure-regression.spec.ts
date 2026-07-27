/**
 * Failure regression tests – Phase 5
 *
 * Guards against regressions in known failure modes:
 *
 *   1. 404 / missing pages          – graceful handling, no crash
 *   2. Network failures              – app stays interactive after a failed fetch
 *   3. Form validation failures      – correct error messages appear
 *   4. API error display             – error state is surfaced to the user
 *   5. Empty-state rendering         – zero-results pages don't crash
 *   6. Rapid repeated actions        – no race conditions
 *   7. Stale-data recovery           – clear and refetch works
 *   8. Large payload rendering       – page doesn't freeze on a big JSON body
 */
import { test, expect } from '../fixtures/base';
import {
  serverErrorHandler,
  networkFailureHandler,
  timeoutHandler,
  clientErrorHandler,
  PROXY_PATTERNS,
} from '../fixtures/api-contract';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 404 / missing pages
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('404 and missing pages', () => {
  test('non-existent route does not hard-crash the app shell', async ({ page }) => {
    // Next.js will return a 404 page; we just verify the browser does not
    // navigate to an error about:blank or throw an unhandled exception
    let uncaughtError: Error | null = null;
    page.on('pageerror', (err) => { uncaughtError = err; });

    const response = await page.goto('/this-page-does-not-exist-12345');
    expect(response?.status()).toBe(404);
    // Next.js 404 page should render something
    await expect(page.locator('body')).not.toBeEmpty();
    expect(uncaughtError).toBeNull();
  });

  test('navigating back from a 404 page restores the previous page', async ({ page }) => {
    await page.goto('/demo');
    await page.goto('/this-page-does-not-exist-12345');
    await page.goBack();
    await expect(page).toHaveURL(/\/demo/);
    await expect(page.getByTestId('demo-main')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Network failures
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('network failure recovery', () => {
  test('app stays interactive after a failed API call', async ({ page }) => {
    await page.route(PROXY_PATTERNS.plugins, networkFailureHandler());
    await page.goto('/demo/api');
    await page.getByTestId('btn-get-plugins').click();

    // Status goes to error
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });

    // UI is still interactive – buttons are clickable
    await expect(page.getByTestId('btn-clear')).toBeEnabled();
    await page.getByTestId('btn-clear').click();
    await expect(page.getByTestId('api-log-empty')).toBeVisible();
  });

  test('subsequent request succeeds after a previous network failure', async ({ page }) => {
    let callCount = 0;
    await page.route(PROXY_PATTERNS.plugins, async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.abort('failed');
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ plugins: [] }),
        });
      }
    });

    await page.goto('/demo/api');

    // First attempt fails
    await page.getByTestId('btn-get-plugins').click();
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });

    // Second attempt succeeds
    await page.getByTestId('btn-get-plugins').click();
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 6000 });
  });

  test('no unhandled JS exceptions on network failure', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.route(PROXY_PATTERNS.plugins, networkFailureHandler());
    await page.goto('/demo/api');
    await page.getByTestId('btn-get-plugins').click();
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });

    expect(errors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Form validation failures
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('form validation failure regressions', () => {
  test('empty submit shows errors for all required fields', async ({ formPage }) => {
    await formPage.getByTestId('btn-submit').click();
    await expect(formPage.getByTestId('error-username')).toBeVisible();
    await expect(formPage.getByTestId('error-email')).toBeVisible();
    await expect(formPage.getByTestId('error-role')).toBeVisible();
    await expect(formPage.getByTestId('error-agree')).toBeVisible();
  });

  test('invalid email address shows email error', async ({ formPage }) => {
    await formPage.getByTestId('input-username').fill('user1');
    await formPage.getByTestId('input-email').fill('not-an-email');
    await formPage.getByTestId('select-role').selectOption('admin');
    await formPage.getByTestId('checkbox-agree').check();
    await formPage.getByTestId('btn-submit').click();

    await expect(formPage.getByTestId('error-email')).toBeVisible();
    await expect(formPage.getByTestId('error-username')).not.toBeVisible();
  });

  test('unchecked agreement shows agreement error', async ({ formPage }) => {
    await formPage.getByTestId('input-username').fill('user1');
    await formPage.getByTestId('input-email').fill('user@nexcore.io');
    await formPage.getByTestId('select-role').selectOption('admin');
    // leave checkbox unchecked
    await formPage.getByTestId('btn-submit').click();

    await expect(formPage.getByTestId('error-agree')).toBeVisible();
  });

  test('form shows server-side failure for reserved username "fail"', async ({ formPage }) => {
    await formPage.getByTestId('input-username').fill('fail');
    await formPage.getByTestId('input-email').fill('fail@nexcore.io');
    await formPage.getByTestId('select-role').selectOption('admin');
    await formPage.getByTestId('checkbox-agree').check();
    await formPage.getByTestId('btn-submit').click();

    await expect(formPage.getByTestId('form-error')).toBeVisible({ timeout: 3000 });
  });

  test('errors clear when reset is clicked', async ({ formPage }) => {
    await formPage.getByTestId('btn-submit').click();
    await expect(formPage.getByTestId('error-username')).toBeVisible();
    await formPage.getByTestId('btn-reset').click();
    await expect(formPage.getByTestId('error-username')).not.toBeVisible();
  });

  test('no duplicate error messages after repeated submit clicks', async ({ formPage }) => {
    await formPage.getByTestId('btn-submit').click();
    await formPage.getByTestId('btn-submit').click();
    const count = await formPage.getByTestId('error-username').count();
    expect(count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. API error display regressions
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('API error display regressions', () => {
  test('500 error does not leave status as "loading"', async ({ page }) => {
    await page.route(PROXY_PATTERNS.plugins, serverErrorHandler());
    await page.goto('/demo/api');
    await page.getByTestId('btn-get-plugins').click();

    await expect(page.getByTestId('api-status-value')).not.toHaveText('loading', {
      timeout: 8000,
    });
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 8000 });
  });

  test('400 error shows response panel with error body', async ({ page }) => {
    await page.route(PROXY_PATTERNS.plugins, clientErrorHandler('invalid_input'));
    await page.goto('/demo/api');
    await page.getByTestId('btn-get-plugins').click();

    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });
    await expect(page.getByTestId('api-response-panel')).toBeVisible();
  });

  test('timeout error does not leave status as "loading"', async ({ page }) => {
    test.slow();
    await page.route(PROXY_PATTERNS.plugins, timeoutHandler(8_000));
    await page.goto('/demo/api');
    await page.getByTestId('btn-get-plugins').click();

    await expect(page.getByTestId('api-status-value')).not.toHaveText('loading', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('api-status-value')).toHaveText('timeout', {
      timeout: 15_000,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Empty-state rendering
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('empty state rendering', () => {
  test('request log shows empty message before any requests', async ({ page }) => {
    await page.goto('/demo/api');
    await expect(page.getByTestId('api-log-empty')).toBeVisible();
  });

  test('empty plugin response does not crash the response panel', async ({ page }) => {
    await page.route(PROXY_PATTERNS.plugins, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plugins: [] }),
      });
    });
    await page.goto('/demo/api');
    await page.getByTestId('btn-get-plugins').click();
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 6000 });
    await expect(page.getByTestId('api-response-body')).toBeVisible();
    const text = await page.getByTestId('api-response-body').textContent();
    expect(JSON.parse(text ?? '{}')).toHaveProperty('plugins');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Rapid repeated actions (race conditions)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('rapid repeated actions', () => {
  test('clicking counter rapidly does not desync counter value', async ({ demoPage }) => {
    await demoPage.goto('/demo');
    const btn = demoPage.getByTestId('counter-increment');
    // Click 5 times rapidly
    for (let i = 0; i < 5; i++) {
      await btn.click();
    }
    await expect(demoPage.getByTestId('counter-value')).toHaveText('5');
  });

  test('rapid API calls do not leave app in loading state', async ({ page }) => {
    let call = 0;
    await page.route(PROXY_PATTERNS.plugins, async (route) => {
      call++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plugins: [], call }),
      });
    });

    await page.goto('/demo/api');
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('btn-get-plugins').click();
      await page.waitForTimeout(100);
    }

    // After a short settle, should not be stuck in loading
    await expect(page.getByTestId('api-status-value')).not.toHaveText('loading', {
      timeout: 5000,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Stale data recovery
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('stale data recovery', () => {
  test('clear button resets response panel and log', async ({ page }) => {
    await page.route(PROXY_PATTERNS.plugins, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plugins: [] }),
      });
    });
    await page.goto('/demo/api');
    await page.getByTestId('btn-get-plugins').click();
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 6000 });

    await page.getByTestId('btn-clear').click();
    await expect(page.getByTestId('api-status-value')).toHaveText('idle');
    await expect(page.getByTestId('api-log-empty')).toBeVisible();
    await expect(page.getByTestId('api-response-panel')).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Large payload rendering
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('large payload rendering', () => {
  test('page handles a 500-item JSON response without hanging', async ({ page }) => {
    const largePlugins = Array.from({ length: 500 }, (_, i) => ({
      id: `plugin-${i}`,
      name: `Plugin ${i}`,
      version: '1.0.0',
      node_types: [`type.${i}`],
    }));

    await page.route(PROXY_PATTERNS.plugins, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plugins: largePlugins }),
      });
    });

    await page.goto('/demo/api');
    const start = Date.now();
    await page.getByTestId('btn-get-plugins').click();
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 10_000 });
    const elapsed = Date.now() - start;

    // Rendering should complete in well under 8 s
    expect(elapsed).toBeLessThan(8_000);
    await expect(page.getByTestId('api-response-body')).toBeVisible();
  });
});
