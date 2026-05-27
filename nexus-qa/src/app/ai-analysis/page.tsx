'use client';

import { useMemo, useState } from 'react';
import type { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Code2,
  Cpu,
  Database,
  Eye,
  FileSearch,
  GitBranch,
  Globe2,
  Layers3,
  Lightbulb,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wand2,
  Wrench,
  Zap,
} from 'lucide-react';
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

type Accent = 'cyan' | 'green' | 'amber' | 'red' | 'violet' | 'blue' | 'slate';

type Stage = {
  id: string;
  label: string;
  detail: string;
  icon: typeof FileSearch;
  progress: number;
  accent: Accent;
};

type Capability = {
  title: string;
  description: string;
  icon: typeof FileSearch;
  accent: Accent;
};

const JOB_TYPE_LABELS: Record<AIJobType, string> = {
  root_cause_analysis: 'Root Cause',
  flaky_detection: 'Flaky',
  locator_healing: 'Locator',
  anomaly_analysis: 'Anomaly',
};

const ACCENTS: Record<Accent, { text: string; bg: string; border: string; glow: string; solid: string }> = {
  cyan: {
    text: 'text-cyan-200',
    bg: 'bg-cyan-400/10',
    border: 'border-cyan-300/25',
    glow: 'shadow-[0_0_48px_rgba(34,211,238,0.18)]',
    solid: '#22D3EE',
  },
  green: {
    text: 'text-emerald-200',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-300/25',
    glow: 'shadow-[0_0_48px_rgba(34,197,94,0.18)]',
    solid: '#22C55E',
  },
  amber: {
    text: 'text-amber-200',
    bg: 'bg-amber-400/10',
    border: 'border-amber-300/25',
    glow: 'shadow-[0_0_48px_rgba(251,191,36,0.16)]',
    solid: '#FBBF24',
  },
  red: {
    text: 'text-red-200',
    bg: 'bg-red-400/10',
    border: 'border-red-300/25',
    glow: 'shadow-[0_0_48px_rgba(248,113,113,0.18)]',
    solid: '#F87171',
  },
  violet: {
    text: 'text-violet-200',
    bg: 'bg-violet-400/10',
    border: 'border-violet-300/25',
    glow: 'shadow-[0_0_48px_rgba(167,139,250,0.18)]',
    solid: '#A78BFA',
  },
  blue: {
    text: 'text-blue-200',
    bg: 'bg-blue-400/10',
    border: 'border-blue-300/25',
    glow: 'shadow-[0_0_48px_rgba(96,165,250,0.16)]',
    solid: '#60A5FA',
  },
  slate: {
    text: 'text-slate-300',
    bg: 'bg-slate-400/10',
    border: 'border-slate-300/15',
    glow: 'shadow-[0_0_48px_rgba(148,163,184,0.08)]',
    solid: '#94A3B8',
  },
};

const STAGES: Stage[] = [
  {
    id: 'gather_evidence',
    label: 'Evidence',
    detail: 'Nodes, logs, screenshots, DOM, API responses.',
    icon: FileSearch,
    progress: 0.15,
    accent: 'cyan',
  },
  {
    id: 'classify_failure',
    label: 'Classify',
    detail: 'Locator, action, config, backend, DB, API, environment.',
    icon: Brain,
    progress: 0.3,
    accent: 'violet',
  },
  {
    id: 'retrieve_memory',
    label: 'Memory',
    detail: 'Compare with historical failure patterns.',
    icon: Database,
    progress: 0.48,
    accent: 'blue',
  },
  {
    id: 'analyze_root_cause',
    label: 'Root Cause',
    detail: 'Trace failure from UI symptom to system cause.',
    icon: GitBranch,
    progress: 0.68,
    accent: 'red',
  },
  {
    id: 'generate_recommendations',
    label: 'Patch Plan',
    detail: 'Rank code, DB, API, config, and test-step fixes.',
    icon: Wrench,
    progress: 0.85,
    accent: 'amber',
  },
  {
    id: 'validate_results',
    label: 'Safety',
    detail: 'Check blast radius, rollback, and verification.',
    icon: ShieldCheck,
    progress: 0.96,
    accent: 'green',
  },
];

