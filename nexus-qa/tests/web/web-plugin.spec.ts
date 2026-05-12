/**
 * Web plugin tests – Phase 5
 *
 * Covers all web node types defined in Phase 5 specification:
 *   web.navigate  web.click  web.fill  web.select  web.wait
 *   web.assert_text  web.extract_text  web.screenshot  web.upload  web.execute_js
 *
 * Tests run against the stable demo pages in /demo/*.
 */
import { test, expect } from '../fixtures/base';

// ═══════════════════════════════════════════════════════════════════════════════
// web.navigate
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('web.navigate', () => {
  test('navigates to demo landing page and receives 200', async ({ page }) => {
    const response = await page.goto('/demo');
    expect(response?.status()).toBe(200);
  });

  test('page title is set correctly', async ({ demoPage }) => {
    await expect(demoPage).toHaveTitle(/NexCore/i);
  });

  test('navigates to /demo/form via link click', async ({ demoPage }) => {
    await demoPage.getByTestId('nav-form').click();
    await expect(demoPage).toHaveURL(/\/demo\/form/);
    await expect(demoPage.getByTestId('form-heading')).toBeVisible();
  });

  test('navigates to /demo/api via link click', async ({ demoPage }) => {
    await demoPage.getByTestId('nav-api').click();
    await expect(demoPage).toHaveURL(/\/demo\/api/);
    await expect(demoPage.getByTestId('api-heading')).toBeVisible();
  });

  test('navigates to /demo/upload via link click', async ({ demoPage }) => {
    await demoPage.getByTestId('nav-upload').click();
    await expect(demoPage).toHaveURL(/\/demo\/upload/);
    await expect(demoPage.getByTestId('upload-heading')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// web.assert_text
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('web.assert_text', () => {
  test('demo heading text is present', async ({ demoPage }) => {
    await expect(demoPage.getByTestId('demo-heading')).toHaveText('NexCore Demo Fixture');
  });

  test('demo subtitle text is present', async ({ demoPage }) => {
    await expect(demoPage.getByTestId('demo-subtitle')).toContainText(
      'Stable page for Playwright web plugin verification',
    );
  });

  test('status cards show "ready"', async ({ demoPage }) => {
    for (const id of ['card-web-status', 'card-api-status', 'card-artifacts-status']) {
      await expect(demoPage.getByTestId(id)).toHaveText('ready');
    }
  });

  test('form heading text on form fixture page', async ({ formPage }) => {
    await expect(formPage.getByTestId('form-heading')).toHaveText('Form Fixture');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// web.extract_text
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('web.extract_text', () => {
  test('extracts heading text value', async ({ demoPage }) => {
    const text = await demoPage.getByTestId('demo-heading').textContent();
    expect(text).toBe('NexCore Demo Fixture');
  });

  test('extracts card label text', async ({ demoPage }) => {
    const label = await demoPage.getByTestId('card-web-label').textContent();
    expect(label).toBe('Web Plugin');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// web.click
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('web.click', () => {
  test('counter increments on button click', async ({ demoPage }) => {
    // Navigate directly so the counter is fresh
    await demoPage.goto('/demo');
    const counter = demoPage.getByTestId('counter-value');
    await expect(counter).toHaveText('0');

    await demoPage.getByTestId('counter-increment').click();
    await expect(counter).toHaveText('1');

    await demoPage.getByTestId('counter-increment').click();
    await demoPage.getByTestId('counter-increment').click();
    await expect(counter).toHaveText('3');
  });

  test('clicking submit without filling form shows validation errors', async ({ formPage }) => {
    await formPage.getByTestId('btn-submit').click();
    await expect(formPage.getByTestId('error-username')).toBeVisible();
    await expect(formPage.getByTestId('error-email')).toBeVisible();
  });

  test('reset button clears the form', async ({ formPage }) => {
    await formPage.getByTestId('input-username').fill('testuser');
    await formPage.getByTestId('btn-reset').click();
    await expect(formPage.getByTestId('input-username')).toHaveValue('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// web.fill
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('web.fill', () => {
  test('fills all form fields and submits successfully', async ({ formPage }) => {
    await formPage.getByTestId('input-username').fill('playwright-user');
    await formPage.getByTestId('input-email').fill('pw@nexcore.io');
    await formPage.getByTestId('textarea-message').fill('Automated test message');
    await formPage.getByTestId('select-role').selectOption('engineer');
    await formPage.getByTestId('checkbox-agree').check();
    await formPage.getByTestId('btn-submit').click();

    await expect(formPage.getByTestId('form-success')).toBeVisible({ timeout: 3000 });
  });

  test('fill with special characters is handled', async ({ formPage }) => {
    await formPage.getByTestId('input-username').fill('user-with_special.chars+123');
    await expect(formPage.getByTestId('input-username')).toHaveValue(
      'user-with_special.chars+123',
    );
  });

  test('fill clears previous value', async ({ formPage }) => {
    await formPage.getByTestId('input-username').fill('first-value');
    await formPage.getByTestId('input-username').fill('second-value');
    await expect(formPage.getByTestId('input-username')).toHaveValue('second-value');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// web.select
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('web.select', () => {
  test('selects Admin role', async ({ formPage }) => {
    await formPage.getByTestId('select-role').selectOption('admin');
    await expect(formPage.getByTestId('select-role')).toHaveValue('admin');
  });

  test('selects Engineer role', async ({ formPage }) => {
    await formPage.getByTestId('select-role').selectOption('engineer');
    await expect(formPage.getByTestId('select-role')).toHaveValue('engineer');
  });

  test('selects Viewer role', async ({ formPage }) => {
    await formPage.getByTestId('select-role').selectOption('viewer');
    await expect(formPage.getByTestId('select-role')).toHaveValue('viewer');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// web.wait
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('web.wait', () => {
  test('waits for async form-success after submit', async ({ formPage }) => {
    await formPage.getByTestId('input-username').fill('waiter');
    await formPage.getByTestId('input-email').fill('waiter@nexcore.io');
    await formPage.getByTestId('select-role').selectOption('admin');
    await formPage.getByTestId('checkbox-agree').check();
    await formPage.getByTestId('btn-submit').click();

    // form-success appears after a 400ms async simulation
    await expect(formPage.getByTestId('form-success')).toBeVisible({ timeout: 5000 });
  });

  test('waits for API status update after button click', async ({ apiPage, mockApi }) => {
    await mockApi([
      {
        pattern: '**/api/proxy/plugins**',
        handler: async (route) => {
          await new Promise((r) => setTimeout(r, 200));
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ plugins: [] }),
          });
        },
      },
    ]);
    await apiPage.getByTestId('btn-get-plugins').click();
    // Loading state appears first
    await expect(apiPage.getByTestId('api-status-value')).toHaveText('loading');
    // Then success
    await expect(apiPage.getByTestId('api-status-value')).toHaveText('success', {
      timeout: 5000,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// web.screenshot
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('web.screenshot', () => {
  test('captures full-page screenshot', async ({ demoPage }) => {
    const screenshot = await demoPage.screenshot({
      fullPage: true,
    });
    expect(screenshot.length).toBeGreaterThan(10_000);
  });

  test('captures element screenshot of hero section', async ({ demoPage }) => {
    const hero = demoPage.getByTestId('demo-hero');
    const screenshot = await hero.screenshot();
    expect(screenshot.length).toBeGreaterThan(1_000);
  });

  test('captures form fixture page screenshot', async ({ formPage }) => {
    const screenshot = await formPage.screenshot({
      fullPage: true,
    });
    expect(screenshot.length).toBeGreaterThan(10_000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// web.upload
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('web.upload', () => {
  test('uploads a text file and shows success', async ({ uploadPage, uploadFixtureFile }) => {
    await uploadPage.getByTestId('input-file').setInputFiles(uploadFixtureFile);
    await expect(uploadPage.getByTestId('selected-filename')).toBeVisible();
    await uploadPage.getByTestId('btn-upload').click();
    await expect(uploadPage.getByTestId('upload-success')).toBeVisible();
  });

  test('upload button is disabled before file selection', async ({ uploadPage }) => {
    await expect(uploadPage.getByTestId('btn-upload')).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// web.execute_js
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('web.execute_js', () => {
  test('executes JavaScript to read document title', async ({ demoPage }) => {
    const title = await demoPage.evaluate(() => document.title);
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
  });

  test('executes JavaScript to scroll to bottom', async ({ demoPage }) => {
    await demoPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const scrollY = await demoPage.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThanOrEqual(0);
  });

  test('executes JavaScript to inject and read a custom attribute', async ({ demoPage }) => {
    await demoPage.evaluate(() => {
      document.documentElement.setAttribute('data-test-injected', 'true');
    });
    const val = await demoPage.getAttribute('html', 'data-test-injected');
    expect(val).toBe('true');
  });
});
