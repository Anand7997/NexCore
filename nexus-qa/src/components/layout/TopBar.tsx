'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  Brain,
  ChevronRight,
  Clock,
  Loader2,
  Moon,
  Search,
  Sun,
  Terminal,
  Zap,
} from 'lucide-react';
import { useExecutionStore } from '@/lib/stores/executionStore';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';
import { useUIStore } from '@/lib/stores/uiStore';
import { cn } from '@/lib/utils';

const WORKSPACE_META: Record<string, { label: string; env: string }> = {
  '/':                   { label: 'Workspace Command Center',   env: 'prod' },
  '/workspace/new':      { label: 'Project Creation',           env: 'prod' },
  '/architecture':       { label: 'Architecture Builder',       env: 'build' },
  '/intent-studio':      { label: 'Business Intent Studio',     env: 'build' },
  '/testcases':          { label: 'Testcase Intelligence',      env: 'prod' },
  '/test-designer':      { label: 'Test Step Designer',         env: 'build' },
  '/execution-control':  { label: 'Execution Control Center',   env: 'run' },
  '/ai-investigation':   { label: 'AI Investigation',           env: 'debug' },
  '/knowledge-graph':    { label: 'Knowledge Graph',            env: 'prod' },
  '/matrix':             { label: 'Platform Matrix',            env: 'prod' },
  '/agents':             { label: 'Execution Agents',           env: 'run' },
  '/settings':           { label: 'System Settings',            env: 'config' },
  '/reports':            { label: 'Intelligence Reports',       env: 'prod' },
  '/workflows':          { label: 'Workflow Development',       env: 'build' },
  '/executions':         { label: 'Execution Monitoring',       env: 'run' },
  '/ai-analysis':        { label: 'AI Inspect',                 env: 'debug' },
  '/test-configuration': { label: 'Test Configuration',         env: 'build' },
};

const ENV_COLORS: Record<string, string> = {
  prod:   'text-[var(--color-state-success)]',
  run:    'text-[var(--color-state-running)]',
  build:  'text-[var(--color-accent-default)]',
  debug:  'text-[var(--color-cyan-neon)]',
  config: 'text-[var(--color-fg-muted)]',
};
const ENV_DOT: Record<string, string> = {
  prod:   'bg-[var(--color-state-success)]',
  run:    'bg-[var(--color-state-running)]',
  build:  'bg-[var(--color-accent-default)]',
  debug:  'bg-[var(--color-cyan-neon)]',
  config: 'bg-[var(--color-fg-muted)]',
};

function FlashCounter({ value, colorClass }: { value: number; colorClass: string }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (value !== prev.current) {
      prev.current = value;
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 400);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [value]);

  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      className={cn('text-xs font-mono font-semibold tabular-nums transition-all', colorClass, flash && 'brightness-150')}
    >
      {value}
    </motion.span>
  );
}

