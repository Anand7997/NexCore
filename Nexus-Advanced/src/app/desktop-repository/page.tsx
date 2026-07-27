'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight, CopyPlus, FileText, Layers3, ListChecks, Monitor, Search,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import {
  useDeleteDesktopRepositoryCase,
  useDesktopRepositoryCases,
} from '@/lib/api/desktopRepository';
import type { DesktopRepositoryCase, DesktopRepositoryStep } from '@/lib/api/types';

function actionColor(action: string) {
  const normalized = action.toUpperCase();
  if (normalized.includes('CLICK')) return '#5b8cff';
  if (normalized.includes('TYPE') || normalized.includes('SELECT')) return '#45c08a';
  if (normalized.includes('ASSERT') || normalized.includes('VERIFY')) return '#f0b558';
  if (normalized.includes('LAUNCH') || normalized.includes('ATTACH')) return '#a195ff';
  return '#8b8c97';
}

function objectLabel(step: DesktopRepositoryStep) {
  const desktop = step.bindings?.desktop ?? {};
  return (
    String(desktop.object_name || desktop.element_name || step.target || step.test_data?.element_name || '')
      .trim() || 'Desktop object'
  );
}

function screenLabel(step: DesktopRepositoryStep) {
  const desktop = step.bindings?.desktop ?? {};
  return (
    String(desktop.screen || desktop.window || desktop.page || step.test_data?.screen || step.test_data?.page_name || '')
      .trim() || 'Desktop screen'
  );
}

function locatorLabel(step: DesktopRepositoryStep) {
  const desktop = step.bindings?.desktop ?? {};
  return (
    String(
      desktop.automation_id ||
      desktop.selector ||
      desktop.uia_path ||
      step.test_data?.automation_id ||
      step.test_data?.path_location ||
      '',
    ).trim() || '-'
  );
}

