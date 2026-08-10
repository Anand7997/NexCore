'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Cpu,
  Database,
  FlaskConical,
  Globe,
  Grid3X3,
  GitBranch,
  LayoutDashboard,
  Microscope,
  Monitor,
  Network,
  Play,
  Plus,
  Server,
  Settings2,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  TrendingDown,
  Wifi,
  Zap,
} from 'lucide-react';
import { useUIStore } from '@/lib/stores/uiStore';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MetricCard {
  id: string;
  label: string;
  value: number;
  unit: string;
  icon: React.ElementType;
  colorClass: string;
  glowColor: string;
  borderColor: string;
  bgColor: string;
  iconBg: string;
  trend: 'up' | 'down' | 'neutral';
  format: (v: number) => string;
  drift: () => number;
}

interface ProjectItem {
  name: string;
  type: string;
  status: 'active' | 'running' | 'idle';
  lastRun: string;
  successRate: number;
  href: string;
}

interface InsightItem {
  icon: React.ElementType;
  type: string;
  message: string;
  severity: 'warn' | 'success' | 'error' | 'info';
  time: string;
}

interface PulseEvent {
  id: string;
  type: string;
  label: string;
  color: string;
  ts: number;
}

interface ActivityEvent {
  id: string;
  message: string;
  detail: string;
  color: string;
  ts: number;
}

interface RouteTile {
  href: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
}

// ─── Static data ─────────────────────────────────────────────────────────────

const PROJECTS: ProjectItem[] = [
  { name: 'Airline Booking Suite', type: 'Web + Mobile + API', status: 'active', lastRun: '2m ago', successRate: 91, href: '/executions' },
  { name: 'Payment Gateway E2E', type: 'Web + API + Desktop', status: 'running', lastRun: 'now', successRate: 87, href: '/executions' },
  { name: 'Invoice Processing', type: 'Desktop + API', status: 'idle', lastRun: '1h ago', successRate: 98, href: '/executions' },
];

const MODULE_LIBRARY: RouteTile[] = [
  // ── Build ──────────────────────────────────────────────────────────────────
  { href: '/main-dashboard',    name: 'MainDashboard',      icon: Grid3X3,         color: '#4dd1e1' },
  { href: '/architecture',       name: 'Architecture',       icon: Globe,           color: '#5b8cff' },
  { href: '/intent-studio',      name: 'Intent Studio',      icon: Target,          color: '#a195ff' },
  { href: '/page-repository',    name: 'Page Repository',    icon: Boxes,           color: '#f0b558' },
  { href: '/master-sheet',       name: 'Master Sheet',       icon: Database,        color: '#45c08a' },
  { href: '/test-designer',      name: 'Test Designer',      icon: Code2,           color: '#a195ff' },
  { href: '/test-configuration', name: 'Test Config',        icon: FlaskConical,    color: '#45c08a' },
  { href: '/testcases',          name: 'Test Cases',         icon: BookOpen,        color: '#4dd1e1' },
  // ── Run ────────────────────────────────────────────────────────────────────
  { href: '/workflows',          name: 'Workflows',          icon: GitBranch,       color: '#a195ff' },
  { href: '/executions',         name: 'Executions',         icon: Play,            color: '#5b8cff' },
  { href: '/execution-control',  name: 'Exec Control',       icon: Cpu,             color: '#4dd1e1' },
  { href: '/agents',             name: 'Agents',             icon: Bot,             color: '#45c08a' },
  // ── Analyze ────────────────────────────────────────────────────────────────
  { href: '/ai-workflow',        name: 'AI Workflow',        icon: Sparkles,        color: '#a195ff' },
  { href: '/ai-analysis',        name: 'AI Inspect Lab',     icon: Brain,           color: '#4dd1e1' },
  { href: '/ai-investigation',   name: 'AI Investigation',   icon: Microscope,      color: '#f0b558' },
  { href: '/matrix',             name: 'Matrix',             icon: Grid3X3,         color: '#f0b558' },
  { href: '/knowledge-graph',    name: 'Knowledge Graph',    icon: Network,         color: '#5b8cff' },
  { href: '/reports',            name: 'Reports',            icon: BarChart3,       color: '#45c08a' },
  // ── System ─────────────────────────────────────────────────────────────────
  { href: '/workspace',          name: 'Workspace',          icon: LayoutDashboard, color: '#4dd1e1' },
  { href: '/settings',           name: 'Settings',           icon: Settings2,       color: '#8b8c97' },
  { href: '/demo',               name: 'Demo',               icon: Activity,        color: '#8b8c97' },
];

