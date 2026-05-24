'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  FileSearch,
  GitBranch,
  Lightbulb,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useExecutions } from '@/lib/api/executions';
import {
  useAIJobs,
  useExecutionAnalysis,
  useFixSuggestions,
  useImplementFixSuggestion,
  useTriggerAIAnalysis,
  type AIJobStatus,
  type AIJobType,
  type FixSuggestion,
  type IntelligenceInsight,
} from '@/lib/api/intelligence';
import { timeAgo } from '@/lib/utils';
import type { ExecutionListItem } from '@/lib/api/types';

type StageState = 'idle' | 'queued' | 'active' | 'complete' | 'failed';

type StageConfig = {
  id: string;
  label: string;
  agent: string;
  provider: string;
  description: string;
  icon: typeof FileSearch;
  progress: number;
  accent: string;
};

const JOB_TYPE_LABELS: Record<AIJobType, string> = {
  root_cause_analysis: 'Root Cause',
  flaky_detection: 'Flaky',
  locator_healing: 'Locator',
  anomaly_analysis: 'Anomaly',
};

const STAGES: StageConfig[] = [
  {
    id: 'gather_evidence',
    label: 'Evidence Intake',
    agent: 'Trace Scout',
    provider: 'OpenAI',
    description: 'Reading nodes, logs, screenshots, and persisted execution evidence.',
    icon: FileSearch,
    progress: 0.15,
    accent: 'cyan',
  },
  {
    id: 'classify_failure',
    label: 'Failure Classifier',
    agent: 'Signal Classifier',
    provider: 'OpenAI',
    description: 'Separating locator, navigation, app, network, and runner failures.',
    icon: Activity,
    progress: 0.3,
    accent: 'violet',
  },
  {
    id: 'retrieve_memory',
    label: 'Memory Match',
    agent: 'Pattern Librarian',
    provider: 'Claude',
    description: 'Comparing this failure with previous investigations and known patterns.',
    icon: Database,
    progress: 0.48,
    accent: 'blue',
  },
  {
    id: 'analyze_root_cause',
    label: 'Root Cause Debate',
    agent: 'Spector Core',
    provider: 'OpenAI + Claude',
    description: 'Reconciling evidence into the most likely root cause.',
    icon: Brain,
    progress: 0.68,
    accent: 'emerald',
  },
  {
    id: 'generate_recommendations',
    label: 'Fix Strategy',
    agent: 'Repair Planner',
    provider: 'Claude',
    description: 'Ranking fixes by confidence, impact, and implementation safety.',
    icon: Wrench,
    progress: 0.85,
    accent: 'amber',
  },
  {
    id: 'validate_results',
    label: 'Safety Review',
    agent: 'Validation Sentinel',
    provider: 'OpenAI',
    description: 'Checking the recommendation before it is exposed for implementation.',
    icon: ShieldCheck,
    progress: 0.96,
    accent: 'green',
  },
];

