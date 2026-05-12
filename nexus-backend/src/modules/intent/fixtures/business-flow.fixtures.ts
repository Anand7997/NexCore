import type {
  ExecutionPlatformKey,
  IntentStep,
} from '../../../contracts/intent-contracts';

export interface BusinessFlowFixture {
  id: string;
  name: string;
  category: 'auth' | 'search' | 'commerce' | 'finance' | 'data';
  supportedPlatforms: readonly ExecutionPlatformKey[];
  steps: IntentStep[];
}

export const LOGIN_WEB: BusinessFlowFixture = {
  id: 'login.web',
  name: 'User login (web)',
  category: 'auth',
  supportedPlatforms: ['web'],
  steps: [
    { intent: 'nav.open', label: 'Open login page', params: { url: 'https://app.nexcore.io/login' } },
    {
      intent: 'form.fill',
      label: 'Enter email',
      params: { selector: '[data-testid="email-input"]', value: 'qa@nexcore.io' },
    },
    {
      intent: 'form.fill',
      label: 'Enter password',
      params: { selector: '[data-testid="password-input"]', value: 'P@ssw0rd!' },
    },
    { intent: 'form.submit', label: 'Submit login form', params: { selector: '[data-testid="login-submit"]' } },
    {
      intent: 'ui.assert_text',
      label: 'Verify dashboard heading',
      params: { selector: '[data-testid="dashboard-heading"]', expected: 'Dashboard' },
    },
    { intent: 'evidence.screenshot', label: 'Capture post-login state' },
  ],
};

export const LOGIN_API: BusinessFlowFixture = {
  id: 'login.api',
  name: 'User login (API)',
  category: 'auth',
  supportedPlatforms: ['api'],
  steps: [
    {
      intent: 'api.request',
      label: 'POST /auth/login',
      params: {
        url: 'https://api.nexcore.io/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { email: 'qa@nexcore.io', password: 'P@ssw0rd!' },
      },
    },
    { intent: 'api.assert_status', label: 'Assert 200 OK', params: { expected: 200 } },
    { intent: 'data.extract', label: 'Extract auth token', params: { jsonPath: '$.token', variable: 'authToken' } },
  ],
};

export const LOGIN_ANDROID: BusinessFlowFixture = {
  id: 'login.android',
  name: 'User login (Android)',
  category: 'auth',
  supportedPlatforms: ['android'],
  steps: [
    { intent: 'nav.open', label: 'Launch login screen', params: { url: 'nexcore://login' } },
    {
      intent: 'form.fill',
      label: 'Enter email',
      params: { selector: 'com.nexcore.app:id/input_email', value: 'qa@nexcore.io' },
    },
    {
      intent: 'form.fill',
      label: 'Enter password',
      params: { selector: 'com.nexcore.app:id/input_password', value: 'P@ssw0rd!' },
    },
    { intent: 'ui.click', label: 'Tap Sign In', params: { selector: 'com.nexcore.app:id/btn_login' } },
    {
      intent: 'ui.assert_text',
      label: 'Verify home screen',
      params: { selector: 'com.nexcore.app:id/label_welcome', expected: 'Welcome back' },
    },
  ],
};

export const SEARCH_WEB: BusinessFlowFixture = {
  id: 'search.web',
  name: 'Product search (web)',
  category: 'search',
  supportedPlatforms: ['web'],
  steps: [
    { intent: 'nav.open', label: 'Open product catalogue', params: { url: 'https://app.nexcore.io/products' } },
    {
      intent: 'form.fill',
      label: 'Enter search term',
      params: { selector: '[data-testid="search-input"]', value: 'automation framework' },
    },
    { intent: 'ui.click', label: 'Submit search', params: { selector: '[data-testid="search-btn"]' } },
    { intent: 'ui.assert_visible', label: 'Results list is visible', params: { selector: '[data-testid="results-list"]' } },
    {
      intent: 'data.extract',
      label: 'Capture first result title',
      params: { selector: '[data-testid="result-0-title"]', variable: 'firstResult' },
    },
    { intent: 'evidence.screenshot', label: 'Capture search results' },
  ],
};

export const SEARCH_API: BusinessFlowFixture = {
  id: 'search.api',
  name: 'Product search (API)',
  category: 'search',
  supportedPlatforms: ['api'],
  steps: [
    {
      intent: 'api.request',
      label: 'GET /products?q=...',
      params: { url: 'https://api.nexcore.io/products?q=automation+framework', method: 'GET' },
    },
    { intent: 'api.assert_status', label: 'Assert 200 OK', params: { expected: 200 } },
    { intent: 'data.extract', label: 'Extract first product id', params: { jsonPath: '$.items[0].id', variable: 'firstProductId' } },
  ],
};

export const CHECKOUT_WEB: BusinessFlowFixture = {
  id: 'checkout.web',
  name: 'E-commerce checkout (web)',
  category: 'commerce',
  supportedPlatforms: ['web'],
  steps: [
    { intent: 'nav.open', label: 'Open cart', params: { url: 'https://app.nexcore.io/cart' } },
    { intent: 'ui.assert_visible', label: 'Cart has items', params: { selector: '[data-testid="cart-item-0"]' } },
    { intent: 'ui.click', label: 'Proceed to checkout', params: { selector: '[data-testid="btn-checkout"]' } },
    { intent: 'form.fill', label: 'Enter card number', params: { selector: '[data-testid="card-number"]', value: '4111111111111111' } },
    { intent: 'form.fill', label: 'Enter expiry', params: { selector: '[data-testid="card-expiry"]', value: '12/28' } },
    { intent: 'form.fill', label: 'Enter CVV', params: { selector: '[data-testid="card-cvv"]', value: '123' } },
    { intent: 'form.submit', label: 'Place order', params: { selector: '[data-testid="btn-place-order"]' } },
    {
      intent: 'ui.assert_text',
      label: 'Verify order confirmation',
      params: { selector: '[data-testid="order-confirmation"]', expected: 'Order confirmed' },
    },
    { intent: 'data.extract', label: 'Capture order ID', params: { selector: '[data-testid="order-id"]', variable: 'orderId' } },
    { intent: 'evidence.screenshot', label: 'Capture confirmation page' },
  ],
};

