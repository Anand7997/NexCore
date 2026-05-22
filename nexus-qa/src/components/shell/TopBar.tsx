'use client';

import Link from 'next/link';
import { Bell, Brain, ChevronRight, Search, Sun, Moon } from 'lucide-react';
import { useUIStore } from '@/lib/stores/uiStore';
import { useExecutionStore } from '@/lib/stores/executionStore';
import { useShellContext } from '@/lib/shell/useShellContext';
import { Pill } from './primitives/Pill';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

export function TopBar() {
  const { toggleCommandPalette, toggleInspector, inspectorOpen, theme, toggleTheme } = useUIStore();
  const ctx = useShellContext();
  const running = useExecutionStore((s) => s.executions.filter((e) => e.status === 'running').length);

  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString([], { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className="grid h-full items-center px-4"
      style={{
        gridTemplateColumns: '1fr auto 1fr',
        background: 'linear-gradient(180deg, rgba(8,8,20,0.95), rgba(4,4,12,0.95))',
        borderBottom: '1px solid rgba(139,92,246,0.15)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-2 text-[11px]">
        <Link href="/" className="font-mono font-semibold" style={{ color: '#a78bfa', letterSpacing: '0.16em' }}>NEXCORE</Link>
        <ChevronRight size={11} className="text-[#6b6c7a]" />
        <span className="font-mono uppercase tracking-[0.10em]" style={{ color: '#6b6c7a', fontSize: 10 }}>{ctx.group}</span>
        <ChevronRight size={11} className="text-[#6b6c7a]" />
        <span className="font-medium" style={{ color: '#fff' }}>{ctx.label}</span>
        {running > 0 && (
          <Pill label={`${running} LIVE`} status="err" tone="red" className="ml-2" />
        )}
      </div>

      {/* Center: command palette trigger */}
      <button
        onClick={toggleCommandPalette}
        className="group flex h-8 w-[380px] items-center gap-2 rounded-lg border px-3 transition-colors"
        style={{
          background: 'rgba(139,92,246,0.05)',
          borderColor: 'rgba(139,92,246,0.22)',
        }}
        aria-label="Open command palette"
      >
        <Search size={13} style={{ color: '#a78bfa' }} />
        <span className="flex-1 truncate text-left text-[12px]" style={{ color: '#8f90a0' }}>
          Search modules, executions, tests…
        </span>
        <span className="rounded border px-1.5 py-[1px] font-mono text-[9px]"
          style={{ background: 'rgba(139,92,246,0.12)', borderColor: 'rgba(139,92,246,0.30)', color: '#a78bfa' }}
        >⌘K</span>
      </button>

      {/* Right: pills + action buttons */}
      <div className="flex items-center justify-end gap-2">
        <Pill label={now} status="live" tone="violet" />
        <Pill label="3 AGENTS" status="ok" tone="green" />
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="flex h-7 w-7 items-center justify-center rounded-md border text-[#8f90a0] transition-colors hover:text-violet-300"
            style={{ background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.15)' }}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md border text-[#8f90a0] transition-colors hover:text-violet-300"
            style={{ background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.15)' }}
            aria-label="Notifications"
          >
            <Bell size={13} />
          </button>
          <button
            onClick={toggleInspector}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
              inspectorOpen
                ? 'text-violet-300 border-violet-500/40 bg-violet-500/12'
                : 'text-[#8f90a0] hover:text-violet-300',
            )}
            style={!inspectorOpen ? { background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.15)' } : undefined}
            aria-label="Toggle AI Copilot"
          >
            <Brain size={13} />
          </button>
        </div>
      </div>
    </header>
  );
}