const SEVERITY_CONFIG = {
  critical: { color: 'text-red-300', bg: 'bg-red-500/10 border-red-500/25', label: 'Critical' },
  high: { color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/25', label: 'High' },
  medium: { color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/25', label: 'Medium' },
  low: { color: 'text-blue-300', bg: 'bg-blue-500/10 border-blue-500/25', label: 'Low' },
  info: { color: 'text-slate-300', bg: 'bg-slate-500/10 border-slate-500/25', label: 'Info' },
};

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('\n');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = asText(item);
        return text ? `${key.replaceAll('_', ' ')}: ${text}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function asList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(asText).filter(Boolean);
  const text = asText(value);
  return text ? [text] : [];
}

function cleanText(value: string): string {
  return value
    .replace(/^\s*\[[^\]]+\]\s*/i, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'this execution')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function confidencePercent(value: number | undefined): number {
  if (!value) return 0;
  return Math.round(value > 1 ? value : value * 100);
}

function executionLabel(execution: ExecutionListItem): string {
  return execution.display_name
    || [execution.project_name, execution.module_name, execution.test_case_name].filter(Boolean).join('_')
    || execution.workflow_name?.replace(/^Execution -\s*/i, '')
    || execution.workflow_id.slice(0, 8);
}

function stageState(stage: StageConfig, job: AIJobStatus | undefined): StageState {
  if (!job) return 'idle';
  if (job.status === 'failed' || job.status === 'cancelled') return job.current_step === stage.id ? 'failed' : 'idle';
  if (job.status === 'completed' || job.progress >= stage.progress) return 'complete';
  if (job.current_step === stage.id) return 'active';
  if (job.status === 'queued' || job.status === 'running') return 'queued';
  return 'idle';
}

function activeStageIndex(job: AIJobStatus | undefined): number {
  if (!job) return 0;
  if (job.current_step) {
    const byStep = STAGES.findIndex((stage) => stage.id === job.current_step);
    if (byStep >= 0) return byStep;
  }
  const byProgress = STAGES.findIndex((stage) => job.progress <= stage.progress);
  return byProgress >= 0 ? byProgress : STAGES.length - 1;
}

function AgentOrb({ job }: { job?: AIJobStatus }) {
  const running = job?.status === 'queued' || job?.status === 'running';
  const progress = Math.max(0, Math.min(100, Math.round((job?.progress ?? 0) * 100)));

  return (
    <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-lg border border-white/8 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.16),rgba(2,6,23,0)_58%)]">
      <motion.div
        className="absolute h-56 w-56 rounded-full border border-cyan-400/20"
        animate={{ rotate: running ? 360 : 0, scale: running ? [1, 1.04, 1] : 1 }}
        transition={{ rotate: { duration: 18, repeat: Infinity, ease: 'linear' }, scale: { duration: 2.5, repeat: Infinity } }}
      />
      <motion.div
        className="absolute h-40 w-40 rounded-full border border-violet-400/20"
        animate={{ rotate: running ? -360 : 0 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute h-72 w-px bg-linear-to-b from-transparent via-cyan-300/40 to-transparent"
        animate={{ rotate: running ? 360 : 45 }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
      />

      <div className="absolute left-8 top-8 rounded-md border border-cyan-400/20 bg-cyan-500/10 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-cyan-200">OpenAI</p>
        <p className="text-[10px] text-cyan-200/60">evidence reasoning</p>
      </div>
      <div className="absolute bottom-8 right-8 rounded-md border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-right">
        <p className="text-[10px] uppercase tracking-wider text-violet-200">Claude</p>
        <p className="text-[10px] text-violet-200/60">second-pass critique</p>
      </div>

      <motion.div
        className="relative flex h-32 w-32 flex-col items-center justify-center rounded-full border border-white/15 bg-slate-950/80 shadow-[0_0_70px_rgba(99,102,241,0.28)]"
        animate={{ y: running ? [0, -6, 0] : 0 }}
        transition={{ duration: 2.4, repeat: Infinity }}
      >
        <Sparkles size={22} className="text-violet-200" />
        <p className="mt-2 text-sm font-semibold text-white">AI Spector</p>
        <p className="mt-1 font-mono text-[10px] text-slate-500">{progress}% locked</p>
      </motion.div>
    </div>
  );
}

function StageCard({ stage, state, index }: { stage: StageConfig; state: StageState; index: number }) {
  const Icon = stage.icon;
  const active = state === 'active';
  const complete = state === 'complete';
  const failed = state === 'failed';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`relative rounded-lg border p-3 transition-all ${
        active
          ? 'border-violet-400/40 bg-violet-500/12 shadow-[0_0_26px_rgba(139,92,246,0.12)]'
          : complete
            ? 'border-emerald-400/25 bg-emerald-500/8'
            : failed
              ? 'border-red-400/25 bg-red-500/8'
              : 'border-white/12 bg-white/[0.04]'
      }`}
    >
      {active && (
        <motion.div
          className="absolute inset-0 rounded-lg border border-violet-300/30"
          animate={{ opacity: [0.2, 0.65, 0.2] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}
      <div className="relative flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
          complete ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-300' : 'border-white/10 bg-black/20 text-slate-300'
        }`}>
          {complete ? <CheckCircle2 size={16} /> : active ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold text-white">{stage.label}</p>
            <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-400">
              {stage.provider}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">{stage.agent}</p>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{stage.description}</p>
        </div>
      </div>
    </motion.div>
  );
}

