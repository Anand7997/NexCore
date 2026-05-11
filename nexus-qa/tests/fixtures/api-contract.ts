/**
 * API contract test fixtures.
 *
 * Provides pre-built route handlers for common contract scenarios:
 *   success        – 200 + valid response body
 *   clientError    – 400 Bad Request
 *   serverError    – 500 Internal Server Error
 *   unauthorized   – 401 Unauthorized
 *   notFound       – 404 Not Found
 *   timeout        – delays response beyond the frontend timeout limit
 *   retryThenPass  – fails N times then succeeds (tracks call count per page)
 *   schemaMismatch – 200 but wrong payload shape
 */
import { type Route } from '@playwright/test';

// ── Canonical response shapes ─────────────────────────────────────────────────

export const CONTRACT_RESPONSES = {
  plugins: {
    plugins: [
      {
        id: 'web',
        name: 'Web Plugin',
        version: '1.0.0',
        node_types: ['web.navigate', 'web.click', 'web.fill'],
      },
      {
        id: 'api',
        name: 'API Plugin',
        version: '1.0.0',
        node_types: ['api.get', 'api.post'],
      },
    ],
  },

  workflows: {
    items: [
      {
        id: 'wf-001',
        name: 'Smoke Test',
        status: 'active',
        node_count: 3,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    total: 1,
  },

  executions: {
    items: [
      {
        id: 'exec-001',
        workflow_id: 'wf-001',
        status: 'completed',
        started_at: '2026-01-01T10:00:00Z',
        completed_at: '2026-01-01T10:01:00Z',
      },
    ],
    total: 1,
  },
} as const;

// ── Route handler factories ───────────────────────────────────────────────────

/** 200 OK with a valid contract body */
export function successHandler(
  body: unknown = CONTRACT_RESPONSES.plugins,
  status = 200,
) {
  return async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  };
}

/** 400 Bad Request */
export function clientErrorHandler(message = 'bad_request') {
  return async (route: Route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: message, code: 'BAD_REQUEST' }),
    });
  };
}

/** 500 Internal Server Error */
export function serverErrorHandler(message = 'internal_server_error') {
  return async (route: Route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: message, code: 'INTERNAL_ERROR' }),
    });
  };
}

/** 401 Unauthorized */
export function unauthorizedHandler() {
  return async (route: Route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unauthorized', code: 'UNAUTHORIZED' }),
    });
  };
}

/** 404 Not Found */
export function notFoundHandler() {
  return async (route: Route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not_found', code: 'NOT_FOUND' }),
    });
  };
}

/**
 * Timeout handler – delays response by `delayMs` (default 8 s).
 * The demo API page uses a 5 s AbortSignal, so 8 s guarantees a timeout.
 */
export function timeoutHandler(delayMs = 8_000) {
  return async (route: Route) => {
    await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ late: true }),
    });
  };
}

/**
 * Retry-then-pass handler factory.
 *
 * @param failCount  Number of requests to fail before succeeding.
 * @param body       The success body.
 */
export function retryThenPassHandler(
  failCount = 1,
  body: unknown = CONTRACT_RESPONSES.plugins,
) {
  let callCount = 0;
  return async (route: Route) => {
    callCount += 1;
    if (callCount <= failCount) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'service_unavailable',
          attempt: callCount,
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  };
}

/**
 * Schema mismatch handler – returns 200 but with completely wrong shape.
 */
export function schemaMismatchHandler() {
  return async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totally_wrong_key: true,
        nested: { unexpected: [1, 2, 3] },
      }),
    });
  };
}

/**
 * Network abort handler – simulates a connection failure.
 */
export function networkFailureHandler() {
  return async (route: Route) => {
    await route.abort('failed');
  };
}

// ── URL patterns ─────────────────────────────────────────────────────────────

/** Matches the Next.js proxy routes used by the demo/api page */
export const PROXY_PATTERNS = {
  plugins: '**/api/proxy/plugins**',
  workflows: '**/api/proxy/workflows**',
  executions: '**/api/proxy/executions**',
  any: '**/api/proxy/**',
} as const;

/** Matches the backend routes directly */
export const BACKEND_PATTERNS = {
  plugins: '**/api/plugins/**',
  nodeTypes: '**/api/plugins/node-types**',
  workflows: '**/api/workflows/**',
  executions: '**/api/executions/**',
  artifacts: '**/api/artifacts/**',
} as const;
