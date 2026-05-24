'use client';
import { useMemo, useState } from 'react';
import { useExecutionStreamStore, selectBucket } from '@/lib/stores/executionStreamStore';
import { useExecutionArtifacts, artifactContentUrl } from '@/lib/api/artifacts';
import type { Artifact } from '@/lib/api/types';

type Tab = 'screenshots' | 'browser' | 'api' | 'variables' | 'artifacts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'screenshots', label: 'Screenshots' },
  { id: 'browser',     label: 'Browser' },
  { id: 'api',         label: 'API' },
  { id: 'variables',   label: 'Variables' },
  { id: 'artifacts',   label: 'All Artifacts' },
];

interface Props {
  executionId: string | null;
}

interface ScreenshotView {
  id: string;
  contentId: string;
  node_key?: string | null;
  name: string;
  size_bytes: number;
  created_at: string;
  isFailure: boolean;
  isLive: boolean;
}

/**
 * Live execution-evidence panel.
 *
 * Combines two data sources:
 *  - WebSocket stream → buckets in executionStreamStore (drives instant UI)
 *  - REST artifact list → useExecutionArtifacts (reconciles on reconnect)
 *
 * Both are kept in sync; the WS-derived list is the authoritative live view,
 * the REST list backfills history when the panel is opened mid-execution.
 */
