'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ComponentProps, FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
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
  Send,
  Wand2,
  Wrench,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUIStore } from '@/lib/stores/uiStore';
import { useExecutions } from '@/lib/api/executions';
import {
  useAskAIInspectAssistant,
  useAIProviderStatus,
  useAIJobs,
  useExecutionAnalysis,
  useImplementAllFixSuggestions,
  useFixSuggestions,
  useImplementFixSuggestion,
  useTriggerAIAnalysis,
  type AssistantQueryResponse,
  type AssistantSource,
  type AIProviderStatus,
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
        return text ? `${key.replace(/_/g, ' ')}: ${text}` : '';
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
  const isLight = useUIStore((s) => s.theme === 'light');
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border ${isLight ? 'bg-[var(--color-surface-1)]' : 'bg-white/[0.055] backdrop-blur-2xl'} ${a.border} ${className}`}
      style={{
        boxShadow: isLight
          ? '0 1px 3px rgba(15,23,42,0.05)'
          : '0 24px 80px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-8 top-0 h-px"
        style={{ background: isLight ? 'rgba(15,23,42,0.08)' : `linear-gradient(90deg, transparent, ${a.solid}88, transparent)` }}
      />
      {children}
    </div>
  );
}

function StatusPill({ label, accent = 'slate' }: { label: string; accent?: Accent }) {
  const a = ACCENTS[accent];
  const isLight = useUIStore((s) => s.theme === 'light');
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${a.border} ${a.bg} ${a.text}`}
      style={isLight
        ? {
            background: 'var(--color-surface-1)',
            borderColor: 'var(--color-line-default)',
            color: 'var(--color-fg-muted)',
          }
        : undefined}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.solid, boxShadow: isLight ? 'none' : `0 0 12px ${a.solid}` }} />
      {label}
    </span>
  );
}

