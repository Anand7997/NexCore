'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, EyeOff, FileText,
  FolderOpen, Layers3, ListChecks, Package, Plus, Save, Search, Tag,
  TestTube, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useCreateTestCase, useCreateTestModule, useCreateTestProject, useCreateTestStep,
  useDeleteTestCase, useDeleteTestModule, useDeleteTestProject, useDeleteTestStep,
  useTestConfigurationTree, useUpdateAnyTestStep, useUpdateTestCase,
  useUpdateTestModule, useUpdateTestProject,
} from '@/lib/api/testConfiguration';
import { useAllPages } from '@/lib/api/pageRepository';
import type { TestCase, TestModule, TestProject, TestStep, PageDetail } from '@/lib/api/types';

// ── Constants ──────────────────────────────────────────────────────────────────

const ACTION_TYPES = [
  'OPEN_BROWSER','CLICK','DOUBLE_CLICK','RIGHT_CLICK','MOUSE_OVER',
  'CLICK_AND_SELECT','CLICK_AND_TYPE','TYPE_AND_SELECT','CLEAR_AND_TYPE',
  'RADIO_BUTTON','DRAG_AND_DROP','SELECT_COUNT','INCREMENT','DECREMENT',
  'HANDLE_CHECKBOX','SWITCH_TO_NEW_WINDOW','SWITCH_TO_WINDOW_BY_INDEX',
  'SWITCH_TO_WINDOW_BY_URL','SWITCH_TO_IFRAME','CLOSE_EXTRA_WINDOWS',
  'NAVIGATE_TO_URL','REFRESH_PAGE','GO_BACK','GO_FORWARD',
  'READ_TEXT','READ_VALUE','READ_TOOLTIP','READ_LABEL',
  'COPY','PASTE','UPLOAD_FILE','DOWNLOAD_FILE','HANDLE',
  'VISUAL_ASSERTION','TYPE','SELECT','WAIT','PRESS_KEY','ASSERTION',
];

const ASSERTION_TYPES = [
  'EQUALS','CONTAINS','NOT_CONTAINS','STARTS_WITH','ENDS_WITH',
  'REGEX','GREATER_THAN','LESS_THAN','IS_VISIBLE','IS_HIDDEN',
  'IS_ENABLED','IS_DISABLED','IS_CHECKED','IS_EMPTY','COUNT_EQUALS',
];

const SECONDARY_ACTIONS = [
  '','LOG_STEP','AUTO_GENERATE_VALUE','TAKE_SCREENSHOT',
  'HIGHLIGHT_ELEMENT','SCROLL_INTO_VIEW',
];

const LEGACY_MAP: Record<string, string> = {
  DOUBLECLICK:'DOUBLE_CLICK',RIGHTCLICK:'RIGHT_CLICK',MOUSEOVER:'MOUSE_OVER',
  MOUSE_HOVER:'MOUSE_OVER',HOVER:'MOUSE_OVER',HOVER_MOUSE_OVER:'MOUSE_OVER',
  CLEAR_TYPE:'CLEAR_AND_TYPE',TYPE_AND_CLEAR:'CLEAR_AND_TYPE',
  TYPE_SELECT:'TYPE_AND_SELECT',TYPE_AND_PICK:'TYPE_AND_SELECT',
  RADIO:'RADIO_BUTTON',RADIOBUTTON:'RADIO_BUTTON',HANDLE_RADIO:'RADIO_BUTTON',
  DRAGDROP:'DRAG_AND_DROP','DRAG_&_DROP':'DRAG_AND_DROP',
  HANDLE_ALERT_DIALOG:'HANDLE',HANDLE_CONFIRMATION:'HANDLE',
  HANDLE_NOTIFICATION:'HANDLE',HANDLE_OS_DIALOG:'HANDLE',
  SWITCH_FRAME:'SWITCH_TO_IFRAME',SWITCH_TO_FRAME:'SWITCH_TO_IFRAME',
  SWITCH_IFRAME:'SWITCH_TO_IFRAME',
};

const ACTION_COLOR: Record<string, string> = {
  CLICK:'#5b8cff',DOUBLE_CLICK:'#5b8cff',RIGHT_CLICK:'#5b8cff',MOUSE_OVER:'#4dd1e1',
  CLICK_AND_SELECT:'#5b8cff',CLICK_AND_TYPE:'#5b8cff',
  TYPE:'#45c08a',TYPE_AND_SELECT:'#45c08a',CLEAR_AND_TYPE:'#45c08a',SELECT:'#45c08a',
  OPEN_BROWSER:'#a195ff',NAVIGATE_TO_URL:'#a195ff',REFRESH_PAGE:'#a195ff',
  GO_BACK:'#a195ff',GO_FORWARD:'#a195ff',
  ASSERTION:'#f0b558',VISUAL_ASSERTION:'#f0b558',
  READ_TEXT:'#4dd1e1',READ_VALUE:'#4dd1e1',READ_TOOLTIP:'#4dd1e1',READ_LABEL:'#4dd1e1',
  WAIT:'#8b8c97',PRESS_KEY:'#8b8c97',HANDLE:'#f06262',HANDLE_CHECKBOX:'#f06262',
  UPLOAD_FILE:'#f0b558',DOWNLOAD_FILE:'#f0b558',
};

const PRIORITY_CONFIG: Record<string, { color: string }> = {
  p0:{ color:'#f06262' },p1:{ color:'#f0b558' },p2:{ color:'#45c08a' },p3:{ color:'#8b8c97' },
};

