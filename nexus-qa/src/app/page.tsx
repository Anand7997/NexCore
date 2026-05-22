'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Activity, Brain, Bot, Cpu, FlaskConical, Globe, Grid3X3,
  GitBranch, LayoutDashboard, Microscope, Network, Play, Plus,
  Settings2, Sparkles, Target, Boxes, BookOpen, BarChart3,
  ArrowUpRight, Code2,
} from 'lucide-react';
import { useExecutionStore } from '@/lib/stores/executionStore';

interface RouteTile {
  href: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const LIBRARY: RouteTile[] = [
  { href: '/executions',         name: 'Executions',         icon: Play },
  { href: '/execution-control',  name: 'Exec Control',       icon: Cpu },
  { href: '/workflows',          name: 'Workflows',          icon: GitBranch },
  { href: '/ai-workflow',        name: 'AI Workflow',        icon: Sparkles },
  { href: '/agents',             name: 'Agents',             icon: Bot },
  { href: '/ai-analysis',        name: 'AI Analysis',        icon: Brain },
  { href: '/ai-investigation',   name: 'AI Investigation',   icon: Microscope },
  { href: '/matrix',             name: 'Matrix',             icon: Grid3X3 },
  { href: '/knowledge-graph',    name: 'Knowledge Graph',    icon: Network },
  { href: '/test-designer',      name: 'Test Designer',      icon: Code2 },
  { href: '/test-configuration', name: 'Test Config',        icon: FlaskConical },
  { href: '/testcases',          name: 'Test Cases',         icon: BookOpen },
  { href: '/page-repository',    name: 'Page Repository',    icon: Boxes },
  { href: '/intent-studio',      name: 'Intent Studio',      icon: Target },
  { href: '/reports',            name: 'Reports',            icon: BarChart3 },
  { href: '/architecture',       name: 'Architecture',       icon: Globe },
  { href: '/settings',           name: 'Settings',           icon: Settings2 },
  { href: '/workspace',          name: 'Workspace',          icon: LayoutDashboard },
  { href: '/demo',               name: 'Demo',               icon: Activity },
];

export default function CommandCenterPage() {
  const executions = useExecutionStore((s) => s.executions);
  const running = executions.filter((e) => e.status === 'running').length;

  return (
    <main className="mx-auto flex h-full max-w-[1600px] flex-col gap-6 px-6 py-6">
      {/* HUD header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-white">Execution Command Center</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.20em]" style={{ color: '#a78bfa' }}>
            ▸ NEXCORE.OPS · V2.0 · MISSION CONTROL
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/workspace/new"
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium text-white transition-transform hover:scale-[1.02] active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
              boxShadow: '0 0 0 1px rgba(139,92,246,0.40), 0 0 20px rgba(139,92,246,0.25)',
            }}
          >
            <Plus size={14} /> New Workspace
          </Link>
        </div>
      </motion.header>

      {/* PRIMARY OPERATIONS */}
      <section>
        <SectionLabel label="Primary Operations" right="03 · live" />
        <div className="grid grid-cols-12 gap-3">
          <HeroTile
            colSpan={5}
            href="/executions"
            icon={Play}
            title="Executions"
            sub={`${running} live · 847 today · 91% pass`}
            badge={`● ${Math.max(running, 1)} LIVE`}
            metric="94.2"
            metricSuffix="%"
            metricTrend="↗"
          />
          <HeroTile
            colSpan={4}
            href="/ai-workflow"
            icon={Sparkles}
            title="AI Workflow"
            sub="Discovery → Plan → Heal"
            badge="● 3 AGENTS"
            metric="23"
            metricSuffix="healed"
            metricTrend="↗"
          />
          <HeroTile
            colSpan={3}
            href="/test-designer"
            icon={Code2}
            title="Test Designer"
            sub="142 cases · 4 flaky"
            badge="18 MODIFIED"
            badgeTone="amber"
            metric="142"
            metricSuffix="cases"
            metricTrend="↗"
          />
        </div>
      </section>

      {/* ALL MODULES */}
      <section className="flex-1 pb-6">
        <SectionLabel label="All Modules" right={`${LIBRARY.length} · routes`} />
        <div className="grid grid-cols-4 gap-3">
          {LIBRARY.map((tile, i) => (
            <LibraryTile key={tile.href} tile={tile} index={i} />
          ))}
        </div>
      </section>
    </main>
  );
}

function SectionLabel({ label, right }: { label: string; right?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: '#a78bfa' }}>
      <span>▸ {label}</span>
      <span className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.30), transparent)' }} />
      {right && <span style={{ color: '#6b6c7a' }}>{right}</span>}
    </div>
  );
}