export const CHECKOUT_API: BusinessFlowFixture = {
  id: 'checkout.api',
  name: 'E-commerce checkout (API)',
  category: 'commerce',
  supportedPlatforms: ['api'],
  steps: [
    {
      intent: 'api.request',
      label: 'POST /orders',
      params: {
        url: 'https://api.nexcore.io/orders',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer {{authToken}}' },
        body: { cartId: 'cart-test-001', paymentToken: 'tok_test_visa' },
      },
    },
    { intent: 'api.assert_status', label: 'Assert 201 Created', params: { expected: 201 } },
    { intent: 'data.extract', label: 'Extract order ID', params: { jsonPath: '$.id', variable: 'orderId' } },
    {
      intent: 'api.request',
      label: 'GET /orders/:id',
      params: { url: 'https://api.nexcore.io/orders/{{orderId}}', method: 'GET' },
    },
    { intent: 'api.assert_status', label: 'Assert order retrieval 200', params: { expected: 200 } },
  ],
};

export const INVOICE_VALIDATION_WEB: BusinessFlowFixture = {
  id: 'invoice.validation.web',
  name: 'Invoice validation (web)',
  category: 'finance',
  supportedPlatforms: ['web'],
  steps: [
    { intent: 'nav.open', label: 'Open invoices list', params: { url: 'https://app.nexcore.io/invoices' } },
    { intent: 'ui.click', label: 'Open first invoice', params: { selector: '[data-testid="invoice-row-0"]' } },
    { intent: 'ui.assert_visible', label: 'Invoice detail visible', params: { selector: '[data-testid="invoice-detail"]' } },
    {
      intent: 'ui.assert_text',
      label: 'Verify invoice status',
      params: { selector: '[data-testid="invoice-status"]', expected: 'Paid' },
    },
    { intent: 'data.extract', label: 'Capture invoice total', params: { selector: '[data-testid="invoice-total"]', variable: 'invoiceTotal' } },
    { intent: 'evidence.screenshot', label: 'Capture invoice detail' },
  ],
};

export const INVOICE_VALIDATION_API: BusinessFlowFixture = {
  id: 'invoice.validation.api',
  name: 'Invoice validation (API)',
  category: 'finance',
  supportedPlatforms: ['api'],
  steps: [
    {
      intent: 'api.request',
      label: 'GET /invoices/:id',
      params: {
        url: 'https://api.nexcore.io/invoices/inv-test-001',
        method: 'GET',
        headers: { Authorization: 'Bearer {{authToken}}' },
      },
    },
    { intent: 'api.assert_status', label: 'Assert 200 OK', params: { expected: 200 } },
    { intent: 'data.extract', label: 'Extract status field', params: { jsonPath: '$.status', variable: 'invoiceStatus' } },
    { intent: 'data.extract', label: 'Extract total amount', params: { jsonPath: '$.total', variable: 'invoiceTotal' } },
  ],
};

export const INVOICE_VALIDATION_DB: BusinessFlowFixture = {
  id: 'invoice.validation.db',
  name: 'Invoice validation (DB)',
  category: 'finance',
  supportedPlatforms: ['db'],
  steps: [
    {
      intent: 'db.query',
      label: 'Fetch invoice record',
      params: { query: 'SELECT id, status, total FROM invoices WHERE id = $1', args: ['inv-test-001'] },
    },
    {
      intent: 'db.assert_rows',
      label: 'Assert exactly one invoice row',
      params: { query: 'SELECT 1 FROM invoices WHERE id = $1', expected: 1 },
    },
    {
      intent: 'data.extract',
      label: 'Extract invoice status',
      params: { query: 'SELECT status FROM invoices WHERE id = $1', column: 'status', variable: 'invoiceStatus' },
    },
  ],
};

export const ALL_BUSINESS_FLOW_FIXTURES: readonly BusinessFlowFixture[] = [
  LOGIN_WEB,
  LOGIN_API,
  LOGIN_ANDROID,
  SEARCH_WEB,
  SEARCH_API,
  CHECKOUT_WEB,
  CHECKOUT_API,
  INVOICE_VALIDATION_WEB,
  INVOICE_VALIDATION_API,
  INVOICE_VALIDATION_DB,
];

export function fixturesByCategory(
  ...categories: BusinessFlowFixture['category'][]
): BusinessFlowFixture[] {
  return ALL_BUSINESS_FLOW_FIXTURES.filter((fixture) =>
    categories.includes(fixture.category),
  );
}

export function fixturesByPlatform(
  platform: ExecutionPlatformKey,
): BusinessFlowFixture[] {
  return ALL_BUSINESS_FLOW_FIXTURES.filter((fixture) =>
    fixture.supportedPlatforms.includes(platform),
  );
}
