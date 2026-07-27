'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Play,
  Edit3,
  Eye,
  Zap,
  Monitor,
  Smartphone,
  Laptop,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  Filter,
  SortAsc,
  Brain,
  Layers3,
  FlaskConical,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

// ── Data ──────────────────────────────────────────────────────────────────────

type ModuleChild = { id: string; name: string; count: number };
type ModuleNode = { id: string; name: string; count: number; open: boolean; children: ModuleChild[] };

const MODULE_TREE: ModuleNode[] = [
  {
    id: 'auth', name: 'Authentication', count: 4, open: true,
    children: [
      { id: 'auth-login', name: 'Login Flow', count: 2 },
      { id: 'auth-reg', name: 'Registration', count: 2 },
    ],
  },
  {
    id: 'booking', name: 'Booking Engine', count: 14, open: false,
    children: [
      { id: 'booking-search', name: 'Search', count: 5 },
      { id: 'booking-select', name: 'Selection', count: 4 },
      { id: 'booking-confirm', name: 'Confirmation', count: 5 },
    ],
  },
  { id: 'payment', name: 'Payment', count: 8, open: false, children: [] },
  { id: 'invoice', name: 'Invoice', count: 5, open: false, children: [] },
];

type TCStatus = 'passing' | 'failing' | 'flaky';
type Priority = 'critical' | 'high' | 'medium' | 'low';
type Platform = 'web' | 'mobile' | 'desktop';

interface Testcase {
  id: string;
  name: string;
  module: string;
  intent: string;
  priority: Priority;
  status: TCStatus;
  platform: Platform[];
  lastRun: string;
  duration: string;
  passRate: number;
  aiScore: number;
  steps: number;
  flaky: boolean;
}

const TESTCASES: Testcase[] = [
  {
    id: 'tc-001', name: 'Valid user login with MFA', module: 'Auth',
    intent: 'User Authentication', priority: 'critical', status: 'passing',
    platform: ['web', 'mobile'], lastRun: '5m ago', duration: '2.3s',
    passRate: 98, aiScore: 94, steps: 7, flaky: false,
  },
  {
    id: 'tc-002', name: 'International flight search with date filter', module: 'Booking',
    intent: 'Book International Flight', priority: 'high', status: 'passing',
    platform: ['web', 'mobile', 'desktop'], lastRun: '12m ago', duration: '4.1s',
    passRate: 87, aiScore: 78, steps: 12, flaky: true,
  },
  {
    id: 'tc-003', name: 'Credit card payment with 3DS auth', module: 'Payment',
    intent: 'Process Payment', priority: 'critical', status: 'failing',
    platform: ['web'], lastRun: '1h ago', duration: '3.8s',
    passRate: 72, aiScore: 65, steps: 9, flaky: false,
  },
  {
    id: 'tc-004', name: 'Invoice PDF generation and download', module: 'Invoice',
    intent: 'Generate Invoice PDF', priority: 'medium', status: 'passing',
    platform: ['web', 'desktop'], lastRun: '2h ago', duration: '5.2s',
    passRate: 100, aiScore: 99, steps: 6, flaky: false,
  },
  {
    id: 'tc-005', name: 'Seat upgrade with loyalty points', module: 'Booking',
    intent: 'Seat Selection', priority: 'high', status: 'passing',
    platform: ['web', 'mobile'], lastRun: '30m ago', duration: '3.1s',
    passRate: 91, aiScore: 88, steps: 8, flaky: false,
  },
];

// Mock run history (10 dots per TC: g=pass, r=fail, a=flaky)
const RUN_HISTORY: Record<string, Array<'pass' | 'fail' | 'flaky'>> = {
  'tc-001': ['pass','pass','pass','pass','pass','pass','pass','pass','pass','pass'],
  'tc-002': ['pass','pass','flaky','pass','pass','fail','pass','flaky','pass','pass'],
  'tc-003': ['pass','pass','fail','fail','pass','fail','fail','pass','fail','fail'],
  'tc-004': ['pass','pass','pass','pass','pass','pass','pass','pass','pass','pass'],
  'tc-005': ['pass','pass','pass','flaky','pass','pass','pass','pass','pass','pass'],
};

