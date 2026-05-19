'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDown, ArrowUp, BookOpen, Code2, Eye, EyeOff, FileText,
  Globe, Hash, Layers3, Link2, Monitor, Plus, Save, Search,
  Smartphone, Scan, Trash2, Tag, Type,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useAllPages, useCreateElement, useCreatePage, useDeleteElement,
  useDeletePage, useDiscoverElements, useUpdateElement, useUpdatePage,
} from '@/lib/api/pageRepository';
import type { DiscoveredElement, PageDetail, PageElement } from '@/lib/api/types';

// ── Constants ──────────────────────────────────────────────────────────────────

const ELEMENT_TYPES = [
  'button','input','link','dropdown','checkbox','radio',
  'textarea','table','label','image','div','span','element',
];

const LOCATOR_STRATEGIES = ['xpath','css','id','name','text','role','testid'];

const PLATFORMS = ['web','android','ios','desktop','api'];

const ELEMENT_TYPE_COLOR: Record<string, string> = {
  button: '#5b8cff', input: '#45c08a', link: '#4dd1e1', dropdown: '#a195ff',
  checkbox: '#f0b558', radio: '#f0b558', textarea: '#45c08a',
  table: '#8b8c97', label: '#8b8c97', image: '#f06262',
  div: '#8b8c97', span: '#8b8c97', element: '#8b8c97',
};

const STRATEGY_COLOR: Record<string, string> = {
  xpath: '#a195ff', css: '#45c08a', id: '#5b8cff', name: '#4dd1e1', text: '#f0b558',
  role: '#f06262', testid: '#e879f9',
};