const TYPE_COLOR: Record<string, string> = {
  functional:'#5b8cff',smoke:'#45c08a',regression:'#f0b558',integration:'#a195ff',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeAction(raw?: string) {
  const s = (raw || 'CLICK').toUpperCase().trim().replace(/[\s\-/]+/g, '_');
  if (s in LEGACY_MAP) return LEGACY_MAP[s];
  return ACTION_TYPES.includes(s) ? s : 'CLICK';
}

function asStr(v: unknown) { return typeof v === 'string' ? v : ''; }
function webBind(s: TestStep) { return s.bindings?.web ?? {}; }
function stepPage(s: TestStep) { return asStr(webBind(s).page); }
function stepElement(s: TestStep) { return asStr(webBind(s).element_name) || s.target; }
function isNavigateAction(action?: string) {
  const normalized = normalizeAction(action);
  return normalized === 'OPEN_BROWSER' || normalized === 'NAVIGATE_TO_URL';
}
function pageUrlForStep(s: TestStep, pageRepo: PageDetail[] = []) {
  const pageName = stepPage(s);
  const repoPage = pageRepo.find((p) => p.name.toLowerCase() === pageName.toLowerCase());
  return repoPage?.url_pattern || '';
}
function stepLocator(s: TestStep) {
  return (
    asStr(s.path_location) ||
    asStr(s.xpath) ||
    asStr(webBind(s).xpath) ||
    asStr(s.test_data?.xpath) ||
    asStr(s.test_data?.locator) ||
    asStr(webBind(s).selector)
  );
}
function stepValue(s: TestStep, pageRepo: PageDetail[] = []) {
  return asStr(s.input_value) || asStr(s.test_data?.value) || (isNavigateAction(s.intent || s.action_type) ? pageUrlForStep(s, pageRepo) : '');
}
function stepAssertionType(s: TestStep) { return asStr(s.test_data?.assertion_type); }
function stepSecondaryAction(s: TestStep) { return asStr(s.test_data?.secondary_action); }
function resolvePathFromRepo(el: { xpath: string; css_selector: string; name: string }): string {
  return el.xpath || el.css_selector || el.name;
}
function tagsToCSV(t: string[]) { return t.join(', '); }
function csvToTags(c: string) { return c.split(',').map((t) => t.trim()).filter(Boolean); }
function uniqueSorted(vs: string[]) { return [...new Set(vs.filter(Boolean))].sort((a, b) => a.localeCompare(b)); }

type StepUpdates = {
  description?: string; action?: string; page?: string;
  element?: string; locator?: string; value?: string;
  assertionType?: string; secondaryAction?: string;
  stepOrder?: number; isEnabled?: boolean;
};

function buildPayload(step: TestStep, u: StepUpdates) {
  const action          = normalizeAction(u.action ?? step.intent);
  const page            = u.page            ?? stepPage(step);
  const elem            = u.element         ?? stepElement(step);
  const loc             = u.locator         ?? stepLocator(step);
  const val             = u.value           ?? stepValue(step);
  const assertionType   = u.assertionType   ?? stepAssertionType(step);
  const secondaryAction = u.secondaryAction ?? stepSecondaryAction(step);
  const desc            = u.description     ?? step.description;
  return {
    name: desc.trim().slice(0, 90) || `Step ${u.stepOrder ?? step.step_order}`,
    description: desc,
    step_order: u.stepOrder ?? step.step_order,
    intent: action,
    action_type: action,
    target: elem,
    input_value: val,
    expected_result: step.expected_result,
    test_data: {
      ...step.test_data,
      value: val,
      action_type: action,
      xpath: loc,
      path_location: loc,
      ...(assertionType   ? { assertion_type:   assertionType   } : {}),
      ...(secondaryAction ? { secondary_action: secondaryAction } : {}),
    },
    tags: step.tags,
    bindings: {
      ...step.bindings,
      web: { ...(step.bindings?.web ?? {}), page, element_name: elem, selector: loc, xpath: loc },
    },
    is_enabled: u.isEnabled ?? step.is_enabled,
  };
}

// ── StepRow ────────────────────────────────────────────────────────────────────

function StepRow({
  step, index, isFirst, isLast,
  onAddAfter, onMoveUp, onMoveDown, onDelete, onUpdate,
  pageOptions, elementOptions, locatorByElement, pageRepo,
}: {
  step: TestStep; index: number; isFirst: boolean; isLast: boolean;
  onAddAfter: () => void; onMoveUp: () => void; onMoveDown: () => void;
  onDelete: () => void; onUpdate: (u: StepUpdates) => void;
  pageOptions: string[]; elementOptions: string[]; locatorByElement: Map<string, string>;
  pageRepo: PageDetail[];
}) {
  const [desc, setDesc]               = useState(step.description);
  const [action, setAction]           = useState(normalizeAction(step.intent));
  const [page, setPage]               = useState(stepPage(step));
  const [element, setElement]         = useState(stepElement(step));
  const [locator, setLocator]         = useState(stepLocator(step));
  const [value, setValue]             = useState(stepValue(step, pageRepo));
  const [assertionType, setAssType]   = useState(stepAssertionType(step));
  const [secondaryAction, setSecAct]  = useState(stepSecondaryAction(step));
  const [enabled, setEnabled]         = useState(step.is_enabled);
  const prevId = useRef(step.id);
  const pageRepoSignature = pageRepo.map((p) => `${p.id}:${p.url_pattern}`).join('|');

  useEffect(() => {
    if (prevId.current === step.id && value) return;
    prevId.current = step.id;
    setDesc(step.description);
    setAction(normalizeAction(step.intent));
    setPage(stepPage(step));
    setElement(stepElement(step));
    setLocator(stepLocator(step));
    setValue(stepValue(step, pageRepo));
    setAssType(stepAssertionType(step));
    setSecAct(stepSecondaryAction(step));
    setEnabled(step.is_enabled);
  }, [pageRepoSignature, step.id]);

  const color = ACTION_COLOR[action] ?? '#8b8c97';

  // Page repository: elements for the selected page
  const repoPage = pageRepo.find((p) => p.name.toLowerCase() === page.toLowerCase());
  const repoElems = repoPage?.elements ?? [];
  const repoPageNames = pageRepo.map((p) => p.name);
  const repoElemNames = repoElems.map((e) => e.name);

  const isAssertionAction = action === 'ASSERTION' || action === 'VISUAL_ASSERTION';

  function save(overrides: StepUpdates = {}) {
    onUpdate({ description: desc, action, page, element, locator, value, assertionType, secondaryAction, isEnabled: enabled, ...overrides });
  }

  function handleElementBlur() {
    const repoEl = repoElems.find((e) => e.name.toLowerCase() === element.toLowerCase());
    if (repoEl) {
      const repoLoc = resolvePathFromRepo(repoEl);
      if (repoLoc && !locator) setLocator(repoLoc);
      onUpdate({ description: desc, action, page, element, locator: repoLoc || locator, value, assertionType, secondaryAction, isEnabled: enabled });
      return;
    }
    const auto = locatorByElement.get(element);
    if (auto && !locator) setLocator(auto);
    onUpdate({ description: desc, action, page, element, locator: auto || locator, value, assertionType, secondaryAction, isEnabled: enabled });
  }

  const ic = 'w-full bg-transparent text-[11px] font-mono text-[var(--color-fg-default)] outline-none placeholder:text-[var(--color-fg-subtle)]/40';
  const bd = 'border-r border-[var(--color-line-subtle)] px-2 py-2';

  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.022, duration: 0.18 }}
      className={[
        'group border-b border-[var(--color-line-subtle)]/40 transition-colors',
        !enabled ? 'opacity-40' : '',
        'hover:bg-[rgba(255,255,255,0.018)]',
      ].join(' ')}
    >
      <td className={`${bd} w-8 text-center shrink-0`}>
        <span className="font-mono text-[10px] text-[var(--color-fg-subtle)]">{step.step_order}</span>
      </td>
      <td className={`${bd} min-w-[150px]`}>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => save()}
          className={ic} placeholder="Describe step…" />
      </td>
      <td className={`${bd} w-40`}>
        <select value={action}
          onChange={(e) => { const v = e.target.value; setAction(v); save({ action: v }); }}
          className={`${ic} cursor-pointer`} style={{ color }}>
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t} style={{ background: '#0d0d18', color: ACTION_COLOR[t] ?? '#8b8c97' }}>{t}</option>
          ))}
        </select>
      </td>
      {/* Page */}
      <td className={`${bd} w-28`}>
        <input value={page} onChange={(e) => setPage(e.target.value)} onBlur={() => save()}
          className={ic} placeholder="Page" list={`pg-${step.id}`} />
        <datalist id={`pg-${step.id}`}>
          {[...new Set([...repoPageNames, ...pageOptions])].map((p) => <option key={p} value={p} />)}
        </datalist>
      </td>
      {/* Element */}
      <td className={`${bd} min-w-[140px]`}>
        <input value={element} onChange={(e) => setElement(e.target.value)} onBlur={handleElementBlur}
          className={ic} placeholder="Element" list={`el-${step.id}`} />
        <datalist id={`el-${step.id}`}>
          {[...new Set([...repoElemNames, ...elementOptions])].map((e) => <option key={e} value={e} />)}
        </datalist>
      </td>
      {/* Paths / Location */}
      <td className={`${bd} min-w-[190px]`}>
        <input
          value={locator}
          onChange={(e) => setLocator(e.target.value)}
          onBlur={() => save()}
          className={`${ic} text-[10px] text-[var(--color-fg-muted)]`}
          placeholder="XPath / selector"
          title={locator}
        />
      </td>
      {/* Value — or assertion type dropdown when action is ASSERTION */}
      <td className={`${bd} min-w-[120px]`}>
        {isAssertionAction ? (
          <div className="space-y-0.5">
            <select value={assertionType}
              onChange={(e) => { const v = e.target.value; setAssType(v); save({ assertionType: v }); }}
              className={`${ic} cursor-pointer text-[#f0b558]`}
              style={{ color: assertionType ? '#f0b558' : undefined }}
            >
              <option value="">— Assertion type —</option>
              {ASSERTION_TYPES.map((t) => (
                <option key={t} value={t} style={{ background: '#0d0d18', color: '#f0b558' }}>{t}</option>
              ))}
            </select>
            <input value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => save()}
              className={`${ic} text-[10px]`} placeholder="Expected value" />
          </div>
        ) : (
          <input value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => save()}
            className={ic} placeholder="Value / data" />
        )}
      </td>
      {/* Secondary action */}
      <td className={`${bd} w-28`}>
        <select value={secondaryAction}
          onChange={(e) => { const v = e.target.value; setSecAct(v); save({ secondaryAction: v }); }}
          className={`${ic} cursor-pointer text-[var(--color-fg-subtle)]`}
        >
          {SECONDARY_ACTIONS.map((a) => (
            <option key={a} value={a} style={{ background: '#0d0d18', color: '#8b8c97' }}>
              {a || '—'}
            </option>
          ))}
        </select>
      </td>
      {/* Enabled */}
      <td className={`${bd} w-9 text-center`}>
        <button onClick={() => { const n = !enabled; setEnabled(n); save({ isEnabled: n }); }}
          className="flex items-center justify-center w-full transition-colors">
          {enabled
            ? <Eye size={10} className="text-[#45c08a] mx-auto" />
            : <EyeOff size={10} className="text-[var(--color-fg-subtle)] mx-auto" />}
        </button>
      </td>
      {/* Row actions */}
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
          <button onClick={onAddAfter}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] transition-all">
            <Plus size={9} className="text-[var(--color-fg-subtle)]" />
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

