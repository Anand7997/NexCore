'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Play, GitBranch, Sparkles, Bot,
  Code2, BookOpen, Boxes, Target, FlaskConical, Grid3X3,
  Network, Brain, Microscope, BarChart3, Settings2, Cpu,
} from 'lucide-react';
import { useExecutionStore } from '@/lib/stores/executionStore';
import { cn } from '@/lib/utils';
import { StatusDot } from './primitives/StatusDot';
import type { StatusKind } from './tokens';

type NavItem = { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };
type NavSection = { id: 'OPS' | 'DESIGN' | 'SYS'; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    id: 'OPS',
    items: [
      { href: '/',                  label: 'Command Center', icon: LayoutDashboard },
      { href: '/executions',        label: 'Executions',     icon: Play },
      { href: '/execution-control', label: 'Exec Control',   icon: Cpu },
      { href: '/workflows',         label: 'Workflows',      icon: GitBranch },
      { href: '/ai-workflow',       label: 'AI Workflow',    icon: Sparkles },
      { href: '/agents',            label: 'Agents',         icon: Bot },
    ],
  },
  {
    id: 'DESIGN',
    items: [
      { href: '/test-designer',      label: 'Test Designer', icon: Code2 },
      { href: '/test-configuration', label: 'Test Config',   icon: FlaskConical },
      { href: '/testcases',          label: 'Test Cases',    icon: BookOpen },
      { href: '/page-repository',    label: 'Pages',         icon: Boxes },
      { href: '/intent-studio',      label: 'Intent Studio', icon: Target },
      { href: '/architecture',       label: 'Architecture',  icon: Boxes },
    ],
  },
  {
    id: 'SYS',
    items: [
      { href: '/ai-analysis',      label: 'AI Analysis',       icon: Brain },
      { href: '/ai-investigation', label: 'AI Investigation',  icon: Microscope },
      { href: '/knowledge-graph',  label: 'Knowledge Graph',   icon: Network },
      { href: '/matrix',           label: 'Matrix',            icon: Grid3X3 },
      { href: '/reports',          label: 'Reports',           icon: BarChart3 },
      { href: '/settings',         label: 'Settings',          icon: Settings2 },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const running = useExecutionStore((s) => s.executions.filter((e) => e.status === 'running').length);

  useEffect(() => {
    SECTIONS.flatMap((s) => s.items).forEach((item) => router.prefetch(item.href));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const liveByHref = useMemo<Record<string, { status: StatusKind; count?: number }>>(() => ({
    '/executions':  { status: running > 0 ? 'live' : 'idle', count: running > 0 ? running : undefined },
    '/agents':      { status: 'ok',   count: 3 },
    '/ai-workflow': { status: 'live' },
  }), [running]);

  return (
    <aside
      className="flex h-full flex-col items-center border-r"
      style={{
        background: 'linear-gradient(180deg, #060611 0%, #02020a 100%)',
        borderColor: 'rgba(139,92,246,0.15)',
        padding: '10px 0',
      }}
    >
      {/* Logo */}
      <Link href="/" className="relative flex h-11 w-11 items-center justify-center rounded-xl"
        style={{
          background: 'conic-gradient(from 90deg at 50% 50%, rgba(139,92,246,0.6), rgba(6,182,212,0.5), rgba(139,92,246,0.6))',
          boxShadow: '0 0 24px rgba(139,92,246,0.40), inset 0 0 0 1px rgba(255,255,255,0.10)',
        }}
        aria-label="Go to Command Center"
      >
        <span className="mc-orb-ring absolute -inset-[3px] rounded-[14px]" aria-hidden />
        <span className="z-10 flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: '#02020a', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 15, color: '#fff' }}
        >N</span>
      </Link>

      {/* Pass-rate mini-readout */}
      <div className="mt-2.5 w-[52px] rounded-md border px-1 py-[5px] text-center"
        style={{ borderColor: 'rgba(139,92,246,0.20)', background: 'rgba(139,92,246,0.04)' }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#a78bfa', fontWeight: 600 }}>94<span style={{ fontSize: 8 }}>%</span></div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: '#6b6c7a', letterSpacing: '0.18em', marginTop: 1 }}>PASS</div>
      </div>

      {/* Sections */}
      <div className="mt-3 flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1 pb-2">
        {SECTIONS.map((section) => (
          <div key={section.id} className="flex w-full flex-col items-center">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'rgba(167,139,250,0.55)', letterSpacing: '0.18em', marginTop: 10, marginBottom: 6 }}>
              ▸ {section.id}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              const live = liveByHref[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={cn(
                    'group relative flex h-11 w-12 items-center justify-center rounded-[9px] border transition-all duration-200',
                    isActive
                      ? 'text-white border-[rgba(139,92,246,0.55)] bg-gradient-to-br from-violet-500/30 to-violet-500/10 shadow-[0_0_18px_rgba(139,92,246,0.30)]'
                      : 'text-[#6b6c7a] border-transparent hover:text-violet-300 hover:bg-violet-500/[0.06] hover:border-violet-500/20',
                  )}
                >
                  {isActive && (
                    <span aria-hidden
                      className="absolute -left-[10px] top-2 bottom-2 w-[3px] rounded-[2px]"
                      style={{
                        background: 'linear-gradient(180deg, #06b6d4, #8b5cf6)',
                        boxShadow: '2px 0 14px rgba(139,92,246,0.65), 0 0 6px rgba(6,182,212,0.40)',
                      }}
                    />
                  )}
                  <Icon size={17} />
                  {live && (
                    <span className="absolute right-[5px] top-[5px]">
                      <StatusDot status={live.status} />
                    </span>
                  )}
                  {live?.count != null && (
                    <span className="absolute left-[3px] top-[3px] rounded-full border px-1 py-[1px]"
                      style={{
                        background: 'rgba(6,182,212,0.20)', color: '#06b6d4',
                        borderColor: 'rgba(6,182,212,0.50)',
                        fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                      }}
                    >
                      {live.count}
                    </span>
                  )}

                  {/* Tooltip on hover */}
                  <span
                    className={cn(
                      'pointer-events-none absolute left-full z-[100] ml-2 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[11px] font-medium',
                      'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
                    )}
                    style={{
                      background: 'rgba(13,13,24,0.95)',
                      borderColor: 'rgba(139,92,246,0.30)',
                      color: '#e7e7ee',
                      boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
                    }}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