const PLATFORM_ICON: Record<string, React.ElementType> = {
  web: Globe, android: Smartphone, ios: Smartphone, desktop: Monitor, api: Code2,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getLocator(el: PageElement): string {
  switch (el.locator_strategy) {
    case 'css':    return el.css_selector;
    case 'id':     return el.css_selector || (el.id_attr ? `#${el.id_attr}` : '');
    case 'name':   return el.css_selector || (el.name_attr ? `[name="${el.name_attr}"]` : '');
    case 'text':   return el.css_selector || el.name;
    case 'role':   return el.css_selector || (el.name_attr ? `[role="${el.name_attr}"]` : '');
    case 'testid': return el.css_selector ? el.css_selector : el.id_attr ? `[data-testid="${el.id_attr}"]` : '';
    default:       return el.xpath;
  }
}

function tagsToCSV(tags: string[]) { return tags.join(', '); }
function csvToTags(s: string) { return s.split(',').map((t) => t.trim()).filter(Boolean); }

// ── Element Row (inline editable) ─────────────────────────────────────────────

type ElemUpdates = {
  name?: string; element_type?: string; xpath?: string; css_selector?: string;
  id_attr?: string; name_attr?: string; locator_strategy?: string;
};

function ElementRow({
  el, index, isFirst, isLast,
  onDelete, onUpdate, onMoveUp, onMoveDown,
}: {
  el: PageElement; index: number; isFirst: boolean; isLast: boolean;
  onDelete: () => void; onUpdate: (u: ElemUpdates) => void;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const [name,     setName]     = useState(el.name);
  const [type,     setType]     = useState(el.element_type || 'element');
  const [xpath,    setXpath]    = useState(el.xpath);
  const [css,      setCss]      = useState(el.css_selector);
  const [idAttr,   setIdAttr]   = useState(el.id_attr);
  const [nameAttr, setNameAttr] = useState(el.name_attr);
  const [strategy, setStrategy] = useState(el.locator_strategy || 'xpath');
  const prevId = useRef(el.id);

  useEffect(() => {
    if (prevId.current === el.id) return;
    prevId.current = el.id;
    setName(el.name); setType(el.element_type); setXpath(el.xpath);
    setCss(el.css_selector); setIdAttr(el.id_attr);
    setNameAttr(el.name_attr); setStrategy(el.locator_strategy);
  }, [el.id]);

  function save(overrides: ElemUpdates = {}) {
    onUpdate({ name, element_type: type, xpath, css_selector: css, id_attr: idAttr, name_attr: nameAttr, locator_strategy: strategy, ...overrides });
  }

  const ic = 'w-full bg-transparent text-[11px] font-mono text-[var(--color-fg-default)] outline-none placeholder:text-[var(--color-fg-subtle)]/40';
  const bd = 'border-r border-[var(--color-line-subtle)] px-2 py-2';
  const typeColor = ELEMENT_TYPE_COLOR[type] ?? '#8b8c97';
  const stratColor = STRATEGY_COLOR[strategy] ?? '#8b8c97';
  const confidence = typeof el.confidence_score === 'number' ? Math.round(el.confidence_score * 100) : null;
  const needsReview = (el.tags ?? []).includes('needs-review') || (confidence !== null && confidence < 75);

  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.18 }}
      className={[
        'group border-b border-[var(--color-line-subtle)]/40 hover:bg-[rgba(255,255,255,0.018)] transition-colors',
        needsReview ? 'bg-yellow-500/[0.035]' : '',
      ].join(' ')}
    >
      {/* Index */}
      <td className={`${bd} w-8 text-center`}>
        <span className="font-mono text-[10px] text-[var(--color-fg-subtle)]">{index + 1}</span>
      </td>

      {/* Name */}
      <td className={`${bd} min-w-[140px]`}>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => save()}
          className={ic} placeholder="Element name…" />
        {confidence !== null && (
          <div className="mt-1 flex items-center gap-1.5 text-[9px] font-mono">
            <span className={needsReview ? 'text-yellow-400' : 'text-emerald-400'}>{confidence}%</span>
            {needsReview && <span className="rounded border border-yellow-500/25 bg-yellow-500/10 px-1 text-yellow-400">review</span>}
          </div>
        )}
      </td>

      {/* Type */}
      <td className={`${bd} w-32`}>
        <select value={type} onChange={(e) => { const v = e.target.value; setType(v); save({ element_type: v }); }}
          className={`${ic} cursor-pointer`} style={{ color: typeColor }}>
          {ELEMENT_TYPES.map((t) => (
            <option key={t} value={t} style={{ background: '#0d0d18', color: ELEMENT_TYPE_COLOR[t] ?? '#8b8c97' }}>{t}</option>
          ))}
        </select>
      </td>

      {/* XPath */}
      <td className={`${bd} min-w-[160px]`}>
        <input value={xpath} onChange={(e) => setXpath(e.target.value)} onBlur={() => save()}
          className={`${ic} text-[10px]`} placeholder="//div[@id='…']" />
      </td>

      {/* CSS Selector */}
      <td className={`${bd} min-w-[140px]`}>
        <input value={css} onChange={(e) => setCss(e.target.value)} onBlur={() => save()}
          className={`${ic} text-[10px]`} placeholder="#id .class" />
      </td>

      {/* ID */}
      <td className={`${bd} w-28`}>
        <input value={idAttr} onChange={(e) => setIdAttr(e.target.value)} onBlur={() => save()}
          className={`${ic} text-[10px]`} placeholder="html-id" />
      </td>

      {/* Name attr */}
      <td className={`${bd} w-28`}>
        <input value={nameAttr} onChange={(e) => setNameAttr(e.target.value)} onBlur={() => save()}
          className={`${ic} text-[10px]`} placeholder="input-name" />
      </td>

      {/* Strategy */}
      <td className={`${bd} w-24`}>
        <select value={strategy} onChange={(e) => { const v = e.target.value; setStrategy(v); save({ locator_strategy: v }); }}
          className={`${ic} cursor-pointer text-[10px]`} style={{ color: stratColor }}>
          {LOCATOR_STRATEGIES.map((s) => (
            <option key={s} value={s} style={{ background: '#0d0d18', color: STRATEGY_COLOR[s] ?? '#8b8c97' }}>{s}</option>
          ))}
        </select>
      </td>

      {/* Actions */}
      <td className="w-24 px-2 py-1">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button disabled={isFirst} onClick={onMoveUp}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] disabled:opacity-20 transition-all">
            <ArrowUp size={9} className="text-[var(--color-fg-subtle)]" />
          </button>
          <button disabled={isLast} onClick={onMoveDown}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] disabled:opacity-20 transition-all">
            <ArrowDown size={9} className="text-[var(--color-fg-subtle)]" />
          </button>
          <button onClick={onDelete}
            className="p-1 rounded hover:bg-red-500/20 transition-all">
            <Trash2 size={9} className="text-red-400/50 hover:text-red-400" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}

// ── Page Card ──────────────────────────────────────────────────────────────────

