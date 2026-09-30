const configuredBaseUrl = import.meta.env.VITE_NEXUS_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const REQUEST_BASE_URL = configuredBaseUrl.replace(/\/$/, '').endsWith('/api')
  ? configuredBaseUrl.replace(/\/$/, '')
  : `${configuredBaseUrl.replace(/\/$/, '')}/api`;
const WEBSOCKET_URL = import.meta.env.VITE_NEXUS_WS_URL;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function normalizeApiBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function getAdvancedApiBaseUrl(): string {
  return normalizeApiBaseUrl(REQUEST_BASE_URL);
}

export function getAdvancedWebSocketUrl(): string {
  if (WEBSOCKET_URL) {
    return WEBSOCKET_URL;
  }

  const apiBaseUrl = getAdvancedApiBaseUrl();
  const runtimeBase = apiBaseUrl.endsWith('/api') ? apiBaseUrl.slice(0, -4) : apiBaseUrl;

  if (runtimeBase.startsWith('https://')) {
    return `${runtimeBase.replace('https://', 'wss://')}/ws`;
  }

  if (runtimeBase.startsWith('http://')) {
    return `${runtimeBase.replace('http://', 'ws://')}/ws`;
  }

  return 'ws://localhost:3001/ws';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${getAdvancedApiBaseUrl()}${path}`, {
    headers: isFormData ? init?.headers : { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let message = text || res.statusText;

    try {
      const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
      if (typeof parsed.detail === 'string') message = parsed.detail;
      else if (typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // Keep the raw response text for non-JSON errors.
    }

    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const advancedApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
};
