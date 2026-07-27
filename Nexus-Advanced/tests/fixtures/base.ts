/**
 * Base test fixture.
 *
 * Extends Playwright's `test` with:
 *   - `demoPage`     – navigate to /demo and return the page
 *   - `formPage`     – navigate to /demo/form and return the page
 *   - `apiPage`      – navigate to /demo/api and return the page
 *   - `uploadPage`   – navigate to /demo/upload and return the page
 *   - `mockApi`      – helper to install route mocks on the current page
 *   - `apiBaseUrl`   – resolved backend base URL
 */
import { test as base, expect, type Page, type Route } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// ── Types ────────────────────────────────────────────────────────────────────

export type MockHandler = (route: Route) => void | Promise<void>;

export interface ApiMockOptions {
  /** URL pattern forwarded to page.route() */
  pattern: string | RegExp;
  handler: MockHandler;
}

export interface BaseFixtures {
  demoPage: Page;
  formPage: Page;
  apiPage: Page;
  uploadPage: Page;
  /** Register one-or-more route mocks before navigation */
  mockApi: (mocks: ApiMockOptions[]) => Promise<void>;
  apiBaseUrl: string;
  /** Returns the path to a temp file that can be used for upload tests */
  uploadFixtureFile: string;
}

// ── Fixture implementation ───────────────────────────────────────────────────

export const test = base.extend<BaseFixtures>({
  apiBaseUrl: [
    async ({}, use) => {
      await use(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api');
    },
    { scope: 'test' },
  ],

  mockApi: [
    async ({ page }, use) => {
      const install = async (mocks: ApiMockOptions[]) => {
        for (const { pattern, handler } of mocks) {
          await page.route(pattern, handler);
        }
      };
      await use(install);
    },
    { scope: 'test' },
  ],

  uploadFixtureFile: [
    async ({}, use) => {
      const tmpDir = path.join(process.cwd(), 'playwright-artifacts', 'tmp-fixtures');
      fs.mkdirSync(tmpDir, { recursive: true });
      const filePath = path.join(tmpDir, 'sample-upload.txt');
      fs.writeFileSync(filePath, 'NexCore Playwright upload fixture\n');
      await use(filePath);
      // Cleanup after test
      fs.rmSync(filePath, { force: true });
    },
    { scope: 'test' },
  ],

  demoPage: [
    async ({ page }, use) => {
      await page.goto('/demo');
      await expect(page.getByTestId('demo-main')).toBeVisible();
      await use(page);
    },
    { scope: 'test' },
  ],

  formPage: [
    async ({ page }, use) => {
      await page.goto('/demo/form');
      await expect(page.getByTestId('form-main')).toBeVisible();
      await use(page);
    },
    { scope: 'test' },
  ],

  apiPage: [
    async ({ page }, use) => {
      await page.goto('/demo/api');
      await expect(page.getByTestId('api-main')).toBeVisible();
      await use(page);
    },
    { scope: 'test' },
  ],

  uploadPage: [
    async ({ page }, use) => {
      await page.goto('/demo/upload');
      await expect(page.getByTestId('upload-main')).toBeVisible();
      await use(page);
    },
    { scope: 'test' },
  ],
});

export { expect };
