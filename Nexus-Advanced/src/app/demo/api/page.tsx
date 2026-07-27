'use client';

import { useState } from 'react';

type RequestState = 'idle' | 'loading' | 'success' | 'error' | 'timeout';

interface ApiResponse {
  status: number;
  data: unknown;
  durationMs: number;
}

export default function DemoApiPage() {
  const [state, setState] = useState<RequestState>('idle');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [requestLog, setRequestLog] = useState<string[]>([]);

  function log(msg: string) {
    setRequestLog((prev) => [...prev, `[${new Date().toISOString()}] ${msg}`]);
  }

  async function triggerRequest(endpoint: string) {
    setState('loading');
    log(`GET ${endpoint}`);
    const start = Date.now();
    try {
      const res = await fetch(endpoint, {
        signal: AbortSignal.timeout(5000),
      });
      const durationMs = Date.now() - start;
      const data = await res.json().catch(() => null);
      log(`Response ${res.status} in ${durationMs}ms`);
      setResponse({ status: res.status, data, durationMs });
      setState(res.ok ? 'success' : 'error');
    } catch (err) {
      const durationMs = Date.now() - start;
      const isTimeout =
        err instanceof DOMException && err.name === 'TimeoutError';
      log(isTimeout ? `Timeout after ${durationMs}ms` : `Error: ${String(err)}`);
      setResponse({ status: 0, data: null, durationMs });
      setState(isTimeout ? 'timeout' : 'error');
    }
  }

  function clearLog() {
    setRequestLog([]);
    setResponse(null);
    setState('idle');
  }

  return (
    <main
      data-testid="api-main"
      className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-start p-10 gap-6"
    >
      <h1 data-testid="api-heading" className="text-2xl font-bold">
        API Fixture
      </h1>
      <p data-testid="api-description" className="text-gray-400 text-sm">
        Triggers real or mocked API calls; used by Playwright API contract tests.
      </p>

      {/* Trigger buttons */}
      <div data-testid="api-controls" className="flex flex-wrap gap-3">
        <button
          data-testid="btn-get-plugins"
          onClick={() => triggerRequest('/api/proxy/plugins')}
          className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm"
        >
          GET /plugins
        </button>
        <button
          data-testid="btn-get-workflows"
          onClick={() => triggerRequest('/api/proxy/workflows')}
          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm"
        >
          GET /workflows
        </button>
        <button
          data-testid="btn-get-executions"
          onClick={() => triggerRequest('/api/proxy/executions')}
          className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-sm"
        >
          GET /executions
        </button>
        <button
          data-testid="btn-clear"
          onClick={clearLog}
          className="px-4 py-2 rounded border border-gray-700 text-sm"
        >
          Clear
        </button>
      </div>

      {/* Status badge */}
      <div data-testid="api-status" className="text-sm font-mono">
        Status:{' '}
        <span
          data-testid="api-status-value"
          className={
            state === 'success'
              ? 'text-emerald-400'
              : state === 'error' || state === 'timeout'
              ? 'text-red-400'
              : state === 'loading'
              ? 'text-yellow-400'
              : 'text-gray-500'
          }
        >
          {state}
        </span>
      </div>

      {/* Response panel */}
      {response && (
        <div
          data-testid="api-response-panel"
          className="w-full max-w-2xl bg-gray-900 rounded-lg border border-gray-700 p-4"
        >
          <p data-testid="api-response-status" className="text-xs text-gray-400 mb-1">
            HTTP {response.status} · {response.durationMs}ms
          </p>
          <pre
            data-testid="api-response-body"
            className="text-xs text-gray-300 overflow-auto max-h-40"
          >
            {JSON.stringify(response.data, null, 2)}
          </pre>
        </div>
      )}

      {/* Request log */}
      <div
        data-testid="api-log"
        className="w-full max-w-2xl bg-gray-900 rounded-lg border border-gray-700 p-4"
      >
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Request Log</p>
        {requestLog.length === 0 ? (
          <p data-testid="api-log-empty" className="text-xs text-gray-600">
            No requests yet.
          </p>
        ) : (
          <ul data-testid="api-log-entries" className="flex flex-col gap-1">
            {requestLog.map((entry, i) => (
              <li key={i} data-testid={`api-log-entry-${i}`} className="text-xs font-mono text-gray-400">
                {entry}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
