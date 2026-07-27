'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  Database,
  FileSpreadsheet,
  FolderOpen,
  GitMerge,
  History,
  ShieldCheck,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useDesktopObjectHealingSuggestions,
  useDesktopObjectHistory,
  useDesktopObjectImpact,
  useDesktopObjectLocatorProfile,
  useResolveDesktopObjectHealingSuggestion,
} from '@/lib/api/pageRepository';
import {
  useMasterSheetTemplate,
  usePreviewMasterSheet,
  useSyncMasterSheetDesktopRepository,
  useUploadMasterSheet,
} from '@/lib/api/masterSheets';
import type {
  DesktopObjectHealingSuggestion,
  DesktopObjectHistoryItem,
  DesktopObjectImpactResponse,
  DesktopObjectLocatorProfileResponse,
  MasterSheetPreviewResponse,
  MasterSheetRepositorySyncResponse,
} from '@/lib/api/types';

const SECTIONS = ['applications', 'windows', 'elements', 'paths', 'test_data', 'environments', 'locators'];

function rowsForSection(result: MasterSheetPreviewResponse | null, section: string) {
  const value = result?.normalized?.[section];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, Record<string, unknown>>).map(([key, item]) => ({
    key,
    item: item && typeof item === 'object' ? item : { value: item },
  }));
}

function previewColumns(rows: ReturnType<typeof rowsForSection>) {
  const preferred = ['key', 'name', 'application_path', 'automation_id', 'locator_strategy', 'primary_locator_value', 'path', 'value', 'control_type'];
  const seen = new Set<string>();
  for (const column of preferred) {
    if (rows.some((row) => row.item[column] !== undefined)) seen.add(column);
  }
  for (const row of rows.slice(0, 8)) {
    Object.keys(row.item).forEach((column) => {
      if (seen.size < 8) seen.add(column);
    });
  }
  return [...seen];
}

