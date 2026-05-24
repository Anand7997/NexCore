'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  Circle,
  ClipboardList,
  Code2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  Globe,
  ListChecks,
  Loader2,
  MousePointerClick,
  Play,
  Radio,
  RefreshCw,
  Route,
  Search,
  Settings2,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Target,
  Upload,
  Wand2,
  Zap,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  extractAIBrdFile,
  useAIModels,
  useAIWorkflow,
  useAIWorkflowReview,
  useConfirmScenarios,
  useCreateAIWorkflow,
  useGenerateScenarios,
  useGenerateTestCases,
} from '@/lib/api/aiWorkflow';
import type {
  AIModelInfo,
  AIScenarioPreview,
  AIScrapedCandidatePreview,
  AIWorkflowState,
  AIWorkflowStateResponse,
} from '@/lib/api/types';

// ── Constants ──────────────────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  { id: 'input', label: 'Input', icon: FileText, desc: 'BRD + URL' },
  { id: 'model', label: 'Model', icon: Bot, desc: 'Select AI' },
  { id: 'scenarios', label: 'Scenarios', icon: ClipboardList, desc: 'Select tests' },
  { id: 'generation', label: 'Test Gen', icon: Wand2, desc: 'Generate' },
  { id: 'discovery', label: 'Binding', icon: Globe, desc: 'Scrape + pick' },
  { id: 'review', label: 'Review', icon: CheckCircle2, desc: 'Results' },
] as const;

type StepId = (typeof WORKFLOW_STEPS)[number]['id'];

const PIPELINE_STAGES = [
  { id: 'project', no: 1, label: 'Creating Project', icon: BookOpen, desc: 'Prepare project workspace' },
  { id: 'module', no: 2, label: 'Creating Module', icon: ClipboardList, desc: 'Attach module context' },
  { id: 'model', no: 3, label: 'Selecting LLM', icon: Bot, desc: 'Choose provider and model' },
  { id: 'testcases', no: 4, label: 'Generating Test Cases', icon: FileText, desc: 'Build scenario test coverage' },
  { id: 'teststeps', no: 5, label: 'Generating Test Steps', icon: Play, desc: 'Draft executable step flow' },
  { id: 'page', no: 6, label: 'Creating Page', icon: Globe, desc: 'Create Page Repository entry' },
  { id: 'mcp', no: 7, label: 'Triggering MCP', icon: Sparkles, desc: 'Start browser scraping' },
  { id: 'scrape', no: 8, label: 'Scrape Candidate Panel', icon: Search, desc: 'Store raw candidates first' },
  { id: 'pageConfig', no: 9, label: 'Configuring Page', icon: Target, desc: 'Save useful elements and XPath' },
  { id: 'stepConfig', no: 10, label: 'Configuring Test Steps', icon: Settings2, desc: 'Bind page, element, action' },
] as const;

type PipelineStageId = (typeof PIPELINE_STAGES)[number]['id'];
type PipelineStatus = 'queued' | 'active' | 'complete' | 'failed';

const PRIORITY_COLOR: Record<string, string> = {
  high: 'text-red-400 bg-red-500/10 border-red-500/25',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
};

const TEST_TYPE_COLOR: Record<string, string> = {
  functional: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
  regression: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
  smoke: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  e2e: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
};

const CLASS_COLOR: Record<string, string> = {
  positive: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  negative: 'text-red-400 bg-red-500/10 border-red-500/25',
  edge: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
};

const TIER_COLOR: Record<string, string> = {
  fast: 'text-emerald-400',
  balanced: 'text-blue-400',
  best: 'text-purple-400',
};

const ORCHESTRATOR_STATUSES = [
  { label: 'Discover', tone: 'cyan' },
  { label: 'Plan', tone: 'violet' },
  { label: 'Bind', tone: 'emerald' },
] as const;

const MCP_PHASES = [
  { id: 'trigger', no: '01', label: 'Panel Live', desc: 'Open MCP telemetry', icon: Radio },
  { id: 'scrape', no: '02', label: 'Scraping', desc: 'Collect raw elements', icon: Activity },
  { id: 'xpaths', no: '03', label: 'XPath Sweep', desc: 'Extract locator paths', icon: Route },
  { id: 'rank', no: '04', label: 'Best Pick', desc: 'Match steps to elements', icon: SlidersHorizontal },
  { id: 'save', no: '05', label: 'Page Config', desc: 'Save useful elements', icon: Database },
  { id: 'configure', no: '06', label: 'Step Bind', desc: 'Wire actions and XPath', icon: ListChecks },
] as const;

type McpPhaseId = (typeof MCP_PHASES)[number]['id'];

const MCP_WAITING_SIGNALS = [
  'Opening MCP browser context and warming the page session',
  'Reading DOM landmarks, ARIA roles, labels, and visible controls',
  'Extracting XPath, CSS, IDs, placeholders, and text anchors',
  'Scoring locator stability before anything reaches Page Repository',
  'Holding raw scrape candidates in preview while test steps decide what matters',
] as const;

const MODEL_CAPABILITIES: Record<string, { speed: number; quality: number; cost: number }> = {
  fast: { speed: 95, quality: 72, cost: 92 },
  balanced: { speed: 72, quality: 88, cost: 70 },
  best: { speed: 48, quality: 98, cost: 40 },
};

const LLM_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', icon: Sparkles },
  { id: 'anthropic', label: 'Anthropic', icon: Bot },
] as const;

const TEXT_BRD_EXTENSIONS = ['.txt', '.md', '.markdown', '.text'];
const DOCX_BRD_EXTENSIONS = ['.docx'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function stateToStep(state: AIWorkflowState): StepId {
  if (['CREATED', 'PROJECT_READY'].includes(state)) return 'input';
  if (state === 'MODULE_READY') return 'model';
  if (['SCENARIOS_GENERATING', 'SCENARIOS_READY', 'AWAITING_CONFIRMATION'].includes(state)) return 'scenarios';
  if (['TESTCASES_GENERATING', 'TESTCASES_READY'].includes(state)) return 'generation';
  if (['PAGE_CREATED', 'DISCOVERY_RUNNING', 'DISCOVERY_DONE', 'LOCATORS_RANKED', 'PAGE_SAVED'].includes(state)) return 'discovery';
  if (['REVIEW_READY', 'COMPLETED'].includes(state)) return 'review';
  return 'input';
}

function isPollingState(state: AIWorkflowState): boolean {
  return ['CREATED', 'PROJECT_READY', 'MODULE_READY', 'PAGE_CREATED',
    'DISCOVERY_RUNNING', 'DISCOVERY_DONE', 'LOCATORS_RANKED',
    'SCENARIOS_GENERATING', 'TESTCASES_GENERATING'].includes(state);
}

function hasDiscoveryPanelActivity(wf: AIWorkflowStateResponse | undefined): boolean {
  if (!wf) return false;
  return [
    'PAGE_CREATED',
    'DISCOVERY_RUNNING',
    'DISCOVERY_DONE',
    'LOCATORS_RANKED',
    'PAGE_SAVED',
    'REVIEW_READY',
    'COMPLETED',
  ].includes(wf.state) || (wf.scraped_candidates?.length ?? 0) > 0 || (wf.selected_elements?.length ?? 0) > 0;
}

function activePipelineStage(wf: AIWorkflowStateResponse | undefined): PipelineStageId {
  if (!wf) return 'project';
  const message = (wf.current_message || '').toLowerCase();
  if (wf.state === 'CREATED') return 'project';
  if (wf.state === 'PROJECT_READY') return 'module';
  if (['MODULE_READY', 'SCENARIOS_GENERATING', 'SCENARIOS_READY', 'AWAITING_CONFIRMATION'].includes(wf.state)) {
    return 'model';
  }
  if (wf.state === 'TESTCASES_GENERATING') {
    return message.includes('step') || wf.teststeps_created > 0 ? 'teststeps' : 'testcases';
  }
  if (wf.state === 'TESTCASES_READY') return 'teststeps';
  if (wf.state === 'PAGE_CREATED') return 'page';
  if (wf.state === 'DISCOVERY_RUNNING') return 'mcp';
  if (wf.state === 'DISCOVERY_DONE') return 'scrape';
  if (wf.state === 'LOCATORS_RANKED') return 'pageConfig';
  if (wf.state === 'PAGE_SAVED') {
    return message.includes('configur') || message.includes('bound') ? 'stepConfig' : 'pageConfig';
  }
  if (['REVIEW_READY', 'COMPLETED'].includes(wf.state)) return 'stepConfig';
  return 'project';
}

function pipelineStageStatus(stageId: PipelineStageId, wf: AIWorkflowStateResponse | undefined): PipelineStatus {
  if (!wf) return 'queued';
  const active = activePipelineStage(wf);
  const activeIdx = PIPELINE_STAGES.findIndex((stage) => stage.id === active);
  const stageIdx = PIPELINE_STAGES.findIndex((stage) => stage.id === stageId);
  if (wf.state === 'FAILED') {
    if (stageId === active) return 'failed';
    return stageIdx < activeIdx ? 'complete' : 'queued';
  }
  if (wf.state === 'COMPLETED' || wf.state === 'REVIEW_READY') return 'complete';
  if (stageId === active) return 'active';
  return stageIdx < activeIdx ? 'complete' : 'queued';
}

function pipelineStageDetail(
  stageId: PipelineStageId,
  wf: AIWorkflowStateResponse | undefined,
  selectedModel: AIModelInfo | null,
): string {
  if (!wf) {
    return stageId === 'project' ? 'Waiting for BRD, URL, project, module, and page name' : 'Queued';
  }
  switch (stageId) {
    case 'project':
      return wf.project_id ? 'Project record is ready' : 'Creating project workspace';
    case 'module':
      return wf.module_id ? 'Module record is ready' : 'Preparing module for generated cases';
    case 'model':
      return selectedModel
        ? `${selectedModel.display_name} selected`
        : wf.scenarios.length > 0
          ? 'Model completed scenario generation'
          : 'Waiting for OpenAI or Anthropic model';
    case 'testcases':
      return wf.testcases_created > 0 ? `${wf.testcases_created} test case draft(s)` : 'Converting selected scenarios';
    case 'teststeps':
      return wf.teststeps_created > 0 ? `${wf.teststeps_created} test step draft(s)` : 'Creating action-by-action steps';
    case 'page':
      return wf.page_id ? `${wf.page_name || 'Page'} created` : 'Page Repository entry pending';
    case 'mcp':
      return wf.state === 'DISCOVERY_RUNNING' ? wf.current_message : 'Browser scraping trigger queued';
    case 'scrape':
      return `${wf.scraped_candidates.length} raw scraped candidate(s) in panel`;
    case 'pageConfig':
      return wf.elements_saved > 0
        ? `${wf.elements_saved} useful element(s) saved with XPath`
        : `${wf.selected_elements.length} useful candidate(s) selected`;
    case 'stepConfig': {
      const mapped = Math.max((wf.teststeps_created ?? 0) - (wf.unmapped_steps ?? 0), 0);
      return wf.teststeps_created > 0
        ? `${mapped}/${wf.teststeps_created} step(s) configured`
        : 'Selecting page, element, action, and XPath';
    }
  }
}

function shouldShowMcpMissionPanel(wf: AIWorkflowStateResponse | undefined): boolean {
  if (!wf) return false;
  return hasDiscoveryPanelActivity(wf);
}

function activeMcpPhase(wf: AIWorkflowStateResponse | undefined): McpPhaseId {
  if (!wf) return 'trigger';
  const message = (wf.current_message || '').toLowerCase();
  if (wf.state === 'PAGE_CREATED') return 'trigger';
  if (wf.state === 'DISCOVERY_RUNNING') return 'scrape';
  if (wf.state === 'DISCOVERY_DONE') return 'xpaths';
  if (wf.state === 'LOCATORS_RANKED') return 'rank';
  if (wf.state === 'PAGE_SAVED') return message.includes('configur') || message.includes('bound') ? 'configure' : 'save';
  if (['REVIEW_READY', 'COMPLETED'].includes(wf.state)) return 'configure';
  return 'trigger';
}

function mcpPhaseStatus(phaseId: McpPhaseId, wf: AIWorkflowStateResponse | undefined): PipelineStatus {
  if (!shouldShowMcpMissionPanel(wf)) return 'queued';
  const active = activeMcpPhase(wf);
  const activeIdx = MCP_PHASES.findIndex((phase) => phase.id === active);
  const phaseIdx = MCP_PHASES.findIndex((phase) => phase.id === phaseId);
  if (wf?.state === 'FAILED') return phaseId === active ? 'failed' : phaseIdx < activeIdx ? 'complete' : 'queued';
  if (['REVIEW_READY', 'COMPLETED'].includes(wf?.state ?? '') || (wf?.state === 'PAGE_SAVED' && active === 'configure')) {
    return phaseIdx <= activeIdx ? 'complete' : 'queued';
  }
  if (phaseId === active) return 'active';
  return phaseIdx < activeIdx ? 'complete' : 'queued';
}

function workflowStateReachedMcpPhase(wf: AIWorkflowStateResponse | undefined, phaseId: McpPhaseId): boolean {
  if (!wf) return false;
  const phaseIdx = MCP_PHASES.findIndex((phase) => phase.id === phaseId);
  const activeIdx = MCP_PHASES.findIndex((phase) => phase.id === activeMcpPhase(wf));
  return activeIdx >= phaseIdx;
}

function locatorQualityNumber(candidate: AIScrapedCandidatePreview): number {
  const raw = candidate.locator_quality;
  if (typeof raw === 'number') return Math.max(0, Math.min(1, raw));
  if (typeof raw === 'string') {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(1, parsed));
  }
  return Math.max(0, Math.min(1, candidate.confidence_score ?? 0));
}

