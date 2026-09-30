const configuredBaseUrl = import.meta.env.VITE_NEXUS_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const REQUEST_BASE_URL = configuredBaseUrl.replace(/\/$/, '').endsWith('/api')
  ? configuredBaseUrl.replace(/\/$/, '')
  : `${configuredBaseUrl.replace(/\/$/, '')}/api`;

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${REQUEST_BASE_URL}${path}`, {
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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, body: FormData) =>
    request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { ApiError };