export default function TopBar() {
  const pathname = usePathname();
  const {
    toggleCommandPalette,
    toggleInspector,
    toggleTerminal,
    inspectorOpen,
    terminalOpen,
    theme,
    toggleTheme,
  } = useUIStore();
  const { executions } = useExecutionStore();
  const events = useRealtimeStore((s) => s.events);
  const unreadCount = Math.min(events.length, 9);

  const running = executions.filter((e) => e.status === 'running').length;
  const queued  = executions.filter((e) => e.status === 'queued').length;
  const failed  = executions.filter((e) => e.status === 'failed').length;

  const workspace = useMemo(() => {
    const exact = WORKSPACE_META[pathname];
    if (exact) return exact;
    const match = Object.entries(WORKSPACE_META).find(
      ([href]) => href !== '/' && pathname.startsWith(href),
    );
    return match?.[1] ?? WORKSPACE_META['/'];
  }, [pathname]);

  return (
    <header
      className="nex-topbar relative z-20 flex h-[var(--shell-topbar-h)] shrink-0 items-center gap-4 px-5"
      style={{
        background: 'var(--color-surface-overlay)',
        backdropFilter: 'blur(16px) saturate(160%)',
        WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        borderBottom: '1px solid var(--color-line-default)',
      }}
    >
      {/* Bottom accent line */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.42) 30%, rgba(34,197,94,0.28) 70%, transparent 100%)',
        }}
      />

      {/* ── Left: Breadcrumb ─────────────────────────────────────── */}
      <div className="flex min-w-0 items-center gap-2 shrink-0">
        <span className="text-[12px] font-mono font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-default)]">
          NEXCORE
        </span>
        <ChevronRight size={14} className="text-[var(--color-fg-subtle)] shrink-0" />
        <span className="truncate text-[14px] font-medium text-[var(--color-fg-muted)] max-w-[220px] md:max-w-none">
          {workspace.label}
        </span>
      </div>

      {/* ── Center: Command search ────────────────────────────────── */}
      <div className="flex-1 flex justify-center px-2">
        <button
          onClick={toggleCommandPalette}
          className={cn(
            'group flex h-10 items-center gap-3 rounded-xl transition-all duration-200',
            'min-w-[260px] w-full max-w-[460px]',
            'border border-[var(--color-line-default)] bg-[var(--color-surface-2)]',
            'px-4 text-[14px] text-[var(--color-fg-subtle)]',
            'hover:border-[rgba(34,211,238,0.32)] hover:bg-[var(--color-surface-3)]',
            'hover:text-[var(--color-fg-muted)]',
            'focus:outline-none focus:border-[rgba(34,211,238,0.46)]',
          )}
          aria-label="Open command palette (Ctrl+K)"
        >
          <Search size={15} className="shrink-0 text-[var(--color-fg-subtle)] group-hover:text-[var(--color-accent-default)] transition-colors" />
          <span className="flex-1 text-left truncate">Search commands, routes, executions</span>
          <span className="kbd shrink-0">⌘K</span>
        </button>
      </div>

      {/* ── Right: Stats + Actions ────────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Execution counters */}
        <div className="hidden items-center gap-2 md:flex">
          <div className="flex items-center gap-1.5">
            <Loader2 size={13} className="animate-spin text-[var(--color-state-running)]" />
            <FlashCounter value={running} colorClass="text-[var(--color-state-running)]" />
            <span className="text-[12px] font-mono text-[var(--color-fg-subtle)]">run</span>
          </div>
          <div className="h-3 w-px bg-[var(--color-line-default)]" />
          <div className="flex items-center gap-1.5">
            <Clock size={13} className="text-[var(--color-state-warning)]" />
            <FlashCounter value={queued} colorClass="text-[var(--color-state-warning)]" />
            <span className="text-[12px] font-mono text-[var(--color-fg-subtle)]">wait</span>
          </div>
          <AnimatePresence>
            {failed > 0 && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="flex items-center gap-1.5 overflow-hidden"
              >
                <div className="h-3 w-px bg-[var(--color-line-default)]" />
                <AlertTriangle size={13} className="shrink-0 text-[var(--color-state-error)]" />
                <FlashCounter value={failed} colorClass="text-[var(--color-state-error)]" />
                <span className="shrink-0 text-[12px] font-mono text-[var(--color-fg-subtle)]">fail</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="hidden h-4 w-px bg-[var(--color-line-default)] md:block" />

        {/* Action buttons row */}
        <div className="flex items-center gap-0.5">
          {/* Terminal button */}
          <button
            onClick={toggleTerminal}
            title="Toggle terminal (Ctrl+`)"
            className={cn(
              'flex h-9 items-center gap-2 rounded-lg px-3 text-[12px] font-mono transition-all duration-150',
              terminalOpen
                ? 'border border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.10)] text-[var(--color-accent-default)]'
                : 'text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]',
            )}
          >
            <Terminal size={14} />
            <span className="hidden sm:inline">Terminal</span>
          </button>

          {/* AI Copilot toggle */}
          <button
            onClick={toggleInspector}
            title="Toggle AI Copilot"
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150',
              inspectorOpen
                ? 'border border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.10)] text-[var(--color-accent-default)]'
                : 'text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]',
            )}
          >
            <Brain size={16} />
          </button>

          {/* Notification bell */}
          <button
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]"
            aria-label="Notifications"
          >
            <Bell size={16} />
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span
                  key={unreadCount}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-state-error)] px-1 text-[10px] font-bold text-white"
                >
                  {unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* ── Theme toggle — Sun / Moon ─────────────────────────── */}
          <motion.button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            whileTap={{ scale: 0.88 }}
            className={cn(
              'relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg transition-all duration-150',
              theme === 'light'
                ? 'border border-[rgba(34,211,238,0.30)] bg-[rgba(34,211,238,0.08)] text-[var(--color-accent-default)]'
                : 'text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]',
            )}
            aria-label="Toggle theme"
          >
            <AnimatePresence mode="wait" initial={false}>
              {theme === 'dark' ? (
                <motion.span
                  key="sun"
                  initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
                  className="flex items-center justify-center"
                >
                  <Sun size={16} />
                </motion.span>
              ) : (
                <motion.span
                  key="moon"
                  initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
                  className="flex items-center justify-center"
                >
                  <Moon size={16} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Environment chip */}
        <div
          className={cn(
            'hidden h-9 items-center gap-2 rounded-lg border border-[var(--color-line-default)]',
            'bg-[var(--color-surface-2)] px-2.5 lg:flex',
          )}
        >
          <Zap size={12} className={cn('shrink-0', ENV_COLORS[workspace.env] ?? ENV_COLORS.prod)} />
          <span className={cn('text-[12px] font-mono', ENV_COLORS[workspace.env] ?? ENV_COLORS.prod)}>
            {workspace.env}
          </span>
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              ENV_DOT[workspace.env] ?? ENV_DOT.prod,
              workspace.env === 'run' && 'shadow-[0_0_5px_rgba(34,211,238,0.7)]',
              workspace.env === 'prod' && 'shadow-[0_0_5px_rgba(16,185,129,0.7)]',
            )}
          />
        </div>
      </div>
    </header>
  );
}