// ── CaseCard ───────────────────────────────────────────────────────────────────

function CaseCard({ tc, isSelected, onClick }: { tc: TestCase; isSelected: boolean; onClick: () => void }) {
  const pc = PRIORITY_CONFIG[tc.priority] ?? { color: '#8b8c97' };
  const tc2 = TYPE_COLOR[tc.test_type] ?? '#8b8c97';
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.005 }}
      onClick={onClick}
      className={[
        'w-full text-left rounded-xl border px-4 py-3 transition-all',
        isSelected
          ? 'border-[rgba(91,140,255,0.4)] bg-[rgba(91,140,255,0.07)] shadow-[0_0_12px_rgba(91,140,255,0.08)]'
          : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] hover:bg-[rgba(255,255,255,0.02)]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <p className="text-[12px] font-medium text-[var(--color-fg-default)] leading-snug">{tc.name}</p>
        <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-mono font-bold"
          style={{ color: pc.color, borderColor: `${pc.color}40`, background: `${pc.color}12` }}>
          {(tc.priority || 'p2').toUpperCase()}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
          style={{ color: tc2, borderColor: `${tc2}30`, background: `${tc2}10` }}>
          {tc.test_type}
        </span>
        {tc.platforms.slice(0, 3).map((p) => (
          <span key={p} className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[var(--color-line-default)] text-[var(--color-fg-subtle)]">{p}</span>
        ))}
        <span className="ml-auto text-[10px] font-mono text-[var(--color-fg-subtle)]">{tc.test_steps.length} steps</span>
      </div>
    </motion.button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type EditorMode = 'project' | 'module' | 'case';

export default function TestConfigurationPage() {
  const router = useRouter();
  useEffect(() => {
    router.prefetch('/page-repository');
    router.prefetch('/architecture');
    router.prefetch('/executions');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data, isLoading } = useTestConfigurationTree();
  const projects   = data?.projects    ?? [];
  const tagCatalog = data?.tag_catalog ?? [];
  const { data: pageRepo = [] } = useAllPages();

  const [selProjectId, setSelProjectId] = useState<string | null>(null);
  const [selModuleId,  setSelModuleId]  = useState<string | null>(null);
  const [selCaseId,    setSelCaseId]    = useState<string | null>(null);
  const [expandedIds, setExpandedIds]   = useState<Set<string>>(new Set());
  const [caseSearch,  setCaseSearch]    = useState('');
  const [editorMode,  setEditorMode]    = useState<EditorMode>('project');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestedProjectId, setRequestedProjectId] = useState<string | null>(null);

  const [pd, setPd] = useState({ name:'', description:'', status:'active', tags:'' });
  const [md, setMd] = useState({ name:'', description:'', status:'active', tags:'' });
  const [cd, setCd] = useState({
    name:'', description:'', status:'draft', testType:'functional',
    priority:'p2', executionMode:'automated', platforms:[] as string[], tags:'', vars:'{}',
  });

  const selProject = projects.find((p) => p.id === selProjectId) ?? null;
  const selModule  = selProject?.modules.find((m) => m.id === selModuleId) ?? null;
  const selCase    = selModule?.test_cases.find((c) => c.id === selCaseId) ?? null;

  const createProject  = useCreateTestProject();
  const updateProject  = useUpdateTestProject(selProjectId ?? '');
  const deleteProject  = useDeleteTestProject();
  const createModule   = useCreateTestModule(selProjectId ?? '');
  const updateModule   = useUpdateTestModule(selModuleId ?? '');
  const deleteModule   = useDeleteTestModule();
  const createCase     = useCreateTestCase(selModuleId ?? '');
  const updateCase     = useUpdateTestCase(selCaseId ?? '');
  const deleteCase     = useDeleteTestCase();
  const createStep     = useCreateTestStep(selCaseId ?? '');
  const updateAnyStep  = useUpdateAnyTestStep();
  const deleteStepHook = useDeleteTestStep();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRequestedProjectId(params.get('projectId'));
  }, []);

  // Auto-select the requested project, or the first project/module/case on load
  useEffect(() => {
    if (!projects.length) return;
    const requested = requestedProjectId ? projects.find((p) => p.id === requestedProjectId) : null;
    const proj = requested ?? projects.find((p) => p.id === selProjectId) ?? projects[0];
    if (proj.id !== selProjectId) {
      setSelProjectId(proj.id);
      setExpandedIds((prev) => new Set([...prev, proj.id]));
      if (requested) setEditorMode('project');
    }
    const mod = proj.modules.find((m) => m.id === selModuleId) ?? proj.modules[0] ?? null;
    if ((mod?.id ?? null) !== selModuleId) setSelModuleId(mod?.id ?? null);
    const tc = mod?.test_cases.find((c) => c.id === selCaseId) ?? mod?.test_cases[0] ?? null;
    if ((tc?.id ?? null) !== selCaseId) setSelCaseId(tc?.id ?? null);
    if (requested) setRequestedProjectId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, requestedProjectId]);

  useEffect(() => {
    if (!selProject) return;
    setPd({ name: selProject.name, description: selProject.description, status: selProject.status, tags: tagsToCSV(selProject.tags) });
  }, [selProject?.id]);

  useEffect(() => {
    if (!selModule) return;
    setMd({ name: selModule.name, description: selModule.description, status: selModule.status, tags: tagsToCSV(selModule.tags) });
  }, [selModule?.id]);

  useEffect(() => {
    if (!selCase) return;
    setCd({
      name: selCase.name, description: selCase.description, status: selCase.status,
      testType: selCase.test_type, priority: selCase.priority,
      executionMode: selCase.execution_mode, platforms: selCase.platforms,
      tags: tagsToCSV(selCase.tags), vars: JSON.stringify(selCase.default_variables ?? {}, null, 2),
    });
    setEditorMode('case');
  }, [selCase?.id]);

  const allSteps      = projects.flatMap((p) => p.modules.flatMap((m) => m.test_cases.flatMap((c) => c.test_steps)));
  const pageOptions   = uniqueSorted(allSteps.map(stepPage));
  const elemOptions   = uniqueSorted(allSteps.map(stepElement));
  const locByElem     = new Map(allSteps.map((s) => [stepElement(s), stepLocator(s)] as const).filter(([e, l]) => e && l));
  const totalModules  = projects.reduce((s, p) => s + p.modules.length, 0);
  const totalCases    = projects.reduce((s, p) => p.modules.reduce((ms, m) => ms + m.test_cases.length, s), 0);
  const totalSteps    = projects.reduce((s, p) => p.modules.reduce((ms, m) => m.test_cases.reduce((cs, c) => cs + c.test_steps.length, ms), s), 0);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function selectProject(p: TestProject) {
    setSelProjectId(p.id); toggleExpand(p.id); setEditorMode('project');
  }

  function selectModule(m: TestModule) {
    setSelModuleId(m.id);
    setSelCaseId(m.test_cases[0]?.id ?? null);
    setEditorMode('module');
  }

  function selectCase(c: TestCase) {
    setSelCaseId(c.id);
    setEditorMode('case');
  }

  function doUpdateStep(step: TestStep, u: StepUpdates) {
    updateAnyStep.mutate({ stepId: step.id, input: buildPayload(step, u) });
  }

  function doMoveStep(step: TestStep, dir: -1 | 1) {
    if (!selCase) return;
    const sorted = [...selCase.test_steps].sort((a, b) => a.step_order - b.step_order);
    const idx = sorted.findIndex((s) => s.id === step.id);
    const si = idx + dir;
    if (idx < 0 || si < 0 || si >= sorted.length) return;
    const other = sorted[si];
    updateAnyStep.mutate({ stepId: step.id, input: { step_order: other.step_order } });
    updateAnyStep.mutate({ stepId: other.id, input: { step_order: step.step_order } });
  }

  function doDeleteStep(step: TestStep) {
    if (window.confirm(`Delete step "${step.name}"?`)) deleteStepHook.mutate(step.id);
  }

  function addStep(after?: TestStep) {
    if (!selCase) return;
    const order = after ? after.step_order + 1 : selCase.test_steps.length + 1;
    createStep.mutate({
      name: `Step ${order}`, description: '', step_order: order, intent: 'CLICK', target: '',
      input_value: '', expected_result: '', test_data: { value: '', action_type: 'CLICK' },
      tags: ['configured'], bindings: { web: { page:'', element_name:'', selector:'', xpath:'' } }, is_enabled: true,
    });
  }

  function saveEditor() {
    setValidationError(null);
    if (editorMode === 'project' && selProject) {
      updateProject.mutate({ name: pd.name, description: pd.description, status: pd.status, tags: csvToTags(pd.tags) });
    } else if (editorMode === 'module' && selModule) {
      updateModule.mutate({ name: md.name, description: md.description, status: md.status, tags: csvToTags(md.tags) });
    } else if (editorMode === 'case' && selCase) {
      try {
        const vars = JSON.parse(cd.vars);
        updateCase.mutate({ name: cd.name, description: cd.description, status: cd.status, test_type: cd.testType, priority: cd.priority, execution_mode: cd.executionMode, platforms: cd.platforms, tags: csvToTags(cd.tags), default_variables: vars });
      } catch { setValidationError('Default variables must be valid JSON.'); }
    }
  }

  function deleteEditor() {
    if (editorMode === 'project' && selProject && window.confirm(`Delete project "${selProject.name}"?`)) { deleteProject.mutate(selProject.id); }
    else if (editorMode === 'module' && selModule && window.confirm(`Delete module "${selModule.name}"?`)) { deleteModule.mutate(selModule.id); }
    else if (editorMode === 'case' && selCase && window.confirm(`Delete case "${selCase.name}"?`)) { deleteCase.mutate(selCase.id); }
  }

  const catPlatforms  = tagCatalog.find((d) => d.key === 'platform')?.values       ?? ['web','android','ios','windows','api'];
  const catTypes      = tagCatalog.find((d) => d.key === 'test_type')?.values      ?? ['functional','smoke','regression'];
  const catPriorities = tagCatalog.find((d) => d.key === 'priority')?.values       ?? ['p0','p1','p2'];
  const catModes      = tagCatalog.find((d) => d.key === 'execution_mode')?.values ?? ['automated','manual','hybrid'];
  const filteredCases = selModule?.test_cases.filter((c) => !caseSearch || c.name.toLowerCase().includes(caseSearch.toLowerCase())) ?? [];
  const sortedSteps   = selCase ? [...selCase.test_steps].sort((a, b) => a.step_order - b.step_order) : [];

  const INP = 'w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)] placeholder:text-[var(--color-fg-subtle)]';
  const LBL = 'text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)] mb-1.5 block';

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="shrink-0 border-b border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-6 py-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Authoring Workspace</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--color-fg-default)]">Test Configuration</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Stats */}
            {[
              { icon: Package,    label: 'Projects', value: projects.length, color: '#5b8cff' },
              { icon: Layers3,    label: 'Modules',  value: totalModules,    color: '#a195ff' },
              { icon: TestTube,   label: 'Cases',    value: totalCases,      color: '#45c08a' },
              { icon: ListChecks, label: 'Steps',    value: totalSteps,      color: '#4dd1e1' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex items-center gap-2 rounded-lg border px-3 py-1.5"
                style={{ borderColor: `${color}25`, background: `${color}0a` }}>
                <Icon size={12} style={{ color }} />
                <span className="font-mono text-sm font-semibold" style={{ color }}>{value}</span>
                <span className="text-[10px] text-[var(--color-fg-subtle)]">{label}</span>
              </div>
            ))}

            {/* Actions */}
            <div className="flex items-center gap-1.5 border-l border-[var(--color-line-default)] pl-3">
              <Button variant="glass" size="sm"
                onClick={() => createProject.mutate(
                  { name: `Project ${projects.length + 1}`, description: 'Execution-ready test catalog.', status: 'active', tags: ['new'] },
                  { onSuccess: (p) => { setSelProjectId(p.id); setExpandedIds((prev) => new Set([...prev, p.id])); setEditorMode('project'); } },
                )}>
                <Plus size={11} /> Project
              </Button>
              <Button variant="glass" size="sm" disabled={!selProject}
                onClick={() => selProject && createModule.mutate(
                  { name: `Module ${selProject.modules.length + 1}`, description: '', status: 'active', tags: [] },
                  { onSuccess: (m) => { setSelModuleId(m.id); setEditorMode('module'); } },
                )}>
                <Plus size={11} /> Module
              </Button>
              <Button variant="glass" size="sm" disabled={!selModule}
                onClick={() => selModule && createCase.mutate(
                  { name: `Test Case ${selModule.test_cases.length + 1}`, description: '', status: 'draft', test_type: 'functional', priority: 'p2', execution_mode: 'automated', platforms: ['web'], tags: ['new'], default_variables: {} },
                  { onSuccess: (c) => { setSelCaseId(c.id); setEditorMode('case'); } },
                )}>
                <Plus size={11} /> Case
              </Button>
              <Button variant="neon" size="sm" disabled={!selCase} onClick={() => addStep()}>
                <Plus size={11} /> Step
              </Button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {validationError && (
            <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
              className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
              {validationError}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Workflow progress strip ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] px-6 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {([
            { label: '① Test Cases', href: '/test-configuration', active: true  },
            { label: '② Pages & Elements', href: '/page-repository', active: false },
            { label: '③ Test Steps', href: '/test-configuration', active: false  },
            { label: '④ Architecture', href: '/architecture', active: false       },
            { label: '⑤ Execution', href: '/executions', active: false            },
          ] as const).map((s, i, arr) => (
            <span key={s.label} className="flex items-center gap-1 shrink-0">
              <Link href={s.href}
                className={[
                  'rounded px-2.5 py-1 text-[10px] font-mono transition-colors',
                  s.active
                    ? 'bg-[rgba(91,140,255,0.15)] text-[#5b8cff] border border-[rgba(91,140,255,0.3)]'
                    : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-default)] hover:bg-[var(--color-surface-2)]',
                ].join(' ')}>
                {s.label}
              </Link>
              {i < arr.length - 1 && <span className="text-[var(--color-fg-subtle)] text-[10px]">›</span>}
            </span>
          ))}
        </div>
      </div>

      {/* ── 3-Column layout ────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Col 1 — Project Tree */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
          <div className="flex items-center gap-2 border-b border-[var(--color-line-subtle)] px-4 py-2.5 shrink-0">
            <FolderOpen size={13} className="text-[var(--color-accent-default)]" />
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Projects</span>
            <span className="ml-auto text-[10px] font-mono text-[var(--color-fg-subtle)]">{projects.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {isLoading && <p className="px-3 py-6 text-center text-xs text-[var(--color-fg-subtle)]">Loading…</p>}
            {!isLoading && projects.length === 0 && (
              <div className="rounded-lg border border-dashed border-[var(--color-line-default)] px-3 py-8 text-center">
                <p className="text-xs text-[var(--color-fg-subtle)]">No projects yet</p>
                <p className="mt-1 text-[10px] text-[var(--color-fg-subtle)]/60">Create one above</p>
              </div>
            )}

            {projects.map((proj) => {
              const expanded = expandedIds.has(proj.id);
              const active   = proj.id === selProjectId;
              return (
                <div key={proj.id}>
                  <button onClick={() => selectProject(proj)}
                    className={[
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all',
                      active ? 'bg-[rgba(91,140,255,0.1)]' : 'hover:bg-[rgba(255,255,255,0.03)]',
                    ].join(' ')}>
                    {expanded
                      ? <ChevronDown size={11} className="shrink-0 text-[var(--color-fg-subtle)]" />
                      : <ChevronRight size={11} className="shrink-0 text-[var(--color-fg-subtle)]" />}
                    <span className={`flex-1 truncate text-[12px] font-medium ${active ? 'text-[var(--color-fg-default)]' : 'text-[var(--color-fg-muted)]'}`}>{proj.name}</span>
                    <span className="shrink-0 text-[9px] font-mono text-[var(--color-fg-subtle)]">{proj.modules.length}m</span>
                  </button>

                  <AnimatePresence>
                    {expanded && (
                      <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
                        transition={{ duration: 0.18 }} className="overflow-hidden">
                        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[var(--color-line-subtle)] pl-2 pb-1">
                          {proj.modules.length === 0
                            ? <p className="py-2 pl-1 text-[10px] text-[var(--color-fg-subtle)]">No modules</p>
                            : proj.modules.map((mod) => {
                              const ma = mod.id === selModuleId;
                              return (
                                <button key={mod.id}
                                  onClick={() => { setSelProjectId(proj.id); selectModule(mod); }}
                                  className={[
                                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all',
                                    ma ? 'bg-[rgba(161,149,255,0.12)] text-[#a195ff]' : 'hover:bg-[rgba(255,255,255,0.03)] text-[var(--color-fg-subtle)]',
                                  ].join(' ')}>
                                  <Layers3 size={10} className="shrink-0" />
                                  <span className="flex-1 truncate text-[11px]">{mod.name}</span>
                                  <span className="shrink-0 text-[9px] font-mono opacity-50">{mod.test_cases.length}c</span>
                                </button>
                              );
                            })
                          }
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Col 2 — Cases + Step Table */}
        <div className="flex min-h-0 flex-1 flex-col border-r border-[var(--color-line-default)] overflow-hidden">

          {/* Cases top half */}
          <div className="flex flex-col border-b border-[var(--color-line-default)] overflow-hidden" style={{ flex: '0 0 40%' }}>
            <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)] px-4 py-2 shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={13} className="text-[#5b8cff]" />
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                  {selModule ? selModule.name : 'Select a module'}
                </span>
                {selModule && <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">· {selModule.test_cases.length}</span>}
              </div>
              {selModule && (
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
                  <input value={caseSearch} onChange={(e) => setCaseSearch(e.target.value)} placeholder="Filter…"
                    className="rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] pl-7 pr-3 py-1 text-[11px] text-[var(--color-fg-default)] outline-none focus:border-[var(--color-accent-default)] transition-colors" />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {!selModule
                ? <p className="py-8 text-center text-xs text-[var(--color-fg-subtle)]">Select a module from the project tree</p>
                : filteredCases.length === 0
                  ? <p className="py-8 text-center text-xs text-[var(--color-fg-subtle)]">{caseSearch ? 'No matching cases' : 'No test cases — create one above'}</p>
                  : (
                    <div className="grid gap-2 grid-cols-1 xl:grid-cols-2">
                      {filteredCases.map((tc) => (
                        <CaseCard key={tc.id} tc={tc} isSelected={tc.id === selCaseId} onClick={() => selectCase(tc)} />
                      ))}
                    </div>
                  )
              }
            </div>
          </div>

          {/* Step table bottom half */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)] px-4 py-2 shrink-0">
              <div className="flex items-center gap-2">
                <ListChecks size={13} className="text-[#45c08a]" />
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                  {selCase ? selCase.name : 'Select a test case'}
                </span>
                {selCase && <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">· {selCase.test_steps.length} steps</span>}
              </div>
              {selCase && (
                <Button variant="glass" size="xs" onClick={() => addStep()}>
                  <Plus size={10} /> Add step
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {!selCase
                ? <p className="py-12 text-center text-xs text-[var(--color-fg-subtle)]">Choose a test case to edit its steps inline</p>
                : sortedSteps.length === 0
                  ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <p className="text-xs text-[var(--color-fg-subtle)]">No steps yet</p>
                      <Button variant="neon" size="sm" className="mt-3" onClick={() => addStep()}>
                        <Plus size={11} /> Add first step
                      </Button>
                    </div>
                  )
                  : (
                    <table className="w-full border-collapse" style={{ minWidth: 1180 }}>
                      <thead className="sticky top-0 z-10" style={{ background: 'var(--color-surface-1)' }}>
                        <tr className="border-b border-[var(--color-line-default)]">
                          {['#','Description','Action','Page','Element','Paths / Location','Value / Assertion','2nd','',''].map((h, i) => (
                            <th key={i} className="px-2 py-2 text-left font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)] border-r border-[var(--color-line-subtle)] last:border-r-0">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSteps.map((step, i) => (
                          <StepRow
                            key={step.id} step={step} index={i}
                            isFirst={i === 0} isLast={i === sortedSteps.length - 1}
                            onAddAfter={() => addStep(step)}
                            onMoveUp={() => doMoveStep(step, -1)}
                            onMoveDown={() => doMoveStep(step, 1)}
                            onDelete={() => doDeleteStep(step)}
                            onUpdate={(u) => doUpdateStep(step, u)}
                            pageOptions={pageOptions} elementOptions={elemOptions} locatorByElement={locByElem}
                            pageRepo={pageRepo}
                          />
                        ))}
                        <tr>
                          <td colSpan={10} className="py-2 px-3">
                            <button onClick={() => addStep(sortedSteps[sortedSteps.length - 1])}
                              className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-default)] transition-colors">
                              <Plus size={9} /> Add step
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )
              }
            </div>
          </div>
        </div>

        {/* Col 3 — Detail Editor + Tag Catalog */}
        <aside className="flex w-80 shrink-0 flex-col border-[var(--color-line-default)] bg-[var(--color-surface-1)] xl:w-96">
          <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)] px-4 py-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={13} className="text-[#45c08a]" />
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                {editorMode === 'project' ? 'Project' : editorMode === 'module' ? 'Module' : 'Test Case'} Editor
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="xs" onClick={deleteEditor}><Trash2 size={10} /> Del</Button>
              <Button variant="neon" size="xs" onClick={saveEditor}><Save size={10} /> Save</Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {editorMode === 'project' && selProject && (
              <div className="space-y-3">
                <div><label className={LBL}>Name</label><input value={pd.name} onChange={(e) => setPd((d) => ({ ...d, name: e.target.value }))} className={INP} placeholder="Project name" /></div>
                <div><label className={LBL}>Status</label>
                  <select value={pd.status} onChange={(e) => setPd((d) => ({ ...d, status: e.target.value }))} className={INP}>
                    {['active','draft','archived'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className={LBL}>Tags</label><input value={pd.tags} onChange={(e) => setPd((d) => ({ ...d, tags: e.target.value }))} className={INP} placeholder="commerce, release" /></div>
                <div><label className={LBL}>Description</label><textarea value={pd.description} onChange={(e) => setPd((d) => ({ ...d, description: e.target.value }))} className={`${INP} min-h-24 resize-y`} placeholder="What this project covers" /></div>
              </div>
            )}

            {editorMode === 'module' && selModule && (
              <div className="space-y-3">
                <div><label className={LBL}>Name</label><input value={md.name} onChange={(e) => setMd((d) => ({ ...d, name: e.target.value }))} className={INP} placeholder="Module name" /></div>
                <div><label className={LBL}>Status</label>
                  <select value={md.status} onChange={(e) => setMd((d) => ({ ...d, status: e.target.value }))} className={INP}>
                    {['active','draft','archived'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className={LBL}>Tags</label><input value={md.tags} onChange={(e) => setMd((d) => ({ ...d, tags: e.target.value }))} className={INP} placeholder="checkout, payments" /></div>
                <div><label className={LBL}>Description</label><textarea value={md.description} onChange={(e) => setMd((d) => ({ ...d, description: e.target.value }))} className={`${INP} min-h-24 resize-y`} placeholder="What this module covers" /></div>
              </div>
            )}

            {editorMode === 'case' && selCase && (
              <div className="space-y-3">
                <div><label className={LBL}>Name</label><input value={cd.name} onChange={(e) => setCd((d) => ({ ...d, name: e.target.value }))} className={INP} placeholder="Case name" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={LBL}>Status</label>
                    <select value={cd.status} onChange={(e) => setCd((d) => ({ ...d, status: e.target.value }))} className={INP}>
                      {['draft','active','deprecated'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label className={LBL}>Priority</label>
                    <select value={cd.priority} onChange={(e) => setCd((d) => ({ ...d, priority: e.target.value }))} className={INP}>
                      {catPriorities.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div><label className={LBL}>Type</label>
                    <select value={cd.testType} onChange={(e) => setCd((d) => ({ ...d, testType: e.target.value }))} className={INP}>
                      {catTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={LBL}>Mode</label>
                    <select value={cd.executionMode} onChange={(e) => setCd((d) => ({ ...d, executionMode: e.target.value }))} className={INP}>
                      {catModes.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={LBL}>Platforms</label>
                  <div className="flex flex-wrap gap-1.5">
                    {catPlatforms.map((p) => {
                      const active = cd.platforms.includes(p);
                      return (
                        <button key={p} onClick={() => setCd((d) => ({ ...d, platforms: active ? d.platforms.filter((x) => x !== p) : [...d.platforms, p] }))}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-mono transition-all ${active ? 'border-[rgba(91,140,255,0.5)] bg-[rgba(91,140,255,0.12)] text-[#5b8cff]' : 'border-[var(--color-line-default)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-default)]'}`}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div><label className={LBL}>Tags</label><input value={cd.tags} onChange={(e) => setCd((d) => ({ ...d, tags: e.target.value }))} className={INP} placeholder="smoke, checkout" /></div>
                <div><label className={LBL}>Description</label><textarea value={cd.description} onChange={(e) => setCd((d) => ({ ...d, description: e.target.value }))} className={`${INP} min-h-20 resize-y`} placeholder="Business path under test" /></div>
                <div><label className={LBL}>Default Variables (JSON)</label><textarea value={cd.vars} onChange={(e) => setCd((d) => ({ ...d, vars: e.target.value }))} className={`${INP} min-h-24 resize-y font-mono text-xs`} placeholder='{"baseUrl":"https://…"}' /></div>
              </div>
            )}

            {!selProject && !isLoading && (
              <div className="flex h-40 items-center justify-center text-xs text-[var(--color-fg-subtle)]">
                Create or select a project to start
              </div>
            )}
          </div>

          {tagCatalog.length > 0 && (
            <div className="shrink-0 border-t border-[var(--color-line-subtle)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Tag size={12} className="text-[#f0b558]" />
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Tag Catalog</span>
              </div>
              <div className="space-y-2.5">
                {tagCatalog.map((dim) => (
                  <div key={dim.key}>
                    <p className="mb-1.5 text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">{dim.label}</p>
                    <div className="flex flex-wrap gap-1">
                      {dim.values.map((v) => (
                        <button key={v}
                          className="rounded-full border border-[var(--color-line-default)] px-2 py-0.5 text-[10px] font-mono text-[var(--color-fg-subtle)] transition-colors hover:border-[var(--color-accent-default)] hover:text-[var(--color-fg-default)]">
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
