'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  Brain,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  GitBranch,
  Grid3X3,
  LayoutDashboard,
  Network,
  Play,
  Plus,
  Settings2,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/stores/uiStore';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const GROUPS: NavGroup[] = [
  {
    id: 'command',
    label: '',
    items: [
      { href: '/', label: 'Workspace', icon: LayoutDashboard },
      { href: '/workspace/new', label: 'Create Project', icon: Plus },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    items: [
      { href: '/architecture', label: 'Architecture', icon: Boxes },
      { href: '/page-repository', label: 'Page Repository', icon: BookOpen },
      { href: '/intent-studio', label: 'Intent Studio', icon: Target },
      { href: '/test-configuration', label: 'Test Config', icon: FlaskConical },
    ],
  },
  {
    id: 'execution',
    label: 'Execution',
    items: [
      { href: '/workflows', label: 'Workflows', icon: GitBranch },
      { href: '/executions', label: 'Executions', icon: Play },
      { href: '/agents', label: 'Agents', icon: Bot },
    ],
  },
  {
    id: 'observability',
    label: 'Observability',
    items: [
      { href: '/ai-analysis', label: 'AI Analysis', icon: Brain },
      { href: '/knowledge-graph', label: 'Knowledge Graph', icon: Network },
      { href: '/matrix', label: 'Matrix', icon: Grid3X3 },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings2 },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
];

function HexLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0"
    >
      <polygon
        points="12,2 21,6.5 21,17.5 12,22 3,17.5 3,6.5"
        fill="rgba(139,92,246,0.15)"
        stroke="rgba(139,92,246,0.65)"
        strokeWidth="1.2"
      />
      <polygon
        points="12,6 17.5,9 17.5,15 12,18 6.5,15 6.5,9"
        fill="rgba(139,92,246,0.08)"
        stroke="rgba(139,92,246,0.35)"
        strokeWidth="0.8"
      />
      <circle cx="12" cy="12" r="2.5" fill="rgba(139,92,246,0.9)" />
      <circle cx="12" cy="12" r="1.2" fill="white" />
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar, toggleCommandPalette } = useUIStore();
  const collapsed = sidebarCollapsed;

  // Pre-warm Turbopack compilation for every route on mount so first clicks are instant
  useEffect(() => {
    const allHrefs = GROUPS.flatMap((g) => g.items.map((i) => i.href));
    allHrefs.forEach((href) => router.prefetch(href));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.aside
      animate={{ width: collapsed ? 52 : 228 }}
      transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
      className="relative z-30 flex h-full shrink-0 flex-col border-r border-[var(--color-line-default)] bg-[var(--color-surface-1)]"
      style={{ minHeight: 0 }}
    >
      {/* Subtle violet edge glow on right border */}
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-px"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(139,92,246,0.25) 40%, rgba(59,130,246,0.15) 70%, transparent 100%)',
        }}
      />

      {/* ── Logo / Brand ──────────────────────────────────────────── */}
      <div
        className={cn(
          'flex h-[var(--shell-topbar-h)] shrink-0 items-center gap-2.5 border-b border-[var(--color-line-default)]',
          collapsed ? 'justify-center px-0' : 'px-3.5',
        )}
      >
        <div className="relative shrink-0">
          <motion.div
            animate={collapsed ? { scale: 1.05 } : { scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <HexLogo size={26} />
          </motion.div>
          {/* AI Online pulse dot */}
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--color-state-success)] shadow-[0_0_6px_rgba(16,185,129,0.7)]">
            <span className="absolute inset-0 rounded-full bg-[var(--color-state-success)] opacity-60 animate-ping" style={{ animationDuration: '2.4s' }} />
          </span>
        </div>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="brand-text"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.14 }}
              className="overflow-hidden"
            >
              <p className="text-[13px] font-bold tracking-tight leading-none">
                <span className="text-[var(--color-fg-default)]">NEX</span>
                <span className="text-[var(--color-fg-default)]">CORE</span>
                <span className="ml-1 text-[var(--color-accent-default)]">QA</span>
              </p>
              <p className="mt-0.5 text-[9px] font-mono uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
                AI Execution OS
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Navigation ────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden pb-2 pt-2.5">
        {GROUPS.map((group, groupIdx) => (
          <div
            key={group.id}
            className={cn(groupIdx > 0 && 'mt-1')}
          >
            <AnimatePresence initial={false}>
              {!collapsed && group.label && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="mb-1 mt-3 px-3.5 text-[9px] font-mono uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]"
                >
                  {group.label}
                </motion.p>
              )}
            </AnimatePresence>

            <ul className={cn('space-y-0.5', collapsed ? 'px-1.5' : 'px-2')}>
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'group relative flex items-center rounded-md transition-all duration-150',
                        collapsed ? 'h-9 w-9 justify-center mx-auto' : 'h-8 gap-2.5 px-2.5',
                        isActive
                          ? 'bg-violet-500/10 border border-violet-500/20 text-violet-300'
                          : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)] border border-transparent',
                      )}
                    >
                      {/* Left rail glow indicator */}
                      {isActive && (
                        <motion.span
                          layoutId="nav-active-bar"
                          className="absolute left-[-8px] top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-[var(--color-accent-default)] nav-glow-rail"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        />
                      )}

                      <Icon
                        size={14}
                        className={cn(
                          'shrink-0 transition-all duration-150',
                          isActive
                            ? 'text-violet-400'
                            : 'text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg-default)]',
                        )}
                      />

                      <AnimatePresence initial={false}>
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.1 }}
                            className="truncate text-[12px] font-medium"
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>

                      {/* Tooltip when collapsed */}
                      {collapsed && (
                        <span
                          className={cn(
                            'pointer-events-none absolute left-full z-50 ml-2.5 whitespace-nowrap',
                            'rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface-3)]',
                            'px-2.5 py-1.5 text-[11px] font-medium',
                            'opacity-0 shadow-[var(--shadow-pop)] transition-all duration-150',
                            'group-hover:opacity-100 group-hover:translate-x-0',
                            '-translate-x-1',
                            isActive ? 'text-violet-300' : 'text-[var(--color-fg-default)]',
                          )}
                        >
                          {item.label}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Bottom: AI Status + Collapse toggle ───────────────────── */}
      <div className="shrink-0 border-t border-[var(--color-line-default)]">
        {/* AI Online indicator */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2 overflow-hidden px-3.5 py-2 border-b border-[var(--color-line-subtle)]"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inset-0 rounded-full bg-[var(--color-state-success)] animate-ping opacity-50" style={{ animationDuration: '2s' }} />
                <span className="relative rounded-full h-2 w-2 bg-[var(--color-state-success)]" />
              </span>
              <span className="text-[10px] font-mono text-[var(--color-state-success)] tracking-wide">AI Online</span>
              <div className="ml-auto flex gap-0.5">
                <span className="h-2.5 w-0.5 rounded-full bg-[var(--color-accent-default)] opacity-70" style={{ animationDelay: '0ms' }} />
                <span className="h-3 w-0.5 rounded-full bg-[var(--color-accent-default)]" />
                <span className="h-2 w-0.5 rounded-full bg-[var(--color-accent-default)] opacity-80" style={{ animationDelay: '200ms' }} />
                <span className="h-3.5 w-0.5 rounded-full bg-[var(--color-accent-default)] opacity-60" />
                <span className="h-2 w-0.5 rounded-full bg-[var(--color-accent-default)] opacity-90" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={toggleSidebar}
          className={cn(
            'flex h-9 w-full items-center transition-colors',
            'text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]',
            collapsed ? 'justify-center' : 'justify-end px-3.5',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
        </button>
      </div>
    </motion.aside>
  );
}