const CAPABILITIES: Capability[] = [
  {
    title: 'Config and DB',
    description: 'Test config, page repository, workflow nodes, broken links, stale JSON bindings.',
    icon: Database,
    accent: 'violet',
  },
  {
    title: 'Backend Code',
    description: 'Action mapping, plugin handler support, route errors, state machine, worker runtime.',
    icon: Code2,
    accent: 'green',
  },
  {
    title: 'Browser MCP',
    description: 'DOM, screenshots, console, network, accessibility tree, Playwright reproduction.',
    icon: Bot,
    accent: 'cyan',
  },
  {
    title: 'API Calls',
    description: 'Status, schema, auth, request payload, headers, contract mismatch.',
    icon: Globe2,
    accent: 'blue',
  },
  {
    title: 'Assertions',
    description: 'Expected vs actual, wrong test data, wrong action type, invalid validation.',
    icon: AlertTriangle,
    accent: 'amber',
  },
  {
    title: 'Safe Patches',
    description: 'Diff preview, SQL preview, audit trail, rollback plan, focused verification.',
    icon: ShieldCheck,
    accent: 'red',
  },
];

const AUTHORITY = [
  { label: 'Observe', icon: Eye, accent: 'green' as Accent },
  { label: 'Recommend', icon: Lightbulb, accent: 'cyan' as Accent },
  { label: 'Patch Config', icon: SettingsIcon, accent: 'amber' as Accent },
  { label: 'Patch Code', icon: Code2, accent: 'violet' as Accent },
  { label: 'Patch DB', icon: Database, accent: 'red' as Accent },
];

function SettingsIcon(props: ComponentProps<typeof Wrench>) {
  return <Wrench {...props} />;
}

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

function cleanText(value: string, limit = 820): string {
  const text = value
    .replace(/^\s*\[[^\]]+\]\s*/i, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'this execution')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}...` : text;
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

function stageState(stage: Stage, job: AIJobStatus | undefined): 'idle' | 'active' | 'done' | 'failed' {
  if (!job) return 'idle';
  if (job.status === 'failed' || job.status === 'cancelled') {
    return job.current_step === stage.id ? 'failed' : 'idle';
  }
  if (job.status === 'completed' || job.progress >= stage.progress) return 'done';
  if (job.current_step === stage.id) return 'active';
  return 'idle';
}

function Panel({
  children,
  className = '',
  accent = 'slate',
}: {
  children: ReactNode;
  className?: string;
  accent?: Accent;
}) {
  const a = ACCENTS[accent];
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border bg-white/[0.055] backdrop-blur-2xl ${a.border} ${className}`}
      style={{
        boxShadow: '0 24px 80px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-8 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${a.solid}88, transparent)` }}
      />
      {children}
    </div>
  );
}

function StatusPill({ label, accent = 'slate' }: { label: string; accent?: Accent }) {
  const a = ACCENTS[accent];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${a.border} ${a.bg} ${a.text}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.solid, boxShadow: `0 0 12px ${a.solid}` }} />
      {label}
    </span>
  );
}