function stringifyCell(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function MasterSheetPage() {
  const template = useMasterSheetTemplate();
  const preview = usePreviewMasterSheet();
  const upload = useUploadMasterSheet();
  const syncRepository = useSyncMasterSheetDesktopRepository();
  const impactAnalysis = useDesktopObjectImpact();
  const historyQuery = useDesktopObjectHistory();
  const locatorProfileQuery = useDesktopObjectLocatorProfile();
  const healingSuggestionQuery = useDesktopObjectHealingSuggestions();
  const resolveHealingSuggestion = useResolveDesktopObjectHealingSuggestion();
  const [jsonText, setJsonText] = useState('');
  const [pathText, setPathText] = useState('');
  const [result, setResult] = useState<MasterSheetPreviewResponse | null>(null);
  const [syncResult, setSyncResult] = useState<MasterSheetRepositorySyncResponse | null>(null);
  const [impactResult, setImpactResult] = useState<DesktopObjectImpactResponse | null>(null);
  const [historyResult, setHistoryResult] = useState<DesktopObjectHistoryItem[] | null>(null);
  const [locatorProfile, setLocatorProfile] = useState<DesktopObjectLocatorProfileResponse | null>(null);
  const [healingSuggestions, setHealingSuggestions] = useState<DesktopObjectHealingSuggestion[] | null>(null);
  const [selectedSection, setSelectedSection] = useState('applications');
  const [error, setError] = useState('');

  const sectionRows = useMemo(() => rowsForSection(result, selectedSection), [result, selectedSection]);
  const columns = useMemo(() => previewColumns(sectionRows), [sectionRows]);
  const issueCounts = useMemo(() => {
    const issues = result?.issues ?? [];
    return {
      errors: issues.filter((issue) => issue.severity === 'error').length,
      warnings: issues.filter((issue) => issue.severity === 'warning').length,
    };
  }, [result]);
  const variablesSnippet = result?.saved_path
    ? JSON.stringify({ master_sheet_path: result.saved_path }, null, 2)
    : result
      ? JSON.stringify({ master_sheet: result.normalized }, null, 2)
      : '';

  function loadTemplate() {
    if (!template.data?.template) return;
    setJsonText(JSON.stringify(template.data.template, null, 2));
    setError('');
  }

  function previewJson() {
    try {
      const parsed = JSON.parse(jsonText || '{}');
      preview.mutate(
        { master_sheet: parsed },
        {
          onSuccess: (data) => {
            setResult(data);
            setSyncResult(null);
            setImpactResult(null);
            setHistoryResult(null);
            setLocatorProfile(null);
            setHealingSuggestions(null);
            setSelectedSection('applications');
            setError('');
          },
          onError: (err) => setError(err instanceof Error ? err.message : 'Preview failed'),
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  }

  function previewPath() {
    if (!pathText.trim()) return;
    preview.mutate(
      { master_sheet_path: pathText.trim() },
      {
        onSuccess: (data) => {
          setResult(data);
          setSyncResult(null);
          setImpactResult(null);
          setHistoryResult(null);
          setLocatorProfile(null);
          setHealingSuggestions(null);
          setSelectedSection('applications');
          setError('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Preview failed'),
      },
    );
  }

  function uploadFile(file: File | null) {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: (data) => {
        setResult(data);
        setSyncResult(null);
        setImpactResult(null);
        setHistoryResult(null);
        setLocatorProfile(null);
        setHealingSuggestions(null);
        setPathText(data.saved_path);
        setSelectedSection('applications');
        setError('');
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Upload failed'),
    });
  }

  function copySnippet() {
    if (variablesSnippet) navigator.clipboard?.writeText(variablesSnippet);
  }

  function syncToRepository() {
    if (!result) return;
    const payload = result.saved_path
      ? { master_sheet_path: result.saved_path }
      : { master_sheet: result.normalized };
    syncRepository.mutate(
      {
        ...payload,
        repository_scope: 'shared',
        update_existing: true,
        skip_invalid: true,
      },
      {
        onSuccess: (data) => {
          setSyncResult(data);
          setImpactResult(null);
          setHistoryResult(null);
          setLocatorProfile(null);
          setHealingSuggestions(null);
          setError('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Repository sync failed'),
      },
    );
  }

  function analyzeImpact(objectKey: string) {
    impactAnalysis.mutate(objectKey, {
      onSuccess: (data) => {
        setImpactResult(data);
        setHistoryResult(null);
        setLocatorProfile(null);
        setHealingSuggestions(null);
        setError('');
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Impact analysis failed'),
    });
  }

  function loadHistory(objectKey: string) {
    historyQuery.mutate(objectKey, {
      onSuccess: (data) => {
        setHistoryResult(data);
        setImpactResult(null);
        setLocatorProfile(null);
        setHealingSuggestions(null);
        setError('');
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'History lookup failed'),
    });
  }

  function loadLocatorProfile(objectKey: string) {
    locatorProfileQuery.mutate(objectKey, {
      onSuccess: (data) => {
        setLocatorProfile(data);
        setImpactResult(null);
        setHistoryResult(null);
        setHealingSuggestions(null);
        setError('');
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Locator profile lookup failed'),
    });
  }

  function loadHealingSuggestions(objectKey: string) {
    healingSuggestionQuery.mutate(objectKey, {
      onSuccess: (data) => {
        setHealingSuggestions(data);
        setImpactResult(null);
        setHistoryResult(null);
        setLocatorProfile(null);
        setError('');
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Healing suggestion lookup failed'),
    });
  }

  function resolveSuggestion(suggestionId: string, approved: boolean) {
    resolveHealingSuggestion.mutate(
      {
        suggestionId,
        input: {
          approved,
          actor: 'master-sheet-ui',
          note: approved ? 'Approved from master sheet repository review' : 'Rejected from master sheet repository review',
        },
      },
      {
        onSuccess: (updated) => {
          setHealingSuggestions((items) =>
            (items ?? []).map((item) => (item.id === updated.id ? updated : item)),
          );
          setError('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Healing suggestion update failed'),
      },
    );
  }

  const input = 'rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-fg-default)] outline-none focus:border-[#5b8cff]/50 placeholder:text-[var(--color-fg-subtle)]/50';
  const label = 'text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-surface-1)]">
      <div className="shrink-0 border-b border-[var(--color-line-default)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Desktop Data</p>
            <h1 className="mt-0.5 text-xl font-semibold text-[var(--color-fg-default)]">Master Sheet</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="glass" size="sm" onClick={loadTemplate} disabled={!template.data}>
              <FileSpreadsheet size={12} /> Template
            </Button>
            <Button variant="neon" size="sm" onClick={previewJson} disabled={preview.isPending || !jsonText.trim()}>
              <CheckCircle2 size={12} /> Validate JSON
            </Button>
            <Button variant="glass" size="sm" onClick={syncToRepository} disabled={!result || syncRepository.isPending}>
              <GitMerge size={12} /> Sync Repository
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] overflow-hidden">
        <aside className="min-h-0 overflow-y-auto border-r border-[var(--color-line-default)] p-4">
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <Upload size={14} className="text-[#5b8cff]" />
              <span className={label}>Upload Sheet</span>
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-2)] px-3 py-6 text-xs text-[var(--color-fg-muted)] transition-colors hover:border-[#5b8cff]/50 hover:text-[var(--color-fg-default)]">
              <Upload size={14} />
              JSON, CSV, XLSX, or XLSM
              <input
                type="file"
                accept=".json,.csv,.xlsx,.xlsm"
                className="hidden"
                onChange={(event) => uploadFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <FolderOpen size={14} className="text-[#45c08a]" />
              <span className={label}>Server Path</span>
            </div>
            <div className="grid gap-2">
              <input className={input} value={pathText} onChange={(event) => setPathText(event.target.value)} placeholder="C:\Data\desktop-master.xlsx" />
              <Button variant="glass" size="sm" onClick={previewPath} disabled={preview.isPending || !pathText.trim()}>
                <CheckCircle2 size={11} /> Validate Path
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <Database size={14} className="text-[#a195ff]" />
              <span className={label}>Inline JSON</span>
            </div>
            <textarea
              className={`${input} h-80 w-full resize-none font-mono leading-5`}
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              placeholder="Paste master_sheet JSON here"
            />
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {SECTIONS.slice(0, 6).map((section) => (
              <button
                key={section}
                onClick={() => setSelectedSection(section)}
                className={[
                  'rounded-md border px-3 py-3 text-left transition-colors',
                  selectedSection === section
                    ? 'border-[#5b8cff]/50 bg-[#5b8cff]/10'
                    : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)]',
                ].join(' ')}
              >
                <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">{section.replace('_', ' ')}</p>
                <p className="mt-1 text-xl font-semibold text-[var(--color-fg-default)]">{result?.summary?.[section] ?? 0}</p>
              </button>
            ))}
          </div>

          {result && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] ${result.valid ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
                {result.valid ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                {result.valid ? 'valid' : 'needs fixes'}
              </span>
              <span className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-red-300">{issueCounts.errors} errors</span>
              <span className="rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-yellow-300">{issueCounts.warnings} warnings</span>
              <span className="truncate text-xs text-[var(--color-fg-subtle)]">{result.filename || result.source}</span>
            </div>
          )}

          {syncResult && (
            <div className="mb-5 rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3">
              <div className="mb-3 flex items-center gap-2">
                <GitMerge size={14} className="text-[#45c08a]" />
                <span className={label}>Repository Sync</span>
              </div>
              <div className="mb-3 grid grid-cols-4 gap-2">
                {[
                  ['Created', syncResult.created, 'text-emerald-300'],
                  ['Updated', syncResult.updated, 'text-cyan-300'],
                  ['Skipped', syncResult.skipped, 'text-yellow-300'],
                  ['Pages', syncResult.pages_created, 'text-[#a195ff]'],
                ].map(([name, value, color]) => (
                  <div key={name} className="rounded-md border border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] px-3 py-2">
                    <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">{name}</p>
                    <p className={`mt-1 text-lg font-semibold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-44 overflow-auto rounded-md border border-[var(--color-line-subtle)]">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {syncResult.objects.map((item) => (
                      <tr key={`${item.object_key}-${item.action}`} className="border-b border-[var(--color-line-subtle)]/50 last:border-b-0">
                        <td className="px-2 py-2 font-mono text-[10px] text-[var(--color-fg-default)]">{item.object_key}</td>
                        <td className="px-2 py-2 text-[var(--color-fg-muted)]">{item.name}</td>
                        <td className="px-2 py-2 text-[var(--color-fg-subtle)]">{item.application}</td>
                        <td className="px-2 py-2">
                          <span className={[
                            'rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase',
                            item.action === 'created'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : item.action === 'updated'
                                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                                : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
                          ].join(' ')}>
                            {item.action}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-[var(--color-fg-subtle)]">{item.reason}</td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              className="inline-flex h-7 items-center gap-1 rounded border border-[var(--color-line-default)] px-2 text-[10px] font-mono text-[var(--color-fg-muted)] hover:border-[#5b8cff]/50 hover:text-[var(--color-fg-default)]"
                              disabled={item.action === 'skipped' || impactAnalysis.isPending}
                              onClick={() => analyzeImpact(item.object_key)}
                            >
                              <Search size={10} /> Impact
                            </button>
                            <button
                              className="inline-flex h-7 items-center gap-1 rounded border border-[var(--color-line-default)] px-2 text-[10px] font-mono text-[var(--color-fg-muted)] hover:border-[#45c08a]/50 hover:text-[var(--color-fg-default)]"
                              disabled={item.action === 'skipped' || historyQuery.isPending}
                              onClick={() => loadHistory(item.object_key)}
                            >
                              <History size={10} /> History
                            </button>
                            <button
                              className="inline-flex h-7 items-center gap-1 rounded border border-[var(--color-line-default)] px-2 text-[10px] font-mono text-[var(--color-fg-muted)] hover:border-[#a195ff]/50 hover:text-[var(--color-fg-default)]"
                              disabled={item.action === 'skipped' || locatorProfileQuery.isPending}
                              onClick={() => loadLocatorProfile(item.object_key)}
                            >
                              <ShieldCheck size={10} /> Profile
                            </button>
                            <button
                              className="inline-flex h-7 items-center gap-1 rounded border border-[var(--color-line-default)] px-2 text-[10px] font-mono text-[var(--color-fg-muted)] hover:border-[#f5c451]/50 hover:text-[var(--color-fg-default)]"
                              disabled={item.action === 'skipped' || healingSuggestionQuery.isPending}
                              onClick={() => loadHealingSuggestions(item.object_key)}
                            >
                              <Sparkles size={10} /> Healing
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {locatorProfile && (
            <div className="mb-5 rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={14} className={locatorProfile.stale ? 'text-yellow-300' : 'text-emerald-300'} />
                  <span className={label}>Locator Profile</span>
                </div>
                <span className={`rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] ${locatorProfile.stale ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                  {Math.round(locatorProfile.stability_score * 100)}% {locatorProfile.stale ? 'stale risk' : 'stable'}
                </span>
              </div>
              <div className="mb-3 grid grid-cols-4 gap-2">
                {[
                  ['Best', locatorProfile.best_strategy || '-', 'text-[#5b8cff]'],
                  ['Changes', locatorProfile.locator_change_count, 'text-yellow-300'],
                  ['History', locatorProfile.history_count, 'text-[#a195ff]'],
                  ['Candidates', locatorProfile.candidates.length, 'text-emerald-300'],
                ].map(([name, value, color]) => (
                  <div key={name} className="rounded-md border border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] px-3 py-2">
                    <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">{name}</p>
                    <p className={`mt-1 truncate text-sm font-semibold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              {(locatorProfile.stale_reasons.length > 0 || locatorProfile.suggestions.length > 0) && (
                <div className="mb-3 grid gap-2 lg:grid-cols-2">
                  <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3">
                    <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.12em] text-yellow-300">Signals</p>
                    <ul className="space-y-1 text-xs text-[var(--color-fg-subtle)]">
                      {(locatorProfile.stale_reasons.length ? locatorProfile.stale_reasons : ['No stale signals detected']).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.12em] text-emerald-300">Suggestions</p>
                    <ul className="space-y-1 text-xs text-[var(--color-fg-subtle)]">
                      {(locatorProfile.suggestions.length ? locatorProfile.suggestions : ['No locator improvements needed']).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </div>
              )}
              <div className="max-h-48 overflow-auto rounded-md border border-[var(--color-line-subtle)]">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {locatorProfile.candidates.map((candidate) => (
                      <tr key={`${candidate.strategy}-${candidate.locator}`} className="border-b border-[var(--color-line-subtle)]/50 last:border-b-0">
                        <td className="px-2 py-2 font-mono text-[10px] text-[var(--color-fg-default)]">{candidate.strategy}</td>
                        <td className="max-w-[280px] truncate px-2 py-2 font-mono text-[10px] text-[var(--color-fg-subtle)]">{candidate.locator}</td>
                        <td className="px-2 py-2">
                          <span className={[
                            'rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase',
                            candidate.strength === 'strong'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : candidate.strength === 'moderate'
                                ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                                : 'border-red-500/30 bg-red-500/10 text-red-300',
                          ].join(' ')}>
                            {candidate.strength}
                          </span>
                        </td>
                        <td className="px-2 py-2 font-mono text-[10px] text-[var(--color-fg-subtle)]">{Math.round(candidate.score * 100)}%</td>
                        <td className="px-2 py-2 text-[10px] text-[var(--color-fg-subtle)]">{candidate.risk_flags.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {healingSuggestions && (
            <div className="mb-5 rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[#f5c451]" />
                  <span className={label}>Healing Suggestions</span>
                </div>
                <span className="text-xs text-[var(--color-fg-subtle)]">
                  {healingSuggestions.filter((item) => item.status === 'pending').length} pending
                </span>
              </div>
              <div className="max-h-64 overflow-auto rounded-md border border-[var(--color-line-subtle)]">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {healingSuggestions.length === 0 ? (
                      <tr>
                        <td className="px-3 py-5 text-center text-[var(--color-fg-subtle)]">No healing suggestions found</td>
                      </tr>
                    ) : (
                      healingSuggestions.map((suggestion) => {
                        const pending = suggestion.status === 'pending';
                        const previewValue = stringifyCell(suggestion.preview_update?.[suggestion.suggested_field] ?? suggestion.suggested_locator);
                        return (
                          <tr key={suggestion.id} className="border-b border-[var(--color-line-subtle)]/50 last:border-b-0">
                            <td className="px-2 py-2">
                              <span className={[
                                'rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase',
                                pending
                                  ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                                  : suggestion.status === 'approved'
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                    : 'border-red-500/30 bg-red-500/10 text-red-300',
                              ].join(' ')}>
                                {suggestion.status}
                              </span>
                            </td>
                            <td className="px-2 py-2 font-mono text-[10px] text-[var(--color-fg-default)]">{suggestion.suggested_field}</td>
                            <td className="px-2 py-2 font-mono text-[10px] text-[var(--color-fg-subtle)]">{suggestion.suggested_strategy}</td>
                            <td className="max-w-[240px] truncate px-2 py-2 font-mono text-[10px] text-[var(--color-fg-subtle)]">{previewValue}</td>
                            <td className="px-2 py-2 text-[10px] text-[var(--color-fg-subtle)]">{Math.round((suggestion.confidence ?? 0) * 100)}%</td>
                            <td className="max-w-[240px] truncate px-2 py-2 text-[10px] text-[var(--color-fg-subtle)]">{suggestion.reason}</td>
                            <td className="px-2 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-emerald-500/25 text-emerald-300 disabled:opacity-40"
                                  disabled={!pending || resolveHealingSuggestion.isPending}
                                  onClick={() => resolveSuggestion(suggestion.id, true)}
                                  title="Approve suggestion"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-500/25 text-red-300 disabled:opacity-40"
                                  disabled={!pending || resolveHealingSuggestion.isPending}
                                  onClick={() => resolveSuggestion(suggestion.id, false)}
                                  title="Reject suggestion"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {historyResult && (
            <div className="mb-5 rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <History size={14} className="text-[#45c08a]" />
                  <span className={label}>Object History</span>
                </div>
                <span className="text-xs text-[var(--color-fg-subtle)]">{historyResult.length} versions</span>
              </div>
              <div className="max-h-60 overflow-auto rounded-md border border-[var(--color-line-subtle)]">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {historyResult.length === 0 ? (
                      <tr>
                        <td className="px-3 py-5 text-center text-[var(--color-fg-subtle)]">No object history found</td>
                      </tr>
                    ) : (
                      historyResult.map((item) => (
                        <tr key={item.id} className="border-b border-[var(--color-line-subtle)]/50 last:border-b-0">
                          <td className="px-2 py-2">
                            <span className={[
                              'rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase',
                              item.action === 'created'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
                            ].join(' ')}>
                              {item.action}
                            </span>
                          </td>
                          <td className="px-2 py-2 font-mono text-[10px] text-[var(--color-fg-subtle)]">{new Date(item.created_at).toLocaleString()}</td>
                          <td className="px-2 py-2 text-[var(--color-fg-default)]">{item.source}</td>
                          <td className="px-2 py-2 font-mono text-[10px] text-[var(--color-fg-subtle)]">{item.changed_fields.join(', ') || 'initial version'}</td>
                          <td className="px-2 py-2 font-mono text-[10px] text-[var(--color-fg-subtle)]">
                            {String(item.before_snapshot?.automation_id ?? '')} -&gt; {String(item.after_snapshot?.automation_id ?? '')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {impactResult && (
            <div className="mb-5 rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Search size={14} className="text-[#5b8cff]" />
                  <span className={label}>Impact Analysis</span>
                </div>
                <span className="text-xs text-[var(--color-fg-subtle)]">{impactResult.object_name} · {impactResult.application}</span>
              </div>
              <div className="mb-3 grid grid-cols-4 gap-2">
                {[
                  ['Steps', impactResult.impacted_step_count, 'text-[#5b8cff]'],
                  ['Workflows', impactResult.workflow_node_count, 'text-[#a195ff]'],
                  ['High', impactResult.risk_summary.high ?? 0, 'text-red-300'],
                  ['Medium', impactResult.risk_summary.medium ?? 0, 'text-yellow-300'],
                ].map(([name, value, color]) => (
                  <div key={name} className="rounded-md border border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] px-3 py-2">
                    <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">{name}</p>
                    <p className={`mt-1 text-lg font-semibold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-56 overflow-auto rounded-md border border-[var(--color-line-subtle)]">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {impactResult.steps.length === 0 ? (
                      <tr>
                        <td className="px-3 py-5 text-center text-[var(--color-fg-subtle)]">No linked test steps found</td>
                      </tr>
                    ) : (
                      impactResult.steps.map((step) => (
                        <tr key={step.step_id} className="border-b border-[var(--color-line-subtle)]/50 last:border-b-0">
                          <td className="px-2 py-2">
                            <span className={[
                              'rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase',
                              step.risk === 'high'
                                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                : step.risk === 'medium'
                                  ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                                  : 'border-[var(--color-line-default)] text-[var(--color-fg-subtle)]',
                            ].join(' ')}>
                              {step.risk}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-[var(--color-fg-default)]">{step.step_name}</td>
                          <td className="px-2 py-2 text-[var(--color-fg-subtle)]">{step.test_case_name}</td>
                          <td className="px-2 py-2 font-mono text-[10px] text-[var(--color-fg-subtle)]">{step.current_locator}</td>
                          <td className="px-2 py-2 text-[10px] text-[var(--color-fg-subtle)]">{step.match_reasons.join(', ')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mb-5 overflow-hidden rounded-lg border border-[var(--color-line-default)]">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-[var(--color-surface-2)] text-[9px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                <tr>
                  <th className="border-r border-[var(--color-line-subtle)] px-2 py-2 text-left font-mono">key</th>
                  {columns.map((column) => (
                    <th key={column} className="border-r border-[var(--color-line-subtle)] px-2 py-2 text-left font-mono last:border-r-0">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sectionRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-xs text-[var(--color-fg-subtle)]">
                      No preview data loaded
                    </td>
                  </tr>
                ) : (
                  sectionRows.map((row) => (
                    <tr key={row.key} className="border-t border-[var(--color-line-subtle)]/60">
                      <td className="px-2 py-2 font-mono text-[var(--color-fg-default)]">{row.key}</td>
                      {columns.map((column) => (
                        <td key={column} className="max-w-[220px] truncate px-2 py-2 font-mono text-[10px] text-[var(--color-fg-subtle)]">
                          {stringifyCell(row.item[column])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {result && result.issues.length > 0 && (
            <div className="mb-5">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-[#f0b558]" />
                <span className={label}>Validation Issues</span>
              </div>
              <div className="space-y-2">
                {result.issues.map((issue, index) => (
                  <div key={`${issue.section}-${issue.key}-${index}`} className="rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase ${issue.severity === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'}`}>{issue.severity}</span>
                      <span className="text-xs font-medium text-[var(--color-fg-default)]">{issue.section}.{issue.key}</span>
                      {issue.field && <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">{issue.field}</span>}
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{issue.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {variablesSnippet && (
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clipboard size={14} className="text-[#45c08a]" />
                  <span className={label}>Execution Variables</span>
                </div>
                <Button variant="glass" size="sm" onClick={copySnippet}>
                  <Clipboard size={11} /> Copy
                </Button>
              </div>
              <pre className="max-h-52 overflow-auto rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3 text-[10px] leading-5 text-[var(--color-fg-default)]">
                {variablesSnippet}
              </pre>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