const INSIGHTS: InsightItem[] = [
  { icon: AlertTriangle, type: 'flaky', message: 'LoginPage.submit flaky (87% pass rate over 48 runs)', severity: 'warn', time: '4m ago' },
  { icon: Sparkles, type: 'recovery', message: 'AI healed 3 locators in CheckoutFlow - confidence 94%', severity: 'success', time: '12m ago' },
  { icon: Zap, type: 'perf', message: 'PaymentAPI response 340ms above baseline (P95)', severity: 'warn', time: '31m ago' },
  { icon: Shield, type: 'coverage', message: 'Mobile adapter gap: iOS checkout step 7 missing locator', severity: 'error', time: '1h ago' },
];

const PULSE_EVENT_TYPES = [
  { type: 'NAVIGATE', label: 'Route', short: 'NAV', color: '#5b8cff', icon: Globe },
  { type: 'ASSERT', label: 'Assert', short: 'CHK', color: '#45c08a', icon: CheckCircle2 },
  { type: 'API_CALL', label: 'API', short: 'API', color: '#a195ff', icon: Server },
  { type: 'EXTRACT', label: 'Extract', short: 'EXT', color: '#4dd1e1', icon: Database },
  { type: 'SCREENSHOT', label: 'Evidence', short: 'IMG', color: '#f0b558', icon: Monitor },
  { type: 'VALIDATE', label: 'Validate', short: 'VAL', color: '#45c08a', icon: Shield },
];

const TOPOLOGY_NODES = [
  { id: 'web', label: 'Web Adapter', icon: Globe, color: '#5b8cff', x: 0 },
  { id: 'pw', label: 'Playwright', icon: Monitor, color: '#a195ff', x: 1 },
  { id: 'engine', label: 'Test Engine', icon: Zap, color: '#4dd1e1', x: 2 },
  { id: 'api', label: 'API Validator', icon: Server, color: '#45c08a', x: 3 },
  { id: 'db', label: 'DB Layer', icon: Database, color: '#f0b558', x: 4 },
];

const INITIAL_ACTIVITY_SEED = [
  { id: 'a1', message: 'Execution #E-4821 started', detail: 'Airline Booking Suite / Web', color: '#5b8cff', ageMs: 12000 },
  { id: 'a2', message: 'Assertion passed', detail: 'checkout_flow.assert_total', color: '#45c08a', ageMs: 9500 },
  { id: 'a3', message: 'Locator healed by AI', detail: 'btn#confirm -> button[data-testid]', color: '#a195ff', ageMs: 7200 },
  { id: 'a4', message: 'Screenshot captured', detail: 'step_12_payment_confirm.png', color: '#4dd1e1', ageMs: 5100 },
  { id: 'a5', message: 'Test suite completed', detail: 'Invoice Processing / 18 of 18 passed', color: '#45c08a', ageMs: 2800 },
];

const ACTIVITY_TEMPLATES = [
  { message: 'Assertion passed', detailFn: () => `step_${Math.floor(Math.random() * 30 + 1)}.assert`, color: '#45c08a' },
  { message: 'API call validated', detailFn: () => `POST /api/v2/${['checkout','auth','search'][Math.floor(Math.random()*3)]}`, color: '#a195ff' },
  { message: 'Screenshot captured', detailFn: () => `evidence_frame_${Math.floor(Math.random()*99+1)}.png`, color: '#4dd1e1' },
  { message: 'Locator healed by AI', detailFn: () => `#btn-${Math.floor(Math.random()*10)} -> [data-id]`, color: '#a195ff' },
  { message: 'Navigation complete', detailFn: () => `/page/${['dashboard','checkout','profile','orders'][Math.floor(Math.random()*4)]}`, color: '#5b8cff' },
  { message: 'Execution resumed', detailFn: () => `After AI retry / attempt ${Math.floor(Math.random()*3+2)}`, color: '#f0b558' },
  { message: 'Flaky test detected', detailFn: () => `rate: ${(Math.random()*15+75).toFixed(0)}% over ${Math.floor(Math.random()*20+20)} runs`, color: '#f0b558' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildInitialActivity(now: number): ActivityEvent[] {
  return INITIAL_ACTIVITY_SEED.map(({ ageMs, ...event }) => ({
    ...event,
    ts: now - ageMs,
  }));
}

function timeAgo(ts: number, now: number): string {
  const s = Math.floor((now - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ label, color, pulse }: { label: string; color: string; pulse: string }) {
  const isLight = useUIStore((s) => s.theme === 'light');

  return (
    <div
      className="flex items-center gap-2 rounded-full border px-3 py-1"
      style={isLight
        ? { borderColor: 'var(--color-line-default)', backgroundColor: 'var(--color-surface-1)' }
        : { borderColor: `${color}33`, backgroundColor: `${color}11` }}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{ backgroundColor: color, animation: `ring-pulse 1.6s ease-out infinite` }}
        />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      </span>
      <span className="text-[12px] font-mono" style={{ color: isLight ? 'var(--color-fg-muted)' : color }}>{label}</span>
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 rounded-full border border-(--color-line-default) bg-(--color-surface-2) px-3 py-1">
      <Clock size={12} style={{ color: 'var(--color-fg-subtle)' }} />
      <span className="font-mono text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>{time}</span>
    </div>
  );
}

function MetricCardComponent({ card, index }: { card: MetricCard; index: number }) {
  const Icon = card.icon;
  const displayVal = card.format(card.value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: 0.1 + index * 0.07, ease: [0.22, 0.61, 0.36, 1] }}
      className="relative flex min-h-[118px] flex-col justify-between gap-2 overflow-hidden rounded-xl border p-3.5"
      style={{
        background: 'var(--color-surface-1)',
        borderColor: card.borderColor,
        boxShadow: `0 0 0 1px ${card.borderColor}, 0 0 20px ${card.glowColor}`,
      }}
    >
      {/* Animated bottom border */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5"
        style={{ background: `linear-gradient(90deg, transparent, ${card.colorClass}, transparent)`, opacity: 0.6 }}
      />
      <div className="flex items-start justify-between">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: card.iconBg, border: `1px solid ${card.borderColor}` }}
        >
          <Icon size={15} style={{ color: card.colorClass }} />
        </div>
        {card.trend === 'up' ? (
          <TrendingUp size={13} style={{ color: '#45c08a' }} />
        ) : card.trend === 'down' ? (
          <TrendingDown size={13} style={{ color: '#f06262' }} />
        ) : null}
      </div>
      <div>
        <div
          className="animate-count-up font-mono text-[24px] font-semibold leading-none tracking-tight"
          style={{ color: card.colorClass }}
        >
          {displayVal}
        </div>
        <p className="mt-1 text-[11px] leading-tight" style={{ color: 'var(--color-fg-muted)' }}>{card.label}</p>
      </div>
    </motion.div>
  );
}