function PageCard({ page, isSelected, onClick }: { page: PageDetail | import('@/lib/api/types').PageListItem; isSelected: boolean; onClick: () => void }) {
  const PlatformIcon = PLATFORM_ICON[page.platform] ?? Globe;
  return (
    <motion.button
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ x: 2 }}
      onClick={onClick}
      className={[
        'w-full text-left rounded-xl border px-3 py-3 transition-all',
        isSelected
          ? 'border-[rgba(91,140,255,0.45)] bg-[rgba(91,140,255,0.07)] shadow-[0_0_12px_rgba(91,140,255,0.07)]'
          : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] hover:bg-[rgba(255,255,255,0.02)]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-[12px] font-medium text-[var(--color-fg-default)] leading-snug line-clamp-1">{page.name}</p>
        <PlatformIcon size={11} className="shrink-0 mt-0.5 text-[var(--color-fg-subtle)]" />
      </div>
      {page.url_pattern && (
        <p className="mb-1.5 truncate font-mono text-[10px] text-[#4dd1e1]/70">{page.url_pattern}</p>
      )}
      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--color-fg-subtle)]">
        <span>{page.element_count} element{page.element_count !== 1 ? 's' : ''}</span>
        <span className="rounded-full border border-[var(--color-line-default)] px-1.5 py-0.5 text-[9px]">{page.platform}</span>
      </div>
    </motion.button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PageRepositoryPage() {
  const router = useRouter();
  useEffect(() => {
    router.prefetch('/test-configuration');
    router.prefetch('/architecture');
    router.prefetch('/executions');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data: allPages = [], isLoading } = useAllPages();
  const [selPageId,   setSelPageId]   = useState<string | null>(null);
  const [search,      setSearch]      = useState('');
  const [showEditor,  setShowEditor]  = useState(true);
  const [discoverUrl, setDiscoverUrl] = useState('');
  const [discoverSummary, setDiscoverSummary] = useState<{
    found: number; saved: number; lowConf: number; durationMs: number; error?: string;
  } | null>(null);

  const selPage = allPages.find((p) => p.id === selPageId) ?? null;

  // Page draft
  const [pd, setPd] = useState({ name: '', url_pattern: '', description: '', platform: 'web', tags: '' });

  // Hooks
  const createPage   = useCreatePage();
  const updatePage   = useUpdatePage(selPageId ?? '');
  const deletePage   = useDeletePage();
  const createElement = useCreateElement(selPageId ?? '');
  const updateElem   = useUpdateElement();
  const deleteElem   = useDeleteElement();
  const discoverElem = useDiscoverElements();

  function doDiscover() {
    if (!discoverUrl.trim()) return;
    let pageName: string;
    try {
      pageName = selPage?.name || `Page from ${new URL(discoverUrl).hostname}`;
    } catch {
      setDiscoverSummary({ found: 0, saved: 0, lowConf: 0, durationMs: 0, error: 'Invalid URL' });
      return;
    }
    setDiscoverSummary(null);
    discoverElem.mutate(
      {
        url: discoverUrl.trim(),
        page_name: pageName,
        platform: selPage?.platform || 'web',
        save_mode: 'auto',
        min_confidence: 0.75,
        page_id: selPage?.id ?? null,
      },
      {
        onSuccess: (res) => {
          setDiscoverSummary({
            found: res.summary.elements_found,
            saved: res.summary.elements_saved,
            lowConf: res.summary.low_confidence,
            durationMs: res.summary.duration_ms,
            error: res.summary.error,
          });
          if (res.page && 'id' in res.page) {
            setSelPageId(res.page.id as string);
          }
        },
        onError: () => {
          setDiscoverSummary({ found: 0, saved: 0, lowConf: 0, durationMs: 0, error: 'Discovery request failed' });
        },
      },
    );
  }

  // Auto-select first page
  useEffect(() => {
    if (!selPageId && allPages.length > 0) setSelPageId(allPages[0].id);
  }, [allPages, selPageId]);

  // Sync draft when selection changes
  useEffect(() => {
    if (!selPage) return;
    setPd({ name: selPage.name, url_pattern: selPage.url_pattern, description: selPage.description, platform: selPage.platform, tags: tagsToCSV(selPage.tags) });
  }, [selPage?.id]);

  function doUpdateElem(el: PageElement, u: ElemUpdates) {
    updateElem.mutate({ elementId: el.id, input: u });
  }

  function addElement() {
    if (!selPageId) return;
    createElement.mutate({
      name: `Element ${(selPage?.elements.length ?? 0) + 1}`,
      element_type: 'element', xpath: '', css_selector: '', id_attr: '',
      name_attr: '', locator_strategy: 'xpath', tags: [],
    });
  }

  function doDeleteElem(el: PageElement) {
    if (window.confirm(`Delete element "${el.name}"?`)) deleteElem.mutate(el.id);
  }

  function savePage() {
    if (!selPage) return;
    updatePage.mutate({ name: pd.name, url_pattern: pd.url_pattern, description: pd.description, platform: pd.platform, tags: csvToTags(pd.tags) });
  }

  function doDeletePage() {
    if (!selPage) return;
    if (window.confirm(`Delete page "${selPage.name}" and all its elements?`)) {
      deletePage.mutate(selPage.id);
      setSelPageId(null);
    }
  }

  const filtered = allPages.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.url_pattern && p.url_pattern.toLowerCase().includes(search.toLowerCase())));
  const sortedElems = selPage ? [...selPage.elements].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const totalElements = allPages.reduce((s, p) => s + p.element_count, 0);

  const INP = 'w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)] placeholder:text-[var(--color-fg-subtle)]';
  const LBL = 'text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)] mb-1.5 block';

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26 }}
        className="shrink-0 border-b border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-6 py-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Test Authoring</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--color-fg-default)]">Page Repository</h1>
            <p className="mt-0.5 text-[11px] text-[var(--color-fg-subtle)]">Define application pages and their UI elements — referenced in test step configuration.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Stats */}
            {[
              { icon: BookOpen,  label: 'Pages',    value: allPages.length,  color: '#5b8cff' },
              { icon: Layers3,   label: 'Elements', value: totalElements,    color: '#45c08a' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex items-center gap-2 rounded-lg border px-3 py-1.5"
                style={{ borderColor: `${color}25`, background: `${color}0a` }}>
                <Icon size={12} style={{ color }} />
                <span className="font-mono text-sm font-semibold" style={{ color }}>{value}</span>
                <span className="text-[10px] text-[var(--color-fg-subtle)]">{label}</span>
              </div>
            ))}

            <div className="flex items-center gap-1.5 border-l border-[var(--color-line-default)] pl-3">
              <Button variant="neon" size="sm"
                onClick={() => createPage.mutate(
                  { name: `Page ${allPages.length + 1}`, url_pattern: '', platform: 'web', description: '', tags: [] },
                  { onSuccess: (p) => setSelPageId(p.id) },
                )}>
                <Plus size={11} /> New Page
              </Button>
              <Button variant="glass" size="sm" disabled={!selPage} onClick={addElement}>
                <Plus size={11} /> Add Element
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Workflow progress strip ──────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] px-6 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {([
            { label: '① Test Cases',       href: '/test-configuration', active: false },
            { label: '② Pages & Elements', href: '/page-repository',   active: true  },
            { label: '③ Test Steps',       href: '/test-configuration', active: false },
            { label: '④ Architecture',     href: '/architecture',       active: false },
            { label: '⑤ Execution',        href: '/executions',         active: false },
          ] as const).map((s, i, arr) => (
            <span key={s.label} className="flex items-center gap-1 shrink-0">
              <Link href={s.href}
                className={[
                  'rounded px-2.5 py-1 text-[10px] font-mono transition-colors',
                  s.active
                    ? 'bg-[rgba(77,209,225,0.15)] text-[#4dd1e1] border border-[rgba(77,209,225,0.3)]'
                    : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-default)] hover:bg-[var(--color-surface-2)]',
                ].join(' ')}>
                {s.label}
              </Link>
              {i < arr.length - 1 && <span className="text-[var(--color-fg-subtle)] text-[10px]">›</span>}
            </span>
          ))}
        </div>
      </div>

      {/* ── Element Discovery Agent Bar ──────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--color-line-subtle)] bg-[var(--color-surface-2)]/50 px-6 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Scan size={13} className="text-[#e879f9] shrink-0" />
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)] shrink-0">Element Discovery Agent</span>
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <input
              value={discoverUrl}
              onChange={(e) => setDiscoverUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doDiscover(); }}
              placeholder="https://example.com/login"
              className="flex-1 min-w-[200px] rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-3 py-1.5 text-[11px] font-mono text-[var(--color-fg-default)] outline-none transition-colors focus:border-[#e879f9]/50 placeholder:text-[var(--color-fg-subtle)]/40"
            />
            <Button
              variant="glass"
              size="sm"
              onClick={doDiscover}
              disabled={discoverElem.isPending || !discoverUrl.trim()}
              className="shrink-0"
            >
              {discoverElem.isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 border-2 border-[var(--color-fg-subtle)] border-t-transparent rounded-full animate-spin" />
                  Discovering…
                </span>
              ) : (
                <><Scan size={11} /> Discover</>
              )}
            </Button>
          </div>
          {discoverSummary && (
            <div className={[
              'flex items-center gap-2 rounded-md border px-2.5 py-1 text-[10px] font-mono',
              discoverSummary.error
                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                : discoverSummary.lowConf > 0
                  ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                  : 'border-green-500/30 bg-green-500/10 text-green-400',
            ].join(' ')}>
              {discoverSummary.error ? (
                <span>Error: {discoverSummary.error}</span>
              ) : (
                <span className="flex items-center gap-2">
                  <span>Found {discoverSummary.found}</span>
                  <span className="opacity-40">·</span>
                  <span>Saved {discoverSummary.saved}</span>
                  {discoverSummary.lowConf > 0 && (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="text-yellow-400">{discoverSummary.lowConf} need review</span>
                    </>
                  )}
                  <span className="opacity-40">·</span>
                  <span className="text-[var(--color-fg-subtle)]">{discoverSummary.durationMs}ms</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 3-column layout ─────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Col 1 — Page List */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
          <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)] px-4 py-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen size={13} className="text-[var(--color-accent-default)]" />
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Pages</span>
            </div>
            <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">{allPages.length}</span>
          </div>

          <div className="shrink-0 px-3 py-2 border-b border-[var(--color-line-subtle)]">
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter pages…"
                className="w-full rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] pl-7 pr-3 py-1 text-[11px] text-[var(--color-fg-default)] outline-none focus:border-[var(--color-accent-default)] transition-colors" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {isLoading && <p className="px-3 py-6 text-center text-xs text-[var(--color-fg-subtle)]">Loading…</p>}
            {!isLoading && filtered.length === 0 && (
              <div className="rounded-lg border border-dashed border-[var(--color-line-default)] px-3 py-8 text-center">
                <p className="text-xs text-[var(--color-fg-subtle)]">{search ? 'No matching pages' : 'No pages yet'}</p>
                {!search && <p className="mt-1 text-[10px] text-[var(--color-fg-subtle)]/60">Click "New Page" above</p>}
              </div>
            )}
            {filtered.map((page) => (
              <PageCard key={page.id} page={page} isSelected={page.id === selPageId} onClick={() => setSelPageId(page.id)} />
            ))}
          </div>
        </aside>

        {/* Col 2 — Element Table */}
        <div className="flex min-h-0 flex-1 flex-col border-r border-[var(--color-line-default)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)] px-4 py-2 shrink-0">
            <div className="flex items-center gap-2">
              <Layers3 size={13} className="text-[#45c08a]" />
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                {selPage ? `${selPage.name} — Elements` : 'Select a page'}
              </span>
              {selPage && <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">· {selPage.elements.length}</span>}
            </div>
            {selPage && (
              <Button variant="glass" size="xs" onClick={addElement}>
                <Plus size={10} /> Add element
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {!selPage
              ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <BookOpen size={28} className="mb-3 text-[var(--color-fg-subtle)]/30" />
                  <p className="text-sm text-[var(--color-fg-muted)]">Select a page to manage its elements</p>
                  <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">Elements are reused across test steps</p>
                </div>
              )
              : sortedElems.length === 0
                ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <p className="text-xs text-[var(--color-fg-subtle)]">No elements yet</p>
                    <Button variant="neon" size="sm" className="mt-3" onClick={addElement}>
                      <Plus size={11} /> Add first element
                    </Button>
                  </div>
                )
                : (
                  <table className="w-full border-collapse" style={{ minWidth: 900 }}>
                    <thead className="sticky top-0 z-10" style={{ background: 'var(--color-surface-1)' }}>
                      <tr className="border-b border-[var(--color-line-default)]">
                        {['#','Name','Type','XPath','CSS Selector','ID Attr','Name Attr','Strategy',''].map((h, i) => (
                          <th key={i} className="px-2 py-2 text-left font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)] border-r border-[var(--color-line-subtle)] last:border-r-0">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedElems.map((el, i) => (
                        <ElementRow
                          key={el.id} el={el} index={i}
                          isFirst={i === 0} isLast={i === sortedElems.length - 1}
                          onDelete={() => doDeleteElem(el)}
                          onUpdate={(u) => doUpdateElem(el, u)}
                          onMoveUp={() => {}}
                          onMoveDown={() => {}}
                        />
                      ))}
                    </tbody>
                  </table>
                )
            }
          </div>

          {/* Active locator preview */}
          {selPage && sortedElems.length > 0 && (
            <div className="shrink-0 border-t border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] px-4 py-2">
              <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)] mb-2">Locator Reference</p>
              <div className="flex flex-wrap gap-2">
                {sortedElems.slice(0, 6).map((el) => {
                  const loc = getLocator(el);
                  const stc = STRATEGY_COLOR[el.locator_strategy] ?? '#8b8c97';
                  return loc ? (
                    <div key={el.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-mono"
                      style={{ borderColor: `${stc}25`, background: `${stc}08` }}>
                      <span style={{ color: stc }}>{el.name}</span>
                      <span className="opacity-40">·</span>
                      <span className="text-[var(--color-fg-subtle)] truncate max-w-[120px]">{loc}</span>
                    </div>
                  ) : null;
                })}
                {sortedElems.length > 6 && (
                  <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">+{sortedElems.length - 6} more</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Col 3 — Page Editor */}
        <aside className="flex w-72 shrink-0 flex-col border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
          <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)] px-4 py-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={13} className="text-[#5b8cff]" />
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Page Editor</span>
            </div>
            {selPage && (
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="xs" onClick={doDeletePage}><Trash2 size={10} /> Del</Button>
                <Button variant="neon" size="xs" onClick={savePage}><Save size={10} /> Save</Button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {!selPage
              ? (
                <div className="flex h-40 items-center justify-center text-xs text-[var(--color-fg-subtle)]">
                  Select or create a page to edit
                </div>
              )
              : (
                <div className="space-y-3">
                  <div>
                    <label className={LBL}>Page Name</label>
                    <input value={pd.name} onChange={(e) => setPd((d) => ({ ...d, name: e.target.value }))} className={INP} placeholder="Login Page" />
                  </div>

                  <div>
                    <label className={LBL}>URL / Path Pattern</label>
                    <div className="relative">
                      <Link2 size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
                      <input value={pd.url_pattern} onChange={(e) => setPd((d) => ({ ...d, url_pattern: e.target.value }))} className={`${INP} pl-8`} placeholder="/login or https://…" />
                    </div>
                  </div>

                  <div>
                    <label className={LBL}>Platform</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PLATFORMS.map((p) => {
                        const active = pd.platform === p;
                        const PIcon = PLATFORM_ICON[p] ?? Globe;
                        return (
                          <button key={p} onClick={() => setPd((d) => ({ ...d, platform: p }))}
                            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-mono transition-all ${active ? 'border-[rgba(91,140,255,0.5)] bg-[rgba(91,140,255,0.12)] text-[#5b8cff]' : 'border-[var(--color-line-default)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-default)]'}`}>
                            <PIcon size={9} />{p}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className={LBL}>Tags</label>
                    <input value={pd.tags} onChange={(e) => setPd((d) => ({ ...d, tags: e.target.value }))} className={INP} placeholder="auth, checkout, payment" />
                  </div>

                  <div>
                    <label className={LBL}>Description</label>
                    <textarea value={pd.description} onChange={(e) => setPd((d) => ({ ...d, description: e.target.value }))} className={`${INP} min-h-24 resize-y`} placeholder="What this page represents…" />
                  </div>

                  {/* Element type legend */}
                  <div className="border-t border-[var(--color-line-subtle)] pt-3">
                    <p className={LBL}>Element Type Colors</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(ELEMENT_TYPE_COLOR).slice(0, 8).map(([t, c]) => (
                        <span key={t} className="rounded-full border px-2 py-0.5 text-[9px] font-mono"
                          style={{ color: c, borderColor: `${c}30`, background: `${c}10` }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Strategy legend */}
                  <div>
                    <p className={LBL}>Locator Strategies</p>
                    <div className="flex flex-wrap gap-1">
                      {LOCATOR_STRATEGIES.map((s) => (
                        <span key={s} className="rounded-full border px-2 py-0.5 text-[9px] font-mono"
                          style={{ color: STRATEGY_COLOR[s], borderColor: `${STRATEGY_COLOR[s]}30`, background: `${STRATEGY_COLOR[s]}10` }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )
            }
          </div>

          {/* Integration hint */}
          <div className="shrink-0 border-t border-[var(--color-line-subtle)] p-4">
            <div className="rounded-lg border border-[rgba(91,140,255,0.2)] bg-[rgba(91,140,255,0.06)] p-3">
              <p className="text-[10px] font-mono font-semibold text-[#5b8cff] mb-1">Used in Test Steps</p>
              <p className="text-[10px] text-[var(--color-fg-subtle)] leading-4">
                Page names and element locators defined here are automatically available in the Test Configuration step editor.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