const AI_RECS: Record<string, string[]> = {
  'tc-001': ['MFA timeout edge case not covered', 'Add SSO fallback assertion', 'Consider rate-limit scenario'],
  'tc-002': ['Add retry logic for calendar widget', 'Validate mobile viewport breakpoint', 'Assert loading skeleton dismissal'],
  'tc-003': ['3DS redirect URL assertion missing', 'Add payment decline scenario', 'Validate error message i18n'],
  'tc-004': ['Cover landscape-mode PDF preview', 'Assert download filename format', 'Test with large invoice (>50 items)'],
  'tc-005': ['Assert points balance deduction', 'Cover insufficient points scenario', 'Test with expired loyalty tier'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function priorityConfig(p: Priority) {
  if (p === 'critical') return { label: 'Critical', cls: 'bg-red-500/15 text-red-400 border-red-500/25' };
  if (p === 'high')     return { label: 'High',     cls: 'bg-orange-500/15 text-orange-400 border-orange-500/25' };
  if (p === 'medium')   return { label: 'Medium',   cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' };
  return                       { label: 'Low',      cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25' };
}

function statusConfig(s: TCStatus, flaky: boolean) {
  if (flaky)             return { label: 'Flaky',   dot: 'bg-amber-400',   ring: 'border-amber-500/30',  text: 'text-amber-400',   bg: 'bg-amber-500/10' };
  if (s === 'passing')   return { label: 'Passing', dot: 'bg-emerald-400', ring: 'border-emerald-500/30', text: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  return                        { label: 'Failing', dot: 'bg-red-400',     ring: 'border-red-500/30',     text: 'text-red-400',     bg: 'bg-red-500/10' };
}

function aiScoreColor(score: number) {
  if (score >= 86) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function PlatformIcon({ p }: { p: Platform }) {
  if (p === 'web')     return <Globe size={11} className="text-blue-400" />;
  if (p === 'mobile')  return <Smartphone size={11} className="text-emerald-400" />;
  return                      <Laptop size={11} className="text-violet-400" />;
}

// ── Mini Circular AI Score Gauge ──────────────────────────────────────────────
function AiScoreGauge({ score }: { score: number }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = aiScoreColor(score);
  return (
    <div className="relative flex items-center justify-center" style={{ width: 30, height: 30 }}>
      <svg width={30} height={30} className="-rotate-90">
        <circle cx={15} cy={15} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2.5} />
        <circle
          cx={15} cy={15} r={r} fill="none"
          stroke={color} strokeWidth={2.5}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className="absolute text-[8px] font-mono font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ── Module Tree ───────────────────────────────────────────────────────────────
function ModuleTree({
  activeModule,
  onSelect,
}: {
  activeModule: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [tree, setTree] = useState<ModuleNode[]>(MODULE_TREE);

  function toggleNode(id: string) {
    setTree((prev) => prev.map((n) => n.id === id ? { ...n, open: !n.open } : n));
  }

  return (
    <div className="h-full overflow-y-auto py-3">
      <p className="px-4 pb-2 text-[9px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
        Modules
      </p>
      {tree.map((node) => (
        <div key={node.id}>
          <button
            onClick={() => { toggleNode(node.id); onSelect(node.id); }}
            className={cn(
              'group flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
              activeModule === node.id
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-default)]'
                : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]',
            )}
          >
            <span className="shrink-0 text-[var(--color-fg-subtle)]">
              {node.open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{node.name}</span>
            <span className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-mono',
              activeModule === node.id
                ? 'bg-[var(--color-accent-default)]/20 text-[var(--color-accent-default)]'
                : 'bg-[var(--color-surface-3)] text-[var(--color-fg-subtle)]',
            )}>
              {node.count}
            </span>
          </button>

          <AnimatePresence>
            {node.open && node.children.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                {node.children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => onSelect(child.id)}
                    className={cn(
                      'flex w-full items-center gap-2 py-1.5 pl-8 pr-3 text-left transition-colors',
                      activeModule === child.id
                        ? 'text-[var(--color-accent-default)]'
                        : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
                    )}
                  >
                    <span className="h-px w-3 shrink-0 bg-[var(--color-line-default)]" />
                    <span className="min-w-0 flex-1 truncate text-[11px]">{child.name}</span>
                    <span className="text-[9px] font-mono text-[var(--color-fg-subtle)]">{child.count}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

// ── Testcase Card ─────────────────────────────────────────────────────────────
function TestcaseCard({
  tc,
  selected,
  onClick,
}: {
  tc: Testcase;
  selected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pri = priorityConfig(tc.priority);
  const sts = statusConfig(tc.status, tc.flaky);
  const isFailing = tc.status === 'failing';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'group relative flex cursor-pointer gap-0 overflow-hidden rounded-lg border transition-all duration-150',
        selected
          ? 'border-[var(--color-accent-default)]/50 bg-[var(--color-surface-2)]'
          : isFailing
          ? 'border-red-500/25 bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]'
          : 'border-[var(--color-line-default)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)]',
      )}
      style={
        selected
          ? { boxShadow: '0 0 0 1px rgba(139,92,246,0.3), 0 0 20px rgba(139,92,246,0.08)' }
          : isFailing
          ? { boxShadow: '0 0 0 1px rgba(239,68,68,0.2), 0 0 12px rgba(239,68,68,0.06)' }
          : undefined
      }
    >
      {/* Left accent bar */}
      <div
        className="w-1 shrink-0 rounded-l-lg"
        style={{
          background: isFailing ? '#ef4444' : tc.flaky ? '#f59e0b' : '#10b981',
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-4 py-3.5">
        {/* Row 1: ID + Name + Priority */}
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-[10px] text-[var(--color-fg-subtle)]">{tc.id}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-fg-default)]">
            {tc.name}
          </span>
          <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase', pri.cls)}>
            {pri.label}
          </span>
        </div>

        {/* Row 2: Module + Intent + Platforms */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1 rounded-md bg-[var(--color-surface-3)] px-2 py-0.5 font-mono text-[var(--color-fg-muted)]">
            <Layers3 size={9} />
            {tc.module}
          </span>
          <ArrowRight size={9} className="text-[var(--color-fg-subtle)] shrink-0" />
          <span className="truncate text-[var(--color-fg-subtle)]">{tc.intent}</span>
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {tc.platform.map((p) => (
              <div
                key={p}
                title={p}
                className="flex h-5 w-5 items-center justify-center rounded border border-[var(--color-line-default)] bg-[var(--color-surface-3)]"
              >
                <PlatformIcon p={p} />
              </div>
            ))}
          </div>
        </div>

        {/* Row 3: Pass rate bar + metrics + status */}
        <div className="flex items-center gap-3">
          {/* Pass rate */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${tc.passRate}%`,
                  background: tc.passRate >= 90 ? '#10b981' : tc.passRate >= 70 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
            <span className="shrink-0 font-mono text-[10px] text-[var(--color-fg-muted)]">{tc.passRate}%</span>
          </div>

          <AiScoreGauge score={tc.aiScore} />

          <div className="flex items-center gap-3 shrink-0 text-[10px] font-mono text-[var(--color-fg-subtle)]">
            <span className="flex items-center gap-1">
              <Clock size={9} />{tc.lastRun}
            </span>
            <span className="flex items-center gap-1">
              <Zap size={9} />{tc.duration}
            </span>
            <span className="flex items-center gap-1">
              <BarChart3 size={9} />{tc.steps} steps
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {tc.flaky && (
              <span className="flex items-center gap-1 rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono text-amber-400">
                <AlertTriangle size={8} /> Flaky
              </span>
            )}
            <span className={cn('flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] font-mono uppercase', sts.ring, sts.bg, sts.text)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', sts.dot)} />
              {sts.label}
            </span>
          </div>
        </div>
      </div>

      {/* Hover action buttons */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-3 top-3 flex items-center gap-1"
          >
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex h-6 w-6 items-center justify-center rounded border border-[var(--color-line-default)] bg-[var(--color-surface-2)] text-emerald-400 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10"
              title="Run"
            >
              <Play size={9} />
            </button>
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex h-6 w-6 items-center justify-center rounded border border-[var(--color-line-default)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg-default)]"
              title="Edit"
            >
              <Edit3 size={9} />
            </button>
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex h-6 w-6 items-center justify-center rounded border border-[var(--color-line-default)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg-default)]"
              title="View"
            >
              <Eye size={9} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ tc }: { tc: Testcase }) {
  const sts = statusConfig(tc.status, tc.flaky);
  const history = RUN_HISTORY[tc.id] ?? [];
  const recs = AI_RECS[tc.id] ?? [];

  function dotColor(r: 'pass' | 'fail' | 'flaky') {
    if (r === 'pass') return 'bg-emerald-400';
    if (r === 'fail') return 'bg-red-400';
    return 'bg-amber-400';
  }

  const JOURNEY = [
    { label: 'Navigate', icon: Globe },
    { label: 'Input', icon: Edit3 },
    { label: 'Action', icon: Play },
    { label: 'Assert', icon: CheckCircle2 },
    { label: 'Capture', icon: Eye },
  ];

  return (
    <motion.div
      key={tc.id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex h-full flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="border-b border-[var(--color-line-default)] px-5 py-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="font-mono text-[10px] text-[var(--color-fg-subtle)]">{tc.id}</span>
          <span className={cn('flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] font-mono uppercase', sts.ring, sts.bg, sts.text)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', sts.dot)} />
            {sts.label}
          </span>
        </div>
        <h2 className="text-sm font-semibold leading-snug text-[var(--color-fg-default)]">{tc.name}</h2>
        <div className="mt-2 flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-md bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-mono text-[var(--color-accent-default)]">
            <Zap size={9} /> {tc.intent}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Journey Map */}
        <div className="border-b border-[var(--color-line-default)] px-5 py-4">
          <p className="mb-3 text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
            Step Journey
          </p>
          <div className="flex items-center gap-0">
            {JOURNEY.map((step, i) => (
              <div key={step.label} className="flex items-center">
                <div className={cn(
                  'flex flex-col items-center gap-1',
                  i < 4 ? 'text-emerald-400' : 'text-[var(--color-fg-subtle)]',
                )}>
                  <div className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md border',
                    i < 4
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)]',
                  )}>
                    <step.icon size={11} />
                  </div>
                  <span className="text-[8px] font-mono">{step.label}</span>
                </div>
                {i < JOURNEY.length - 1 && (
                  <div className="mx-1 h-px w-4 bg-[var(--color-line-default)]" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Execution History */}
        <div className="border-b border-[var(--color-line-default)] px-5 py-4">
          <p className="mb-3 text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
            Last 10 Runs
          </p>
          <div className="flex items-center gap-1.5">
            {history.map((r, i) => (
              <div
                key={i}
                title={r}
                className={cn('h-4 w-4 rounded-sm', dotColor(r))}
                style={{ opacity: 0.7 + (i / history.length) * 0.3 }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] font-mono text-[var(--color-fg-subtle)]">
            <span>{history.filter((r) => r === 'pass').length}/10 passed</span>
            <span>Avg: {tc.duration}</span>
          </div>
        </div>

        {/* Platform Coverage */}
        <div className="border-b border-[var(--color-line-default)] px-5 py-4">
          <p className="mb-3 text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
            Platform Coverage
          </p>
          <div className="space-y-2">
            {(['web', 'mobile', 'desktop'] as Platform[]).map((p) => {
              const covered = tc.platform.includes(p);
              return (
                <div key={p} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlatformIcon p={p} />
                    <span className="text-xs capitalize text-[var(--color-fg-muted)]">{p}</span>
                  </div>
                  {covered
                    ? <CheckCircle2 size={13} className="text-emerald-400" />
                    : <XCircle size={13} className="text-[var(--color-fg-subtle)]" />
                  }
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Health */}
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <Brain size={12} className="text-[var(--color-accent-default)]" />
            <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
              AI Health Score
            </p>
            <span
              className="ml-auto font-mono text-sm font-bold"
              style={{ color: aiScoreColor(tc.aiScore) }}
            >
              {tc.aiScore}
            </span>
          </div>

          <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${tc.aiScore}%`, background: aiScoreColor(tc.aiScore) }}
            />
          </div>

          <p className="mb-3 mt-2 text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
            Recommendations
          </p>
          <div className="space-y-1.5">
            {recs.map((r, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2"
              >
                <Zap size={10} className="mt-0.5 shrink-0 text-[var(--color-accent-default)]" />
                <span className="text-[11px] text-[var(--color-fg-muted)]">{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-[var(--color-line-default)] p-4">
        <div className="flex flex-col gap-2">
          <Button variant="neon" size="sm" className="w-full justify-center">
            <FlaskConical size={11} /> Open in Designer
          </Button>
          <div className="flex gap-2">
            <Button variant="glass" size="sm" className="flex-1 justify-center">
              <Play size={10} /> Run Now
            </Button>
            <Button variant="ghost" size="sm" className="flex-1 justify-center">
              <BarChart3 size={10} /> History
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TestcasesPage() {
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [selectedTC, setSelectedTC] = useState<Testcase | null>(null);
  const [filterChip, setFilterChip] = useState<'all' | 'passing' | 'failing' | 'flaky' | 'critical'>('all');
  const [sort, setSort] = useState<'lastRun' | 'passRate' | 'priority'>('lastRun');

  const filtered = TESTCASES.filter((tc) => {
    if (filterChip === 'all') return true;
    if (filterChip === 'passing') return tc.status === 'passing' && !tc.flaky;
    if (filterChip === 'failing') return tc.status === 'failing';
    if (filterChip === 'flaky') return tc.flaky;
    if (filterChip === 'critical') return tc.priority === 'critical';
    return true;
  });

  const FILTER_CHIPS: { key: typeof filterChip; label: string; count: number }[] = [
    { key: 'all',      label: 'All',      count: TESTCASES.length },
    { key: 'passing',  label: 'Passing',  count: TESTCASES.filter((t) => t.status === 'passing' && !t.flaky).length },
    { key: 'failing',  label: 'Failing',  count: TESTCASES.filter((t) => t.status === 'failing').length },
    { key: 'flaky',    label: 'Flaky',    count: TESTCASES.filter((t) => t.flaky).length },
    { key: 'critical', label: 'Critical', count: TESTCASES.filter((t) => t.priority === 'critical').length },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Page Header ───────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-line-default)] px-6 py-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
            Intelligence Layer
          </p>
          <h1 className="mt-0.5 text-lg font-bold tracking-tight text-[var(--color-fg-default)]">
            Testcase Intelligence
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter chips */}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-1">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.key}
                onClick={() => setFilterChip(chip.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-mono transition-all',
                  filterChip === chip.key
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-default)]'
                    : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
                )}
              >
                {chip.label}
                <span className={cn(
                  'rounded-full px-1 py-0.5 text-[8px]',
                  filterChip === chip.key ? 'bg-[var(--color-accent-default)]/20' : 'bg-[var(--color-surface-3)]',
                )}>
                  {chip.count}
                </span>
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1 rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-2 py-1">
            <SortAsc size={11} className="text-[var(--color-fg-subtle)]" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="bg-transparent text-[10px] font-mono text-[var(--color-fg-muted)] focus:outline-none"
            >
              <option value="lastRun">Last Run</option>
              <option value="passRate">Pass Rate</option>
              <option value="priority">Priority</option>
            </select>
          </div>

          {/* Module dropdown */}
          <div className="flex items-center gap-1 rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-2 py-1">
            <Filter size={11} className="text-[var(--color-fg-subtle)]" />
            <select
              onChange={(e) => setActiveModule(e.target.value || null)}
              className="bg-transparent text-[10px] font-mono text-[var(--color-fg-muted)] focus:outline-none"
            >
              <option value="">All Modules</option>
              {MODULE_TREE.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <Button variant="neon" size="sm">
            <Plus size={11} /> New Testcase
          </Button>
        </div>
      </div>

      {/* ── Three-column body ─────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* LEFT: Module Tree */}
        <div className="w-[200px] shrink-0 overflow-hidden border-r border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
          <ModuleTree activeModule={activeModule} onSelect={setActiveModule} />
        </div>

        {/* CENTER: Testcase Cards */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Stats bar */}
          <div className="flex shrink-0 items-center gap-6 border-b border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-5 py-2.5">
            {[
              { label: 'Total', val: TESTCASES.length, color: 'text-[var(--color-fg-muted)]' },
              { label: 'Passing', val: TESTCASES.filter((t) => t.status === 'passing' && !t.flaky).length, color: 'text-emerald-400' },
              { label: 'Failing', val: TESTCASES.filter((t) => t.status === 'failing').length, color: 'text-red-400' },
              { label: 'Flaky', val: TESTCASES.filter((t) => t.flaky).length, color: 'text-amber-400' },
              { label: 'Avg AI Score', val: `${Math.round(TESTCASES.reduce((a, t) => a + t.aiScore, 0) / TESTCASES.length)}`, color: 'text-[var(--color-accent-default)]' },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className={cn('text-sm font-bold font-mono', s.color)}>{s.val}</span>
                <span className="text-[9px] font-mono uppercase tracking-wide text-[var(--color-fg-subtle)]">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2.5">
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-[var(--color-fg-subtle)]">
                  <FlaskConical size={28} className="mb-3 opacity-30" />
                  <p className="text-sm">No testcases match this filter</p>
                </div>
              )}
              {filtered.map((tc) => (
                <TestcaseCard
                  key={tc.id}
                  tc={tc}
                  selected={selectedTC?.id === tc.id}
                  onClick={() => setSelectedTC(selectedTC?.id === tc.id ? null : tc)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Detail Panel */}
        <AnimatePresence>
          {selectedTC ? (
            <motion.div
              key="detail"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
              className="shrink-0 overflow-hidden border-l border-[var(--color-line-default)] bg-[var(--color-surface-1)]"
            >
              <div className="h-full w-80">
                <DetailPanel tc={selectedTC} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="hidden w-[320px] shrink-0 items-center justify-center border-l border-[var(--color-line-default)] bg-[var(--color-surface-1)] lg:flex"
            >
              <div className="flex flex-col items-center gap-2 px-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)]">
                  <FlaskConical size={18} className="text-[var(--color-fg-subtle)]" />
                </div>
                <p className="text-xs text-[var(--color-fg-subtle)]">Select a testcase to view its intelligence profile</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
