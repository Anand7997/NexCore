'use client';

import { useMemo, useState } from 'react';
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

  const objectsQuery = useDesktopObjects({ search });
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
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-[var(--color-line-default)]">
          <div className="border-b border-[var(--color-line-subtle)] p-3">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-[var(--color-fg-subtle)]" />
              <input className={`${input} pl-8`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search objects" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {objects.map((item) => (
              <button
                key={item.id}
                onClick={() => selectObject(item)}
                className={[
                  'mb-1.5 w-full rounded-md border px-3 py-2 text-left transition-colors',
                  item.object_key === selected?.object_key
                    ? 'border-[#5b8cff]/40 bg-[#5b8cff]/10'
                    : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)]',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-[var(--color-fg-default)]">{item.name}</span>
                  <span className="rounded border border-[var(--color-line-default)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-fg-subtle)]">{confidence(item.confidence_score)}</span>
                </div>
                <p className="mt-1 truncate text-[10px] font-mono text-[var(--color-fg-subtle)]">{item.object_key}</p>
                <p className="mt-1 truncate text-[10px] text-[var(--color-fg-subtle)]">{item.locator_strategy}: {item.primary_locator}</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-5">
          {selected ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Monitor size={14} className="text-[#5b8cff]" />
                  <span className={label}>Object Definition</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
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

              <aside className="grid gap-5">
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
              </aside>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-fg-subtle)]">
              <Bot size={16} className="mr-2" /> No desktop objects found.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