function ProjectCard({ project, index }: { project: ProjectItem; index: number }) {
  const statusColor = project.status === 'running' ? '#5b8cff' : project.status === 'active' ? '#45c08a' : '#8b8c97';
  const statusLabel = project.status === 'running' ? 'Running' : project.status === 'active' ? 'Active' : 'Idle';
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.18 + index * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
      className="group relative rounded-xl border px-3.5 py-3 transition-all"
      style={{
        background: 'var(--color-surface-1)',
        borderColor: 'var(--color-line-default)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-medium" style={{ color: 'var(--color-fg-default)' }}>{project.name}</h3>
          <p className="mt-0.5 text-[11px] font-mono" style={{ color: 'var(--color-fg-subtle)' }}>{project.type}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: `${statusColor}15`, border: `1px solid ${statusColor}30` }}>
          <span className="relative flex h-1.5 w-1.5">
            {project.status === 'running' && (
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: statusColor, animation: 'ring-pulse 1.4s ease-out infinite' }} />
            )}
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
          </span>
          <span className="text-[11px] font-mono" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </div>
      <div className="mt-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>Success Rate</span>
          <span className="font-mono text-[12px]" style={{ color: project.successRate >= 95 ? '#45c08a' : project.successRate >= 85 ? '#f0b558' : '#f06262' }}>
            {project.successRate}%
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--color-surface-3)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${project.successRate}%` }}
            transition={{ duration: 0.8, delay: 0.4 + index * 0.1, ease: [0.22, 0.61, 0.36, 1] }}
            className="h-full rounded-full"
            style={{
              background: project.successRate >= 95 ? 'linear-gradient(90deg, #45c08a, #6adba0)' :
                project.successRate >= 85 ? 'linear-gradient(90deg, #f0b558, #f5ca7a)' :
                  'linear-gradient(90deg, #f06262, #f58a8a)',
            }}
          />
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>Last run: {project.lastRun}</span>
        <Link
          href={project.href}
          className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-all hover:border-(--color-accent-default) hover:text-(--color-accent-default)"
          style={{ borderColor: 'var(--color-line-default)', color: 'var(--color-fg-muted)' }}
        >
          Open <ArrowUpRight size={10} />
        </Link>
      </div>
    </motion.div>
  );
}

function InsightRow({ item, index }: { item: InsightItem; index: number }) {
  const Icon = item.icon;
  const colorMap = { warn: '#f0b558', success: '#45c08a', error: '#f06262', info: '#5b8cff' };
  const c = colorMap[item.severity];
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, delay: 0.22 + index * 0.07 }}
      className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5"
      style={{ background: `${c}08`, borderColor: `${c}20` }}
    >
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${c}18` }}>
        <Icon size={12} style={{ color: c }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-5" style={{ color: 'var(--color-fg-default)' }}>{item.message}</p>
        <p className="mt-0.5 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>{item.time}</p>
      </div>
    </motion.div>
  );
}