function locatorText(candidate: AIScrapedCandidatePreview): string {
  return candidate.xpath || candidate.best_locator || candidate.css_selector || 'locator pending';
}

function compactLocator(locator: string, max = 116): string {
  if (locator.length <= max) return locator;
  return `${locator.slice(0, Math.max(max - 16, 12))}...${locator.slice(-12)}`;
}

function mcpPanelProgress(wf: AIWorkflowStateResponse | undefined): number {
  if (!shouldShowMcpMissionPanel(wf)) return 0;
  const activeIdx = MCP_PHASES.findIndex((phase) => phase.id === activeMcpPhase(wf));
  return Math.round(((activeIdx + 1) / MCP_PHASES.length) * 100);
}

function confColor(conf: number): string {
  if (conf >= 0.8) return 'text-emerald-400';
  if (conf >= 0.5) return 'text-amber-400';
  return 'text-red-400';
}

function isPlainTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith('text/') || TEXT_BRD_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function isDocxFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || DOCX_BRD_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${className ?? ''}`}>
      {label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-surface-3 transition-colors">
      {copied
        ? <CheckCircle2 size={11} className="text-emerald-400" />
        : <Copy size={11} className="text-(--color-fg-subtle) hover:text-(--color-fg-muted)" />
      }
    </button>
  );
}

// ── CapabilityBars ─────────────────────────────────────────────────────────────

function CapabilityBars({ tier }: { tier: string }) {
  const caps = MODEL_CAPABILITIES[tier] ?? MODEL_CAPABILITIES.balanced;
  const bars = [
    { label: 'Speed', value: caps.speed, color: 'bg-emerald-500' },
    { label: 'Quality', value: caps.quality, color: 'bg-violet-500' },
    { label: 'Cost eff.', value: caps.cost, color: 'bg-blue-500' },
  ];
  return (
    <div className="space-y-1.5 mt-2">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="text-[9px] text-(--color-fg-subtle) w-12 shrink-0">{b.label}</span>
          <div className="flex-1 h-1 rounded-full bg-surface-3 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${b.color}`}
              initial={{ width: 0 }}
              animate={{ width: `${b.value}%` }}
              transition={{ duration: 0.6, delay: 0.1 }}
            />
          </div>
          <span className="text-[9px] text-(--color-fg-subtle) w-6 text-right tabular-nums">{b.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── ConfidenceRing ─────────────────────────────────────────────────────────────

function ConfidenceRing({ value, size = 32 }: { value: number; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const color = value >= 0.8 ? '#06b6d4' : value >= 0.5 ? '#a78bfa' : '#f59e0b';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        <defs>
          <radialGradient id={`workflow-confidence-glow-${size}`}>
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="80%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r + 2} fill={`url(#workflow-confidence-glow-${size})`} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - value) }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-[9px] font-semibold" style={{ color }}>
        {Math.round(value * 100)}
      </span>
    </div>
  );
}

// ── ConfidenceGauge ────────────────────────────────────────────────────────────

function ConfidenceGauge({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.8 ? 'bg-emerald-500' : value >= 0.5 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-(--color-fg-subtle) truncate max-w-30">{label}</span>
        <span className={`text-[10px] font-medium tabular-nums ${confColor(value)}`}>{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-surface-3 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </div>
  );
}

// ── TokenStream ────────────────────────────────────────────────────────────────

function TokenStream({ message, agentName }: { message: string; agentName?: string }) {
  const [displayed, setDisplayed] = useState('');
  const msgRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!message || message === msgRef.current) return;
    msgRef.current = message;
    if (timerRef.current) clearInterval(timerRef.current);
    let i = 0;
    const target = message;
    timerRef.current = setInterval(() => {
      i += 2;
      setDisplayed(target.slice(0, i));
      if (i >= target.length) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setDisplayed(target);
      }
    }, 12);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [message]);

  return (
    <div className="rounded-xl bg-(--color-surface-1) border border-(--color-line-subtle) overflow-hidden">
      {agentName && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-(--color-line-subtle) bg-(--color-surface-2)">
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
          >
            <Sparkles size={11} className="text-violet-400" />
          </motion.div>
          <span className="text-[10px] font-medium text-violet-300">{agentName}</span>
          <div className="ml-auto flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full bg-violet-400"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="p-4 font-mono text-[11px] text-violet-200 leading-relaxed min-h-20">
        {displayed || <span className="text-(--color-fg-subtle)">Waiting for AI&hellip;</span>}
        {displayed && <span className="animate-pulse text-violet-400">&#x258B;</span>}
      </div>
    </div>
  );
}

type McpNarrationRow = {
  id: string;
  label: string;
  detail: string;
  status: PipelineStatus;
  icon: React.ElementType;
};

function buildMcpNarrationRows(
  wf: AIWorkflowStateResponse | undefined,
  pulseIndex: number,
): McpNarrationRow[] {
  const candidates = wf?.scraped_candidates ?? [];
  const selected = wf?.selected_elements ?? [];
  const raw = candidates.length;
  const picked = selected.length;
  const xpathCandidates = candidates.filter((candidate) => candidate.xpath || candidate.best_locator).length;
  const topLocator = candidates
    .map(locatorText)
    .find((locator) => locator !== 'locator pending');
  const waitingSignal = MCP_WAITING_SIGNALS[pulseIndex % MCP_WAITING_SIGNALS.length];
  const pageName = wf?.page_name || 'target page';

  return [
    {
      id: 'panel-open',
      label: 'MCP panel opened',
      detail: workflowStateReachedMcpPhase(wf, 'trigger')
        ? `Binding telemetry is live for ${pageName}.`
        : 'Waiting for page creation before MCP starts.',
      status: workflowStateReachedMcpPhase(wf, 'trigger') ? 'complete' : 'queued',
      icon: Radio,
    },
    {
      id: 'scrape-started',
      label: raw > 0 ? `Scraped ${raw} element candidates` : 'Scraping started',
      detail: wf?.state === 'DISCOVERY_RUNNING'
        ? waitingSignal
        : raw > 0
          ? 'Raw candidates are parked in preview mode until step matching is done.'
          : wf?.current_message || 'MCP trigger is queued.',
      status: raw > 0 ? 'complete' : mcpPhaseStatus('scrape', wf),
      icon: Search,
    },
    {
      id: 'xpath-sweep',
      label: xpathCandidates > 0 ? `${xpathCandidates} locator paths captured` : 'Extracting XPath paths',
      detail: topLocator
        ? `Strongest visible path: ${compactLocator(topLocator, 96)}`
        : 'XPath and CSS candidates will appear as soon as scraping returns.',
      status: xpathCandidates > 0 ? 'complete' : mcpPhaseStatus('xpaths', wf),
      icon: Route,
    },
    {
      id: 'best-pick',
      label: picked > 0 ? `Picked ${picked} best-fit elements` : 'Picking the best elements',
      detail: picked > 0
        ? 'Generated test steps were compared against labels, roles, text, IDs, and locators.'
        : 'The selector ranker will choose only elements required by generated test steps.',
      status: picked > 0 ? 'complete' : mcpPhaseStatus('rank', wf),
      icon: MousePointerClick,
    },
    {
      id: 'page-config',
      label: (wf?.elements_saved ?? 0) > 0 ? `${wf?.elements_saved} elements saved` : 'Configuring page now',
      detail: (wf?.elements_saved ?? 0) > 0
        ? `${Math.max(raw - (wf?.elements_saved ?? 0), 0)} noisy scrape candidates skipped.`
        : 'Useful elements are being prepared for Page Repository.',
      status: (wf?.elements_saved ?? 0) > 0 ? 'complete' : mcpPhaseStatus('save', wf),
      icon: Database,
    },
    {
      id: 'step-config',
      label: 'Configuring test steps',
      detail: wf?.teststeps_created
        ? `${Math.max(wf.teststeps_created - wf.unmapped_steps, 0)}/${wf.teststeps_created} steps mapped to page, element, action, and XPath.`
        : 'Step bindings will lock in after the selected elements are saved.',
      status: mcpPhaseStatus('configure', wf),
      icon: ListChecks,
    },
  ];
}

function McpMissionControlPanel({
  wf,
  compact = false,
}: {
  wf: AIWorkflowStateResponse | undefined;
  compact?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [pulseIndex, setPulseIndex] = useState(0);
  const candidates = wf?.scraped_candidates ?? [];
  const selected = wf?.selected_elements ?? [];
  const selectedIds = new Set(selected.map((item) => item.candidate_id));
  const isLive = !!wf && isPollingState(wf.state) && wf.state !== 'FAILED';
  const activePhaseId = activeMcpPhase(wf);
  const activePhase = MCP_PHASES.find((phase) => phase.id === activePhaseId) ?? MCP_PHASES[0];
  const panelProgress = mcpPanelProgress(wf);
  const xpathCount = candidates.filter((candidate) => candidate.xpath || candidate.best_locator).length;
  const highQuality = candidates.filter((candidate) => locatorQualityNumber(candidate) >= 0.78).length;
  const latestRows = buildMcpNarrationRows(wf, pulseIndex);
  const rankedCandidates = [...candidates].sort((a, b) => {
    const aSelected = selectedIds.has(a.candidate_id) || a.selected ? 1 : 0;
    const bSelected = selectedIds.has(b.candidate_id) || b.selected ? 1 : 0;
    if (aSelected !== bSelected) return bSelected - aSelected;
    return locatorQualityNumber(b) - locatorQualityNumber(a);
  });
  const visibleCandidates = rankedCandidates.slice(0, compact ? 5 : 10);
  const ActiveIcon = activePhase.icon;

  useEffect(() => {
    if (reducedMotion || !isLive) return;
    const id = window.setInterval(() => {
      setPulseIndex((value) => value + 1);
    }, 2400);
    return () => window.clearInterval(id);
  }, [isLive, reducedMotion]);

  if (!wf) return null;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.28, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#030712] shadow-[0_24px_90px_rgba(0,0,0,0.38),0_0_60px_rgba(6,182,212,0.08)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(circle at 18% 0%, rgba(34,211,238,0.18), transparent 34%), radial-gradient(circle at 86% 12%, rgba(16,185,129,0.12), transparent 30%), linear-gradient(135deg, rgba(15,23,42,0.92), rgba(2,6,23,0.96))',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(34,211,238,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.10) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(circle at 55% 38%, black, transparent 76%)',
        }}
      />
      {isLive && !reducedMotion && (
        <>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-32 bg-linear-to-r from-transparent via-cyan-200/12 to-transparent"
            animate={{ x: ['-120%', '620%'] }}
            transition={{ repeat: Infinity, duration: 2.8, ease: 'linear' }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute right-8 top-8 h-36 w-36 rounded-full border border-cyan-300/15"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 18, ease: 'linear' }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute right-12 top-12 h-28 w-28 rounded-full border border-emerald-300/12"
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 14, ease: 'linear' }}
          />
        </>
      )}

      <div className="relative z-10 p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-100">
                <Zap size={11} />
                MCP Mission Control
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] ${
                isLive
                  ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                  : 'border-white/[0.08] bg-white/[0.035] text-(--color-fg-subtle)'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-emerald-300 animate-pulse' : 'bg-white/30'}`} />
                {isLive ? 'Live scrape telemetry' : wf.state === 'FAILED' ? 'Stopped' : 'Telemetry captured'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]">
                {isLive ? <Loader2 size={17} className="animate-spin" /> : <ActiveIcon size={17} />}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight text-white md:text-xl">MCP is doing the boring scrape work in public</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-(--color-fg-subtle)">
                  {wf.current_message || `Standing by for ${activePhase.label.toLowerCase()}.`}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 lg:w-[360px]">
            {[
              { label: 'Scraped', value: candidates.length, icon: Search, tone: 'text-cyan-200' },
              { label: 'XPath', value: xpathCount, icon: Route, tone: 'text-blue-200' },
              { label: 'Picked', value: selected.length, icon: MousePointerClick, tone: 'text-emerald-200' },
              { label: 'Saved', value: wf.elements_saved ?? 0, icon: Database, tone: 'text-violet-200' },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="min-w-0 rounded-lg border border-white/[0.07] bg-black/25 p-2 text-center">
                  <Icon size={12} className={`mx-auto mb-1 ${metric.tone}`} />
                  <div className={`font-mono text-lg font-bold tabular-nums ${metric.tone}`}>{metric.value}</div>
                  <div className="truncate text-[8px] uppercase tracking-wide text-(--color-fg-subtle)">{metric.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-black/45">
            <motion.div
              className="h-full rounded-full bg-linear-to-r from-cyan-300 via-blue-300 to-emerald-300"
              animate={{ width: `${panelProgress}%` }}
              transition={{ duration: reducedMotion ? 0 : 0.45, ease: 'easeOut' }}
            />
          </div>
          <span className="font-mono text-[10px] tabular-nums text-cyan-100">{panelProgress}%</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-6">
          {MCP_PHASES.map((phase) => {
            const status = mcpPhaseStatus(phase.id, wf);
            const Icon = phase.icon;
            const statusClass =
              status === 'complete' ? 'border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100' :
                status === 'active' ? 'border-cyan-300/35 bg-cyan-300/[0.10] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.10)]' :
                  status === 'failed' ? 'border-red-300/35 bg-red-400/[0.10] text-red-200' :
                    'border-white/[0.06] bg-white/[0.025] text-(--color-fg-subtle)';
            return (
              <div key={phase.id} className={`relative overflow-hidden rounded-lg border px-2.5 py-2 ${statusClass}`}>
                {status === 'active' && isLive && !reducedMotion && (
                  <motion.div
                    aria-hidden
                    className="absolute inset-y-0 w-10 bg-linear-to-r from-transparent via-white/12 to-transparent"
                    animate={{ x: ['-160%', '420%'] }}
                    transition={{ repeat: Infinity, duration: 1.9, ease: 'linear' }}
                  />
                )}
                <div className="relative flex items-center gap-2">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-current/20 bg-black/20">
                    {status === 'complete'
                      ? <CheckCircle2 size={12} />
                      : status === 'active'
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Icon size={12} />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-[8px] opacity-70">{phase.no}</div>
                    <div className="truncate text-[10px] font-semibold leading-tight">{phase.label}</div>
                    <div className="truncate text-[8px] opacity-70">{phase.desc}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={`mt-4 grid gap-3 ${compact ? 'xl:grid-cols-[1fr_1.1fr]' : 'xl:grid-cols-[0.9fr_1.25fr]'}`}>
          <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/25 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-(--color-fg-default)">
                <Cpu size={13} className="text-cyan-200" />
                What MCP is doing
              </div>
              <span className="font-mono text-[9px] text-(--color-fg-subtle)">{activePhase.no} / 06</span>
            </div>
            <div className="divide-y divide-white/[0.055]">
              {latestRows.map((row, index) => {
                const Icon = row.icon;
                const isActive = row.status === 'active';
                const iconClass =
                  row.status === 'complete' ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' :
                    isActive ? 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100' :
                      row.status === 'failed' ? 'border-red-300/35 bg-red-400/10 text-red-200' :
                        'border-white/[0.07] bg-white/[0.025] text-(--color-fg-subtle)';
                return (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reducedMotion ? 0 : index * 0.035 }}
                    className="flex gap-2.5 px-3 py-2.5"
                  >
                    <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${iconClass}`}>
                      {isActive && isLive ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[11px] font-semibold leading-tight ${isActive ? 'text-cyan-100' : 'text-(--color-fg-default)'}`}>
                        {row.label}
                      </div>
                      <div className="mt-0.5 break-words font-mono text-[9px] leading-relaxed text-(--color-fg-subtle)">
                        {row.detail}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/25 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-(--color-fg-default)">
                <Target size={13} className="text-emerald-200" />
                XPath + candidate stream
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[9px] text-(--color-fg-subtle)">
                <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-1.5 py-0.5 text-cyan-100">{highQuality} strong</span>
                <span className="rounded border border-emerald-300/20 bg-emerald-300/10 px-1.5 py-0.5 text-emerald-100">{selected.length} picked</span>
              </div>
            </div>
            {visibleCandidates.length === 0 ? (
              <div className="flex min-h-44 items-center justify-center px-4 py-8 text-center">
                <div>
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                    <Search size={18} className={isLive ? 'animate-pulse' : ''} />
                  </div>
                  <div className="text-xs font-semibold text-(--color-fg-default)">
                    {isLive ? 'MCP scrape is running' : 'Waiting for scrape candidates'}
                  </div>
                  <div className="mx-auto mt-1 max-w-sm text-[10px] leading-relaxed text-(--color-fg-subtle)">
                    {isLive ? MCP_WAITING_SIGNALS[pulseIndex % MCP_WAITING_SIGNALS.length] : 'Candidate rows, XPath, confidence, and picked status will land here.'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_78px] gap-2 border-b border-white/[0.055] bg-[#030712]/95 px-3 py-1.5 font-mono text-[8px] uppercase tracking-wide text-(--color-fg-subtle) backdrop-blur">
                  <div>Element</div>
                  <div>XPath / selector</div>
                  <div className="text-right">Signal</div>
                </div>
                {visibleCandidates.map((candidate, index) => {
                  const isSelected = selectedIds.has(candidate.candidate_id) || candidate.selected;
                  const quality = locatorQualityNumber(candidate);
                  const locator = locatorText(candidate);
                  const hint = candidate.label || candidate.placeholder || candidate.input_type || candidate.element_type;
                  return (
                    <motion.div
                      key={candidate.candidate_id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reducedMotion ? 0 : Math.min(index * 0.025, 0.18) }}
                      className={`grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_78px] gap-2 border-b border-white/[0.045] px-3 py-2 transition-colors ${
                        isSelected ? 'bg-emerald-300/[0.055]' : 'hover:bg-white/[0.025]'
                      }`}
                    >
                      <div className="min-w-0 flex items-start gap-2">
                        <div className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border ${
                          isSelected
                            ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
                            : 'border-white/[0.07] bg-white/[0.025] text-(--color-fg-subtle)'
                        }`}>
                          {isSelected ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-semibold text-(--color-fg-default)">
                            {candidate.name || hint}
                          </div>
                          <div className="truncate text-[9px] text-(--color-fg-subtle)">{hint}</div>
                        </div>
                      </div>
                      <div className="min-w-0 flex items-center gap-1.5">
                        <div className="min-w-0 flex-1 rounded-md border border-cyan-300/10 bg-cyan-300/[0.035] px-2 py-1 font-mono text-[9px] text-cyan-100/80">
                          <span className="block truncate" title={locator}>{compactLocator(locator)}</span>
                        </div>
                        {locator !== 'locator pending' && <CopyButton text={locator} />}
                      </div>
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="text-right">
                          <div className={`font-mono text-[10px] font-semibold tabular-nums ${confColor(quality)}`}>
                            {Math.round(quality * 100)}%
                          </div>
                          <div className="truncate text-[8px] text-(--color-fg-subtle)">
                            {candidate.locator_strategy || 'ranked'}
                          </div>
                        </div>
                        <ConfidenceRing value={quality} size={18} />
                      </div>
                    </motion.div>
                  );
                })}
                {rankedCandidates.length > visibleCandidates.length && (
                  <div className="px-3 py-2 font-mono text-[9px] text-(--color-fg-subtle)">
                    Showing {visibleCandidates.length} of {rankedCandidates.length} candidates in the live stream.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ── Left Panel: 10-stage pipeline ─────────────────────────────────────────────

const PIPELINE_STATUS_STYLE: Record<PipelineStatus, string> = {
  queued: 'border-white/[0.07] bg-white/[0.025] text-(--color-fg-subtle)',
  active: 'border-cyan-400/35 bg-cyan-400/[0.08] text-cyan-200 shadow-[0_0_24px_-14px_rgba(34,211,238,0.9)]',
  complete: 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300',
  failed: 'border-red-400/40 bg-red-500/10 text-red-300',
};

function WorkflowTimeline({
  wf, selectedModel,
}: {
  wf: AIWorkflowStateResponse | undefined; selectedModel: AIModelInfo | null;
}) {
  const activeId = activePipelineStage(wf);
  const activeIdx = PIPELINE_STAGES.findIndex((s) => s.id === activeId);
  return (
    <div className="relative flex flex-col gap-1.5 py-1">
      <div className="absolute left-6 top-8 bottom-8 w-px bg-white/[0.08] z-0" />
      <motion.div
        className="absolute left-6 top-8 w-px bg-linear-to-b from-cyan-300 via-violet-300 to-emerald-300 z-0 origin-top shadow-[0_0_14px_rgba(34,211,238,0.45)]"
        animate={{ height: `${(Math.max(activeIdx, 0) / (PIPELINE_STAGES.length - 1)) * 100}%` }}
        transition={{ duration: 0.4 }}
      />
      {PIPELINE_STAGES.map((step) => {
        const status = pipelineStageStatus(step.id, wf);
        const isActive = status === 'active';
        const isDone = status === 'complete';
        const isError = status === 'failed';
        const Icon = step.icon;
        const detail = pipelineStageDetail(step.id, wf, selectedModel);
        return (
          <div key={step.id} className="relative z-10">
            <motion.div
              layout
              className={`group relative overflow-hidden flex items-start gap-2.5 px-2.5 py-2.5 rounded-xl border transition-all duration-200 ${PIPELINE_STATUS_STYLE[status]}`}
            >
              {isActive && (
                <motion.div
                  className="absolute inset-y-0 w-14 bg-linear-to-r from-transparent via-cyan-200/10 to-transparent"
                  animate={{ x: ['-120%', '420%'] }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                />
              )}
              <div className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 mt-0.5 border ${
                isError ? 'border-red-500/40 bg-red-500/10' :
                  isDone ? 'border-emerald-500/35 bg-emerald-500/10' :
                    isActive ? 'border-cyan-400/45 bg-cyan-400/10 shadow-[0_0_12px_rgba(34,211,238,0.18)]' :
                      'border-white/[0.08] bg-black/20'
              }`}>
                {isError ? <XCircle size={13} /> :
                  isDone ? <CheckCircle2 size={13} /> :
                    isActive ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                        <Loader2 size={13} />
                      </motion.div>
                    ) : <Icon size={13} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[9px] font-mono tabular-nums opacity-70 w-4 shrink-0">{String(step.no).padStart(2, '0')}</span>
                  <div className={`text-[11px] font-semibold leading-tight truncate ${isActive ? 'text-cyan-100' : isDone ? 'text-emerald-200' : isError ? 'text-red-200' : 'text-(--color-fg-muted)'}`}>
                    {step.label}
                  </div>
                </div>
                <div className="text-[9px] text-(--color-fg-subtle) leading-tight mt-0.5 line-clamp-2">
                  {detail || step.desc}
                </div>
                {isActive && wf?.current_message && (
                  <div className="mt-1 text-[9px] font-mono text-cyan-200/80 line-clamp-2">
                    {wf.current_message}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

// ── Right Panel: Live Intelligence ────────────────────────────────────────────

function useCountUp(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = Date.now();
    let rafId: number;
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      setValue(Math.round(target * progress));
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return value;
}

function MetricCard({ label, value, warn, icon: Icon }: {
  label: string; value: number; warn?: boolean; icon: React.ElementType;
}) {
  const display = useCountUp(value);
  return (
    <div className="rounded-xl bg-white/[0.035] border border-white/[0.08] p-2.5 flex flex-col gap-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-1.5">
        <Icon size={9} className={warn && value > 0 ? 'text-amber-400' : 'text-(--color-fg-subtle)'} />
        <span className="text-[9px] text-(--color-fg-subtle) leading-tight">{label}</span>
      </div>
      <span className={`text-lg font-bold tabular-nums ${warn && value > 0 ? 'text-amber-400' : 'text-(--color-fg-default)'}`}>
        {display}
      </span>
    </div>
  );
}

function activityIcon(item: { state: string; message: string }) {
  const text = `${item.state} ${item.message}`.toLowerCase();
  if (item.state === 'FAILED') return XCircle;
  if (item.state === 'COMPLETED' || item.state === 'REVIEW_READY') return CheckCircle2;
  if (text.includes('page')) return Globe;
  if (text.includes('scrap') || text.includes('discover')) return Search;
  if (text.includes('locator') || text.includes('xpath') || text.includes('element')) return Target;
  if (text.includes('scenario')) return ClipboardList;
  if (text.includes('test case')) return FileText;
  if (text.includes('step')) return Play;
  return Circle;
}

function WorkflowActivityFeed({ wf, limit = 10 }: {
  wf: AIWorkflowStateResponse | undefined; limit?: number;
}) {
  const items = (wf?.activity_log ?? []).slice(-limit);
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl bg-(--color-surface-1) border border-(--color-line-subtle) overflow-hidden">
      <div className="px-3 py-2 border-b border-(--color-line-subtle) flex items-center justify-between">
        <div className="text-xs font-semibold text-(--color-fg-muted)">Workflow Activity</div>
        <div className="text-[10px] text-(--color-fg-subtle)">{items.length} latest</div>
      </div>
      <div className="divide-y divide-(--color-line-subtle) max-h-80 overflow-y-auto">
        {items.map((item, index) => {
          const Icon = activityIcon(item);
          const isLatest = index === items.length - 1 && wf ? isPollingState(wf.state) : false;
          const isDone = ['PAGE_SAVED', 'SCENARIOS_READY', 'TESTCASES_READY', 'REVIEW_READY', 'COMPLETED'].includes(item.state);
          return (
            <motion.div
              key={`${item.timestamp}-${index}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-3 py-2.5 flex gap-2.5"
            >
              <div className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${item.state === 'FAILED'
                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                : isLatest
                  ? 'border-violet-500/35 bg-violet-500/10 text-violet-300'
                  : isDone
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                    : 'border-(--color-line-default) bg-(--color-surface-2) text-(--color-fg-subtle)'}`}
              >
                {isLatest ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <div className="text-xs font-medium text-(--color-fg-default) leading-snug">{item.message}</div>
                  <div className="ml-auto text-[9px] text-(--color-fg-subtle) tabular-nums shrink-0">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {item.detail && (
                  <div className="text-[10px] text-(--color-fg-subtle) mt-0.5 leading-relaxed">{item.detail}</div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineFocusCard({ wf, selectedModel }: {
  wf: AIWorkflowStateResponse | undefined; selectedModel: AIModelInfo | null;
}) {
  if (!wf) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.035] p-3">
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/50 to-transparent" />
        <div className="text-[9px] uppercase tracking-[0.18em] text-cyan-200/70">Ready State</div>
        <div className="mt-1 text-[12px] font-semibold text-(--color-fg-default)">Awaiting BRD intake</div>
        <div className="mt-2 text-[10px] leading-relaxed text-(--color-fg-subtle)">
          Drop a requirement document and URL to arm discovery, scenario planning, and locator binding.
        </div>
      </div>
    );
  }
  const activeId = activePipelineStage(wf);
  const activeIndex = PIPELINE_STAGES.findIndex((stage) => stage.id === activeId);
  const activeStage = PIPELINE_STAGES[activeIndex] ?? PIPELINE_STAGES[0];
  const nextStage = PIPELINE_STAGES[activeIndex + 1];
  const Icon = activeStage.icon;
  const detail = pipelineStageDetail(activeStage.id, wf, selectedModel);

  return (
    <div className="rounded-2xl bg-white/[0.035] border border-cyan-400/20 p-3 overflow-hidden relative">
      {isPollingState(wf.state) && (
        <motion.div
          className="absolute top-0 left-0 h-px w-20 bg-linear-to-r from-transparent via-cyan-300 to-transparent"
          animate={{ x: ['-50%', '320%'] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
        />
      )}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-xl border border-cyan-400/30 bg-cyan-400/10 flex items-center justify-center text-cyan-200">
          <Icon size={13} />
        </div>
        <div className="min-w-0">
          <div className="text-[9px] text-(--color-fg-subtle)">Active Stage</div>
          <div className="text-[11px] font-semibold text-(--color-fg-default) truncate">
            {activeStage.no}. {activeStage.label}
          </div>
        </div>
      </div>
      <div className="text-[10px] text-(--color-fg-subtle) leading-relaxed">{detail}</div>
      {nextStage && wf.state !== 'FAILED' && wf.state !== 'COMPLETED' && (
        <div className="mt-2 pt-2 border-t border-(--color-line-subtle) flex items-center justify-between gap-2">
          <span className="text-[9px] text-(--color-fg-subtle)">Next</span>
          <span className="text-[9px] text-(--color-fg-muted) truncate">{nextStage.no}. {nextStage.label}</span>
        </div>
      )}
    </div>
  );
}

function LiveIntelligence({ wf, selectedModel }: {
  wf: AIWorkflowStateResponse | undefined; selectedModel: AIModelInfo | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="px-1">
        <div className="text-[10px] font-semibold text-(--color-fg-subtle) uppercase tracking-[0.18em]">
          Live Intelligence
        </div>
        <div className="mt-1 h-px bg-linear-to-r from-cyan-300/35 via-violet-300/25 to-transparent" />
      </div>
      {selectedModel && (
        <div className="rounded-2xl bg-white/[0.035] border border-white/[0.08] p-3">
          <div className="text-[9px] text-(--color-fg-subtle) mb-1">Active Model</div>
          <div className="text-[11px] font-medium text-(--color-fg-default) leading-tight">{selectedModel.display_name}</div>
          <div className={`text-[9px] mt-0.5 ${TIER_COLOR[selectedModel.tier]}`}>
            {selectedModel.tier.charAt(0).toUpperCase() + selectedModel.tier.slice(1)}
          </div>
          <CapabilityBars tier={selectedModel.tier} />
        </div>
      )}
      <PipelineFocusCard wf={wf} selectedModel={selectedModel} />
      <div className="grid grid-cols-2 gap-1.5">
        <MetricCard label="Scraped" value={wf?.scraped_candidates?.length ?? 0} icon={Search} />
        <MetricCard label="Saved" value={wf?.elements_saved ?? 0} icon={Target} />
        <MetricCard label="Scenarios" value={wf?.scenarios.length ?? 0} icon={ClipboardList} />
        <MetricCard label="Tests" value={wf?.testcases_created ?? 0} icon={CheckCircle2} />
        <MetricCard label="Steps" value={wf?.teststeps_created ?? 0} icon={Play} />
        <MetricCard label="Review" value={wf?.unmapped_steps ?? 0} icon={AlertTriangle} warn />
      </div>
      {wf && (
        <div className="rounded-2xl bg-white/[0.035] border border-white/[0.08] p-3">
          <div className="text-[9px] text-(--color-fg-subtle) mb-1.5">Progress</div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-black/40 overflow-hidden relative">
              <motion.div
                className="h-full rounded-full bg-linear-to-r from-cyan-400 via-violet-400 to-emerald-400"
                animate={{ width: `${wf.progress_percent}%` }}
                transition={{ duration: 0.5 }}
              />
              {isPollingState(wf.state) && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-linear-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                />
              )}
            </div>
            <span className="text-[10px] tabular-nums text-(--color-fg-muted) w-7 text-right">{wf.progress_percent}%</span>
          </div>
          <div className="text-[9px] text-(--color-fg-subtle) leading-tight line-clamp-2">{wf.current_message}</div>
        </div>
      )}
      {wf?.errors && wf.errors.length > 0 && (
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2.5">
          <div className="text-[9px] font-medium text-red-400 mb-1">Errors</div>
          {wf.errors.slice(-2).map((e, i) => (
            <div key={i} className="text-[9px] text-red-300/80 leading-tight mb-0.5">{e}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 1: Input Form ────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: 'web', label: 'Web', icon: Globe },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
  { id: 'api', label: 'API', icon: Code2 },
] as const;

function useFavicon(url: string) {
  const [favicon, setFavicon] = useState<string | null>(null);
  useEffect(() => {
    if (!url || !/^https?:\/\//i.test(url)) { setFavicon(null); return; }
    try {
      const domain = new URL(url).hostname;
      setFavicon(`https://www.google.com/s2/favicons?domain=${domain}&sz=32`);
    } catch { setFavicon(null); }
  }, [url]);
  return favicon;
}

function InputStep({ onStart, isPending }: {
  onStart: (data: { brd_text: string; webpage_url: string; project_name: string; module_name: string; page_name: string; platform: string; ai_provider: string; ai_model: string }) => void;
  isPending: boolean;
}) {
  const [brd, setBrd] = useState('');
  const [url, setUrl] = useState('');
  const [projectName, setProjectName] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [pageName, setPageName] = useState('');
  const [platform, setPlatform] = useState<'web' | 'mobile' | 'api'>('web');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const favicon = useFavicon(url);

  function validate() {
    const e: Record<string, string> = {};
    if (!brd.trim()) e.brd = 'BRD text is required';
    if (!url.trim()) e.url = 'URL is required';
    else if (!/^https?:\/\//i.test(url)) e.url = 'URL must start with http:// or https://';
    if (!projectName.trim()) e.projectName = 'Project name is required';
    if (!pageName.trim()) e.pageName = 'Page name is required';
    return e;
  }

  function handleStart() {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setErrors({});
    onStart({
      brd_text: brd,
      webpage_url: url,
      project_name: projectName,
      module_name: moduleName || projectName,
      page_name: pageName,
      platform,
      ai_provider: 'null',
      ai_model: 'null',
    });
  }

  async function readFile(file: File) {
    if (isDocxFile(file)) {
      setIsExtracting(true);
      try {
        const extracted = await extractAIBrdFile(file);
        setBrd(extracted.text);
        setErrors((prev) => {
          const next = { ...prev };
          delete next.brd;
          return next;
        });
      } catch (error) {
        setErrors((prev) => ({
          ...prev,
          brd: error instanceof Error ? error.message : 'Could not extract text from this DOCX file.',
        }));
      } finally {
        setIsExtracting(false);
      }
      return;
    }
    if (!isPlainTextFile(file)) {
      setErrors((prev) => ({
        ...prev,
        brd: 'Upload a DOCX or plain text BRD (.txt or .md), or paste the text here.',
      }));
      return;
    }
    const text = await file.text();
    if (text.includes('\u0000')) {
      setErrors((prev) => ({
        ...prev,
        brd: 'This file contains binary data. Paste the BRD as plain text instead.',
      }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next.brd;
      return next;
    });
    setBrd(text);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  const labelCls = 'block text-[11px] font-medium text-(--color-fg-muted) mb-1.5';
  const inputCls = 'w-full bg-(--color-surface-2) border border-(--color-line-default) rounded-lg px-3 py-2 text-sm text-(--color-fg-default) placeholder:text-(--color-fg-subtle)/40 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <label className={labelCls}>
          Business Requirements Document
          <span className="text-(--color-fg-subtle) font-normal ml-1">({brd.length} chars)</span>
        </label>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`relative overflow-hidden rounded-xl border-2 border-dashed transition-all ${isDragging ? 'border-violet-500/60 bg-violet-500/10 scale-[1.01] shadow-[0_0_28px_rgba(139,92,246,0.18)]' : 'border-(--color-line-default) hover:border-line-strong'}`}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-45"
            style={{
              backgroundImage:
                'linear-gradient(30deg, rgba(139,92,246,0.16) 12%, transparent 12.5%, transparent 87%, rgba(139,92,246,0.16) 87.5%, rgba(139,92,246,0.16)), linear-gradient(150deg, rgba(6,182,212,0.12) 12%, transparent 12.5%, transparent 87%, rgba(6,182,212,0.12) 87.5%, rgba(6,182,212,0.12)), linear-gradient(30deg, rgba(139,92,246,0.16) 12%, transparent 12.5%, transparent 87%, rgba(139,92,246,0.16) 87.5%, rgba(139,92,246,0.16)), linear-gradient(150deg, rgba(6,182,212,0.12) 12%, transparent 12.5%, transparent 87%, rgba(6,182,212,0.12) 87.5%, rgba(6,182,212,0.12))',
              backgroundPosition: '0 0, 0 0, 18px 31px, 18px 31px',
              backgroundSize: '36px 62px',
              maskImage: 'linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)',
            }}
          />
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-cyan-400/10 to-transparent transition-opacity ${isDragging ? 'opacity-100' : 'opacity-45'}`}
          />
          {brd ? (
            <textarea
              className="relative w-full bg-transparent px-4 py-3 text-xs font-mono text-(--color-fg-default) focus:outline-none min-h-40 resize-y leading-relaxed"
              value={brd}
              onChange={(e) => setBrd(e.target.value)}
            />
          ) : (
            <div className="relative flex flex-col items-center justify-center py-10 cursor-pointer" onClick={() => fileRef.current?.click()}>
              <div className="w-11 h-11 rounded-xl border border-cyan-400/25 bg-cyan-400/10 shadow-[0_0_18px_rgba(6,182,212,0.16)] flex items-center justify-center mb-3">
                <Upload size={16} className="text-cyan-300" />
              </div>
              <p className="text-sm font-medium text-(--color-fg-muted)">Drop your BRD here</p>
              <p className="text-[11px] text-(--color-fg-subtle) mt-1">DOCX or plain text .txt/.md — or paste text directly</p>
            </div>
          )}
          {isDragging && (
            <div className="absolute inset-0 rounded-xl flex items-center justify-center pointer-events-none">
              <span className="text-sm font-medium text-violet-400">Drop to import</span>
            </div>
          )}
        </div>
        {brd && (
          <button onClick={() => fileRef.current?.click()} className="mt-1.5 text-[10px] text-(--color-fg-subtle) hover:text-(--color-fg-muted) flex items-center gap-1 transition-colors">
            <Upload size={10} /> Replace file
          </button>
        )}
        {isExtracting && (
          <p className="text-[10px] text-violet-400 mt-1 flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" /> Extracting DOCX text...
          </p>
        )}
        <input ref={fileRef} type="file" accept=".docx,.txt,.md,.markdown,.text,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.currentTarget.value = ''; }} />
        {errors.brd && <p className="text-[10px] text-red-400 mt-1">{errors.brd}</p>}
      </div>

      <div>
        <label className={labelCls}>Webpage URL</label>
        <div className="relative">
          {favicon
            ? <img src={favicon} alt="" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-sm" />
            : <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-fg-subtle)" />}
          <input type="url" className={`${inputCls} pl-8`} placeholder="https://example.com/login"
            value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        {errors.url && <p className="text-[10px] text-red-400 mt-1">{errors.url}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Project Name</label>
          <input className={inputCls} placeholder="My Web App" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          {errors.projectName && <p className="text-[10px] text-red-400 mt-1">{errors.projectName}</p>}
        </div>
        <div>
          <label className={labelCls}>Module <span className="text-(--color-fg-subtle) font-normal">(optional)</span></label>
          <input className={inputCls} placeholder="Defaults to project name" value={moduleName} onChange={(e) => setModuleName(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Page Name</label>
        <input className={inputCls} placeholder="Flight Search Page" value={pageName} onChange={(e) => setPageName(e.target.value)} />
        {errors.pageName && <p className="text-[10px] text-red-400 mt-1">{errors.pageName}</p>}
      </div>

      <div>
        <label className={labelCls}>Platform</label>
        <div className="flex gap-2">
          {PLATFORMS.map(({ id, label: lbl, icon: Icon }) => (
            <button key={id} onClick={() => setPlatform(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${platform === id ? 'border-violet-500/50 bg-violet-500/10 text-violet-300' : 'border-(--color-line-default) text-(--color-fg-muted) hover:border-line-strong hover:bg-(--color-surface-2)'}`}>
              <Icon size={14} />{lbl}
            </button>
          ))}
        </div>
      </div>

      <Button variant="neon" size="md" onClick={handleStart} disabled={isPending || isExtracting} className="w-full justify-center gap-2">
        {isPending || isExtracting ? <><Loader2 size={14} className="animate-spin" /> {isExtracting ? 'Extracting...' : 'Starting...'}</> : <><Sparkles size={14} /> Start AI Workflow</>}
      </Button>
    </div>
  );
}

// ── Step 2: Model Selection ────────────────────────────────────────────────────

function ModelSelectionStep({ onSelectModel, isPending }: {
  onSelectModel: (model: AIModelInfo) => void; isPending: boolean;
}) {
  const { data: modelsData, isLoading } = useAIModels();
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
  const [selected, setSelected] = useState<AIModelInfo | null>(null);
  const models = modelsData?.models ?? [];
  const providerModels = models.filter((model) => model.provider === provider);
  const recommended = providerModels.find((m) => m.configured && m.tier === 'balanced')
    ?? providerModels.find((m) => m.configured)
    ?? providerModels[0];

  useEffect(() => {
    setSelected(null);
  }, [provider]);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="text-sm text-(--color-fg-muted)">
        Select an LLM provider, then choose the model that will generate scenarios, test cases, and test steps from the BRD. Page scraping will run later and save only the elements needed by those steps.
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-(--color-fg-subtle)">
          <Loader2 size={14} className="animate-spin" /> Loading models&hellip;
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {LLM_PROVIDERS.map(({ id, label, icon: Icon }) => {
              const providerReady = models.some((model) => model.provider === id && model.configured);
              const providerHint = models.find((model) => model.provider === id)?.setup_hint;
              const active = provider === id;
              return (
                <button key={id} onClick={() => setProvider(id)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-all ${active ? 'border-violet-500/50 bg-violet-500/10 text-violet-300' : 'border-(--color-line-default) bg-(--color-surface-2) text-(--color-fg-muted) hover:border-line-strong'}`}>
                  <Icon size={15} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{label}</div>
                    <div className={`text-[10px] mt-0.5 ${providerReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {providerReady ? 'Ready' : (providerHint ?? 'Setup required')}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-(--color-fg-muted)">
              {providerModels.length} models available
            </div>
            <div className="text-[10px] text-(--color-fg-subtle)">
              fast · balanced · best
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
          {providerModels.map((model) => {
            const isSelected = selected?.model_id === model.model_id;
            const isRecommended = model.model_id === recommended?.model_id;
            return (
              <motion.button key={model.model_id} onClick={() => model.configured && setSelected(model)}
                whileHover={{ scale: 1.005 }} whileTap={{ scale: 0.995 }}
                className={`w-full text-left rounded-xl border p-4 transition-all relative overflow-hidden ${!model.configured ? 'opacity-60 cursor-not-allowed border-(--color-line-subtle) bg-(--color-surface-1)' : isSelected ? 'border-violet-500/50 bg-violet-500/10 shadow-[0_0_20px_-8px_rgba(139,92,246,0.4)]' : 'border-(--color-line-default) bg-(--color-surface-2) hover:border-line-strong'}`}>
                {isRecommended && (
                  <div className="absolute top-0 right-0 bg-violet-500/20 border-l border-b border-violet-500/30 px-2 py-0.5 rounded-bl-lg">
                    <span className="text-[9px] font-semibold text-violet-400 uppercase tracking-wider">Recommended</span>
                  </div>
                )}
                <div className="flex items-start gap-3 pr-16">
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${isSelected ? 'border-violet-500 bg-violet-500' : 'border-line-strong'}`}>
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-(--color-fg-default)">{model.display_name}</span>
                      <Badge label={model.tier} className={`${TIER_COLOR[model.tier]} border-current bg-transparent`} />
                      {!model.configured && <Badge label="key required" className="text-amber-400 border-amber-500/30 bg-amber-500/5" />}
                    </div>
                    <div className="text-[11px] text-(--color-fg-subtle)">{model.best_for}</div>
                    {!model.configured && model.setup_hint && (
                      <div className="text-[10px] text-amber-400 mt-1">{model.setup_hint}</div>
                    )}
                    <div className="text-[10px] text-(--color-fg-subtle)/60 mt-0.5">{model.provider} &middot; {model.model_id}</div>
                    <CapabilityBars tier={model.tier} />
                  </div>
                </div>
              </motion.button>
            );
          })}
          </div>
        </div>
      )}
      <Button variant="neon" size="md" disabled={!selected || isPending}
        onClick={() => selected && onSelectModel(selected)}
        className="w-full justify-center gap-2">
        {isPending ? <><Loader2 size={14} className="animate-spin" /> Processing&hellip;</> : <><Sparkles size={14} />{selected ? `Generate Scenarios with ${selected.display_name}` : 'Select a configured model'}</>}
      </Button>
    </div>
  );
}

// ── Step 3: Discovery ─────────────────────────────────────────────────────────

function DiscoveryStep({ wf }: { wf: AIWorkflowStateResponse | undefined }) {
  const isDone = wf?.state === 'PAGE_SAVED';
  return (
    <div className="space-y-5">
      <McpMissionControlPanel wf={wf} />
      <WorkflowActivityFeed wf={wf} limit={12} />
      {isDone && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-4 py-3">
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-300">Page saved with {wf?.elements_saved} necessary elements selected from the scrape</span>
        </motion.div>
      )}
      <div className="rounded-xl bg-(--color-surface-1) border border-(--color-line-subtle) p-4">
        <div className="text-[10px] font-semibold text-(--color-fg-subtle) uppercase tracking-wider mb-3">Status</div>
        <div className="font-mono text-[11px] leading-relaxed">
          <div className={wf && isPollingState(wf.state) ? 'text-violet-400' : 'text-emerald-400'}>
            {wf?.current_message || 'Waiting for discovery to start…'}
          </div>
          {wf && isPollingState(wf.state) && (
            <div className="flex items-center gap-1.5 mt-2 text-(--color-fg-subtle)">
              <Loader2 size={10} className="animate-spin" /><span>Running selective binding…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Scenarios ─────────────────────────────────────────────────────────

function ScenariosStep({ scenarios, onConfirm, isPending }: {
  scenarios: AIScenarioPreview[]; onConfirm: (ids: string[]) => void; isPending: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState({ priority: '', testType: '', classification: '' });

  function toggle(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  const filtered = scenarios.filter((s) => {
    if (filter.priority && s.priority !== filter.priority) return false;
    if (filter.testType && s.test_type !== filter.testType) return false;
    if (filter.classification && s.classification !== filter.classification) return false;
    return true;
  });

  const sel = 'bg-(--color-surface-2) border border-(--color-line-default) rounded-lg px-2.5 py-1.5 text-[11px] text-(--color-fg-muted) focus:outline-none focus:border-violet-500/50 transition-colors';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="xs" onClick={() => setSelected(new Set(scenarios.map((s) => s.scenario_id)))}>Select All</Button>
        <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>Deselect All</Button>
        <div className="flex-1" />
        <select className={sel} value={filter.priority} onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value }))}>
          <option value="">All priorities</option>
          {['high', 'medium', 'low'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={sel} value={filter.testType} onChange={(e) => setFilter((f) => ({ ...f, testType: e.target.value }))}>
          <option value="">All types</option>
          {['functional', 'regression', 'smoke', 'e2e'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={sel} value={filter.classification} onChange={(e) => setFilter((f) => ({ ...f, classification: e.target.value }))}>
          <option value="">All classes</option>
          {['positive', 'negative', 'edge'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-[11px] text-(--color-fg-subtle)">{selected.size} / {scenarios.length}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-105 overflow-y-auto pr-1">
        {filtered.map((s) => {
          const isSel = selected.has(s.scenario_id);
          return (
            <motion.div key={s.scenario_id} onClick={() => toggle(s.scenario_id)} whileHover={{ scale: 1.003 }}
              className={`rounded-xl border p-3.5 cursor-pointer transition-all ${isSel ? 'border-violet-500/40 bg-violet-500/10 shadow-[0_0_12px_-6px_rgba(139,92,246,0.3)]' : 'border-(--color-line-default) bg-(--color-surface-2) hover:border-line-strong'}`}>
              <div className="flex items-start gap-2 mb-2">
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${isSel ? 'border-violet-500 bg-violet-500' : 'border-line-strong'}`}>
                  {isSel && <CheckCircle2 size={10} className="text-white" />}
                </div>
                <span className="text-xs font-medium text-(--color-fg-default) leading-tight">{s.title}</span>
              </div>
              <p className="text-[10px] text-(--color-fg-subtle) mb-2.5 leading-relaxed line-clamp-2">{s.business_requirement}</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <Badge label={s.priority} className={PRIORITY_COLOR[s.priority]} />
                <Badge label={s.test_type} className={TEST_TYPE_COLOR[s.test_type]} />
                <Badge label={s.classification} className={CLASS_COLOR[s.classification]} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-(--color-fg-subtle)">
                <span>~{s.estimated_test_cases} cases</span>
                <div className="flex items-center gap-1.5">
                  <ConfidenceRing value={s.confidence} size={16} />
                  <span className={confColor(s.confidence)}>{(s.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <Button variant="neon" size="md" disabled={selected.size === 0 || isPending}
        onClick={() => onConfirm(Array.from(selected))} className="w-full justify-center gap-2">
        {isPending ? <><Loader2 size={14} className="animate-spin" /> Processing&hellip;</> : <><Wand2 size={14} />Generate Test Cases for {selected.size} Scenario{selected.size !== 1 ? 's' : ''}</>}
      </Button>
    </div>
  );
}

// ── Step 5: Test Generation ───────────────────────────────────────────────────

function TestGenerationStep({ wf }: { wf: AIWorkflowStateResponse | undefined }) {
  const agentName = wf?.current_message?.includes('scenario') ? 'ScenarioGenerationAgent'
    : wf?.current_message?.includes('step') ? 'TestStepBindingAgent'
    : wf?.current_message?.includes('test') ? 'TestCaseGenerationAgent'
    : 'AIWorkflowOrchestrator';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden relative">
          <motion.div className="h-full rounded-full bg-linear-to-r from-violet-600 to-violet-400"
            animate={{ width: `${wf?.progress_percent ?? 0}%` }} transition={{ duration: 0.5 }} />
          {wf && isPollingState(wf.state) && (
            <motion.div className="absolute inset-0 rounded-full bg-linear-to-r from-transparent via-white/20 to-transparent"
              animate={{ x: ['-100%', '200%'] }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }} />
          )}
        </div>
        <span className="text-xs tabular-nums text-(--color-fg-muted) w-8 text-right">{wf?.progress_percent ?? 0}%</span>
      </div>
      <TokenStream message={wf?.current_message ?? ''} agentName={agentName} />
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Tests Created', value: wf?.testcases_created ?? 0 },
          { label: 'Steps Mapped', value: (wf?.teststeps_created ?? 0) - (wf?.unmapped_steps ?? 0) },
          { label: 'Needs Review', value: wf?.unmapped_steps ?? 0, warn: true },
        ].map((c) => (
          <div key={c.label} className="rounded-xl bg-(--color-surface-2) border border-(--color-line-default) p-3 text-center">
            <div className={`text-2xl font-bold tabular-nums ${c.warn && c.value > 0 ? 'text-amber-400' : 'text-(--color-fg-default)'}`}>{c.value}</div>
            <div className="text-[10px] text-(--color-fg-subtle) mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>
      <WorkflowActivityFeed wf={wf} limit={14} />
    </div>
  );
}

// ── Step 6: Review ────────────────────────────────────────────────────────────

function ReviewStep({ workflowId, wf }: { workflowId: string; wf: AIWorkflowStateResponse | undefined }) {
  const { data: review, isLoading } = useAIWorkflowReview(workflowId);
  if (isLoading) return (
    <div className="flex items-center gap-2 text-sm text-(--color-fg-subtle)">
      <Loader2 size={14} className="animate-spin" /> Loading review&hellip;
    </div>
  );
  if (!review) return null;

  const summaryCards = [
    { label: 'Elements', value: review.elements_saved },
    { label: 'Scenarios', value: review.scenarios_generated },
    { label: 'Selected', value: review.scenarios_selected },
    { label: 'Tests', value: review.testcases_created },
    { label: 'Steps', value: review.teststeps_created },
    { label: 'Review', value: review.needs_review_items.length, warn: true },
  ];

  return (
    <div className="space-y-5">
      {hasDiscoveryPanelActivity(wf) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-(--color-fg-muted)">
            <Sparkles size={12} className="text-violet-400" />
            MCP Scrape Panel
          </div>
          <McpMissionControlPanel wf={wf} compact />
        </div>
      )}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {summaryCards.map((c) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-(--color-surface-2) border border-(--color-line-default) p-3 text-center">
            <div className={`text-xl font-bold tabular-nums ${c.warn && c.value > 0 ? 'text-amber-400' : 'text-(--color-fg-default)'}`}>{c.value}</div>
            <div className="text-[9px] text-(--color-fg-subtle) mt-0.5 uppercase tracking-wide">{c.label}</div>
          </motion.div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-(--color-fg-muted) mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-amber-400" />
            Needs Review ({review.needs_review_items.length})
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {review.needs_review_items.length === 0 ? (
              <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={12} /> All steps mapped successfully
              </div>
            ) : review.needs_review_items.map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-amber-300 truncate">{item.testcase_name}</div>
                    <div className="text-[10px] text-(--color-fg-subtle) mt-0.5">Step {item.step_number}: {item.description}</div>
                    <div className="text-[10px] text-amber-400/70 mt-1">{item.reason}</div>
                  </div>
                  <Badge label="warn" className="text-amber-400 border-amber-500/30 bg-amber-500/5 shrink-0" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-(--color-fg-muted) mb-2 flex items-center gap-1.5">
            <Search size={11} className="text-red-400" />
            Low Confidence ({review.low_confidence_locators.length})
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {review.low_confidence_locators.length === 0 ? (
              <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={12} /> All locators above threshold
              </div>
            ) : review.low_confidence_locators.map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-lg bg-red-500/5 border border-red-500/15 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-red-300 truncate">{item.element_name}</span>
                  <CopyButton text={item.current_locator} />
                </div>
                <ConfidenceGauge value={item.confidence} label={item.current_locator} />
                <div className="flex items-center justify-between mt-2">
                  <Badge label={item.strategy} className="text-(--color-fg-subtle) border-(--color-line-default)" />
                  <a href="/page-repository" className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                    Fix <ExternalLink size={8} />
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 pt-3 border-t border-(--color-line-subtle)">
        <a href="/test-configuration">
          <Button variant="neon" size="sm" className="gap-1.5"><Settings2 size={13} /> Open Test Configuration</Button>
        </a>
        <a href="/page-repository">
          <Button variant="glass" size="sm" className="gap-1.5"><BookOpen size={13} /> Open Page Repository</Button>
        </a>
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(review, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            const objectUrl = URL.createObjectURL(blob);
            a.href = objectUrl;
            a.download = 'workflow-review.json';
            a.click();
            URL.revokeObjectURL(objectUrl);
          }}
          className="ml-auto text-[11px] text-(--color-fg-subtle) hover:text-(--color-fg-muted) flex items-center gap-1 transition-colors"
        >
          <ExternalLink size={11} /> Export JSON
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIWorkflowPage() {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<StepId>('input');
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());
  const [selectedModel, setSelectedModel] = useState<AIModelInfo | null>(null);
  const [errorStep, setErrorStep] = useState<StepId | null>(null);

  const polling = !!workflowId;
  const { data: wf } = useAIWorkflow(workflowId, polling);

  const createWorkflow = useCreateAIWorkflow();
  const generateScenarios = useGenerateScenarios(workflowId ?? '');
  const confirmScenarios = useConfirmScenarios(workflowId ?? '');
  const generateTestCases = useGenerateTestCases(workflowId ?? '');

  useEffect(() => {
    if (!wf) return;
    const step = stateToStep(wf.state);
    setActiveStep(step);
    if (wf.state === 'FAILED') setErrorStep(step);
    const order: StepId[] = ['input', 'model', 'scenarios', 'generation', 'discovery', 'review'];
    const currentIdx = order.indexOf(step);
    setCompletedSteps(new Set(order.slice(0, currentIdx)));
  }, [wf?.state]);

  async function handleStart(data: Parameters<typeof InputStep>[0]['onStart'] extends (d: infer D) => void ? D : never) {
    const result = await createWorkflow.mutateAsync(data);
    setWorkflowId(result.workflow_id);
    setActiveStep('model');
  }

  async function handleModelSelected(model: AIModelInfo) {
    setSelectedModel(model);
    if (workflowId) {
      await generateScenarios.mutateAsync({ ai_provider: model.provider, ai_model: model.model_id });
      setActiveStep('scenarios');
    }
  }

  async function handleConfirmScenarios(ids: string[]) {
    if (!workflowId) return;
    await confirmScenarios.mutateAsync({ scenario_ids: ids });
    await generateTestCases.mutateAsync();
    setActiveStep('generation');
  }

  const content: Record<StepId, React.ReactNode> = {
    input: <InputStep onStart={handleStart} isPending={createWorkflow.isPending} />,
    model: <ModelSelectionStep onSelectModel={handleModelSelected} isPending={generateScenarios.isPending} />,
    discovery: <DiscoveryStep wf={wf} />,
    scenarios: <ScenariosStep scenarios={wf?.scenarios ?? []} onConfirm={handleConfirmScenarios}
      isPending={confirmScenarios.isPending || generateTestCases.isPending} />,
    generation: <TestGenerationStep wf={wf} />,
    review: workflowId ? <ReviewStep workflowId={workflowId} wf={wf} /> : null,
  };
  const activeStepMeta = WORKFLOW_STEPS.find((step) => step.id === activeStep) ?? WORKFLOW_STEPS[0];
  const activeStage = PIPELINE_STAGES.find((stage) => stage.id === activePipelineStage(wf)) ?? PIPELINE_STAGES[0];
  const visualProgress = wf?.progress_percent ?? Math.round((completedSteps.size / WORKFLOW_STEPS.length) * 100);

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-[#020617]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(circle at 28% 12%, rgba(34,211,238,0.10), transparent 28%), radial-gradient(circle at 80% 18%, rgba(139,92,246,0.12), transparent 30%), linear-gradient(180deg, rgba(15,23,42,0.52), rgba(2,6,23,0.96))',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.10) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(circle at center, black, transparent 78%)',
        }}
      />

      <div className="relative z-10 w-72 shrink-0 border-r border-white/[0.08] bg-black/25 p-3 overflow-y-auto backdrop-blur-xl">
        <div className="mb-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold text-(--color-fg-subtle) uppercase tracking-[0.18em]">10-stage pipeline</div>
              <div className="mt-1 text-[9px] text-(--color-fg-subtle)">Project, scenario, scrape, XPath, configured steps</div>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 font-mono text-[11px] text-cyan-200">
              {String(activeStage.no).padStart(2, '0')}
            </div>
          </div>
          <div className="mt-3 h-1 rounded-full bg-black/40 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-linear-to-r from-cyan-300 via-violet-300 to-emerald-300"
              animate={{ width: `${visualProgress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>
        <WorkflowTimeline wf={wf} selectedModel={selectedModel} />
      </div>

      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        <div
          className="mx-5 mt-5 mb-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] px-5 py-4 shadow-[0_22px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 84% 10%, rgba(34,211,238,0.12), transparent 64%), radial-gradient(ellipse 70% 70% at 16% 0%, rgba(139,92,246,0.13), transparent 62%), rgba(15,23,42,0.58)',
          }}
        >
          <div className="flex flex-col gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200">
                  AI Execution OS
                </span>
                <span className="rounded-full border border-white/[0.08] bg-black/20 px-2.5 py-1 font-mono text-[10px] text-(--color-fg-subtle)">
                  {activeStepMeta.label} / {activeStage.label}
                </span>
              </div>
              <h1 className="text-[22px] font-semibold tracking-tight text-white">AI Workflow Orchestrator</h1>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-(--color-fg-subtle)">
                Convert requirements into scenarios, test cases, page intelligence, and configured executable steps.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {wf && isPollingState(wf.state) && (
                  <motion.div animate={{ opacity: [0.55, 1, 0.55] }} transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                    className="flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] text-cyan-200">
                    <Loader2 size={10} className="animate-spin" /> Live
                  </motion.div>
                )}
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-emerald-200">
                  3 AGENTS NOMINAL
                </span>
              </div>
              <div className="flex items-center gap-2">
                {ORCHESTRATOR_STATUSES.map((item, i) => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${
                      item.tone === 'cyan' ? 'bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.65)]' :
                        item.tone === 'violet' ? 'bg-violet-300 shadow-[0_0_10px_rgba(167,139,250,0.65)]' :
                          'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.65)]'
                    }`} />
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-(--color-fg-subtle)">{item.label}</span>
                    {i < ORCHESTRATOR_STATUSES.length - 1 && <span className="h-px w-4 bg-white/[0.12]" />}
                  </div>
                ))}
              </div>
              {wf && (
                <div className="ml-auto">
                  <span className="text-[10px] font-mono text-(--color-fg-subtle)">{wf.state}</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-black/35">
              <motion.div
                className="h-full rounded-full bg-linear-to-r from-cyan-300 via-violet-300 to-emerald-300"
                animate={{ width: `${visualProgress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-(--color-fg-muted)">{visualProgress}%</span>
          </div>
        </div>
        <div className="relative flex-1 overflow-y-auto px-6 pb-6 pt-2">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '100% 18px',
              maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
            }}
          />
          <AnimatePresence mode="wait">
            <motion.div key={activeStep} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="relative">
              {content[activeStep]}
            </motion.div>
          </AnimatePresence>
          {wf?.state === 'FAILED' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="mt-6 rounded-xl bg-red-500/10 border border-red-500/25 p-5">
              <div className="flex items-center gap-2 mb-2">
                <XCircle size={14} className="text-red-400" />
                <span className="text-sm font-medium text-red-300">Workflow Failed</span>
              </div>
              <div className="text-xs text-red-300/70 mb-4 leading-relaxed">{wf.current_message}</div>
              <Button variant="danger" size="sm" className="gap-1.5"
                onClick={() => { setWorkflowId(null); setActiveStep('input'); setCompletedSteps(new Set()); setErrorStep(null); }}>
                <RefreshCw size={12} /> Start Over
              </Button>
            </motion.div>
          )}
        </div>
      </div>

      <div className="relative z-10 w-60 shrink-0 border-l border-white/[0.08] bg-black/25 p-3 overflow-y-auto backdrop-blur-xl">
        <LiveIntelligence wf={wf} selectedModel={selectedModel} />
      </div>
    </div>
  );
}