function ThreeDBot({ job }: { job?: AIJobStatus }) {
  const running = job?.status === 'queued' || job?.status === 'running';
  const progress = Math.max(0, Math.min(100, Math.round((job?.progress ?? 0) * 100)));
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const botShiftX = useMotionValue(0);
  const botShiftY = useMotionValue(0);
  const auraShiftX = useMotionValue(0);
  const auraShiftY = useMotionValue(0);
  const eyeShiftX = useMotionValue(0);
  const eyeShiftY = useMotionValue(0);
  const spring = { stiffness: 170, damping: 18, mass: 0.45 };
  const rotateX = useSpring(tiltX, spring);
  const rotateY = useSpring(tiltY, spring);
  const x = useSpring(botShiftX, spring);
  const y = useSpring(botShiftY, spring);
  const auraX = useSpring(auraShiftX, { stiffness: 95, damping: 22, mass: 0.6 });
  const auraY = useSpring(auraShiftY, { stiffness: 95, damping: 22, mass: 0.6 });
  const eyeX = useSpring(eyeShiftX, { stiffness: 240, damping: 18, mass: 0.2 });
  const eyeY = useSpring(eyeShiftY, { stiffness: 240, damping: 18, mass: 0.2 });

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const cursorX = (event.clientX - rect.left) / rect.width - 0.5;
    const cursorY = (event.clientY - rect.top) / rect.height - 0.5;

    tiltY.set(cursorX * 26);
    tiltX.set(cursorY * -18);
    botShiftX.set(cursorX * 18);
    botShiftY.set(cursorY * 12);
    auraShiftX.set(cursorX * 120);
    auraShiftY.set(cursorY * 84);
    eyeShiftX.set(cursorX * 7);
    eyeShiftY.set(cursorY * 5);
  };

  const handlePointerLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
    botShiftX.set(0);
    botShiftY.set(0);
    auraShiftX.set(0);
    auraShiftY.set(0);
    eyeShiftX.set(0);
    eyeShiftY.set(0);
  };

  return (
    <div
      className="group relative min-h-[360px] overflow-hidden rounded-[32px] border border-cyan-300/15 bg-[radial-gradient(circle_at_50%_35%,rgba(34,211,238,0.22),rgba(15,23,42,0.16)_42%,rgba(2,6,23,0.38)_78%)]"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/20 blur-3xl"
        style={{ x: auraX, y: auraY }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/20"
        animate={{ rotate: running ? 360 : 20, scale: running ? [1, 1.04, 1] : 1 }}
        transition={{ rotate: { duration: 18, repeat: Infinity, ease: 'linear' }, scale: { duration: 3, repeat: Infinity } }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/20"
        animate={{ rotate: running ? -360 : -12 }}
        transition={{ duration: 13, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute left-8 top-10 h-16 w-16 rounded-full bg-cyan-300/20 blur-2xl"
        animate={{ y: running ? [0, 18, 0] : 0, opacity: [0.35, 0.8, 0.35] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <motion.div
        className="absolute bottom-10 right-12 h-24 w-24 rounded-full bg-emerald-300/20 blur-2xl"
        animate={{ y: running ? [0, -24, 0] : 0, opacity: [0.25, 0.75, 0.25] }}
        transition={{ duration: 5, repeat: Infinity }}
      />

      <div className="absolute left-6 top-6">
        <StatusPill label={running ? 'Inspecting' : 'Standby'} accent={running ? 'green' : 'slate'} />
      </div>

      <div className="absolute bottom-6 left-6 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 backdrop-blur-xl">
        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Confidence core</p>
        <p className="mt-1 font-mono text-2xl font-bold text-cyan-200">{progress}%</p>
      </div>

      <div className="absolute inset-0 flex items-center justify-center [perspective:900px]">
        <motion.div
          className="relative h-56 w-56 [transform-style:preserve-3d]"
          style={{ rotateX, rotateY, x, y }}
        >
          <motion.div
            className="absolute inset-0 [transform-style:preserve-3d]"
            animate={{ y: running ? [0, -10, 0] : [0, -4, 0] }}
            transition={{ duration: running ? 3.2 : 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="absolute left-1/2 top-0 h-6 w-1 -translate-x-1/2 rounded-full bg-cyan-200/80 shadow-[0_0_18px_rgba(34,211,238,0.8)]" />
            <motion.div
              className="absolute left-1/2 top-[-13px] h-5 w-5 -translate-x-1/2 rounded-full bg-emerald-300 shadow-[0_0_28px_rgba(34,197,94,0.9)]"
              animate={{ scale: running ? [1, 1.22, 1] : [1, 1.08, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <div className="absolute left-1/2 top-7 h-28 w-36 -translate-x-1/2 rounded-[42px] border border-cyan-200/30 bg-[linear-gradient(145deg,rgba(226,252,255,0.96),rgba(56,189,248,0.52)_45%,rgba(14,116,144,0.72))] shadow-[0_35px_80px_rgba(34,211,238,0.28),inset_12px_14px_22px_rgba(255,255,255,0.62),inset_-18px_-18px_28px_rgba(8,47,73,0.38)]">
              <div className="absolute inset-x-5 top-10 h-11 rounded-[24px] border border-slate-950/20 bg-slate-950/88 shadow-[inset_0_0_18px_rgba(34,211,238,0.25)]">
                <motion.div
                  className="absolute left-5 top-4 h-3 w-5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.9)]"
                  style={{ x: eyeX, y: eyeY }}
                />
                <motion.div
                  className="absolute right-5 top-4 h-3 w-5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.9)]"
                  style={{ x: eyeX, y: eyeY }}
                />
                <motion.div
                  className="absolute left-1/2 top-6 h-1 w-9 -translate-x-1/2 rounded-full bg-emerald-300/80"
                  animate={{ width: running ? [24, 38, 24] : 30 }}
                  transition={{ duration: 1.9, repeat: Infinity }}
                />
              </div>
            </div>
            <div className="absolute left-1/2 top-[128px] h-20 w-28 -translate-x-1/2 rounded-[34px] border border-white/20 bg-[linear-gradient(145deg,rgba(103,232,249,0.78),rgba(15,23,42,0.92))] shadow-[0_32px_80px_rgba(15,23,42,0.55),inset_10px_12px_22px_rgba(255,255,255,0.22)]">
              <div className="absolute left-1/2 top-6 h-8 w-8 -translate-x-1/2 rounded-full border border-cyan-200/30 bg-cyan-300/10">
                <Sparkles className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-100" size={16} />
              </div>
            </div>
            <div className="absolute left-[22px] top-[142px] h-11 w-7 rotate-[-18deg] rounded-full bg-cyan-200/50 blur-[0.2px]" />
            <div className="absolute right-[22px] top-[142px] h-11 w-7 rotate-[18deg] rounded-full bg-cyan-200/50 blur-[0.2px]" />
            <div className="absolute bottom-2 left-1/2 h-5 w-36 -translate-x-1/2 rounded-full bg-cyan-300/30 blur-xl" />
            <motion.div
              className="pointer-events-none absolute -bottom-7 left-1/2 h-8 w-44 -translate-x-1/2 rounded-full bg-cyan-200/20 blur-2xl"
              animate={{ opacity: running ? [0.35, 0.72, 0.35] : [0.25, 0.42, 0.25] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

function StageRail({ job }: { job?: AIJobStatus }) {
  return (
    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
      {STAGES.map((stage, index) => {
        const state = stageState(stage, job);
        const Icon = stage.icon;
        const accent = ACCENTS[stage.accent];
        const active = state === 'active';
        const done = state === 'done';
        const failed = state === 'failed';
        return (
          <motion.div
            key={stage.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.035 }}
            className={`rounded-2xl border p-3 ${active || done ? accent.border : 'border-white/8'} ${active ? accent.bg : 'bg-white/[0.035]'}`}
          >
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${accent.border} ${done ? accent.bg : 'bg-black/20'} ${accent.text}`}>
                {done ? <CheckCircle2 size={15} /> : active ? <Loader2 size={15} className="animate-spin" /> : failed ? <AlertTriangle size={15} /> : <Icon size={15} />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{stage.label}</p>
                <p className="text-[9px] uppercase tracking-wider text-slate-500">{state}</p>
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-slate-400">{stage.detail}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: typeof Activity; accent: Accent }) {
  const a = ACCENTS[accent];
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${a.border} ${a.bg} ${a.text}`}>
          <Icon size={16} />
        </div>
        <p className={`font-mono text-2xl font-bold ${a.text}`}>{value}</p>
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
    </div>
  );
}

function InsightCard({ insight }: { insight: IntelligenceInsight }) {
  const severityAccent: Accent = insight.severity === 'critical' || insight.severity === 'high'
    ? 'red'
    : insight.severity === 'medium'
      ? 'amber'
      : 'blue';
  const a = ACCENTS[severityAccent];
  return (
    <div className={`rounded-2xl border p-4 ${a.border} bg-white/[0.035]`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${a.border} ${a.bg} ${a.text}`}>
          <AlertTriangle size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${a.text}`}>{insight.severity}</span>
            <span className="text-[10px] text-slate-600">{confidencePercent(insight.confidence)}%</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-white">{insight.title}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{cleanText(insight.description, 240)}</p>
        </div>
      </div>
    </div>
  );
}

function FixCard({
  fix,
  implemented,
  disabled,
  onImplement,
}: {
  fix: FixSuggestion;
  implemented: boolean;
  disabled: boolean;
  onImplement: () => void;
}) {
  const confidence = confidencePercent(fix.confidence);
  const accent: Accent = confidence >= 80 ? 'green' : confidence >= 60 ? 'amber' : 'red';
  const a = ACCENTS[accent];
  return (
    <div className={`rounded-3xl border p-5 ${implemented ? 'border-emerald-300/30 bg-emerald-400/8' : 'border-white/8 bg-white/[0.04]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wrench size={15} className={a.text} />
            <p className="text-sm font-semibold text-white">{fix.title}</p>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">{fix.rationale}</p>
        </div>
        <StatusPill label={`${confidence}%`} accent={accent} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-red-300/15 bg-red-400/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-red-200/70">Current</p>
          <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-red-100/75">{fix.old_value || 'not set'}</p>
        </div>
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/70">Proposed</p>
          <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-emerald-100/75">{fix.new_value || fix.blocked_reason || 'pending discovery'}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500">
          Target: <span className="text-slate-300">{fix.target_type.replace('_', ' ')}</span>
        </p>
        <Button
          variant="neon"
          size="sm"
          disabled={!fix.can_implement || disabled || implemented}
          onClick={onImplement}
        >
          {disabled ? <Loader2 size={13} className="animate-spin" /> : implemented ? <CheckCircle2 size={13} /> : <Wand2 size={13} />}
          {implemented ? 'Implemented' : 'Apply with audit'}
        </Button>
      </div>
    </div>
  );
}

function CapabilityGrid() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {CAPABILITIES.map((cap) => {
        const Icon = cap.icon;
        const a = ACCENTS[cap.accent];
        return (
          <div key={cap.title} className={`rounded-2xl border p-4 ${a.border} bg-white/[0.035]`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${a.border} ${a.bg} ${a.text}`}>
              <Icon size={17} />
            </div>
            <p className="mt-3 text-sm font-semibold text-white">{cap.title}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">{cap.description}</p>
          </div>
        );
      })}
    </div>
  );
}

function AuthorityStrip() {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {AUTHORITY.map((item, index) => {
        const Icon = item.icon;
        const a = ACCENTS[item.accent];
        return (
          <div key={item.label} className={`flex min-w-[130px] items-center gap-2 rounded-2xl border px-3 py-2 ${index < 3 ? a.border : 'border-white/8'} ${index < 3 ? a.bg : 'bg-white/[0.025]'}`}>
            <Icon size={14} className={index < 3 ? a.text : 'text-slate-600'} />
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${index < 3 ? a.text : 'text-slate-500'}`}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Worklog({ steps, active }: { steps: string[]; active: boolean }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-slate-950/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-cyan-200" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Agent Worklog</p>
        </div>
        <StatusPill label={active ? 'Live' : 'Idle'} accent={active ? 'green' : 'slate'} />
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {steps.map((step, index) => (
            <motion.div
              key={`${step}-${index}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-3 rounded-2xl border border-white/6 bg-white/[0.025] px-3 py-2"
            >
              <span className="mt-0.5 font-mono text-[10px] text-cyan-300">&gt;</span>
              <p className="text-xs leading-relaxed text-slate-300">{cleanText(step, 280)}</p>
            </motion.div>
          ))}
        </AnimatePresence>
        {steps.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-500">Run inspection to stream tool calls and reasoning here.</p>
        )}
      </div>
    </div>
  );
}

export default function AIAnalysisPage() {
  const { data: executions = [] } = useExecutions();
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
  const [jobType, setJobType] = useState<AIJobType>('root_cause_analysis');
  const [implementedFixId, setImplementedFixId] = useState('');

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
  const insights = useMemo(() => analysis?.insights ?? [], [analysis]);
  const findings = asList(jobResult?.findings);
  const recommendations = asList(jobResult?.recommendations);
  const analysisSteps = asList(jobResult?.analysis_steps);
  const rootCause = cleanText(asText(jobResult?.root_cause) || asText(jobResult?.summary) || insights[0]?.description || '', 900);
  const confidence = confidencePercent(typeof jobResult?.confidence === 'number' ? jobResult.confidence : insights[0]?.confidence);
  const progress = Math.round((latestJob?.progress ?? 0) * 100);
  const failedCount = selectedExecutionItem ? Math.max(selectedExecutionItem.node_count - selectedExecutionItem.completed_nodes, 0) : 0;
  const recommendedFixes = [...fixes].sort((a, b) => {
    if (a.can_implement !== b.can_implement) return a.can_implement ? -1 : 1;
    return b.confidence - a.confidence;
  });

  const worklogSteps = analysisSteps.length
    ? analysisSteps
    : activeJob
      ? STAGES.filter((stage) => progress >= Math.round(stage.progress * 100) - 10).map((stage) => `${stage.label}: ${stage.detail}`)
      : [];

  const runInvestigation = () => {
    if (!selectedExecutionId) return;
    setImplementedFixId('');
    triggerMutation.mutate({ executionId: selectedExecutionId, jobType });
  };

  const implementSelectedFix = (fix: FixSuggestion) => {
    if (!selectedExecutionId) return;
    implementFix.mutate(
      { executionId: selectedExecutionId, nodeKey: fix.node_key },
      { onSuccess: () => setImplementedFixId(fix.id) },
    );
  };

  return (
    <div
      className="relative h-full overflow-y-auto bg-[#031118] text-slate-100"
      style={{
        fontFamily: "'Fira Sans', 'Segoe UI', sans-serif",
        background:
          'radial-gradient(circle at 12% 12%, rgba(34,211,238,0.18), transparent 32%), radial-gradient(circle at 86% 4%, rgba(34,197,94,0.14), transparent 30%), linear-gradient(135deg, #031118 0%, #061c24 46%, #020617 100%)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-cyan-300/10 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-5 py-5 lg:px-7">
        <Panel accent="cyan" className="p-5 lg:p-6">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="flex min-w-0 flex-col justify-between gap-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label="MCP Inspect" accent="green" />
                  <StatusPill label="Full-system diagnosis" accent="cyan" />
                </div>
                <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-[-0.04em] text-white md:text-6xl">
                  AI Inspect that can follow the failure all the way down.
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-cyan-50/70 md:text-base">
                  Not just "XPath wrong". This cockpit checks locator quality, page element links, action mapping,
                  backend handler support, stale workflow config, DB integrity, API evidence, and browser runtime behavior.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Execution</span>
                    <select
                      value={selectedExecutionId ?? ''}
                      onChange={(event) => setSelectedExecution(event.target.value || null)}
                      className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
                    >
                      {executions.length === 0 && <option value="">No executions</option>}
                      {executions.map((execution) => (
                        <option key={execution.id} value={execution.id}>
                          {executionLabel(execution)} | {execution.status}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Inspect Mode</span>
                    <select
                      value={jobType}
                      onChange={(event) => setJobType(event.target.value as AIJobType)}
                      className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
                    >
                      {(Object.entries(JOB_TYPE_LABELS) as [AIJobType, string][]).map(([type, label]) => (
                        <option key={type} value={type}>{label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex items-end">
                  <Button
                    variant="neon"
                    size="md"
                    className="h-11 w-full rounded-2xl border-emerald-300/40 bg-emerald-400/15 px-5 text-emerald-100 hover:bg-emerald-400/25 md:w-auto"
                    disabled={!selectedExecutionId || triggerMutation.isPending || activeJob}
                    onClick={runInvestigation}
                  >
                    {triggerMutation.isPending || activeJob ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                    {triggerMutation.isPending || activeJob ? 'Inspecting...' : 'Run Deep Inspect'}
                  </Button>
                </div>
              </div>
            </div>

            <ThreeDBot job={latestJob} />
          </div>
        </Panel>

        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Evidence Items" value={analysis ? analysis.evidence_counts.nodes + analysis.evidence_counts.timeline_entries + analysis.evidence_counts.events + analysis.evidence_counts.artifacts : 0} icon={Layers3} accent="cyan" />
          <MetricCard label="Failed Nodes" value={analysis?.summary.failed_nodes ?? failedCount} icon={AlertTriangle} accent="red" />
          <MetricCard label="Insights" value={insights.length} icon={Brain} accent="violet" />
          <MetricCard label="Patch Plans" value={fixes.length} icon={Wrench} accent="green" />
        </div>

        <Panel accent="green" className="p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Authority</p>
              <p className="mt-1 text-sm text-slate-300">Read deeply by default. Mutations remain previewed, audited, and rollback-aware.</p>
            </div>
            <StatusPill label="Policy guarded" accent="green" />
          </div>
          <AuthorityStrip />
        </Panel>

        <Panel accent="violet" className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Inspection Pipeline</p>
              <h2 className="mt-1 text-lg font-bold text-white">From symptom to verified repair</h2>
            </div>
            <StatusPill label={latestJob?.status ?? 'idle'} accent={activeJob ? 'green' : latestJob?.status === 'failed' ? 'red' : 'slate'} />
          </div>
          <StageRail job={latestJob} />
        </Panel>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
          <div className="space-y-5">
            <Panel accent="red" className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Root Cause</p>
                  <h2 className="mt-1 text-xl font-bold text-white">
                    {selectedExecutionItem ? executionLabel(selectedExecutionItem) : 'Select an execution'}
                  </h2>
                  {selectedExecutionItem && (
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedExecutionItem.environment} / {selectedExecutionItem.platform} / {timeAgo(selectedExecutionItem.started_at ?? selectedExecutionItem.created_at)}
                    </p>
                  )}
                </div>
                <StatusPill label={confidence ? `${confidence}% confidence` : 'pending'} accent={confidence >= 80 ? 'green' : confidence >= 50 ? 'amber' : 'slate'} />
              </div>
              <div className="rounded-3xl border border-white/8 bg-slate-950/40 p-5">
                <p className="text-sm leading-7 text-slate-200">
                  {rootCause || (activeJob ? 'AI Inspect is correlating execution evidence, code paths, DB links, and runtime behavior.' : 'Run Deep Inspect to produce a detailed root-cause narrative.')}
                </p>
              </div>
            </Panel>

            <Panel accent="green" className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Patch Plans</p>
                  <h2 className="mt-1 text-lg font-bold text-white">Clean preview before anything changes</h2>
                </div>
                <StatusPill label={`${recommendedFixes.length} found`} accent={recommendedFixes.length ? 'green' : 'slate'} />
              </div>
              <div className="space-y-3">
                {recommendedFixes.slice(0, 4).map((fix) => (
                  <FixCard
                    key={fix.id}
                    fix={fix}
                    implemented={implementedFixId === fix.id}
                    disabled={implementFix.isPending}
                    onImplement={() => implementSelectedFix(fix)}
                  />
                ))}
                {recommendedFixes.length === 0 && (
                  <div className="rounded-3xl border border-white/8 bg-white/[0.035] p-8 text-center">
                    <Wrench className="mx-auto text-slate-600" size={26} />
                    <p className="mt-3 text-sm font-semibold text-slate-300">No patch plan yet</p>
                    <p className="mt-1 text-xs text-slate-500">Run inspection or capture more evidence to generate repair candidates.</p>
                  </div>
                )}
              </div>
            </Panel>

            <Panel accent="cyan" className="p-5">
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Capability Matrix</p>
                <h2 className="mt-1 text-lg font-bold text-white">What this dashboard is allowed to inspect</h2>
              </div>
              <CapabilityGrid />
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel accent="cyan" className="p-4">
              <Worklog steps={worklogSteps.slice(-8)} active={!!activeJob} />
            </Panel>

            <Panel accent="amber" className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Lightbulb size={16} className="text-amber-200" />
                <h2 className="text-lg font-bold text-white">Recommended Next Moves</h2>
              </div>
              <div className="space-y-2">
                {(recommendations.length ? recommendations : insights[0]?.recommendation ? [insights[0].recommendation] : []).slice(0, 5).map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-2xl border border-amber-300/15 bg-amber-400/5 px-4 py-3">
                    <p className="text-xs leading-relaxed text-slate-300">{cleanText(item, 220)}</p>
                  </div>
                ))}
                {recommendations.length === 0 && !insights[0]?.recommendation && (
                  <p className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-5 text-center text-xs text-slate-500">
                    Recommendations appear after analysis.
                  </p>
                )}
              </div>
            </Panel>

            <Panel accent="violet" className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Activity size={16} className="text-violet-200" />
                <h2 className="text-lg font-bold text-white">Findings</h2>
              </div>
              <div className="space-y-3">
                {(findings.length ? findings : []).slice(0, 4).map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3">
                    <p className="text-xs leading-relaxed text-slate-300">{cleanText(item, 260)}</p>
                  </div>
                ))}
                {findings.length === 0 && insights.slice(0, 3).map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
                {findings.length === 0 && insights.length === 0 && (
                  <p className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-5 text-center text-xs text-slate-500">
                    Findings will land here when evidence is available.
                  </p>
                )}
              </div>
            </Panel>

            <Panel accent="slate" className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Cpu size={16} className="text-slate-300" />
                <h2 className="text-lg font-bold text-white">Recent Jobs</h2>
              </div>
              <div className="space-y-2">
                {aiJobs.slice(0, 4).map((job) => (
                  <div key={job.id} className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-slate-200">{JOB_TYPE_LABELS[job.job_type] ?? job.job_type}</p>
                      <span className="font-mono text-[10px] text-cyan-200">{Math.round(job.progress * 100)}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                      <motion.div
                        animate={{ width: `${Math.round(job.progress * 100)}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300"
                      />
                    </div>
                    <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">{job.status}</p>
                  </div>
                ))}
                {aiJobs.length === 0 && (
                  <p className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-5 text-center text-xs text-slate-500">
                    No investigation jobs yet.
                  </p>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
