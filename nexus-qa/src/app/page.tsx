'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  Globe,
  Monitor,
  Plus,
  Server,
  Shield,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Wifi,
  Zap,
} from 'lucide-react';

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

// ─── Static data ─────────────────────────────────────────────────────────────

const PROJECTS: ProjectItem[] = [
  { name: 'Airline Booking Suite', type: 'Web + Mobile + API', status: 'active', lastRun: '2m ago', successRate: 91, href: '/executions' },
  { name: 'Payment Gateway E2E', type: 'Web + API + Desktop', status: 'running', lastRun: 'now', successRate: 87, href: '/executions' },
  { name: 'Invoice Processing', type: 'Desktop + API', status: 'idle', lastRun: '1h ago', successRate: 98, href: '/executions' },
];

const INSIGHTS: InsightItem[] = [
  { icon: AlertTriangle, type: 'flaky', message: 'LoginPage.submit flaky (87% pass rate over 48 runs)', severity: 'warn', time: '4m ago' },
  { icon: Sparkles, type: 'recovery', message: 'AI healed 3 locators in CheckoutFlow — confidence 94%', severity: 'success', time: '12m ago' },
  { icon: Zap, type: 'perf', message: 'PaymentAPI response 340ms above baseline (P95)', severity: 'warn', time: '31m ago' },
  { icon: Shield, type: 'coverage', message: 'Mobile adapter gap: iOS checkout step 7 missing locator', severity: 'error', time: '1h ago' },
];

const PULSE_EVENT_TYPES = [
  { type: 'NAVIGATE', color: '#5b8cff' },
  { type: 'ASSERT', color: '#45c08a' },
  { type: 'API_CALL', color: '#a195ff' },
  { type: 'EXTRACT', color: '#4dd1e1' },
  { type: 'SCREENSHOT', color: '#f0b558' },
  { type: 'VALIDATE', color: '#45c08a' },
];

const TOPOLOGY_NODES = [
  { id: 'web', label: 'Web Adapter', icon: Globe, color: '#5b8cff', x: 0 },
  { id: 'pw', label: 'Playwright', icon: Monitor, color: '#a195ff', x: 1 },
  { id: 'engine', label: 'Test Engine', icon: Zap, color: '#4dd1e1', x: 2 },
  { id: 'api', label: 'API Validator', icon: Server, color: '#45c08a', x: 3 },
  { id: 'db', label: 'DB Layer', icon: Database, color: '#f0b558', x: 4 },
];

const INITIAL_ACTIVITY_SEED = [
  { id: 'a1', message: 'Execution #E-4821 started', detail: 'Airline Booking Suite · Web', color: '#5b8cff', ageMs: 12000 },
  { id: 'a2', message: 'Assertion passed', detail: 'checkout_flow.assert_total', color: '#45c08a', ageMs: 9500 },
  { id: 'a3', message: 'Locator healed by AI', detail: 'btn#confirm → button[data-testid]', color: '#a195ff', ageMs: 7200 },
  { id: 'a4', message: 'Screenshot captured', detail: 'step_12_payment_confirm.png', color: '#4dd1e1', ageMs: 5100 },
  { id: 'a5', message: 'Test suite completed', detail: 'Invoice Processing · 18/18 passed', color: '#45c08a', ageMs: 2800 },
];

