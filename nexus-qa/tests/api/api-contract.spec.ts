/**
 * API contract tests – Phase 5
 *
 * Tests all five contract scenarios against the /demo/api page:
 *   1. Success            – 200 + valid schema
 *   2. Client error       – 4xx response
 *   3. Server error       – 5xx response
 *   4. Timeout            – response delay > frontend abort timeout
 *   5. Retry then pass    – fails N times then succeeds
 *   6. Schema mismatch    – 200 but unexpected payload shape
 *   7. Network failure    – connection aborted
 *   8. Unauthorized       – 401
 *   9. Not found          – 404
 *
 * Routes are intercepted via Playwright's page.route() before page load.
 */
import { test, expect } from '../fixtures/base';
import {
  successHandler,
  clientErrorHandler,
  serverErrorHandler,
  unauthorizedHandler,
  notFoundHandler,
  timeoutHandler,
  retryThenPassHandler,
  schemaMismatchHandler,
  networkFailureHandler,
  PROXY_PATTERNS,
  CONTRACT_RESPONSES,
} from '../fixtures/api-contract';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Navigate to /demo/api with a pre-installed route mock, then click a trigger button */
async function triggerWithMock(
  page: import('@playwright/test').Page,
  pattern: string | RegExp,
  handler: Parameters<typeof page.route>[1],
  btn: string,
) {
  await page.route(pattern, handler);
  await page.goto('/demo/api');
  await page.getByTestId(btn).click();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Success scenario
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('success', () => {
  test('GET /plugins returns 200 and response body is displayed', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      successHandler(CONTRACT_RESPONSES.plugins),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 6000 });
    await expect(page.getByTestId('api-response-panel')).toBeVisible();
    await expect(page.getByTestId('api-response-status')).toContainText('200');
  });

  test('GET /workflows returns 200 and response body is displayed', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.workflows,
      successHandler(CONTRACT_RESPONSES.workflows),
      'btn-get-workflows',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 6000 });
  });

  test('response body contains expected keys', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      successHandler(CONTRACT_RESPONSES.plugins),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 6000 });
    const body = await page.getByTestId('api-response-body').textContent();
    const parsed = JSON.parse(body ?? '{}');
    expect(parsed).toHaveProperty('plugins');
    expect(Array.isArray(parsed.plugins)).toBe(true);
  });

  test('request is logged after successful call', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      successHandler(CONTRACT_RESPONSES.plugins),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 6000 });
    await expect(page.getByTestId('api-log-entry-0')).toBeVisible();
    await expect(page.getByTestId('api-log-entry-1')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Client error (4xx)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('failure – client error', () => {
  test('400 response sets status to error', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      clientErrorHandler('validation_failed'),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });
  });

  test('401 unauthorized sets status to error', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      unauthorizedHandler(),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });
  });

  test('404 not found sets status to error', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      notFoundHandler(),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Server error (5xx)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('failure – server error', () => {
  test('500 response sets status to error', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      serverErrorHandler('internal_server_error'),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });
  });

  test('error response body is rendered in response panel', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      serverErrorHandler(),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });
    await expect(page.getByTestId('api-response-panel')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Timeout
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('timeout', () => {
  test.slow(); // mark as slow; Playwright triples the default timeout

  test('response delay beyond abort limit sets status to timeout', async ({ page }) => {
    // Demo page aborts after 5 s; handler delays 8 s → timeout
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      timeoutHandler(8_000),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('timeout', {
      timeout: 15_000,
    });
  });

  test('timeout entry is appended to request log', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      timeoutHandler(8_000),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('timeout', {
      timeout: 15_000,
    });
    const logEntry1 = await page.getByTestId('api-log-entry-1').textContent();
    expect(logEntry1?.toLowerCase()).toContain('timeout');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Retry then pass
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('retry then pass', () => {
  test('page succeeds after a transient 503 on first attempt', async ({ page }) => {
    // Handler fails on call 1, succeeds on call 2
    const handler = retryThenPassHandler(1, CONTRACT_RESPONSES.plugins);
    await page.route(PROXY_PATTERNS.plugins, handler);
    await page.goto('/demo/api');

    // First click → 503 → error
    await page.getByTestId('btn-get-plugins').click();
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });

    // Second click → 200 → success
    await page.getByTestId('btn-get-plugins').click();
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 6000 });
  });

  test('accumulates multiple log entries across retried calls', async ({ page }) => {
    const handler = retryThenPassHandler(2, CONTRACT_RESPONSES.plugins);
    await page.route(PROXY_PATTERNS.plugins, handler);
    await page.goto('/demo/api');

    for (let i = 0; i < 3; i++) {
      await page.getByTestId('btn-get-plugins').click();
      await page.waitForTimeout(300);
    }

    // At least 3 GET log entries + 3 response log entries (≥ 6 total)
    const count = await page.getByTestId(/api-log-entry-/).count();
    expect(count).toBeGreaterThanOrEqual(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Schema mismatch
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('schema mismatch', () => {
  test('200 with wrong schema is still displayed (no crash)', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      schemaMismatchHandler(),
      'btn-get-plugins',
    );
    // The demo page renders any 200 as success; it does not validate schema
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 6000 });
    // Body is rendered
    await expect(page.getByTestId('api-response-body')).toBeVisible();
    const body = await page.getByTestId('api-response-body').textContent();
    const parsed = JSON.parse(body ?? '{}');
    // Schema lacks 'plugins' key → mismatch detected programmatically
    expect(parsed).not.toHaveProperty('plugins');
    expect(parsed).toHaveProperty('totally_wrong_key');
  });

  test('schema mismatch payload does not contain required plugin fields', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      schemaMismatchHandler(),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 6000 });
    const body = await page.getByTestId('api-response-body').textContent();
    const parsed = JSON.parse(body ?? '{}');
    expect(parsed).not.toHaveProperty('id');
    expect(parsed).not.toHaveProperty('name');
    expect(parsed).not.toHaveProperty('version');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Network failure
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('network failure', () => {
  test('aborted request sets status to error', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      networkFailureHandler(),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });
  });

  test('network failure logs an error entry', async ({ page }) => {
    await triggerWithMock(
      page,
      PROXY_PATTERNS.plugins,
      networkFailureHandler(),
      'btn-get-plugins',
    );
    await expect(page.getByTestId('api-status-value')).toHaveText('error', { timeout: 6000 });
    const logEntry1 = await page.getByTestId('api-log-entry-1').textContent();
    expect(logEntry1?.toLowerCase()).toContain('error');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Request / response inspection via Playwright network
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('request and response log inspection', () => {
  test('Playwright captures the outgoing request URL', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/proxy/')) requests.push(req.url());
    });

    await page.route(PROXY_PATTERNS.plugins, successHandler());
    await page.goto('/demo/api');
    await page.getByTestId('btn-get-plugins').click();
    await page.waitForTimeout(500);

    expect(requests.some((u) => u.includes('/api/proxy/plugins'))).toBe(true);
  });

  test('Playwright captures the response status code', async ({ page }) => {
    const responses: { url: string; status: number }[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/api/proxy/')) {
        responses.push({ url: res.url(), status: res.status() });
      }
    });

    await page.route(PROXY_PATTERNS.plugins, successHandler(CONTRACT_RESPONSES.plugins, 200));
    await page.goto('/demo/api');
    await page.getByTestId('btn-get-plugins').click();
    await page.waitForTimeout(500);

    const match = responses.find((r) => r.url.includes('/api/proxy/plugins'));
    expect(match).toBeDefined();
    expect(match?.status).toBe(200);
  });

  test('clears log between separate requests', async ({ page }) => {
    await page.route(PROXY_PATTERNS.plugins, successHandler());
    await page.route(PROXY_PATTERNS.workflows, successHandler(CONTRACT_RESPONSES.workflows));
    await page.goto('/demo/api');

    await page.getByTestId('btn-get-plugins').click();
    await expect(page.getByTestId('api-status-value')).toHaveText('success', { timeout: 6000 });

    await page.getByTestId('btn-clear').click();
    await expect(page.getByTestId('api-log-empty')).toBeVisible();
  });
});