function ThreeDBot({ job }: { job?: AIJobStatus }) {
  const isLight = useUIStore((s) => s.theme === 'light');
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
      className="group relative min-h-[360px] overflow-hidden rounded-[32px] border border-cyan-300/15 bg-[var(--color-surface-1)]"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        background: isLight
          ? 'var(--color-surface-1)'
          : 'radial-gradient(circle at 50% 35%, rgba(34,211,238,0.18), transparent 42%), linear-gradient(180deg, var(--color-surface-1), var(--color-bg-base))',
      }}
    >
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/20 blur-3xl"
        style={isLight ? { x: auraX, y: auraY, opacity: 0 } : { x: auraX, y: auraY }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/20"
        style={isLight ? { borderColor: 'var(--color-line-default)' } : undefined}
        animate={{ rotate: running ? 360 : 20, scale: running ? [1, 1.04, 1] : 1 }}
        transition={{ rotate: { duration: 18, repeat: Infinity, ease: 'linear' }, scale: { duration: 3, repeat: Infinity } }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/20"
        style={isLight ? { borderColor: 'var(--color-line-default)' } : undefined}
        animate={{ rotate: running ? -360 : -12 }}
        transition={{ duration: 13, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute left-8 top-10 h-16 w-16 rounded-full bg-cyan-300/20 blur-2xl"
        style={isLight ? { opacity: 0 } : undefined}
        animate={{ y: running ? [0, 18, 0] : 0, opacity: [0.35, 0.8, 0.35] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <motion.div
        className="absolute bottom-10 right-12 h-24 w-24 rounded-full bg-emerald-300/20 blur-2xl"
        style={isLight ? { opacity: 0 } : undefined}
        animate={{ y: running ? [0, -24, 0] : 0, opacity: [0.25, 0.75, 0.25] }}
        transition={{ duration: 5, repeat: Infinity }}
      />

      <div className="absolute left-6 top-6">
        <StatusPill label={running ? 'Inspecting' : 'Standby'} accent={running ? 'green' : 'slate'} />
      </div>

      <div
        className="absolute bottom-6 left-6 rounded-2xl border border-[var(--color-line-default)] bg-[var(--color-surface-overlay)] px-4 py-3 backdrop-blur-xl"
        style={isLight ? { background: 'var(--color-surface-1)', backdropFilter: 'none' } : undefined}
      >
        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Confidence core</p>
        <p className="mt-1 font-mono text-2xl font-bold text-cyan-200" style={isLight ? { color: 'var(--color-fg-default)' } : undefined}>{progress}%</p>
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
            <div
              className="absolute left-1/2 top-0 h-6 w-1 -translate-x-1/2 rounded-full bg-cyan-200/80 shadow-[0_0_18px_rgba(34,211,238,0.8)]"
              style={isLight ? { background: 'rgba(148,163,184,0.8)', boxShadow: 'none' } : undefined}
            />
            <motion.div
              className="absolute left-1/2 top-[-13px] h-5 w-5 -translate-x-1/2 rounded-full bg-emerald-300 shadow-[0_0_28px_rgba(34,197,94,0.9)]"
              style={isLight ? { background: 'rgba(148,163,184,0.85)', boxShadow: 'none' } : undefined}
              animate={{ scale: running ? [1, 1.22, 1] : [1, 1.08, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <div
              className="absolute left-1/2 top-7 h-28 w-36 -translate-x-1/2 rounded-[42px] border border-cyan-200/30 bg-[linear-gradient(145deg,rgba(226,252,255,0.96),rgba(56,189,248,0.52)_45%,rgba(14,116,144,0.72))] shadow-[0_35px_80px_rgba(34,211,238,0.28),inset_12px_14px_22px_rgba(255,255,255,0.62),inset_-18px_-18px_28px_rgba(8,47,73,0.38)]"
              style={isLight
                ? {
                    background: 'var(--color-surface-1)',
                    borderColor: 'var(--color-line-default)',
                    boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
                  }
                : undefined}
            >
              <div
                className="absolute inset-x-5 top-10 h-11 rounded-[24px] border border-[var(--color-line-default)] bg-[var(--color-surface-1)] shadow-[inset_0_0_18px_rgba(34,211,238,0.18)]"
                style={isLight ? { boxShadow: 'none' } : undefined}
              >
                <motion.div
                  className="absolute left-5 top-4 h-3 w-5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.9)]"
                  style={isLight
                    ? { x: eyeX, y: eyeY, background: 'rgba(15,23,42,0.55)', boxShadow: 'none' }
                    : { x: eyeX, y: eyeY }}
                />
                <motion.div
                  className="absolute right-5 top-4 h-3 w-5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.9)]"
                  style={isLight ? { x: eyeX, y: eyeY, background: 'rgba(15,23,42,0.55)', boxShadow: 'none' } : { x: eyeX, y: eyeY }}
                />
                <motion.div
                  className="absolute left-1/2 top-6 h-1 w-9 -translate-x-1/2 rounded-full bg-emerald-300/80"
                  style={isLight ? { background: 'rgba(148,163,184,0.85)' } : undefined}
                  animate={{ width: running ? [24, 38, 24] : 30 }}
                  transition={{ duration: 1.9, repeat: Infinity }}
                />
              </div>
            </div>
            <div
              className="absolute left-1/2 top-[128px] h-20 w-28 -translate-x-1/2 rounded-[34px] border border-white/20 bg-[linear-gradient(145deg,rgba(103,232,249,0.78),rgba(34,211,238,0.18))] shadow-[0_24px_60px_rgba(14,116,144,0.18),inset_10px_12px_22px_rgba(255,255,255,0.22)]"
              style={isLight
                ? {
                    background: 'var(--color-surface-1)',
                    borderColor: 'var(--color-line-default)',
                    boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
                  }
                : undefined}
            >
              <div
                className="absolute left-1/2 top-6 h-8 w-8 -translate-x-1/2 rounded-full border border-cyan-200/30 bg-cyan-300/10"
                style={isLight ? { borderColor: 'var(--color-line-default)', background: 'var(--color-surface-1)' } : undefined}
              >
                <Sparkles
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-100"
                  size={16}
                  style={isLight ? { color: 'var(--color-fg-default)' } : undefined}
                />
              </div>
            </div>
            <div className="absolute left-[22px] top-[142px] h-11 w-7 rotate-[-18deg] rounded-full bg-cyan-200/50 blur-[0.2px]" style={isLight ? { opacity: 0 } : undefined} />
            <div className="absolute right-[22px] top-[142px] h-11 w-7 rotate-[18deg] rounded-full bg-cyan-200/50 blur-[0.2px]" style={isLight ? { opacity: 0 } : undefined} />
            <div className="absolute bottom-2 left-1/2 h-5 w-36 -translate-x-1/2 rounded-full bg-cyan-300/30 blur-xl" style={isLight ? { opacity: 0 } : undefined} />
            <motion.div
              className="pointer-events-none absolute -bottom-7 left-1/2 h-8 w-44 -translate-x-1/2 rounded-full bg-cyan-200/20 blur-2xl"
              style={isLight ? { opacity: 0 } : undefined}
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
    <div className="rounded-3xl border border-white/8 bg-[var(--color-surface-1)] p-4">
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

type TerminalMessage = {
  role: 'system' | 'assistant' | 'user';
  text: string;
  result?: AssistantQueryResponse;
};

type AssistantScreen = 'chat' | 'evidence' | 'fixes' | 'plan';

type AssistantScreenMeta = {
  id: AssistantScreen;
  label: string;
  icon: typeof Terminal;
  accent: Accent;
};

const ASSISTANT_SCREENS: AssistantScreenMeta[] = [
  { id: 'chat', label: 'Console', icon: Terminal, accent: 'cyan' },
  { id: 'evidence', label: 'Evidence', icon: FileSearch, accent: 'blue' },
  { id: 'fixes', label: 'Fixes', icon: Wrench, accent: 'green' },
  { id: 'plan', label: 'RAG', icon: Database, accent: 'violet' },
];

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => (
    !!item && typeof item === 'object' && !Array.isArray(item)
  ));
}

function providerAccent(status: string): Accent {
  if (status === 'ok' || status === 'ready') return 'green';
  if (status === 'quota_exhausted' || status === 'auth_failed') return 'amber';
  if (status === 'not_configured' || status === 'package_missing') return 'slate';
  return 'red';
}

function providerLabel(status: string): string {
  if (status === 'quota_exhausted') return 'Quota exhausted';
  if (status === 'auth_failed') return 'Auth failed';
  if (status === 'package_missing') return 'Package missing';
  if (status === 'not_configured') return 'Not configured';
  return status;
}

function ProviderCouncil({
  statuses,
  attempts,
  checking,
  onCheck,
}: {
  statuses: AIProviderStatus[];
  attempts: Record<string, unknown>[];
  checking: boolean;
  onCheck: () => void;
}) {
  const attemptsByProvider = new Map(attempts.map((attempt) => [asText(attempt.provider), attempt]));
  return (
    <Panel accent="blue" className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Provider Council</p>
          <h2 className="mt-1 text-lg font-bold text-white">OpenAI and Claude health</h2>
          <p className="mt-1 text-xs text-slate-500">
            OpenAI remains the fallback path when Claude is out of quota. When both are healthy, the Lab compares both and selects the strongest fix.
          </p>
        </div>
        <Button variant="neon" size="sm" onClick={onCheck} disabled={checking}>
          {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {checking ? 'Checking...' : 'Check Live'}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {statuses.map((status) => {
          const attempt = attemptsByProvider.get(status.provider);
          const liveStatus = asText(attempt?.status) || status.status;
          const confidence = asText(attempt?.confidence);
          const error = asText(attempt?.error) || status.error || '';
          return (
            <div key={status.provider} className={`rounded-2xl border p-4 ${ACCENTS[providerAccent(liveStatus)].border} bg-white/[0.035]`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">{status.label}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-500">{status.model}</p>
                </div>
                <StatusPill label={providerLabel(liveStatus)} accent={providerAccent(liveStatus)} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                {liveStatus === 'ok'
                  ? `Working${confidence ? ` at ${confidence} confidence` : ''}.`
                  : error || 'Ready to check live availability.'}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function AssistantSourceList({ sources }: { sources: AssistantSource[] }) {
  if (sources.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.035] px-4 py-8 text-center">
        <FileSearch className="mx-auto text-slate-600" size={24} />
        <p className="mt-3 text-xs text-slate-500">Ask a question to retrieve execution, workflow, job, and fix evidence.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      {sources.map((source, index) => (
        <div key={`${source.type}-${source.label}-${index}`} className="rounded-xl border border-blue-300/15 bg-blue-400/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-blue-100">{source.label}</p>
            <span className="rounded-md border border-blue-300/15 bg-blue-400/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-blue-200">
              {source.type}
            </span>
          </div>
          <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-slate-300">{cleanText(source.excerpt, 720)}</p>
        </div>
      ))}
    </div>
  );
}

function AssistantFixCouncil({
  fix,
  modelFixes,
  implementing,
  implementedFixId,
  onImplementFix,
}: {
  fix?: FixSuggestion;
  modelFixes: ModelFixCandidate[];
  implementing: boolean;
  implementedFixId: string;
  onImplementFix?: (fix: FixSuggestion) => void;
}) {
  if (!fix) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.035] px-4 py-8 text-center">
        <Wrench className="mx-auto text-slate-600" size={24} />
        <p className="mt-3 text-sm font-semibold text-slate-300">No fix candidate selected</p>
        <p className="mt-1 text-xs text-slate-500">Ask "show fixes" or run a Lab Scan to build a patch council.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        {modelFixes.map((candidate) => (
          <div
            key={candidate.model}
            className={[
              'rounded-xl border p-3 transition-colors',
              candidate.recommended
                ? 'border-emerald-300/25 bg-emerald-400/8'
                : 'border-cyan-300/15 bg-cyan-400/5',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">{candidate.model}</p>
              <StatusPill label={candidate.recommended ? 'Recommended' : `${confidencePercent(candidate.confidence)}%`} accent={candidate.recommended ? 'green' : 'cyan'} />
            </div>
            <p className="mt-2 text-xs font-semibold text-white">{candidate.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{candidate.summary}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-red-300/15 bg-red-400/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-red-200/70">Current</p>
          <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-red-100/75">{fix.old_value || 'not set'}</p>
        </div>
        <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/70">Proposed</p>
          <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-emerald-100/75">{fix.new_value || fix.blocked_reason || 'pending discovery'}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-[var(--color-surface-1)] px-3 py-3">
        <div>
          <p className="text-xs font-semibold text-white">{fix.title}</p>
          <p className="mt-1 text-[11px] text-slate-500">Target: {fixTargetLabel(fix)} / {fix.field}</p>
        </div>
        <Button
          variant="neon"
          size="sm"
          disabled={!fix.can_implement || implementing || implementedFixId === fix.id || !onImplementFix}
          onClick={() => onImplementFix?.(fix)}
        >
          {implementing ? <Loader2 size={13} className="animate-spin" /> : implementedFixId === fix.id ? <CheckCircle2 size={13} /> : <Wand2 size={13} />}
          {implementedFixId === fix.id ? 'Implemented' : 'Implement recommended'}
        </Button>
      </div>
    </div>
  );
}

function AssistantRagPlan({ result }: { result: AssistantQueryResponse | null }) {
  const panels = result?.panels ?? {};
  const ragScope = Array.isArray(panels.rag_scope) ? panels.rag_scope.map(asText).filter(Boolean) : [];
  const failedNodes = asRecordArray(panels.failed_nodes);
  const workflowContext = asRecordArray(panels.workflow_context);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-4">
        <div className="rounded-xl border border-violet-300/15 bg-violet-400/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-violet-200/70">Intent</p>
          <p className="mt-2 font-mono text-sm text-violet-100">{result?.intent ?? 'waiting'}</p>
        </div>
        <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">Confidence</p>
          <p className="mt-2 font-mono text-sm text-cyan-100">{result ? `${confidencePercent(result.confidence)}%` : '0%'}</p>
        </div>
        <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/70">Fixes</p>
          <p className="mt-2 font-mono text-sm text-emerald-100">{result?.fixes.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-amber-300/15 bg-amber-400/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-amber-200/70">Answer</p>
          <p className="mt-2 font-mono text-sm text-amber-100">{result?.answer_source ?? 'waiting'}</p>
        </div>
      </div>

      <div className="rounded-xl border border-white/8 bg-[var(--color-surface-1)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Retrieved DB scope</p>
          <span className="font-mono text-[10px] text-slate-500">
            {result?.provider ? `${result.provider}/${result.model ?? 'default model'}` : result?.llm_error ?? 'LLM not queried yet'}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(ragScope.length ? ragScope : ['executions', 'execution_nodes', 'workflow_nodes', 'intelligence_jobs']).map((item) => (
            <span key={item} className="rounded-md border border-violet-300/15 bg-violet-400/10 px-2 py-1 font-mono text-[10px] text-violet-100">
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-red-300/15 bg-red-400/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-200/70">Failed nodes</p>
          <div className="mt-3 space-y-2">
            {failedNodes.length === 0 && <p className="text-xs text-slate-500">No failed node rows retrieved yet.</p>}
            {failedNodes.slice(0, 4).map((node, index) => (
              <p key={`${asText(node.node_key)}-${index}`} className="font-mono text-[11px] leading-relaxed text-slate-300">
                {asText(node.node_key) || 'node'} / {asText(node.type) || 'unknown'} / {asText(node.status) || 'unknown'}
              </p>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-blue-300/15 bg-blue-400/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200/70">Workflow context</p>
          <div className="mt-3 space-y-2">
            {workflowContext.length === 0 && <p className="text-xs text-slate-500">No workflow config rows retrieved yet.</p>}
            {workflowContext.slice(0, 4).map((node, index) => (
              <p key={`${asText(node.node_key)}-${index}`} className="font-mono text-[11px] leading-relaxed text-slate-300">
                {asText(node.node_key) || 'node'} / {asText(node.type) || 'unknown'} / {cleanText(asText(node.config), 120)}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

type ModelFixCandidate = {
  model: 'OpenAI 5.5' | 'Claude';
  title: string;
  confidence: number;
  summary: string;
  recommended?: boolean;
};

function fixTargetLabel(fix?: FixSuggestion): string {
  if (!fix) return 'no patch target selected';
  if (fix.target_type === 'workflow_node') return 'workflow node config';
  if (fix.target_type === 'page_element') return 'Page Repository element';
  return 'test step';
}

function buildModelFixCandidates(fix?: FixSuggestion): ModelFixCandidate[] {
  if (!fix) return [];
  const target = fixTargetLabel(fix);
  const proposed = cleanText(fix.new_value || fix.blocked_reason || 'pending evidence', 240);
  return [
    {
      model: 'OpenAI 5.5',
      title: fix.title,
      confidence: Math.max(fix.confidence, 0.9),
      summary: `Most direct repair: update ${target}. Proposed patch: ${proposed}`,
      recommended: true,
    },
    {
      model: 'Claude',
      title: fix.category === 'desktop_launch_config' ? 'Use attach-first desktop startup' : 'Apply conservative repository-safe repair',
      confidence: Math.max(Math.min(fix.confidence - 0.04, 0.88), 0.72),
      summary: fix.category === 'desktop_launch_config'
        ? 'Avoid duplicate app launches by attaching to the existing process/window before starting a new instance.'
        : `Prefer the same target with extra verification before applying to ${target}.`,
    },
  ];
}

function isGreeting(text: string): boolean {
  return /^(hi+|hii+|hello|hey|yo|good\s+(morning|afternoon|evening))\b/i.test(text.trim());
}

function isErrorQuestion(text: string): boolean {
  return /\b(error|err|eror|wrror|issue|problem|fail|failed|failure|wrong|actual|happen|happened|root|cause)\b/i.test(text);
}

function isFixQuestion(text: string): boolean {
  return /\b(fix|fixes|patch|repair|solve|solution|implement|recommend|recommended|change|apply|heal)\b/i.test(text);
}

function buildAssistantResponse({
  query,
  rootCause,
  fix,
  execution,
  recommendations,
}: {
  query: string;
  rootCause: string;
  fix?: FixSuggestion;
  execution?: ExecutionListItem;
  recommendations: string[];
}): string {
  const normalized = query.toLowerCase();
  const title = execution ? executionLabel(execution) : 'the selected execution';
  const modelFixes = buildModelFixCandidates(fix);
  if (isGreeting(query)) {
    return [
      'I am good, and I am looking at this like a senior test automation engineer.',
      execution
        ? `Current focus: ${title} on ${execution.platform}. I can explain the failure, compare patch options, or help decide what to rerun.`
        : 'Select an execution and I can explain failures, patch impact, and next validation steps.',
    ].join('\n');
  }
  if (isFixQuestion(normalized)) {
    if (!fix) {
      return [
        `I do not have a safe patch ready for ${title} yet.`,
        'OpenAI 5.5 view: gather the failed node config, runtime output, and linked repository/test-step metadata first.',
        'Claude view: avoid patching until there is a verified target and rollback path.',
        'Run Lab Scan, then I will show ranked fixes you can choose from.',
      ].join('\n');
    }
    const modelLines = modelFixes.map((candidate) => (
      `${candidate.recommended ? 'Most recommended - ' : ''}${candidate.model}: ${candidate.title} (${confidencePercent(candidate.confidence)}%). ${candidate.summary}`
    ));
    return [
      'Fix recommendations:',
      ...modelLines,
      '',
      `Patch target: ${fixTargetLabel(fix)}.`,
      `Why: ${cleanText(fix.rationale, 420)}`,
      `Current: ${cleanText(fix.old_value || 'not set', 260)}`,
      `Proposed: ${cleanText(fix.new_value || fix.blocked_reason || 'pending evidence', 320)}`,
      fix.can_implement
        ? 'Pick the recommended fix or click Apply with audit. After patching, rerun the same execution to verify.'
        : `Blocked: ${fix.blocked_reason || 'not enough evidence for an automatic patch.'}`,
    ].join('\n');
  }
  if (isErrorQuestion(normalized)) {
    if (fix?.category === 'desktop_launch_config') {
      return [
        `Actual error in ${title}: the test failed before recorded VS Code actions ran.`,
        'The prerequisite desktop.launch step was cancelled/retried, so downstream steps were skipped.',
        'The suspicious config is launch-oriented instead of attach-oriented: it can open duplicate app windows, and values like "Snap Assist" or a numeric PID are unstable.',
        `Best current fix: ${fix.title} (${confidencePercent(fix.confidence)}% confidence).`,
      ].join('\n');
    }
    return rootCause
      ? `Root cause readout for ${title}: ${cleanText(rootCause, 620)}`
      : `I need a completed inspection job before I can explain the root cause for ${title}. Click Run Lab Scan and I will stream the evidence path here.`;
  }
  if (normalized.includes('next') || normalized.includes('rerun') || normalized.includes('validate')) {
    const moves = recommendations.length
      ? recommendations.slice(0, 3).map((item, index) => `${index + 1}. ${cleanText(item, 180)}`).join('\n')
      : fix
        ? `1. Review the recommended ${fixTargetLabel(fix)} patch.\n2. Apply with audit.\n3. Rerun the same testcase and confirm desktop.launch completes before interaction steps.`
        : '1. Run Lab Scan.\n2. Review Suggested Fixes.\n3. Apply only implementable patches, then rerun.';
    return `Recommended next moves:\n${moves}`;
  }
  return [
    `As a test engineer, I would read ${title} from three angles: failed node behavior, workflow/test-step config, and runtime evidence.`,
    rootCause ? `Current root-cause summary: ${cleanText(rootCause, 360)}` : 'There is not enough root-cause text yet, so I would run Lab Scan before making a risky change.',
    fix ? `Current best patch candidate: ${fix.title} (${confidencePercent(fix.confidence)}% confidence). Ask "show fixes" to compare OpenAI 5.5 and Claude recommendations.` : 'No implementable patch is selected yet.',
  ].join('\n');
}

function ClopAgentConsole({
  rootCause,
  fix,
  execution,
  recommendations,
  executionId,
  onImplementFix,
  implementing = false,
  implementedFixId = '',
}: {
  rootCause: string;
  fix?: FixSuggestion;
  execution?: ExecutionListItem;
  recommendations: string[];
  executionId: string | null;
  onImplementFix?: (fix: FixSuggestion) => void;
  implementing?: boolean;
  implementedFixId?: string;
}) {
  const askAssistant = useAskAIInspectAssistant();
  const [query, setQuery] = useState('');
  const [activeScreen, setActiveScreen] = useState<AssistantScreen>('chat');
  const [lastResult, setLastResult] = useState<AssistantQueryResponse | null>(null);
  const [messages, setMessages] = useState<TerminalMessage[]>([
    {
      role: 'system',
      text: 'clop-agent attached: DB retrieval, execution evidence, workflow config, test configuration, repository bindings, model fix council.',
    },
    {
      role: 'assistant',
      text: 'Ask anything. I will answer general testing questions like a senior test engineer, and fix questions will return ranked OpenAI 5.5 and Claude repair candidates.',
    },
  ]);
  const recommendedFix = lastResult?.fixes.find((item) => item.id === lastResult.recommended_fix_id)
    ?? lastResult?.fixes[0]
    ?? fix;
  const modelFixes = buildModelFixCandidates(recommendedFix);
  const latestSources = lastResult?.sources ?? [];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setQuery('');
    setMessages((items) => [...items, { role: 'user', text: trimmed }]);

    if (executionId) {
      try {
        const result = await askAssistant.mutateAsync({ executionId, question: trimmed });
        setLastResult(result);
        if (result.intent === 'fix') setActiveScreen('fixes');
        setMessages((items) => [...items, { role: 'assistant', text: result.answer, result }]);
        return;
      } catch {
        const answer = buildAssistantResponse({ query: trimmed, rootCause, fix: recommendedFix, execution, recommendations });
        setMessages((items) => [
          ...items,
          {
            role: 'assistant',
            text: `${answer}\n\nDB assistant was not reachable, so I answered from the visible inspection context.`,
          },
        ]);
        return;
      }
    }

    const answer = buildAssistantResponse({ query: trimmed, rootCause, fix: recommendedFix, execution, recommendations });
    setMessages((items) => [...items, { role: 'assistant', text: answer }]);
  };

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-cyan-300/20 bg-[var(--color-surface-overlay)] shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-emerald-200" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200">CLOP Agent</p>
            <p className="text-[10px] text-slate-500">Query, retrieve, explain, compare, implement.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={executionId ? 'DB attached' : 'No execution'} accent={executionId ? 'green' : 'slate'} />
          <StatusPill
            label={lastResult?.answer_source === 'llm' ? 'LLM live' : lastResult?.answer_source === 'fallback' ? 'Fallback' : 'Ready'}
            accent={lastResult?.answer_source === 'llm' ? 'green' : lastResult?.answer_source === 'fallback' ? 'amber' : 'cyan'}
          />
          <StatusPill label={recommendedFix?.can_implement ? 'Patch ready' : 'Inspect'} accent={recommendedFix?.can_implement ? 'green' : 'cyan'} />
        </div>
      </div>

      <div className="grid min-h-[480px] lg:grid-cols-[210px_minmax(0,1fr)]">
        <div className="border-b border-white/8 bg-[var(--color-surface-2)] p-3 lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {ASSISTANT_SCREENS.map((screen) => {
              const Icon = screen.icon;
              const accent = ACCENTS[screen.accent];
              const active = activeScreen === screen.id;
              return (
                <button
                  key={screen.id}
                  type="button"
                  onClick={() => setActiveScreen(screen.id)}
                  className={[
                    'flex h-10 items-center gap-2 rounded-lg border px-3 text-left transition-colors',
                    active ? `${accent.border} ${accent.bg} ${accent.text}` : 'border-white/8 bg-white/[0.025] text-slate-500 hover:text-slate-200',
                  ].join(' ')}
                >
                  <Icon size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em]">{screen.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 rounded-xl border border-white/8 bg-[var(--color-surface-1)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Runtime</p>
            <div className="mt-3 space-y-2 font-mono text-[11px] text-slate-400">
              <p>intent: {lastResult?.intent ?? 'idle'}</p>
              <p>sources: {latestSources.length}</p>
              <p>fixes: {lastResult?.fixes.length ?? (fix ? 1 : 0)}</p>
              <p>answer: {lastResult?.answer_source ?? 'waiting'}</p>
              <p>model: {lastResult?.provider ? `${lastResult.provider}/${lastResult.model ?? 'default'}` : 'OpenAI 5.5 + Claude'}</p>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {activeScreen === 'chat' && (
              <div className="max-h-[390px] space-y-2 overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={[
                      'rounded-xl border px-3 py-2 whitespace-pre-wrap',
                      message.role === 'user'
                        ? 'ml-8 border-cyan-300/20 bg-cyan-400/8 text-cyan-100'
                        : message.role === 'system'
                          ? 'border-emerald-300/15 bg-emerald-400/5 text-emerald-100/80'
                          : 'mr-8 border-white/8 bg-white/[0.035] text-slate-200',
                    ].join(' ')}
                  >
                    <span className="mr-2 text-slate-500">{message.role === 'user' ? 'you >' : message.role === 'system' ? 'sys >' : 'clop >'}</span>
                    {message.text}
                    {message.result?.sources?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {message.result.sources.slice(0, 4).map((source) => (
                          <span key={`${source.type}-${source.label}`} className="rounded-md border border-cyan-300/15 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-100">
                            {source.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {askAssistant.isPending && (
                  <div className="mr-8 rounded-xl border border-emerald-300/15 bg-emerald-400/5 px-3 py-2 text-emerald-100/80">
                    <span className="mr-2 text-slate-500">clop &gt;</span>
                    retrieving DB context...
                  </div>
                )}
              </div>
            )}
            {activeScreen === 'evidence' && <AssistantSourceList sources={latestSources} />}
            {activeScreen === 'fixes' && (
              <AssistantFixCouncil
                fix={recommendedFix}
                modelFixes={modelFixes}
                implementing={implementing}
                implementedFixId={implementedFixId}
                onImplementFix={onImplementFix}
              />
            )}
            {activeScreen === 'plan' && <AssistantRagPlan result={lastResult} />}
          </div>

          <form onSubmit={submit} className="flex items-center gap-2 border-t border-white/8 p-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[var(--color-surface-1)] px-3 font-mono text-xs text-[var(--color-fg-default)] outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45"
              placeholder="Ask: what was the error, show fixes, why is this safe..."
              disabled={askAssistant.isPending}
            />
            <Button variant="neon" size="sm" className="h-10 rounded-lg px-4" disabled={askAssistant.isPending}>
              {askAssistant.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Ask
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AIAnalysisPage() {
  const { data: executions = [] } = useExecutions();
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
  const [jobType, setJobType] = useState<AIJobType>('root_cause_analysis');
  const [implementedFixId, setImplementedFixId] = useState('');
  const [implementationMessage, setImplementationMessage] = useState('');
  const [bulkScanning, setBulkScanning] = useState(false);
  const [bulkScanMessage, setBulkScanMessage] = useState('');
  const [providerProbe, setProviderProbe] = useState(false);

  useEffect(() => {
    const requestedExecution = new URLSearchParams(window.location.search).get('executionId');
    if (requestedExecution) setSelectedExecution(requestedExecution);
  }, []);

  const failedExecutions = useMemo(
    () => executions.filter((execution) => execution.status === 'failed'),
    [executions],
  );
  const defaultExecution = failedExecutions[0] ?? executions[0];
  const selectedExecutionId = executions.some((execution) => execution.id === selectedExecution)
    ? selectedExecution
    : defaultExecution?.id ?? null;

  const { data: analysis } = useExecutionAnalysis(selectedExecutionId);
  const { data: aiJobs = [] } = useAIJobs(selectedExecutionId);
  const { data: fixes = [] } = useFixSuggestions(selectedExecutionId);
  const {
    data: providerStatuses = [],
    isFetching: providerChecking,
    refetch: refetchProviderStatus,
  } = useAIProviderStatus(providerProbe);
  const triggerMutation = useTriggerAIAnalysis();
  const implementFix = useImplementFixSuggestion();
  const implementAllFixes = useImplementAllFixSuggestions();

  const selectedExecutionItem = executions.find((execution) => execution.id === selectedExecutionId);
  const latestJob = aiJobs[0];
  const activeJob = latestJob?.status === 'queued' || latestJob?.status === 'running';
  const jobResult = latestJob?.result ?? null;
  const insights = useMemo(() => analysis?.insights ?? [], [analysis]);
  const findings = asList(jobResult?.findings);
  const recommendations = asList(jobResult?.recommendations);
  const analysisSteps = asList(jobResult?.analysis_steps);
  const rootCause = cleanText(asText(jobResult?.root_cause) || asText(jobResult?.summary) || insights[0]?.description || '', 900);
  const providerAttempts = asRecordArray(jobResult?.provider_results);
  const confidence = confidencePercent(typeof jobResult?.confidence === 'number' ? jobResult.confidence : insights[0]?.confidence);
  const progress = Math.round((latestJob?.progress ?? 0) * 100);
  const failedCount = selectedExecutionItem ? Math.max(selectedExecutionItem.node_count - selectedExecutionItem.completed_nodes, 0) : 0;
  const recommendedFixes = [...fixes].sort((a, b) => {
    if (a.can_implement !== b.can_implement) return a.can_implement ? -1 : 1;
    return b.confidence - a.confidence;
  });
  const primaryFix = recommendedFixes[0];

  const worklogSteps = analysisSteps.length
    ? analysisSteps
    : activeJob
      ? STAGES.filter((stage) => progress >= Math.round(stage.progress * 100) - 10).map((stage) => `${stage.label}: ${stage.detail}`)
      : [];

  const runInvestigation = () => {
    if (!selectedExecutionId) return;
    setImplementedFixId('');
    setImplementationMessage('');
    setBulkScanMessage('');
    triggerMutation.mutate({ executionId: selectedExecutionId, jobType });
  };

  const runProviderCheck = () => {
    if (providerProbe) {
      void refetchProviderStatus();
      return;
    }
    setProviderProbe(true);
  };

  const runFailedLabScan = async () => {
    if (failedExecutions.length === 0) return;
    setBulkScanning(true);
    setBulkScanMessage('');
    setImplementedFixId('');
    try {
      for (const execution of failedExecutions) {
        await triggerMutation.mutateAsync({
          executionId: execution.id,
          jobType: 'root_cause_analysis',
        });
      }
      setBulkScanMessage(`Queued detailed lab scans for ${failedExecutions.length} failed ${failedExecutions.length === 1 ? 'execution' : 'executions'}.`);
    } catch {
      setBulkScanMessage('Could not queue every failed execution. Check backend availability and retry the Lab Scan.');
    } finally {
      setBulkScanning(false);
    }
  };

  const implementSelectedFix = (fix: FixSuggestion) => {
    if (!selectedExecutionId) return;
    implementFix.mutate(
      { executionId: selectedExecutionId, nodeKey: fix.node_key },
      { onSuccess: () => {
        setImplementedFixId(fix.id);
        setImplementationMessage('Implemented the recommended verified fix and refreshed linked configuration.');
      } },
    );
  };

  const implementAllVerifiedFixes = () => {
    if (!selectedExecutionId || recommendedFixes.length === 0) return;
    implementAllFixes.mutate(
      { executionId: selectedExecutionId, fixes: recommendedFixes },
      {
        onSuccess: (result) => {
          setImplementedFixId('all');
          setImplementationMessage(`Implemented ${result.applied} verified ${result.applied === 1 ? 'fix' : 'fixes'}${result.skipped ? `; ${result.skipped} candidates need more evidence or manual review.` : '.'}`);
        },
      },
    );
  };

  return (
    <div
      className="relative h-full overflow-y-auto bg-[var(--color-bg-base)] text-[var(--color-fg-default)]"
      style={{
        fontFamily: "'Fira Sans', 'Segoe UI', sans-serif",
        background: 'var(--color-bg-base)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[720px] -translate-x-1/2 rounded-full opacity-0 bg-cyan-300/10 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-5 py-5 lg:px-7">
        <Panel accent="cyan" className="p-5 lg:p-6">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="flex min-w-0 flex-col justify-between gap-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label="AI Inspect Lab" accent="green" />
                  <StatusPill label="Failed execution diagnosis" accent="cyan" />
                </div>
                <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-[-0.04em] text-[var(--color-fg-default)] md:text-6xl">
                  AI Inspect Lab for deep failure reasons and implementation plans.
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-fg-muted)] md:text-base">
                  This lab scans failed testcases and workflows in depth: failed nodes, runtime evidence, locator quality,
                  page and test-step config, API responses, stale workflow bindings, and safe implementation options.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Execution</span>
                    <select
                      value={selectedExecutionId ?? ''}
                      onChange={(event) => setSelectedExecution(event.target.value || null)}
                      className="h-11 w-full rounded-2xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-3 text-sm text-[var(--color-fg-default)] outline-none transition focus:border-cyan-300/50"
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
                      className="h-11 w-full rounded-2xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-3 text-sm text-[var(--color-fg-default)] outline-none transition focus:border-cyan-300/50"
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
                    {triggerMutation.isPending || activeJob ? 'Inspecting...' : 'Run Lab Scan'}
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

        <ProviderCouncil
          statuses={providerStatuses}
          attempts={providerAttempts}
          checking={providerChecking}
          onCheck={runProviderCheck}
        />

        <Panel accent="red" className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Failed Lab Queue</p>
              <h2 className="mt-1 text-lg font-bold text-white">Detailed scan queue for failed testcases and workflows</h2>
              <p className="mt-1 text-xs text-slate-500">
                The Lab keeps implementation actions here, while Mini AI Bot stays read-only inside Workflow and Execution.
              </p>
            </div>
            <Button
              variant="neon"
              size="sm"
              className="border-red-300/35 bg-red-400/10 text-red-100 hover:bg-red-400/20"
              disabled={failedExecutions.length === 0 || bulkScanning || triggerMutation.isPending}
              onClick={() => void runFailedLabScan()}
            >
              {bulkScanning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {bulkScanning ? 'Queuing scans...' : `Scan All Failed (${failedExecutions.length})`}
            </Button>
          </div>

          {bulkScanMessage && (
            <p className="mb-3 rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-xs text-slate-300">
              {bulkScanMessage}
            </p>
          )}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {failedExecutions.slice(0, 9).map((execution) => {
              const selected = execution.id === selectedExecutionId;
              return (
                <button
                  key={execution.id}
                  type="button"
                  onClick={() => setSelectedExecution(execution.id)}
                  className={`rounded-2xl border p-3 text-left transition ${selected ? 'border-cyan-300/35 bg-cyan-400/10' : 'border-white/8 bg-white/[0.035] hover:border-red-300/20 hover:bg-red-400/5'}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="rounded-md border border-red-300/20 bg-red-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-red-100">
                      {execution.test_case_name ? 'Testcase' : 'Workflow'}
                    </span>
                    <span className="font-mono text-[10px] text-red-200">{execution.platform}</span>
                  </div>
                  <p className="truncate text-xs font-semibold text-white">{executionLabel(execution)}</p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {execution.environment} / {timeAgo(execution.started_at ?? execution.created_at)}
                  </p>
                </button>
              );
            })}
            {failedExecutions.length === 0 && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-6 text-center md:col-span-2 xl:col-span-3">
                <CheckCircle2 className="mx-auto text-emerald-300" size={22} />
                <p className="mt-2 text-sm font-semibold text-slate-200">No failed executions in the current list</p>
                <p className="mt-1 text-xs text-slate-500">Failed workflows and testcases will appear here for lab-level diagnosis.</p>
              </div>
            )}
          </div>
        </Panel>

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
              <div className="rounded-3xl border border-white/8 bg-[var(--color-surface-1)] p-5">
                <p className="text-sm leading-7 text-slate-200">
                  {rootCause || (activeJob ? 'AI Inspect Lab is correlating execution evidence, code paths, DB links, and runtime behavior.' : 'Run Lab Scan to produce a detailed root-cause narrative.')}
                </p>
              </div>
            </Panel>

            <Panel accent="green" className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Patch Plans</p>
                  <p className="mt-1 text-xs text-slate-500">Implement applies every verified repository, test-step, or workflow-config fix candidate for this execution.</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill label={`${recommendedFixes.length} found`} accent={recommendedFixes.length ? 'green' : 'slate'} />
                  <Button
                    variant="neon"
                    size="sm"
                    disabled={!selectedExecutionId || recommendedFixes.every((fix) => !fix.can_implement) || implementAllFixes.isPending}
                    onClick={implementAllVerifiedFixes}
                  >
                    {implementAllFixes.isPending ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                    Implement All Verified
                  </Button>
                </div>
              </div>
              {implementationMessage && (
                <p className="mb-3 rounded-2xl border border-emerald-300/15 bg-emerald-400/8 px-4 py-3 text-xs text-emerald-100">
                  {implementationMessage}
                </p>
              )}
              <div className="space-y-3">
                {recommendedFixes.slice(0, 4).map((fix) => (
                  <FixCard
                    key={fix.id}
                    fix={fix}
                    implemented={implementedFixId === fix.id || implementedFixId === 'all'}
                    disabled={implementFix.isPending || implementAllFixes.isPending}
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
                <h2 className="mt-1 text-lg font-bold text-white">What this Lab is allowed to inspect</h2>
              </div>
              <CapabilityGrid />
              <ClopAgentConsole
                rootCause={rootCause}
                fix={primaryFix}
                execution={selectedExecutionItem}
                recommendations={recommendations}
                executionId={selectedExecutionId}
                onImplementFix={implementSelectedFix}
                implementing={implementFix.isPending}
                implementedFixId={implementedFixId}
              />
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