export function EvidencePanel({ executionId }: Props) {
  const [tab, setTab] = useState<Tab>('screenshots');

  const bucket = useExecutionStreamStore(selectBucket(executionId));
  const { data: persistedArtifacts = [] } = useExecutionArtifacts(executionId);

  const screenshotArtifacts = useMemo<ScreenshotView[]>(() => {
    const persisted: ScreenshotView[] = persistedArtifacts
      .filter((a) => a.kind === 'screenshot')
      .map((a) => ({
        id: a.id,
        contentId: a.id,
        node_key: a.node_key,
        name: a.name,
        size_bytes: a.size_bytes,
        created_at: a.created_at,
        isFailure: a.name.toLowerCase().includes('failure') || Boolean(a.metadata?.error),
        isLive: false,
      }));

    const seen = new Set(persisted.map((a) => a.contentId));
    const live: ScreenshotView[] = bucket.artifacts
      .filter((a) => a.kind === 'screenshot' && a.artifactId && !seen.has(a.artifactId))
      .map((a) => ({
        id: a.id,
        contentId: a.artifactId,
        node_key: a.nodeId,
        name: a.name,
        size_bytes: a.sizeBytes,
        created_at: a.timestamp,
        isFailure: a.name.toLowerCase().includes('failure') || Boolean(a.metadata?.error),
        isLive: true,
      }));

    return [...live, ...persisted].sort((a, b) => {
      if (a.isFailure !== b.isFailure) return a.isFailure ? -1 : 1;
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
  }, [bucket.artifacts, persistedArtifacts]);

  const failedScreenshots = screenshotArtifacts.filter((a) => a.isFailure);

  if (!executionId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-fg-muted">
        Select an execution to see live evidence.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {failedScreenshots.length > 0 && (
        <div className="shrink-0 border-b border-red-500/15 bg-red-500/8 px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-red-300">
              Failed Screenshots
            </span>
            <span className="font-mono text-[10px] text-red-300/70">{failedScreenshots.length}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {failedScreenshots.slice(0, 4).map((a) => (
              <a
                key={a.id}
                href={artifactContentUrl(a.contentId)}
                target="_blank"
                rel="noreferrer"
                className="group relative block h-20 w-32 shrink-0 overflow-hidden rounded-md border border-red-500/30 bg-surface-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artifactContentUrl(a.contentId)} alt={a.name} className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-1 text-[9px] text-white">
                  <span className="block truncate">{a.node_key ?? a.name}</span>
                </div>
                {a.isLive && (
                  <span className="absolute right-1 top-1 rounded bg-red-500 px-1 text-[8px] font-bold text-white">
                    LIVE
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
      {/* Tab strip */}
      <div className="flex shrink-0 gap-1 border-b border-border-subtle bg-surface-1/40 px-2 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'rounded-md px-2.5 py-1 text-xs font-medium transition',
              tab === t.id
                ? 'bg-surface-2 text-fg-default shadow-sm'
                : 'text-fg-muted hover:text-fg-default',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'screenshots' && (
          <ScreenshotsTab artifacts={screenshotArtifacts} />
        )}
        {tab === 'browser' && (
          <BrowserActionsTab actions={bucket.browserActions} />
        )}
        {tab === 'api' && (
          <ApiCallsTab calls={bucket.apiCalls} />
        )}
        {tab === 'variables' && (
          <VariablesTab context={bucket.context} updates={bucket.variables} />
        )}
        {tab === 'artifacts' && (
          <ArtifactsTab artifacts={persistedArtifacts} />
        )}
      </div>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────

function ScreenshotsTab({ artifacts }: { artifacts: ScreenshotView[] }) {
  if (artifacts.length === 0) {
    return <Empty>No screenshots yet — they appear as web nodes execute.</Empty>;
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {artifacts.map((a) => (
        <a
          key={a.id}
          href={artifactContentUrl(a.contentId)}
          target="_blank"
          rel="noreferrer"
          className="group relative overflow-hidden rounded-md border border-border-subtle bg-surface-1 transition hover:border-accent-blue"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artifactContentUrl(a.contentId)}
            alt={a.name}
            loading="lazy"
            className="block w-full object-cover"
          />
          <div className="flex items-center justify-between border-t border-border-subtle px-2 py-1 text-[11px] text-fg-muted">
            <span className="truncate">{a.name}</span>
            <span>{(a.size_bytes / 1024).toFixed(0)} KB</span>
          </div>
          {a.isFailure ? (
            <div className="absolute right-1.5 top-1.5 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              failed
            </div>
          ) : a.isLive ? (
            <div className="absolute right-1.5 top-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              live
            </div>
          ) : null}
          {a.node_key ? (
            <div className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {a.node_key}
            </div>
          ) : null}
        </a>
      ))}
    </div>
  );
}

function BrowserActionsTab({
  actions,
}: {
  actions: ReturnType<typeof useExecutionStreamStore.getState>['buckets'][string]['browserActions'];
}) {
  if (actions.length === 0) {
    return <Empty>No browser actions yet.</Empty>;
  }
  return (
    <ul className="space-y-1.5 font-mono text-xs">
      {actions.slice().reverse().map((a) => (
        <li
          key={a.id}
          className="rounded border border-border-subtle bg-surface-1 px-2.5 py-1.5"
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-accent-blue/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-blue">
              {a.action}
            </span>
            <span className="truncate text-fg-default">
              {a.selector ?? a.url ?? '(no target)'}
            </span>
            <span className="ml-auto text-[10px] text-fg-muted">
              {a.durationMs}ms
            </span>
          </div>
          <div className="mt-0.5 text-[10px] text-fg-muted">
            node={a.nodeId} · {new Date(a.timestamp).toLocaleTimeString()}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ApiCallsTab({
  calls,
}: {
  calls: ReturnType<typeof useExecutionStreamStore.getState>['buckets'][string]['apiCalls'];
}) {
  if (calls.length === 0) {
    return <Empty>No API calls yet.</Empty>;
  }
  return (
    <ul className="space-y-1.5 font-mono text-xs">
      {calls.slice().reverse().map((c) => {
        const okColor =
          c.error ? 'text-status-error'
          : c.statusCode && c.statusCode >= 400 ? 'text-status-warn'
          : 'text-status-success';
        return (
          <li
            key={c.id}
            className="rounded border border-border-subtle bg-surface-1 px-2.5 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold">
                {c.method}
              </span>
              <span className={['font-semibold', okColor].join(' ')}>
                {c.statusCode ?? (c.error ? 'ERR' : '...')}
              </span>
              <span className="ml-auto text-[10px] text-fg-muted">{c.durationMs}ms</span>
            </div>
            <div className="mt-0.5 truncate text-fg-default">{c.url}</div>
            {c.error ? (
              <div className="mt-0.5 text-[10px] text-status-error">{c.error}</div>
            ) : (
              <div className="mt-0.5 text-[10px] text-fg-muted">
                req={c.requestSize}B · res={c.responseSize}B · node={c.nodeId}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function VariablesTab({
  context,
  updates,
}: {
  context: Record<string, unknown>;
  updates: ReturnType<typeof useExecutionStreamStore.getState>['buckets'][string]['variables'];
}) {
  const keys = Object.keys(context).sort();
  return (
    <div className="space-y-3">
      <section>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          Shared context ({keys.length})
        </h3>
        {keys.length === 0 ? (
          <Empty>No shared variables yet — they appear as nodes set them.</Empty>
        ) : (
          <ul className="space-y-1 font-mono text-xs">
            {keys.map((k) => (
              <li
                key={k}
                className="flex items-start gap-2 rounded border border-border-subtle bg-surface-1 px-2.5 py-1.5"
              >
                <code className="shrink-0 text-accent-purple">{k}</code>
                <code className="truncate text-fg-default">
                  {formatValue(context[k])}
                </code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          Recent updates
        </h3>
        {updates.length === 0 ? (
          <Empty>No variable updates yet.</Empty>
        ) : (
          <ul className="space-y-1 font-mono text-[11px]">
            {updates.slice().reverse().slice(0, 20).map((u) => (
              <li key={u.id} className="text-fg-muted">
                <span className="text-accent-blue">{u.nodeId ?? '?'}</span>
                {' → '}
                {Object.keys(u.variables).join(', ')}
                <span className="ml-2 text-[10px]">
                  {new Date(u.timestamp).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ArtifactsTab({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) {
    return <Empty>No artifacts yet.</Empty>;
  }
  return (
    <ul className="space-y-1.5 font-mono text-xs">
      {artifacts.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-2 rounded border border-border-subtle bg-surface-1 px-2.5 py-1.5"
        >
          <span className="rounded bg-accent-blue/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-blue">
            {a.kind}
          </span>
          <span className="truncate text-fg-default">{a.name}</span>
          {a.node_key ? (
            <span className="text-[10px] text-fg-muted">[{a.node_key}]</span>
          ) : null}
          <a
            href={artifactContentUrl(a.id)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-[10px] text-accent-blue hover:underline"
          >
            open ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-border-subtle py-8 text-center text-xs text-fg-muted">
      {children}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value.length > 80 ? value.slice(0, 79) + '…' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    return json.length > 80 ? json.slice(0, 79) + '…' : json;
  } catch {
    return '<unserializable>';
  }
}
