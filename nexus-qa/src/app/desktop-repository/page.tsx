'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Bot, CheckCircle2, Database, History,
  Monitor, RefreshCw, Save, Search, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useDeleteDesktopObject,
  useDesktopObjectHistory,
  useDesktopObjectImpact,
  useDesktopObjectLocatorProfile,
  useDesktopObjects,
  useSyncDesktopWorkflows,
  useUpdateDesktopObject,
} from '@/lib/api/pageRepository';
import type {
  DesktopObject,
  DesktopObjectHistoryItem,
  DesktopObjectImpactResponse,
  DesktopObjectLocatorProfileResponse,
} from '@/lib/api/types';

function confidence(value?: number | null) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'n/a';
}

export default function DesktopRepositoryPage() {
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [draft, setDraft] = useState<Partial<DesktopObject>>({});
  const [impact, setImpact] = useState<DesktopObjectImpactResponse | null>(null);
  const [history, setHistory] = useState<DesktopObjectHistoryItem[]>([]);
  const [profile, setProfile] = useState<DesktopObjectLocatorProfileResponse | null>(null);
  const [syncMessage, setSyncMessage] = useState('');

  const objectsQuery = useDesktopObjects({ search });
  const syncWorkflows = useSyncDesktopWorkflows();
  const updateObject = useUpdateDesktopObject();
  const deleteObject = useDeleteDesktopObject();
  const impactQuery = useDesktopObjectImpact();
  const historyQuery = useDesktopObjectHistory();
  const profileQuery = useDesktopObjectLocatorProfile();

  const objects = objectsQuery.data ?? [];
  const selected = useMemo(
    () => objects.find((item) => item.object_key === selectedKey) ?? objects[0] ?? null,
    [objects, selectedKey],
  );

  useEffect(() => {
    if (!selected) {
      setDraft({});
      return;
    }
    setDraft(selected);
  }, [selected?.object_key]);

  function selectObject(item: DesktopObject) {
    setSelectedKey(item.object_key);
    setDraft(item);
    setImpact(null);
    setHistory([]);
    setProfile(null);
  }

  function save() {
    if (!selected) return;
    updateObject.mutate({
      objectKey: selected.object_key,
      input: {
        name: draft.name,
        control_type: draft.control_type,
        automation_id: draft.automation_id,
        name_text: draft.name_text,
        class_name: draft.class_name,
        uia_path: draft.uia_path,
        locator_strategy: draft.locator_strategy,
        primary_locator: draft.primary_locator,
        window: draft.window,
        screen: draft.screen,
        process_name: draft.process_name,
        ai_label: draft.ai_label,
        ocr_text: draft.ocr_text,
      },
    });
  }

  function inspect() {
    if (!selected) return;
    impactQuery.mutate(selected.object_key, { onSuccess: setImpact });
    historyQuery.mutate(selected.object_key, { onSuccess: setHistory });
    profileQuery.mutate(selected.object_key, { onSuccess: setProfile });
  }

  function remove() {
    if (!selected) return;
    deleteObject.mutate(selected.object_key, {
      onSuccess: () => {
        setSelectedKey('');
        setDraft({});
        setImpact(null);
        setHistory([]);
        setProfile(null);
      },
    });
  }

  function syncFromWorkflows() {
    setSyncMessage('');
    syncWorkflows.mutate(
      { include_recording_sessions: true, update_existing: true },
      {
        onSuccess: (result) => {
          const firstSynced = result.objects.find((item) => item.object?.object_key)?.object?.object_key;
          if (firstSynced) setSelectedKey(firstSynced);
          setSyncMessage(`${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
        },
        onError: () => setSyncMessage('Sync failed'),
      },
    );
  }

  const input = 'w-full rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-fg-default)] outline-none focus:border-[#5b8cff]/50';
  const label = 'text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-surface-1)]">
      <div className="shrink-0 border-b border-[var(--color-line-default)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Desktop Automation</p>
            <h1 className="mt-0.5 text-xl font-semibold text-[var(--color-fg-default)]">Desktop Repository Manager</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="glass" size="sm" disabled={syncWorkflows.isPending} onClick={syncFromWorkflows}>
              <RefreshCw size={11} /> Sync Workflows
            </Button>
            <Button variant="glass" size="sm" disabled={!selected} onClick={inspect}>
              <RefreshCw size={11} /> Inspect
            </Button>
            <Button variant="glass" size="sm" disabled={!selected || updateObject.isPending} onClick={save}>
              <Save size={11} /> Save
            </Button>
            <Button variant="glass" size="sm" disabled={!selected || deleteObject.isPending} onClick={remove}>
              <Trash2 size={11} /> Delete
            </Button>
          </div>
        </div>
        {syncMessage && (
          <p className="mt-2 text-[10px] font-mono text-[var(--color-fg-subtle)]">{syncMessage}</p>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--color-line-default)]">
          <div className="border-b border-[var(--color-line-subtle)] p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-64 flex-1">
                <Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-[var(--color-fg-subtle)]" />
                <input className={`${input} pl-8`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search objects" />
              </div>
              <span className="rounded border border-[var(--color-line-default)] px-2 py-1 text-[10px] font-mono text-[var(--color-fg-subtle)]">
                {objects.length} object{objects.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {objects.length ? (
              <table className="w-full border-collapse" style={{ minWidth: 1040 }}>
                <thead>
                  <tr className="border-b border-[var(--color-line-default)] text-left">
                    {['Object', 'Application', 'Type', 'Locator', 'Window', 'Process', 'Confidence'].map((heading) => (
                      <th key={heading} className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {objects.map((item) => {
                    const active = item.object_key === selected?.object_key;
                    return (
                      <tr
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectObject(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') selectObject(item);
                        }}
                        className={[
                          'cursor-pointer border-b border-[var(--color-line-subtle)]/50 outline-none transition-colors hover:bg-white/[0.025] focus:bg-white/[0.035]',
                          active ? 'bg-[#5b8cff]/10' : '',
                        ].join(' ')}
                      >
                        <td className="max-w-72 px-3 py-2">
                          <p className="truncate text-xs font-medium text-[var(--color-fg-default)]">{item.name}</p>
                          <p className="mt-1 truncate text-[10px] font-mono text-[var(--color-fg-subtle)]">{item.object_key}</p>
                        </td>
                        <td className="max-w-64 px-3 py-2">
                          <p className="truncate text-xs text-[var(--color-fg-default)]">{item.application || 'Desktop Application'}</p>
                          <p className="mt-1 truncate text-[10px] font-mono text-[var(--color-fg-subtle)]">{item.application_path || '-'}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded border border-[var(--color-line-default)] px-2 py-1 text-[10px] font-mono text-[var(--color-fg-subtle)]">
                            {item.control_type || 'element'}
                          </span>
                        </td>
                        <td className="max-w-72 px-3 py-2">
                          <p className="truncate text-[11px] font-mono text-[#4dd1e1]">{item.locator_strategy || 'name'}</p>
                          <p className="mt-1 truncate text-[10px] font-mono text-[var(--color-fg-subtle)]">{item.primary_locator || '-'}</p>
                        </td>
                        <td className="max-w-44 px-3 py-2">
                          <p className="truncate text-xs text-[var(--color-fg-default)]">{item.window || '-'}</p>
                          <p className="mt-1 truncate text-[10px] text-[var(--color-fg-subtle)]">{item.screen || '-'}</p>
                        </td>
                        <td className="max-w-36 px-3 py-2">
                          <p className="truncate text-[10px] font-mono text-[var(--color-fg-subtle)]">{item.process_name || '-'}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded border border-[var(--color-line-default)] px-2 py-1 text-[10px] font-mono text-[var(--color-fg-default)]">
                            {confidence(item.confidence_score)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-sm text-[var(--color-fg-subtle)]">
                <div className="flex items-center">
                  <Bot size={16} className="mr-2" /> No desktop objects found.
                </div>
                <Button variant="glass" size="sm" disabled={syncWorkflows.isPending} onClick={syncFromWorkflows}>
                  <RefreshCw size={11} /> Sync Workflows
                </Button>
              </div>
            )}
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto p-5">
          {selected ? (
            <div className="grid gap-5">
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Monitor size={14} className="text-[#5b8cff]" />
                  <span className={label}>Object Definition</span>
                </div>
                <div className="grid gap-3">
                  {[
                    ['Name', 'name'],
                    ['Control Type', 'control_type'],
                    ['Automation ID', 'automation_id'],
                    ['Name/Text', 'name_text'],
                    ['Class Name', 'class_name'],
                    ['UIA Path', 'uia_path'],
                    ['Locator Strategy', 'locator_strategy'],
                    ['Primary Locator', 'primary_locator'],
                    ['Window', 'window'],
                    ['Screen', 'screen'],
                    ['Process', 'process_name'],
                    ['AI Label', 'ai_label'],
                  ].map(([title, key]) => (
                    <label key={key} className="grid gap-1.5">
                      <span className={label}>{title}</span>
                      <input
                        className={input}
                        value={String((draft as Record<string, unknown>)[key] ?? (selected as unknown as Record<string, unknown>)[key] ?? '')}
                        onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-6">
                  <div className="mb-3 flex items-center gap-2">
                    <Activity size={14} className="text-[#45c08a]" />
                    <span className={label}>Locator Profile</span>
                  </div>
                  {profile ? (
                    <div className="rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--color-fg-default)]">{Math.round(profile.stability_score * 100)} stability</span>
                        <span className={`rounded border px-2 py-0.5 text-[10px] font-mono ${profile.stale ? 'border-yellow-500/30 text-yellow-400' : 'border-emerald-500/30 text-emerald-400'}`}>
                          {profile.stale ? 'stale' : 'stable'}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">Best: {profile.best_strategy}</span>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {profile.candidates.map((candidate) => (
                          <div key={`${candidate.strategy}-${candidate.locator}`} className="rounded border border-[var(--color-line-subtle)] px-2 py-1.5">
                            <p className="truncate text-xs text-[var(--color-fg-default)]">{candidate.strategy}: {candidate.locator}</p>
                            <p className="mt-1 text-[10px] text-[var(--color-fg-subtle)]">{candidate.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-[var(--color-line-default)] p-4 text-xs text-[var(--color-fg-subtle)]">Run Inspect to load locator scoring.</div>
                  )}
                </div>
              </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-[#f0b558]" />
                    <span className={label}>Impact</span>
                  </div>
                  <div className="rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3">
                    <p className="text-2xl font-semibold text-[var(--color-fg-default)]">{impact?.impacted_step_count ?? 0}</p>
                    <p className="text-[10px] text-[var(--color-fg-subtle)]">linked test steps</p>
                    <p className="mt-2 text-[10px] text-[var(--color-fg-subtle)]">{impact?.workflow_node_count ?? 0} workflow nodes</p>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <History size={14} className="text-[#a195ff]" />
                    <span className={label}>History</span>
                  </div>
                  <div className="space-y-2">
                    {history.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={12} className="text-[#45c08a]" />
                          <span className="text-xs text-[var(--color-fg-default)]">{item.action}</span>
                        </div>
                        <p className="mt-1 text-[10px] font-mono text-[var(--color-fg-subtle)]">{item.changed_fields.join(', ') || 'snapshot'}</p>
                      </div>
                    ))}
                    {!history.length && (
                      <div className="rounded-md border border-dashed border-[var(--color-line-default)] p-4 text-xs text-[var(--color-fg-subtle)]">Run Inspect to load history.</div>
                    )}
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <Database size={14} className="text-[#f0b558]" />
                    <span className={label}>Metadata</span>
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3 text-[10px] text-[var(--color-fg-subtle)]">
                    {JSON.stringify(selected.metadata ?? {}, null, 2)}
                  </pre>
                </section>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-[var(--color-fg-subtle)]">
              <div className="flex items-center">
                <Bot size={16} className="mr-2" /> No desktop objects found.
              </div>
              <Button variant="glass" size="sm" disabled={syncWorkflows.isPending} onClick={syncFromWorkflows}>
                <RefreshCw size={11} /> Sync Workflows
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