function InsightCard({ insight, selected, onClick }: {
  insight: IntelligenceInsight;
  selected: boolean;
  onClick: () => void;
}) {
  const sev = SEVERITY_CONFIG[insight.severity];
  const confidence = confidencePercent(insight.confidence);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-all ${
        selected ? 'border-violet-400/40 bg-violet-500/12' : 'border-white/8 bg-white/[0.025] hover:border-white/16 hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-md border p-2 ${sev.bg}`}>
          <AlertTriangle size={13} className={sev.color} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-bold uppercase ${sev.color}`}>{sev.label}</span>
            <span className="text-[9px] text-slate-600">{insight.type.replace('_', ' ')}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-snug text-slate-100">{insight.title}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${confidence}%` }}
                transition={{ duration: 0.9 }}
                className="h-full rounded-full bg-linear-to-r from-violet-400 to-cyan-300"
              />
            </div>
            <span className="font-mono text-[9px] text-violet-300">{confidence}%</span>
          </div>
        </div>
        <ChevronRight size={12} className={`mt-1 text-slate-600 transition ${selected ? 'rotate-90 text-violet-300' : ''}`} />
      </div>
    </button>
  );
}

function FixCard({
  fix,
  selected,
  recommended,
  implemented,
  onSelect,
}: {
  fix: FixSuggestion;
  selected: boolean;
  recommended: boolean;
  implemented: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left transition-all ${
        selected ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/8 bg-white/[0.025] hover:border-emerald-400/25'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-400/25 bg-emerald-500/10 text-emerald-300">
          {implemented ? <CheckCircle2 size={15} /> : <Wrench size={15} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-white">{fix.title}</p>
            {recommended && (
              <span className="rounded border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-emerald-300">
                Recommended
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-400">{fix.rationale}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded border border-white/8 bg-black/20 px-1.5 py-0.5 text-[9px] text-slate-400">
              {fix.target_type.replace('_', ' ')}
            </span>
            <span className="font-mono text-[9px] text-emerald-300">{confidencePercent(fix.confidence)}%</span>
            {!fix.can_implement && <span className="text-[9px] text-amber-300">needs review</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function AIAnalysisPage() {
  const { data: executions = [] } = useExecutions();
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
  const [selectedInsightId, setSelectedInsightId] = useState('');
  const [selectedFixId, setSelectedFixId] = useState('');
  const [implementedFixId, setImplementedFixId] = useState('');
  const [jobType, setJobType] = useState<AIJobType>('root_cause_analysis');

  const defaultExecution = executions.find((execution) => execution.status === 'failed') ?? executions[0];
  const selectedExecutionId = executions.some((execution) => execution.id === selectedExecution)
    ? selectedExecution
    : defaultExecution?.id ?? null;
  const { data: analysis } = useExecutionAnalysis(selectedExecutionId);
  const { data: aiJobs = [] } = useAIJobs(selectedExecutionId);
  const { data: fixes = [] } = useFixSuggestions(selectedExecutionId);
  const triggerMutation = useTriggerAIAnalysis();
  const implementFix = useImplementFixSuggestion();

  const selectedExecutionItem = executions.find((execution) => execution.id === selectedExecutionId);
  const latestJob = aiJobs[0];
  const activeJob = latestJob?.status === 'queued' || latestJob?.status === 'running';
  const jobResult = latestJob?.result ?? null;
  const activeStage = activeStageIndex(latestJob);

  const insights = useMemo(() => analysis?.insights ?? [], [analysis]);

  const recommendedFix = useMemo(() => {
    return [...fixes].sort((a, b) => {
      if (a.can_implement !== b.can_implement) return a.can_implement ? -1 : 1;
      return b.confidence - a.confidence;
    })[0];
  }, [fixes]);

  const selectedInsight = insights.find((insight) => insight.id === selectedInsightId) ?? insights[0];
  const selectedFix = fixes.find((fix) => fix.id === selectedFixId) ?? recommendedFix;
  const rootCause = cleanText(asText(jobResult?.root_cause) || selectedInsight?.description || '');
  const summary = cleanText(asText(jobResult?.summary) || analysis?.summary?.status || '');
  const findings = asList(jobResult?.findings);
  const recommendations = asList(jobResult?.recommendations);
  const analysisSteps = asList(jobResult?.analysis_steps);
  const confidence = confidencePercent(typeof jobResult?.confidence === 'number' ? jobResult.confidence : selectedInsight?.confidence);

  const visibleSteps = analysisSteps.length > 0
    ? analysisSteps
    : STAGES.slice(0, activeJob ? activeStage + 1 : 0).map((stage) => `${stage.agent}: ${stage.description}`);

  const metrics = [
    { label: 'Evidence', value: analysis ? analysis.evidence_counts.nodes + analysis.evidence_counts.timeline_entries + analysis.evidence_counts.events + analysis.evidence_counts.artifacts : 0, color: 'text-cyan-300' },
    { label: 'Errors', value: analysis?.summary.failed_nodes ?? 0, color: 'text-red-300' },
    { label: 'Insights', value: insights.length, color: 'text-violet-300' },
    { label: 'Fixes', value: fixes.length, color: 'text-emerald-300' },
  ];

  const taxonomy = [
    { label: 'Failure class', value: cleanText(asText(jobResult?.failure_class)) || analysis?.summary.highest_severity || 'pending' },
    { label: 'Failed nodes', value: String(analysis?.summary.failed_nodes ?? 0) },
    { label: 'Artifacts', value: String(analysis?.summary.artifact_count ?? 0) },
    { label: 'Confidence', value: confidence ? `${confidence}%` : 'pending' },
  ];

  const runInvestigation = () => {
    if (!selectedExecutionId) return;
    setImplementedFixId('');
    triggerMutation.mutate({ executionId: selectedExecutionId, jobType });
  };

  const implementSelectedFix = () => {
    if (!selectedExecutionId || !selectedFix) return;
    implementFix.mutate(
      { executionId: selectedExecutionId, nodeKey: selectedFix.node_key },
      { onSuccess: () => setImplementedFixId(selectedFix.id) },
    );
  };

  return (
    <div className="flex h-full overflow-hidden bg-[#020617] text-slate-100">
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-white/8 bg-slate-950/80">
        <div className="border-b border-white/8 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-violet-400/25 bg-violet-500/10 text-violet-200">
              <Bot size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">AI Investigation</p>
              <h1 className="truncate text-lg font-semibold text-white">AI Spector</h1>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <label className="block text-[10px] uppercase tracking-wider text-slate-500">Execution</label>
            <select
              value={selectedExecutionId ?? ''}
              onChange={(event) => {
                setSelectedExecution(event.target.value || null);
                setSelectedInsightId('');
                setSelectedFixId('');
              }}
              className="h-9 w-full rounded-md border border-white/10 bg-slate-900 px-2 text-xs text-slate-200 outline-none transition focus:border-violet-400/50"
            >
              {executions.length === 0 && <option value="">No executions</option>}
              {executions.map((execution) => (
                <option key={execution.id} value={execution.id}>
                  {executionLabel(execution)} | {execution.status}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(JOB_TYPE_LABELS) as [AIJobType, string][]).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setJobType(type)}
                  className={`h-8 rounded-md border text-[10px] font-medium transition ${
                    jobType === type
                      ? 'border-violet-400/40 bg-violet-500/15 text-violet-200'
                      : 'border-white/8 bg-white/[0.025] text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <Button
              variant="neon"
              size="sm"
              className="w-full justify-center"
              disabled={!selectedExecutionId || triggerMutation.isPending || activeJob}
              onClick={runInvestigation}
            >
              {triggerMutation.isPending || activeJob ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {triggerMutation.isPending || activeJob ? 'Investigating...' : 'Run investigation'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-white/8 p-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-white/8 bg-white/[0.025] p-3">
              <p className={`font-mono text-xl font-bold ${metric.color}`}>{metric.value}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{metric.label}</p>
            </div>
          ))}
        </div>

        <div className="border-b border-white/8 p-4">
          <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
            <Cpu size={11} className="text-violet-300" />
            Agent Jobs
          </p>
          <div className="space-y-2">
            {aiJobs.slice(0, 3).map((job) => (
              <div key={job.id} className="flex items-center gap-2 rounded-md border border-white/8 bg-white/[0.025] px-2 py-2">
                <div className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-black/20">
                  {job.status === 'running' ? <Loader2 size={13} className="animate-spin text-cyan-300" /> : <Cpu size={13} className="text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-medium text-slate-300">{JOB_TYPE_LABELS[job.job_type] ?? job.job_type}</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/8">
                    <motion.div
                      animate={{ width: `${Math.round(job.progress * 100)}%` }}
                      className="h-full rounded-full bg-linear-to-r from-cyan-300 to-violet-300"
                    />
                  </div>
                </div>
                <span className="font-mono text-[9px] uppercase text-slate-500">{job.status}</span>
              </div>
            ))}
            {aiJobs.length === 0 && (
              <p className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-3 text-[11px] text-slate-500">
                No active investigation.
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
            <AlertTriangle size={11} className="text-amber-300" />
            Evidence Insights
          </p>
          <div className="space-y-2">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                selected={selectedInsightId === insight.id}
                onClick={() => setSelectedInsightId(insight.id)}
              />
            ))}
            {insights.length === 0 && (
              <p className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-6 text-center text-xs text-slate-500">
                No evidence-backed insights yet.
              </p>
            )}
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-white/8 px-7 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Selected run</p>
              <h2 className="mt-1 truncate text-xl font-semibold text-white">
                {selectedExecutionItem ? executionLabel(selectedExecutionItem) : 'No execution selected'}
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">
                {selectedExecutionItem ? `${selectedExecutionItem.environment} / ${selectedExecutionItem.platform} / ${timeAgo(selectedExecutionItem.created_at)}` : 'Waiting for an execution'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Progress</p>
                <p className="font-mono text-lg font-bold text-cyan-300">{Math.round((latestJob?.progress ?? 0) * 100)}%</p>
              </div>
              <div className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Status</p>
                <p className="font-mono text-lg font-bold text-violet-300">{latestJob?.status ?? 'idle'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-7">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <GlassCard className="overflow-hidden p-0" animate={false} glow="violet">
                <div className="grid gap-0">
                  <AgentOrb job={latestJob} />
                  <div className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Multi-agent reasoning</p>
                        <h3 className="mt-1 text-base font-semibold text-white">OpenAI and Claude review loop</h3>
                      </div>
                      <Sparkles size={16} className={activeJob ? 'animate-pulse text-violet-300' : 'text-slate-600'} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {STAGES.map((stage, index) => (
                        <StageCard
                          key={stage.id}
                          stage={stage}
                          index={index}
                          state={stageState(stage, latestJob)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-5" animate={false} glow="cyan">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Live worklog</p>
                    <h3 className="mt-1 text-base font-semibold text-white">What the agents are doing</h3>
                  </div>
                  <RefreshCw size={15} className={activeJob ? 'animate-spin text-cyan-300' : 'text-slate-600'} />
                </div>
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {visibleSteps.slice(-8).map((step, index) => (
                      <motion.div
                        key={`${step}-${index}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        className="flex items-start gap-3 rounded-md border border-white/8 bg-white/[0.025] px-3 py-2"
                      >
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-500/10">
                          <span className="font-mono text-[9px] text-cyan-300">{index + 1}</span>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-400">{cleanText(step)}</p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {visibleSteps.length === 0 && (
                    <p className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-5 text-center text-xs text-slate-500">
                      The worklog starts when investigation begins.
                    </p>
                  )}
                </div>
              </GlassCard>
            </div>

            <div className="space-y-5">
              <GlassCard className="p-5" animate={false} glow="red">
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle size={15} className="text-red-300" />
                  <h3 className="text-base font-semibold text-white">Root Cause</h3>
                  {confidence > 0 && (
                    <span className="ml-auto rounded border border-violet-400/25 bg-violet-500/10 px-2 py-1 font-mono text-[10px] text-violet-200">
                      {confidence}%
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-slate-300">
                  {rootCause || summary || (activeJob ? 'The agents are still correlating evidence.' : 'Run an investigation to produce the root cause.')}
                </p>
              </GlassCard>

              <GlassCard className="p-5" animate={false} glow="blue">
                <div className="mb-4 flex items-center gap-2">
                  <GitBranch size={15} className="text-blue-300" />
                  <h3 className="text-base font-semibold text-white">Error Taxonomy</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {taxonomy.map((item) => (
                    <div key={item.label} className="rounded-md border border-white/8 bg-white/[0.025] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</p>
                      <p className="mt-1 break-words text-xs font-semibold text-slate-200">{item.value}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="p-5" animate={false} glow="green">
                <div className="mb-4 flex items-center gap-2">
                  <Lightbulb size={15} className="text-emerald-300" />
                  <h3 className="text-base font-semibold text-white">How to Tackle It</h3>
                </div>
                <div className="space-y-2">
                  {(recommendations.length ? recommendations : selectedInsight?.recommendation ? [selectedInsight.recommendation] : []).slice(0, 5).map((item, index) => (
                    <div key={`${item}-${index}`} className="rounded-md border border-emerald-400/15 bg-emerald-500/8 px-3 py-2">
                      <p className="text-xs leading-relaxed text-slate-300">{cleanText(item)}</p>
                    </div>
                  ))}
                  {recommendations.length === 0 && !selectedInsight?.recommendation && (
                    <p className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-4 text-xs text-slate-500">
                      Recommended action plan appears after analysis.
                    </p>
                  )}
                </div>
              </GlassCard>

              <GlassCard className="p-5" animate={false} glow="violet">
                <div className="mb-4 flex items-center gap-2">
                  <Zap size={15} className="text-violet-300" />
                  <h3 className="text-base font-semibold text-white">Findings</h3>
                </div>
                <div className="space-y-2">
                  {(findings.length ? findings : selectedInsight ? [selectedInsight.description] : []).slice(0, 5).map((item, index) => (
                    <div key={`${item}-${index}`} className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-2">
                      <p className="text-xs leading-relaxed text-slate-400">{cleanText(item)}</p>
                    </div>
                  ))}
                  {findings.length === 0 && !selectedInsight && (
                    <p className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-4 text-xs text-slate-500">
                      Findings will land here when evidence is available.
                    </p>
                  )}
                </div>
              </GlassCard>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <GlassCard className="p-5" animate={false} glow="green">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Solution board</p>
                  <h3 className="mt-1 text-base font-semibold text-white">Ranked fixes</h3>
                </div>
                {recommendedFix && (
                  <span className="rounded border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
                    best: {confidencePercent(recommendedFix.confidence)}%
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {fixes.map((fix) => (
                  <FixCard
                    key={fix.id}
                    fix={fix}
                    selected={selectedFix?.id === fix.id}
                    recommended={recommendedFix?.id === fix.id}
                    implemented={implementedFixId === fix.id}
                    onSelect={() => setSelectedFixId(fix.id)}
                  />
                ))}
                {fixes.length === 0 && (
                  <p className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-6 text-center text-xs text-slate-500">
                    No implementable fix has been detected yet.
                  </p>
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-5" animate={false} glow="green">
              <div className="mb-4 flex items-center gap-2">
                <Wrench size={15} className="text-emerald-300" />
                <h3 className="text-base font-semibold text-white">Implementation</h3>
              </div>
              {selectedFix ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-white/8 bg-white/[0.025] p-4">
                    <p className="text-sm font-semibold text-white">{selectedFix.title}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">{selectedFix.rationale}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md border border-red-400/15 bg-red-500/8 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-red-300/70">Current</p>
                        <p className="mt-1 break-all font-mono text-[10px] text-red-200/80">{selectedFix.old_value || 'not set'}</p>
                      </div>
                      <div className="rounded-md border border-emerald-400/15 bg-emerald-500/8 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-300/70">Proposed</p>
                        <p className="mt-1 break-all font-mono text-[10px] text-emerald-200/80">{selectedFix.new_value || selectedFix.blocked_reason || 'pending discovery'}</p>
                      </div>
                    </div>
                  </div>

                  {implementedFixId === selectedFix.id && (
                    <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-4">
                      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                        <CheckCircle2 size={15} />
                        Fix implemented
                      </p>
                      <p className="mt-1 text-xs text-emerald-200/70">
                        The selected locator or test-step binding has been persisted.
                      </p>
                    </div>
                  )}

                  <Button
                    variant="neon"
                    size="sm"
                    className="w-full justify-center"
                    disabled={!selectedFix.can_implement || implementFix.isPending || implementedFixId === selectedFix.id}
                    onClick={implementSelectedFix}
                  >
                    {implementFix.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    {implementedFixId === selectedFix.id ? 'Implemented' : 'Implement selected fix'}
                  </Button>
                  {!selectedFix.can_implement && (
                    <p className="text-xs text-amber-300">{selectedFix.blocked_reason || 'This fix needs manual review before implementation.'}</p>
                  )}
                </div>
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-white/8 bg-white/[0.025] text-center">
                  <Wrench size={24} className="mb-3 text-slate-600" />
                  <p className="text-sm text-slate-400">No fix selected</p>
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  );
}