interface HeroTileProps {
  href: string; icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string; sub: string; badge: string; badgeTone?: 'cyan' | 'amber';
  metric: string; metricSuffix: string; metricTrend: string; colSpan: number;
}
function HeroTile(p: HeroTileProps) {
  const Icon = p.icon;
  const badgeColor = p.badgeTone === 'amber'
    ? { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', fg: '#fcd34d' }
    : { bg: 'rgba(6,182,212,0.10)',  border: 'rgba(6,182,212,0.30)',  fg: '#06b6d4' };
  const span = p.colSpan === 5 ? 'col-span-5' : p.colSpan === 4 ? 'col-span-4' : 'col-span-3';
  return (
    <Link
      href={p.href}
      className={`${span} group relative overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-0.5`}
      style={{
        minHeight: 150,
        padding: 18,
        borderColor: 'rgba(139,92,246,0.32)',
        background:
          'radial-gradient(ellipse 80% 50% at 80% 20%, rgba(139,92,246,0.18), transparent 70%), rgba(139,92,246,0.05)',
        boxShadow: '0 0 0 1px rgba(139,92,246,0.06), 0 0 30px rgba(139,92,246,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.6), transparent)' }}
      />
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px]"
          style={{
            background: 'rgba(139,92,246,0.20)',
            border: '1px solid rgba(139,92,246,0.50)',
            boxShadow: '0 0 20px rgba(139,92,246,0.30), inset 0 1px 0 rgba(255,255,255,0.10)',
          }}
        ><Icon size={18} className="text-violet-200" /></div>
        <span className="rounded-full border px-2 py-[3px] font-mono text-[9px] tracking-[0.10em]"
          style={{ background: badgeColor.bg, borderColor: badgeColor.border, color: badgeColor.fg }}
        >{p.badge}</span>
      </div>
      <div className="mt-4">
        <div className="text-[16px] font-semibold tracking-tight text-white">{p.title}</div>
        <div className="mt-1 font-mono text-[11px]" style={{ color: '#8f90a0', letterSpacing: '0.04em' }}>{p.sub}</div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <span className="text-[28px] font-semibold leading-none text-white"
            style={{ textShadow: '0 0 18px rgba(139,92,246,0.5)', letterSpacing: '-0.02em' }}
          >{p.metric}</span>
          <span className="ml-1 text-[12px] font-medium" style={{ color: '#a78bfa' }}>{p.metricSuffix}</span>
        </div>
        <span className="text-[16px] opacity-70 group-hover:opacity-100" style={{ color: '#a78bfa' }}>{p.metricTrend}</span>
      </div>
    </Link>
  );
}

function LibraryTile({ tile, index }: { tile: RouteTile; index: number }) {
  const Icon = tile.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.04 * index, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <Link
        href={tile.href}
        className="group relative flex items-center gap-3.5 overflow-hidden rounded-xl border px-4 py-3.5 transition-all duration-200 hover:translate-x-[2px]"
        style={{
          minHeight: 76,
          background: 'rgba(139,92,246,0.03)',
          borderColor: 'rgba(139,92,246,0.14)',
        }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all"
          style={{
            background: 'rgba(139,92,246,0.18)',
            border: '1px solid rgba(139,92,246,0.32)',
          }}
        >
          <Icon size={16} className="text-violet-200" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium" style={{ color: '#e7e7ee' }}>{tile.name}</div>
          <div className="mt-0.5 truncate font-mono text-[10px]" style={{ color: '#6b6c7a', letterSpacing: '0.05em' }}>{tile.href}</div>
        </div>
        <ArrowUpRight size={14} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: '#a78bfa' }}
        />
        <span aria-hidden className="pointer-events-none absolute bottom-0 left-4 right-4 h-px opacity-0 transition-opacity group-hover:opacity-100"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.30), transparent)' }}
        />
      </Link>
    </motion.div>
  );
}