function CaseSummary({ item, active, onClick }: {
  item: DesktopRepositoryCase;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-nexcore-desktop-repository-case', item.id);
        event.dataTransfer.setData('text/plain', item.name);
      }}
      onClick={onClick}
      className={[
        'w-full cursor-pointer rounded-lg border px-4 py-3 text-left transition-colors',
        active
          ? 'border-[#5b8cff]/45 bg-[#5b8cff]/10'
          : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] hover:bg-white/[0.025]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--color-fg-default)]">{item.name}</p>
          <p className="mt-1 line-clamp-2 text-xs text-[var(--color-fg-subtle)]">{item.description || 'Reusable desktop testcase'}</p>
        </div>
        <span className="shrink-0 rounded border border-[#45c08a]/30 bg-[#45c08a]/10 px-2 py-1 text-[10px] font-mono text-[#45c08a]">
          {item.step_count} steps
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {[item.priority, item.test_type, ...item.platforms.slice(0, 2)].filter(Boolean).map((tag) => (
          <span key={tag} className="rounded border border-[var(--color-line-default)] px-2 py-0.5 text-[10px] font-mono text-[var(--color-fg-subtle)]">
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}

export default function DesktopRepositoryPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const casesQuery = useDesktopRepositoryCases({ search });
  const deleteCase = useDeleteDesktopRepositoryCase();

  const cases = useMemo(() => casesQuery.data ?? [], [casesQuery.data]);
  const selected = useMemo(
    () => cases.find((item) => item.id === selectedId) ?? cases[0] ?? null,
    [cases, selectedId],
  );

  function remove(item: DesktopRepositoryCase) {
    if (!window.confirm(`Delete reusable testcase "${item.name}"?`)) return;
    deleteCase.mutate(item.id, {
      onSuccess: () => {
        if (selectedId === item.id) setSelectedId('');
      },
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-surface-1)]">
      <div className="shrink-0 border-b border-[var(--color-line-default)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Reusable Desktop Flows</p>
            <h1 className="mt-0.5 text-xl font-semibold text-[var(--color-fg-default)]">Desktop Repository</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/test-configuration">
              <Button variant="glass" size="sm">
                <CopyPlus size={12} /> Save From Test Config
              </Button>
            </Link>
            <Link href="/test-configuration">
              <Button variant="neon" size="sm">
                <ArrowRight size={12} /> Insert Into Testcase
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-[var(--color-line-default)]">
          <div className="border-b border-[var(--color-line-subtle)] p-3">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-[var(--color-fg-subtle)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 pl-8 text-xs text-[var(--color-fg-default)] outline-none focus:border-[#5b8cff]/50"
                placeholder="Search reusable testcases"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {cases.map((item) => (
              <CaseSummary
                key={item.id}
                item={item}
                active={selected?.id === item.id}
                onClick={() => setSelectedId(item.id)}
              />
            ))}
            {!cases.length && (
              <div className="rounded-lg border border-dashed border-[var(--color-line-default)] px-4 py-10 text-center">
                <Monitor size={18} className="mx-auto text-[var(--color-fg-subtle)]" />
                <p className="mt-3 text-sm text-[var(--color-fg-default)]">No reusable desktop testcases yet</p>
                <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">Open Test Config and save a desktop testcase to this repository.</p>
              </div>
            )}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto">
          {selected ? (
            <div className="mx-auto max-w-5xl p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-[#5b8cff]" />
                    <h2 className="text-lg font-semibold text-[var(--color-fg-default)]">{selected.name}</h2>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm text-[var(--color-fg-subtle)]">{selected.description || 'Reusable desktop testcase'}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[...selected.tags, ...selected.platforms].slice(0, 8).map((tag) => (
                      <span key={tag} className="rounded border border-[var(--color-line-default)] px-2 py-0.5 text-[10px] font-mono text-[var(--color-fg-subtle)]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <Button variant="glass" size="sm" disabled={deleteCase.isPending} onClick={() => remove(selected)}>
                  <Trash2 size={12} /> Delete
                </Button>
              </div>

              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-4">
                  <div className="flex items-center gap-2">
                    <ListChecks size={14} className="text-[#45c08a]" />
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Steps</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-[var(--color-fg-default)]">{selected.step_count}</p>
                </div>
                <div className="rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-4">
                  <div className="flex items-center gap-2">
                    <Layers3 size={14} className="text-[#a195ff]" />
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Type</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-[var(--color-fg-default)]">{selected.test_type}</p>
                </div>
                <div className="rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-4">
                  <div className="flex items-center gap-2">
                    <Monitor size={14} className="text-[#4dd1e1]" />
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Source</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-[var(--color-fg-default)]">
                    {String(selected.metadata.source_test_case_name || selected.source_test_case_id || 'Saved testcase')}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-[var(--color-line-default)]">
                <table className="w-full border-collapse" style={{ minWidth: 980 }}>
                  <thead>
                    <tr className="border-b border-[var(--color-line-default)] bg-[var(--color-surface-2)] text-left">
                      {['#', 'Action', 'Screen', 'Object', 'Locator', 'Value'].map((heading) => (
                        <th key={heading} className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.steps.map((step) => {
                      const color = actionColor(step.action_type || step.intent);
                      return (
                        <tr key={step.id} className="border-b border-[var(--color-line-subtle)]/60 last:border-b-0">
                          <td className="px-3 py-2 text-[10px] font-mono text-[var(--color-fg-subtle)]">{step.step_order}</td>
                          <td className="px-3 py-2">
                            <span className="rounded border px-2 py-1 text-[10px] font-mono" style={{ color, borderColor: `${color}45`, background: `${color}12` }}>
                              {step.action_type || step.intent || 'CLICK'}
                            </span>
                          </td>
                          <td className="max-w-56 px-3 py-2 text-xs text-[var(--color-fg-default)]">
                            <span className="block truncate">{screenLabel(step)}</span>
                          </td>
                          <td className="max-w-56 px-3 py-2 text-xs text-[var(--color-fg-default)]">
                            <span className="block truncate">{objectLabel(step)}</span>
                          </td>
                          <td className="max-w-72 px-3 py-2">
                            <span className="block truncate font-mono text-[10px] text-[#4dd1e1]">{locatorLabel(step)}</span>
                          </td>
                          <td className="max-w-48 px-3 py-2">
                            <span className="block truncate text-xs text-[var(--color-fg-subtle)]">{step.input_value || String(step.test_data?.value || '') || '-'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-96 items-center justify-center text-sm text-[var(--color-fg-subtle)]">
              Select a reusable testcase to inspect its steps.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
