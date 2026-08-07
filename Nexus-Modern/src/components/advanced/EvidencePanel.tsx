import { useMemo, useState } from 'react';
import { artifactContentUrl, useExecutionArtifacts } from '@/lib/advanced-api/artifacts';
import type { Artifact } from '@/lib/advanced-api/types';
import type { ExecutionLiveBucket } from '@/hooks/useExecutionLiveStream';

type Tab = 'screenshots' | 'browser' | 'api' | 'variables' | 'artifacts';

interface ScreenshotView {
  id: string;
  contentId: string;
  nodeKey?: string | null;
  name: string;
  sizeBytes: number;
  createdAt: string;
  isFailure: boolean;
  isLive: boolean;
  isLiveCapture: boolean;
  metadata: Record<string, unknown>;
}

export function EvidencePanel({
  executionId,
  bucket,
}: {
  executionId: string | null;
  bucket: ExecutionLiveBucket;
}) {
  const [tab, setTab] = useState<Tab>('screenshots');
  const { data: persistedArtifacts = [] } = useExecutionArtifacts(executionId);

  const screenshots = useMemo<ScreenshotView[]>(() => {
    const persisted: ScreenshotView[] = persistedArtifacts
      .filter((artifact) => artifact.kind === 'screenshot')
      .map((artifact) => ({
        id: artifact.id,
        contentId: artifact.id,
        nodeKey: artifact.node_key,
        name: artifact.name,
        sizeBytes: artifact.size_bytes,
        createdAt: artifact.created_at,
        isFailure:
          artifact.name.toLowerCase().includes('failure') ||
          artifact.metadata?.capture_reason === 'failure' ||
          Boolean(artifact.metadata?.error),
        isLive: false,
        isLiveCapture: artifact.metadata?.capture_reason === 'live_action' || artifact.metadata?.live_preview === true,
        metadata: artifact.metadata ?? {},
      }));

    const seen = new Set(persisted.map((artifact) => artifact.contentId));
    const live: ScreenshotView[] = bucket.artifacts
      .filter((artifact) => artifact.kind === 'screenshot' && artifact.artifactId && !seen.has(artifact.artifactId))
      .map((artifact) => ({
        id: artifact.id,
        contentId: artifact.artifactId,
        nodeKey: artifact.nodeId,
        name: artifact.name,
        sizeBytes: artifact.sizeBytes,
        createdAt: artifact.timestamp,
        isFailure:
          artifact.name.toLowerCase().includes('failure') ||
          artifact.metadata?.capture_reason === 'failure' ||
          Boolean(artifact.metadata?.error),
        isLive: true,
        isLiveCapture: artifact.metadata?.capture_reason === 'live_action' || artifact.metadata?.live_preview === true,
        metadata: artifact.metadata ?? {},
      }));

    return [...live, ...persisted].sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt));
  }, [bucket.artifacts, persistedArtifacts]);

  const livePreview = screenshots.find((artifact) => artifact.isLiveCapture) ?? screenshots[0];
  const failedScreenshots = screenshots.filter((artifact) => artifact.isFailure);

  if (!executionId) {
    return <EmptyState text="Select an execution to inspect captured evidence." />;
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/8 bg-black/15">
      {livePreview ? (
        <div className="border-b border-white/8 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Live Browser</span>
            <span className="truncate font-mono text-[10px] text-slate-400">
              {String(livePreview.metadata.action ?? livePreview.nodeKey ?? livePreview.name)}
            </span>
          </div>
          <a href={artifactContentUrl(livePreview.contentId)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-white/8 bg-black">
            <img src={artifactContentUrl(livePreview.contentId)} alt={livePreview.name} className="h-52 w-full object-contain" />
          </a>
        </div>
      ) : null}

      {failedScreenshots.length > 0 ? (
        <div className="border-b border-red-300/20 bg-red-300/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-200">Failure Captures</span>
            <span className="font-mono text-[10px] text-red-200/70">{failedScreenshots.length}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {failedScreenshots.slice(0, 4).map((artifact) => (
              <a
                key={artifact.id}
                href={artifactContentUrl(artifact.contentId)}
                target="_blank"
                rel="noreferrer"
                className="relative block h-20 w-32 shrink-0 overflow-hidden rounded-2xl border border-red-300/20 bg-black/20"
              >
                <img src={artifactContentUrl(artifact.contentId)} alt={artifact.name} className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-1 text-[9px] text-white">
                  <span className="block truncate">{artifact.nodeKey ?? artifact.name}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex gap-1 border-b border-white/8 px-2 py-2">
        {(['screenshots', 'browser', 'api', 'variables', 'artifacts'] as Tab[]).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setTab(entry)}
            className={
              tab === entry
                ? 'rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100'
                : 'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-slate-200'
            }
          >
            {entry}
          </button>
        ))}
      </div>

      <div className="max-h-[32rem] overflow-y-auto p-3">
        {tab === 'screenshots' ? <ScreenshotsTab screenshots={screenshots} /> : null}
        {tab === 'browser' ? <BrowserTab bucket={bucket} /> : null}
        {tab === 'api' ? <ApiTab bucket={bucket} /> : null}
        {tab === 'variables' ? <VariablesTab bucket={bucket} /> : null}
        {tab === 'artifacts' ? <ArtifactsTab artifacts={persistedArtifacts} /> : null}
      </div>
    </div>
  );
}

function ScreenshotsTab({ screenshots }: { screenshots: ScreenshotView[] }) {
  if (screenshots.length === 0) {
    return <EmptyState text="No screenshots captured yet." />;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {screenshots.map((artifact) => (
        <a
          key={artifact.id}
          href={artifactContentUrl(artifact.contentId)}
          target="_blank"
          rel="noreferrer"
          className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035]"
        >
          <img src={artifactContentUrl(artifact.contentId)} alt={artifact.name} loading="lazy" className="w-full object-cover" />
          <div className="flex items-center justify-between gap-2 border-t border-white/8 px-3 py-2 text-[11px] text-slate-400">
            <span className="truncate">{artifact.name}</span>
            <span>{(artifact.sizeBytes / 1024).toFixed(0)} KB</span>
          </div>
        </a>
      ))}
    </div>
  );
}

function BrowserTab({ bucket }: { bucket: ExecutionLiveBucket }) {
  if (bucket.browserActions.length === 0) {
    return <EmptyState text="No browser actions streamed yet." />;
  }

  return (
    <div className="space-y-2">
      {bucket.browserActions.slice().reverse().map((action) => (
        <div key={action.id} className="rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
              {action.action}
            </span>
            <span className="truncate text-slate-200">{action.selector ?? action.url ?? '(no target)'}</span>
            <span className="ml-auto text-slate-500">{action.durationMs}ms</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">node={action.nodeId}</div>
        </div>
      ))}
    </div>
  );
}

function ApiTab({ bucket }: { bucket: ExecutionLiveBucket }) {
  if (bucket.apiCalls.length === 0) {
    return <EmptyState text="No API calls streamed yet." />;
  }

  return (
    <div className="space-y-2">
      {bucket.apiCalls.slice().reverse().map((call) => (
        <div key={call.id} className="rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200">
              {call.method}
            </span>
            <span className={call.error || (call.statusCode ?? 0) >= 400 ? 'text-red-200' : 'text-emerald-200'}>
              {call.statusCode ?? (call.error ? 'ERR' : '...')}
            </span>
            <span className="ml-auto text-slate-500">{call.durationMs}ms</span>
          </div>
          <div className="mt-1 truncate text-slate-300">{call.url}</div>
          <div className="mt-1 text-[10px] text-slate-500">
            {call.error ? call.error : `req=${call.requestSize}B · res=${call.responseSize}B · node=${call.nodeId}`}
          </div>
        </div>
      ))}
    </div>
  );
}

function VariablesTab({ bucket }: { bucket: ExecutionLiveBucket }) {
  const keys = Object.keys(bucket.context).sort();

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Shared Context</div>
        {keys.length === 0 ? (
          <EmptyState text="No shared variables yet." />
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2 font-mono text-xs">
                <span className="text-violet-200">{key}</span>
                <span className="truncate text-slate-200">{formatValue(bucket.context[key])}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Recent Updates</div>
        {bucket.variables.length === 0 ? (
          <EmptyState text="No variable updates yet." />
        ) : (
          <div className="space-y-1 font-mono text-[11px] text-slate-400">
            {bucket.variables.slice().reverse().slice(0, 20).map((update) => (
              <div key={update.id}>
                <span className="text-cyan-200">{update.nodeId ?? '?'}</span> → {Object.keys(update.variables).join(', ')}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ArtifactsTab({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) {
    return <EmptyState text="No persisted artifacts found for this execution." />;
  }

  return (
    <div className="space-y-2">
      {artifacts.map((artifact) => (
        <div key={artifact.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2 font-mono text-xs">
          <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
            {artifact.kind}
          </span>
          <span className="truncate text-slate-200">{artifact.name}</span>
          <a href={artifactContentUrl(artifact.id)} target="_blank" rel="noreferrer" className="ml-auto text-cyan-200 hover:underline">
            open
          </a>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 79)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    return json.length > 80 ? `${json.slice(0, 79)}...` : json;
  } catch {
    return '<unserializable>';
  }
}