const ACTIVITY_TEMPLATES = [
  { message: 'Assertion passed', detailFn: () => `step_${Math.floor(Math.random() * 30 + 1)}.assert`, color: '#45c08a' },
  { message: 'API call validated', detailFn: () => `POST /api/v2/${['checkout','auth','search'][Math.floor(Math.random()*3)]}`, color: '#a195ff' },
  { message: 'Screenshot captured', detailFn: () => `evidence_frame_${Math.floor(Math.random()*99+1)}.png`, color: '#4dd1e1' },
  { message: 'Locator healed by AI', detailFn: () => `#btn-${Math.floor(Math.random()*10)} → [data-id]`, color: '#a195ff' },
  { message: 'Navigation complete', detailFn: () => `/page/${['dashboard','checkout','profile','orders'][Math.floor(Math.random()*4)]}`, color: '#5b8cff' },
  { message: 'Execution resumed', detailFn: () => `After AI retry · attempt ${Math.floor(Math.random()*3+2)}`, color: '#f0b558' },
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
  return (
    <div
      className="flex items-center gap-2 rounded-full border px-3 py-1"
      style={{ borderColor: `${color}33`, backgroundColor: `${color}11` }}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{ backgroundColor: color, animation: `ring-pulse 1.6s ease-out infinite` }}
        />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      </span>
      <span className="text-[11px] font-mono" style={{ color }}>{label}</span>
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
      <Clock size={11} style={{ color: 'var(--color-fg-subtle)' }} />
      <span className="font-mono text-[11px]" style={{ color: 'var(--color-fg-muted)' }}>{time}</span>
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
      className="relative flex flex-col gap-3 overflow-hidden rounded-xl border p-4"
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
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: card.iconBg, border: `1px solid ${card.borderColor}` }}
        >
          <Icon size={16} style={{ color: card.colorClass }} />
        </div>
        {card.trend === 'up' ? (
          <TrendingUp size={13} style={{ color: '#45c08a' }} />
        ) : card.trend === 'down' ? (
          <TrendingDown size={13} style={{ color: '#f06262' }} />
        ) : null}
      </div>
      <div>
        <div
          className="animate-count-up font-mono text-2xl font-semibold tracking-tight"
          style={{ color: card.colorClass }}
        >
          {displayVal}
        </div>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--color-fg-muted)' }}>{card.label}</p>
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
      className="group relative rounded-xl border p-4 transition-all"
      style={{
        background: 'var(--color-surface-1)',
        borderColor: 'var(--color-line-default)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium" style={{ color: 'var(--color-fg-default)' }}>{project.name}</h3>
          <p className="mt-0.5 text-[10px] font-mono" style={{ color: 'var(--color-fg-subtle)' }}>{project.type}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: `${statusColor}15`, border: `1px solid ${statusColor}30` }}>
          <span className="relative flex h-1.5 w-1.5">
            {project.status === 'running' && (
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: statusColor, animation: 'ring-pulse 1.4s ease-out infinite' }} />
            )}
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
          </span>
          <span className="text-[10px] font-mono" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>Success Rate</span>
          <span className="font-mono text-[11px]" style={{ color: project.successRate >= 95 ? '#45c08a' : project.successRate >= 85 ? '#f0b558' : '#f06262' }}>
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
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>Last run: {project.lastRun}</span>
        <Link
          href={project.href}
          className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-all hover:border-(--color-accent-default) hover:text-(--color-accent-default)"
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
      className="flex items-start gap-3 rounded-lg border p-3"
      style={{ background: `${c}08`, borderColor: `${c}20` }}
    >
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${c}18` }}>
        <Icon size={12} style={{ color: c }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-4" style={{ color: 'var(--color-fg-default)' }}>{item.message}</p>
        <p className="mt-0.5 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>{item.time}</p>
      </div>
    </motion.div>
  );
}

function OrchestrationPulse() {
  const [events, setEvents] = useState<PulseEvent[]>([]);

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

  return (
    <div className="flex items-center gap-2 overflow-hidden">
      <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--color-fg-subtle)' }}>Live</span>
      <div className="h-px flex-1" style={{ background: 'var(--color-line-default)' }} />
      <div className="flex items-center gap-2">
        <AnimatePresence mode="popLayout">
          {events.map((ev) => (
            <motion.div
              key={ev.id}
              initial={{ opacity: 0, scale: 0.7, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -20 }}
              transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
              className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1"
              style={{
                background: `${ev.color}12`,
                borderColor: `${ev.color}30`,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ev.color }} />
              <span className="font-mono text-[10px] font-medium" style={{ color: ev.color }}>{ev.label}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="h-px flex-1" style={{ background: 'var(--color-line-default)' }} />
      <span className="shrink-0 text-[10px] font-mono" style={{ color: 'var(--color-fg-subtle)' }}>engine</span>
    </div>
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
      <div className="mb-4 flex items-center gap-2">
        <Wifi size={13} style={{ color: 'var(--color-accent-default)' }} />
        <h3 className="text-xs font-medium" style={{ color: 'var(--color-fg-default)' }}>System Topology</h3>
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center gap-0">
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
        <div className="relative z-10 flex w-full flex-col gap-3 px-2">
          {TOPOLOGY_NODES.map((node, i) => {
            const Icon = node.icon;
            const isActive = activeNode === i;
            return (
              <motion.div
                key={node.id}
                animate={isActive ? { y: [-1, 1, -1] } : { y: 0 }}
                transition={{ duration: 2, repeat: isActive ? Infinity : 0, ease: 'easeInOut' }}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all"
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
        className="flex-1 space-y-1 overflow-y-auto pr-1"
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
              className="flex items-start gap-2 rounded-lg px-3 py-2"
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

export default function CommandCenterPage() {
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
    <main className="flex h-full flex-col gap-0 overflow-hidden">
      <div className="flex h-full flex-col gap-4 px-6 py-5">

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
          className="flex shrink-0 items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div>
              <h1
                className="text-[22px] font-semibold leading-tight tracking-tight"
                style={{
                  color: 'var(--color-fg-default)',
                }}
              >
                Execution Command Center
              </h1>
              <p className="mt-0.5 text-[10px] font-mono uppercase tracking-[0.16em]" style={{ color: 'var(--color-fg-subtle)' }}>
                NEXCORE QA · AI Execution OS · v2.0
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge label="3 Active Agents" color="#45c08a" pulse="green" />
            <StatusBadge label="AI Online" color="#a195ff" pulse="violet" />
            <LiveClock />
            <Link
              href="/workspace/new"
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all hover:opacity-90 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #8b79ff, #6b5ce7)',
                color: '#fff',
                boxShadow: '0 0 0 1px rgba(139,121,255,0.4), 0 0 20px rgba(139,121,255,0.25)',
              }}
            >
              <Plus size={14} />
              Create Execution Workspace
            </Link>
          </div>
        </motion.header>

        {/* ── MAIN GRID ──────────────────────────────────────────────── */}
        <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-[auto_auto_1fr] gap-4">

          {/* METRIC CARDS — row 1, cols 1-7 */}
          <div className="col-span-7 grid grid-cols-4 gap-3">
            {metricCards.map((card, i) => (
              <MetricCardComponent key={card.id} card={card} index={i} />
            ))}
          </div>

          {/* RECENT PROJECTS — row 1+2, cols 8-12 */}
          <motion.section
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="col-span-5 row-span-2 flex flex-col gap-3 overflow-hidden rounded-xl border p-4"
            style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }}
          >
            <div className="flex shrink-0 items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-fg-muted)' }}>
                Recent Projects
              </h2>
              <Link
                href="/test-configuration"
                className="flex items-center gap-1 text-[10px] font-mono transition-colors hover:text-(--color-accent-default)"
                style={{ color: 'var(--color-fg-subtle)' }}
              >
                View all <ChevronRight size={10} />
              </Link>
            </div>
            <div className="flex flex-col gap-2 overflow-hidden">
              {PROJECTS.map((p, i) => (
                <ProjectCard key={p.name} project={p} index={i} />
              ))}
            </div>

            {/* AI INSIGHTS FEED */}
            <div className="mt-1 border-t pt-3" style={{ borderColor: 'var(--color-line-default)' }}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-fg-muted)' }}>
                AI Insights
              </h2>
              <div className="flex flex-col gap-1.5">
                {INSIGHTS.map((item, i) => (
                  <InsightRow key={item.type + i} item={item} index={i} />
                ))}
              </div>
            </div>
          </motion.section>

          {/* ORCHESTRATION PULSE — row 2, cols 1-7 */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.18 }}
            className="col-span-7 flex flex-col justify-center rounded-xl border px-5 py-3"
            style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }}
          >
            <div className="mb-2 flex items-center gap-2">
              <Zap size={12} style={{ color: 'var(--color-accent-default)' }} />
              <h2 className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-fg-muted)' }}>
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
            className="col-span-4 overflow-hidden rounded-xl border p-4"
            style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }}
          >
            <SystemTopology />
          </motion.section>

          {/* ACTIVITY STREAM — row 3, cols 5-7 */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="col-span-3 overflow-hidden rounded-xl border p-4"
            style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }}
          >
            <ActivityStream />
          </motion.section>

          {/* QUICK LINKS — row 3, cols 8-12 (bottom of right col) */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.34 }}
            className="col-span-5 flex flex-col justify-between overflow-hidden rounded-xl border p-4"
            style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }}
          >
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-fg-muted)' }}>
              Quick Navigation
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Workflows', href: '/workflows', icon: Brain, color: '#a195ff' },
                { label: 'Executions', href: '/executions', icon: Activity, color: '#5b8cff' },
                { label: 'AI Analysis', href: '/ai-analysis', icon: Sparkles, color: '#4dd1e1' },
                { label: 'Agents', href: '/agents', icon: Server, color: '#45c08a' },
                { label: 'Matrix', href: '/matrix', icon: Globe, color: '#f0b558' },
                { label: 'Settings', href: '/settings', icon: Shield, color: '#8b8c97' },
              ].map(({ label, href, icon: Icon, color }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-all hover:border-(--color-accent-default)/30"
                  style={{ background: `${color}08`, borderColor: `${color}20` }}
                >
                  <Icon size={13} style={{ color }} />
                  <span className="text-[11px] font-medium" style={{ color: 'var(--color-fg-muted)' }}>{label}</span>
                  <ArrowRight size={10} className="ml-auto opacity-0 transition-opacity group-hover:opacity-100" style={{ color: 'var(--color-accent-default)' }} />
                </Link>
              ))}
            </div>
          </motion.section>

        </div>
      </div>
    </main>
  );
}