function OrchestrationPulse() {
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const isLight = useUIStore((s) => s.theme === 'light');

  useEffect(() => {
    // Seed initial events client-side only (avoids SSR hydration mismatch)
    setEvents(
      Array.from({ length: 8 }, (_, i) => {
        const t = PULSE_EVENT_TYPES[Math.floor(Math.random() * PULSE_EVENT_TYPES.length)];
        return { id: genId(), type: t.type, label: t.type, color: t.color, ts: Date.now() - (8 - i) * 1800 };
      })
    );
    const id = setInterval(() => {
      const t = PULSE_EVENT_TYPES[Math.floor(Math.random() * PULSE_EVENT_TYPES.length)];
      setEvents(prev => {
        const next = [...prev, { id: genId(), type: t.type, label: t.type, color: t.color, ts: Date.now() }];
        return next.slice(-10);
      });
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const latest = events[events.length - 1];
  const recent = events.slice(-4).reverse();
  const density = Math.min(100, events.length * 10);

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-3.5">
      <div
        className="pointer-events-none absolute inset-x-4 top-0 h-px"
        style={{ background: 'rgba(15,23,42,0.08)' }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10"
            style={isLight ? { background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' } : undefined}
          >
            <span
              className="absolute inset-0 rounded-xl bg-cyan-300/10 animate-pulse"
              style={isLight ? { background: 'transparent' } : undefined}
            />
            <Cpu size={17} className="relative text-cyan-100" style={isLight ? { color: 'var(--color-fg-default)' } : undefined} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100"
                style={isLight
                  ? {
                      background: 'var(--color-surface-1)',
                      borderColor: 'var(--color-line-default)',
                      color: 'var(--color-fg-muted)',
                    }
                  : undefined}
              >
                Live engine
              </span>
              <span className="font-mono text-[10px] text-[var(--color-fg-subtle)]">
                cadence 2.2s
              </span>
            </div>
            <p className="mt-1 truncate text-[12px] font-medium text-[var(--color-fg-muted)]">
              {latest ? `${latest.label} signal routed through execution mesh` : 'Waiting for orchestration signals'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-right">
          <div
            className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-1.5"
            style={isLight ? { background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' } : undefined}
          >
            <div className="font-mono text-[16px] font-semibold leading-none text-[var(--color-accent-default)]">{events.length}</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-wide text-[var(--color-fg-subtle)]">signals</div>
          </div>
          <div
            className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-1.5"
            style={isLight ? { background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' } : undefined}
          >
            <div className="font-mono text-[16px] font-semibold leading-none text-[var(--color-state-success)]">{density}%</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-wide text-[var(--color-fg-subtle)]">load</div>
          </div>
        </div>
      </div>

      <div
        className="relative mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-black/20 px-3 py-3"
        style={isLight ? { background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' } : undefined}
      >
        <div className="absolute left-6 right-6 top-[31px] h-px bg-[var(--color-line-default)]" />
        <motion.div
          aria-hidden
          className="absolute top-[30px] h-[2px] w-24 rounded-full bg-[rgba(15,23,42,0.18)]"
          animate={{ x: ['-20%', '760%'] }}
          transition={{ repeat: Infinity, duration: 3.1, ease: 'linear' }}
        />

        <div className="relative z-10 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {PULSE_EVENT_TYPES.map((step) => {
            const Icon = step.icon;
            const isLatest = latest?.type === step.type;
            const count = events.filter((event) => event.type === step.type).length;
            return (
              <div
                key={step.type}
                className="rounded-xl border px-2.5 py-2 transition-all"
                style={{
                  background: isLight
                    ? 'var(--color-surface-1)'
                    : isLatest ? `${step.color}18` : 'rgba(255,255,255,0.025)',
                  borderColor: isLight
                    ? 'var(--color-line-default)'
                    : isLatest ? `${step.color}55` : 'rgba(255,255,255,0.075)',
                  boxShadow: isLight ? 'none' : isLatest ? `0 0 18px ${step.color}22` : 'none',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="grid h-7 w-7 place-items-center rounded-lg border"
                    style={isLight
                      ? { background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }
                      : { background: `${step.color}14`, borderColor: `${step.color}30` }}
                  >
                    <Icon size={13} style={{ color: step.color }} />
                  </span>
                  <span className="font-mono text-[10px] font-semibold" style={{ color: step.color }}>
                    {step.short}
                  </span>
                </div>
                <div className="mt-2 truncate text-[11px] font-semibold text-[var(--color-fg-default)]">{step.label}</div>
                <div className="mt-0.5 font-mono text-[9px] text-[var(--color-fg-subtle)]">{count} events</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Latest</span>
        <AnimatePresence mode="popLayout" initial={false}>
          {recent.map((ev) => (
            <motion.div
              key={ev.id}
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
              style={isLight
                ? { background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }
                : { background: `${ev.color}10`, borderColor: `${ev.color}2f` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ev.color }} />
              <span className="font-mono text-[10px] font-medium" style={{ color: ev.color }}>{ev.label}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        <span className="ml-auto font-mono text-[10px] text-[var(--color-fg-subtle)]">mesh stable</span>
      </div>
    </div>
  );
}

function ConductorBridge({ cards }: { cards: MetricCard[] }) {
  const stages = PULSE_EVENT_TYPES.slice(0, 5);
  const isLight = useUIStore((s) => s.theme === 'light');

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.14 }}
      className="relative overflow-hidden rounded-2xl border px-4 py-3.5"
      style={{
        background: 'var(--color-surface-1)',
        borderColor: 'var(--color-line-default)',
        boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'none',
          backgroundSize: '34px 34px',
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-8 right-8 top-1/2 hidden h-px xl:block"
        style={{ background: 'rgba(15,23,42,0.08)' }}
        animate={{ opacity: [0.35, 0.9, 0.35] }}
        transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
      />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Network size={15} style={{ color: isLight ? 'var(--color-fg-default)' : '#67e8f9' }} />
            <h2
              className="text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-100"
              style={isLight ? { color: 'var(--color-fg-default)' } : undefined}
            >
              Execution Orchestra
            </h2>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[var(--color-fg-subtle)]">
            Signals move from workspace health into the conductor, then out to execution stages.
          </p>
        </div>
        <div
          className="flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100"
          style={isLight
            ? {
                background: 'var(--color-surface-1)',
                borderColor: 'var(--color-line-default)',
                color: 'var(--color-fg-muted)',
              }
            : undefined}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_14px_rgba(103,232,249,0.9)]" />
          tempo 2.2s
        </div>
      </div>

      <div className="relative mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] xl:items-center">
        <div className="grid grid-cols-2 gap-2">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                className="relative overflow-hidden rounded-xl border px-3 py-2.5"
                style={isLight
                  ? { background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }
                  : { background: `${card.colorClass}0c`, borderColor: `${card.colorClass}24` }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border"
                    style={isLight
                      ? { background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }
                      : { background: `${card.colorClass}14`, borderColor: `${card.colorClass}30` }}
                  >
                    <Icon size={13} style={{ color: card.colorClass }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[13px] font-semibold leading-none" style={{ color: card.colorClass }}>
                      {card.format(card.value)}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-subtle)]">
                      {card.label}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative mx-auto flex h-[122px] w-[150px] items-center justify-center">
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full border border-cyan-300/20"
            style={isLight ? { borderColor: 'var(--color-line-default)' } : undefined}
            animate={{ scale: [0.92, 1.04, 0.92], opacity: [0.32, 0.75, 0.32] }}
            transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
          />
          <motion.div
            aria-hidden
            className="absolute h-[84px] w-[84px] rounded-full border border-emerald-300/20"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 11, ease: 'linear' }}
            style={{
              background: isLight
                ? 'none'
                : 'conic-gradient(from 90deg, rgba(34,211,238,0.0), rgba(34,211,238,0.34), rgba(69,192,138,0.24), rgba(34,211,238,0.0))',
              borderColor: isLight ? 'var(--color-line-default)' : undefined,
            }}
          />
          <div
            className="relative grid h-[74px] w-[74px] place-items-center rounded-2xl border border-cyan-300/30 bg-[var(--color-surface-1)] shadow-[0_0_32px_rgba(34,211,238,0.18)]"
            style={isLight ? { borderColor: 'var(--color-line-default)', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' } : undefined}
          >
            <Zap size={22} className="text-cyan-100" style={isLight ? { color: 'var(--color-fg-default)' } : undefined} />
            <span
              className="absolute -bottom-6 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-100"
              style={isLight ? { color: 'var(--color-fg-muted)' } : undefined}
            >
              conductor
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5 xl:grid-cols-5">
          {stages.map((stage) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.type}
                className="rounded-xl border px-3 py-2.5"
                style={isLight
                  ? { background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }
                  : { background: `${stage.color}0c`, borderColor: `${stage.color}24` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon size={13} style={{ color: stage.color }} />
                  <span className="font-mono text-[10px] font-semibold" style={{ color: stage.color }}>
                    {stage.short}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] font-semibold text-[var(--color-fg-default)]">{stage.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}

function SystemTopology() {
  const [activeNode, setActiveNode] = useState(2); // engine is active

  useEffect(() => {
    const id = setInterval(() => {
      setActiveNode(Math.floor(Math.random() * TOPOLOGY_NODES.length));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Wifi size={13} style={{ color: 'var(--color-accent-default)' }} />
        <h3 className="text-xs font-medium" style={{ color: 'var(--color-fg-default)' }}>System Topology</h3>
      </div>
      <div className="relative flex flex-col items-center justify-center gap-0">
        {/* SVG connecting lines */}
        <svg
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: 'none' }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8b79ff" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#8b79ff" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8b79ff" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          {/* Vertical spine */}
          <line x1="50%" y1="10%" x2="50%" y2="90%" stroke="url(#edgeGrad)" strokeWidth="1" strokeDasharray="4 4">
            <animate attributeName="stroke-dashoffset" from="100" to="0" dur="3s" repeatCount="indefinite" />
          </line>
        </svg>
        <div className="relative z-10 flex w-full flex-col gap-2 px-1">
          {TOPOLOGY_NODES.map((node, i) => {
            const Icon = node.icon;
            const isActive = activeNode === i;
            return (
              <motion.div
                key={node.id}
                animate={isActive ? { y: [-1, 1, -1] } : { y: 0 }}
                transition={{ duration: 2, repeat: isActive ? Infinity : 0, ease: 'easeInOut' }}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 transition-all"
                style={{
                  background: isActive ? `${node.color}12` : 'var(--color-surface-2)',
                  borderColor: isActive ? `${node.color}40` : 'var(--color-line-default)',
                  boxShadow: isActive ? `0 0 12px ${node.color}20` : 'none',
                }}
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                  style={{ background: `${node.color}18`, border: `1px solid ${node.color}30` }}
                >
                  <Icon size={13} style={{ color: node.color }} />
                </div>
                <span className="text-[11px] font-medium" style={{ color: isActive ? node.color : 'var(--color-fg-muted)' }}>
                  {node.label}
                </span>
                {isActive && (
                  <span className="ml-auto flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: node.color, animation: 'ring-pulse 1.2s ease-out infinite' }} />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActivityStream() {
  const listRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0);
  const [events, setEvents] = useState<ActivityEvent[]>(() => buildInitialActivity(0));

  useEffect(() => {
    const syncNow = () => setNow(Date.now());

    syncNow();
    setEvents(buildInitialActivity(Date.now()));

    const clockId = setInterval(syncNow, 1000);
    const activityId = setInterval(() => {
      const tpl = ACTIVITY_TEMPLATES[Math.floor(Math.random() * ACTIVITY_TEMPLATES.length)];
      setEvents(prev => {
        const next = [
          ...prev,
          { id: genId(), message: tpl.message, detail: tpl.detailFn(), color: tpl.color, ts: Date.now() },
        ];
        return next.slice(-40);
      });
    }, 2000);
    return () => {
      clearInterval(clockId);
      clearInterval(activityId);
    };
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Activity size={13} style={{ color: 'var(--color-accent-default)' }} />
        <h3 className="text-xs font-medium" style={{ color: 'var(--color-fg-default)' }}>Activity Stream</h3>
        <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-[#45c08a]" style={{ animation: 'ring-pulse 1.4s ease-out infinite' }} />
      </div>
      <div
        ref={listRef}
        className="max-h-[260px] space-y-1 overflow-y-auto pr-1"
        style={{ scrollBehavior: 'smooth' }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {events.map((ev) => (
            <motion.div
              key={ev.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2 rounded-lg px-3 py-1.5"
              style={{ background: `${ev.color}08`, border: `1px solid ${ev.color}18` }}
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ev.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px]" style={{ color: 'var(--color-fg-default)' }}>{ev.message}</p>
                <p className="mt-0.5 truncate font-mono text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>{ev.detail}</p>
              </div>
              <span className="shrink-0 text-[9px] font-mono" style={{ color: 'var(--color-fg-subtle)' }}>{timeAgo(ev.ts, now)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ModuleLibraryTile({ tile, index }: { tile: RouteTile; index: number }) {
  const Icon = tile.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: 0.02 * index, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <Link
        href={tile.href}
        className="group flex min-h-[50px] items-center gap-2.5 rounded-lg border px-3 py-2 transition-all hover:translate-x-[2px]"
        style={{
          background: `${tile.color}08`,
          borderColor: `${tile.color}20`,
        }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
          style={{ background: `${tile.color}12`, borderColor: `${tile.color}28` }}
        >
          <Icon size={14} style={{ color: tile.color }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium" style={{ color: 'var(--color-fg-muted)' }}>
            {tile.name}
          </span>
          <span className="block truncate font-mono text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
            {tile.href}
          </span>
        </span>
        <ArrowUpRight
          size={11}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: 'var(--color-accent-default)' }}
        />
      </Link>
    </motion.div>
  );
}

export default function CommandCenterPage() {
  const isLight = useUIStore((s) => s.theme === 'light');
  // Live metric state
  const [metrics, setMetrics] = useState({
    executions: 7,
    successRate: 94.2,
    aiRecoveries: 23,
    flakyDetected: 4,
  });

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics(prev => ({
        executions: Math.max(0, prev.executions + (Math.random() < 0.5 ? 1 : -1)),
        successRate: Math.min(100, Math.max(0, prev.successRate + (Math.random() - 0.5) * 0.6)),
        aiRecoveries: prev.aiRecoveries + (Math.random() < 0.12 ? 1 : 0),
        flakyDetected: Math.max(0, prev.flakyDetected + (Math.random() < 0.08 ? 1 : Math.random() < 0.1 ? -1 : 0)),
      }));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const metricCards: MetricCard[] = [
    {
      id: 'exec',
      label: 'Active Executions',
      value: metrics.executions,
      unit: '',
      icon: Activity,
      colorClass: '#5b8cff',
      glowColor: 'rgba(91,140,255,0.12)',
      borderColor: 'rgba(91,140,255,0.22)',
      bgColor: 'rgba(91,140,255,0.08)',
      iconBg: 'rgba(91,140,255,0.12)',
      trend: 'neutral',
      format: v => String(Math.round(v)),
      drift: () => (Math.random() < 0.5 ? 1 : -1),
    },
    {
      id: 'rate',
      label: 'Success Rate',
      value: metrics.successRate,
      unit: '%',
      icon: CheckCircle2,
      colorClass: '#45c08a',
      glowColor: 'rgba(69,192,138,0.12)',
      borderColor: 'rgba(69,192,138,0.22)',
      bgColor: 'rgba(69,192,138,0.08)',
      iconBg: 'rgba(69,192,138,0.12)',
      trend: 'up',
      format: v => `${v.toFixed(1)}%`,
      drift: () => (Math.random() - 0.5) * 0.6,
    },
    {
      id: 'ai',
      label: 'AI Recoveries',
      value: metrics.aiRecoveries,
      unit: '',
      icon: Sparkles,
      colorClass: '#a195ff',
      glowColor: 'rgba(161,149,255,0.12)',
      borderColor: 'rgba(161,149,255,0.22)',
      bgColor: 'rgba(161,149,255,0.08)',
      iconBg: 'rgba(161,149,255,0.12)',
      trend: 'up',
      format: v => String(Math.round(v)),
      drift: () => (Math.random() < 0.12 ? 1 : 0),
    },
    {
      id: 'flaky',
      label: 'Flaky Detected',
      value: metrics.flakyDetected,
      unit: '',
      icon: AlertTriangle,
      colorClass: '#f0b558',
      glowColor: 'rgba(240,181,88,0.12)',
      borderColor: 'rgba(240,181,88,0.22)',
      bgColor: 'rgba(240,181,88,0.08)',
      iconBg: 'rgba(240,181,88,0.12)',
      trend: 'neutral',
      format: v => String(Math.round(v)),
      drift: () => (Math.random() < 0.08 ? 1 : Math.random() < 0.1 ? -1 : 0),
    },
  ];

  return (
    <main className="workspace-dashboard flex min-h-full flex-col overflow-y-auto">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:px-7 lg:py-5">

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
          className="relative isolate overflow-hidden rounded-[26px] border p-5 lg:p-6"
          style={{
            background: 'var(--color-surface-1)',
            borderColor: 'var(--color-line-default)',
            boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
          }}
        >
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[rgba(15,23,42,0.08)]" />
          <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100"
                  style={isLight
                    ? {
                        background: 'var(--color-surface-1)',
                        borderColor: 'var(--color-line-default)',
                        color: 'var(--color-fg-muted)',
                      }
                    : undefined}
                >
                  Workspace Command Center
                </span>
                <StatusBadge label="3 Active Agents" color="#45c08a" pulse="green" />
                <StatusBadge label="AI Online" color="#a195ff" pulse="violet" />
                <LiveClock />
              </div>

              <h1 className="mt-4 max-w-3xl text-[30px] font-semibold leading-[1.06] tracking-[-0.035em] text-[var(--color-fg-default)] md:text-[40px]">
                See the risk, control the run, and launch the next QA mission.
              </h1>
              <p className="mt-3 max-w-2xl text-[15px] leading-6 text-[var(--color-fg-muted)]">
                A cleaner operating floor for executions, AI recoveries, flaky-test triage, topology, and every module your team needs next.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  href="/main-dashboard/automation/web/planning"
                  className={`flex max-w-full items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold transition-all hover:-translate-y-0.5 hover:opacity-95 active:scale-95 ${isLight ? 'border border-[var(--color-line-default)]' : ''}`}
                  style={{
                    background: isLight ? 'var(--color-surface-1)' : 'var(--color-accent-default)',
                    color: isLight ? 'var(--color-fg-default)' : 'var(--color-accent-fg)',
                    boxShadow: isLight ? '0 1px 3px rgba(15,23,42,0.05)' : '0 6px 18px rgba(37,99,235,0.14)',
                  }}
                >
                  <Plus size={15} />
                  <span className="truncate">Open Planning Workspace</span>
                </Link>
                <Link
                  href="/executions"
                  className="flex items-center gap-2 rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-fg-default)] transition-all hover:border-cyan-300/35 hover:bg-cyan-300/10"
                >
                  Monitor live runs <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {[
                { label: 'Suite health', value: `${metrics.successRate.toFixed(1)}%`, tone: '#45c08a', detail: 'Live success score' },
                { label: 'AI recoveries', value: metrics.aiRecoveries, tone: '#a195ff', detail: 'Self-healed signals' },
                { label: 'Flaky watch', value: metrics.flakyDetected, tone: '#f0b558', detail: 'Needs review' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border px-4 py-3"
                  style={{
                    background: 'var(--color-surface-1)',
                    borderColor: 'var(--color-line-default)',
                    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400">{item.label}</span>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.tone, boxShadow: `0 0 14px ${item.tone}` }} />
                  </div>
                  <div className="mt-2 font-mono text-[24px] font-semibold leading-none" style={{ color: item.tone }}>
                    {item.value}
                  </div>
                  <p className="mt-1 text-[12px] text-slate-400">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ── MAIN GRID ──────────────────────────────────────────────── */}
        <div className="relative grid grid-cols-1 items-start gap-4 xl:grid-cols-12">

          {/* METRIC CARDS — row 1, cols 1-7 */}
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:col-span-8 2xl:grid-cols-4">
            {metricCards.map((card, i) => (
              <MetricCardComponent key={card.id} card={card} index={i} />
            ))}
          </div>

          <div className="xl:col-span-8">
            <ConductorBridge cards={metricCards} />
          </div>

          {/* RECENT PROJECTS — row 1+2, cols 8-12 */}
          <motion.section
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="flex flex-col gap-4 xl:absolute xl:right-0 xl:top-0 xl:w-[32%]"
          >
            <div
              className="flex flex-col gap-3 overflow-y-auto rounded-2xl border p-4 xl:max-h-[300px]"
              style={{
                background: 'var(--color-surface-1)',
                borderColor: 'var(--color-line-default)',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              }}
            >
            <div className="flex shrink-0 items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-fg-muted)' }}>
                Operations Rail
              </h2>
              <Link
                href="/test-configuration"
                className="flex items-center gap-1 text-[13px] font-mono transition-colors hover:text-(--color-accent-default)"
                style={{ color: 'var(--color-fg-subtle)' }}
              >
                View all <ChevronRight size={10} />
              </Link>
            </div>
            <p className="-mt-1 text-[12px] leading-5" style={{ color: 'var(--color-fg-subtle)' }}>
              Active workspaces, live risk, and the next signals that deserve attention.
            </p>
            <div className="flex flex-col gap-2 overflow-hidden">
              {PROJECTS.map((p, i) => (
                <ProjectCard key={p.name} project={p} index={i} />
              ))}
            </div>

            {/* AI INSIGHTS FEED */}
            <div className="mt-0.5 border-t pt-2.5" style={{ borderColor: 'rgba(161,149,255,0.16)' }}>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-fg-muted)' }}>
                AI Insights
              </h2>
              <div className="flex flex-col gap-1.5">
                {INSIGHTS.map((item, i) => (
                  <InsightRow key={item.type + i} item={item} index={i} />
                ))}
              </div>
            </div>
            </div>

            <div className="grid gap-4">
              <div className="overflow-hidden rounded-2xl border p-4" style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }}>
                <SystemTopology />
              </div>
              <div className="overflow-hidden rounded-2xl border p-4" style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }}>
                <ActivityStream />
              </div>
            </div>
          </motion.section>

          {/* ORCHESTRATION PULSE — row 2, cols 1-7 */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.18 }}
            className="flex flex-col justify-center rounded-2xl border px-5 py-4 xl:col-span-8"
            style={{
              background: 'var(--color-surface-1)',
              borderColor: 'var(--color-line-default)',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <Zap size={16} style={{ color: 'var(--color-accent-default)' }} />
              <h2 className="text-[13px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-fg-muted)' }}>
                Live Orchestration Pulse
              </h2>
            </div>
            <OrchestrationPulse />
          </motion.section>

          {/* SYSTEM TOPOLOGY — row 3, cols 1-4 */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.24 }}
            className="hidden"
            style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }}
          >
            <SystemTopology />
          </motion.section>

          {/* ACTIVITY STREAM — row 3, cols 5-7 */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="hidden"
            style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }}
          >
            <ActivityStream />
          </motion.section>

          {/* QUICK LINKS — row 3, cols 8-12 (bottom of right col) */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.34 }}
            className="flex min-h-[280px] flex-col overflow-hidden rounded-2xl border p-4 xl:col-span-8 xl:col-start-1"
            style={{
              background: 'var(--color-surface-1)',
              borderColor: 'var(--color-line-default)',
            }}
          >
            <div className="mb-2.5 flex shrink-0 items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-fg-muted)' }}>
                Mission Launchpad
              </h2>
              <span className="font-mono text-[13px]" style={{ color: 'var(--color-fg-subtle)' }}>
                {MODULE_LIBRARY.length} routes
              </span>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2 2xl:grid-cols-3">
              {MODULE_LIBRARY.map((tile, index) => (
                <ModuleLibraryTile key={tile.href} tile={tile} index={index} />
              ))}
            </div>
          </motion.section>

        </div>
      </div>
    </main>
  );
}
