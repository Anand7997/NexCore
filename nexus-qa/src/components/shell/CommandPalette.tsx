'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3, Bot, Boxes, Code2, Cpu, FlaskConical, Grid3X3,
  LayoutDashboard, Microscope, Network, Plus, Search, Settings2, Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/stores/uiStore';

type CommandCategory = 'Navigation' | 'Execution' | 'Intelligence' | 'System';

interface Command {
  href: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  category: CommandCategory;
}

const COMMANDS: Command[] = [
  { href: '/',                  label: 'Command Center',           hint: 'Mission-control dashboard',                  icon: LayoutDashboard, category: 'Navigation' },
  { href: '/workspace/new',     label: 'Create Project',           hint: 'Start a new QA project',                     icon: Plus,            category: 'Navigation' },
  { href: '/architecture',      label: 'Architecture Builder',     hint: 'Design system topology',                     icon: Boxes,           category: 'Intelligence' },
  { href: '/intent-studio',     label: 'Business Intent Studio',   hint: 'Capture and refine intents',                 icon: Target,          category: 'Intelligence' },
  { href: '/testcases',         label: 'Testcase Intelligence',    hint: 'AI-generated test cases',                    icon: FlaskConical,    category: 'Intelligence' },
  { href: '/test-designer',     label: 'Test Step Designer',       hint: 'Author granular test steps',                 icon: Code2,           category: 'Execution' },
  { href: '/execution-control', label: 'Execution Control',        hint: 'Orchestrate test runs',                      icon: Cpu,             category: 'Execution' },
  { href: '/agents',            label: 'Execution Agents',         hint: 'Manage distributed runners',                 icon: Bot,             category: 'Execution' },
  { href: '/ai-investigation',  label: 'AI Investigation',         hint: 'AI failure analysis',                        icon: Microscope,      category: 'Intelligence' },
  { href: '/knowledge-graph',   label: 'Knowledge Graph',          hint: 'Entity relationships',                       icon: Network,         category: 'Intelligence' },
  { href: '/matrix',            label: 'Platform Matrix',          hint: 'Cross-platform parity',                      icon: Grid3X3,         category: 'Intelligence' },
  { href: '/settings',          label: 'System Settings',          hint: 'Configure environment',                      icon: Settings2,       category: 'System' },
  { href: '/reports',           label: 'Intelligence Reports',     hint: 'Operational analytics',                      icon: BarChart3,       category: 'System' },
];

const CATEGORY_ORDER: CommandCategory[] = ['Navigation', 'Execution', 'Intelligence', 'System'];

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? COMMANDS.filter((c) => `${c.label} ${c.hint} ${c.category}`.toLowerCase().includes(query.toLowerCase()))
    : COMMANDS;

  const grouped = CATEGORY_ORDER.reduce<Record<string, Command[]>>((acc, cat) => {
    const items = filtered.filter((c) => c.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});
  const flat = CATEGORY_ORDER.flatMap((c) => grouped[c] ?? []);

  useEffect(() => { setSel(0); }, [query]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isToggle = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      if (isToggle) { e.preventDefault(); setCommandPaletteOpen(!commandPaletteOpen); }
      if (e.key === 'Escape') setCommandPaletteOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      const cmd = flat[sel];
      if (cmd) { setCommandPaletteOpen(false); router.push(cmd.href); }
    }
  }

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 px-4 pt-[10vh] backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          onMouseDown={() => setCommandPaletteOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
            className="w-full max-w-[640px] overflow-hidden rounded-xl glass-ultra"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[var(--color-line-default)] px-4 py-3.5">
              <Search size={15} className="text-violet-300" />
              <input
                ref={inputRef} value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Navigate to a workspace or run a command..."
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#6b6c7a]"
                style={{ color: '#e7e7ee' }}
              />
              <span className="kbd">Esc</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {flat.length === 0 ? (
                <div className="py-10 text-center text-[12px]" style={{ color: '#6b6c7a' }}>No results for &quot;{query}&quot;</div>
              ) : CATEGORY_ORDER.map((cat) => {
                const items = grouped[cat];
                if (!items?.length) return null;
                return (
                  <div key={cat} className="mb-1">
                    <p className="mb-1 mt-2 px-3 font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: '#a78bfa' }}>{cat}</p>
                    {items.map((cmd) => {
                      const idx = flat.indexOf(cmd);
                      const active = idx === sel;
                      const Icon = cmd.icon;
                      return (
                        <Link
                          key={cmd.href} href={cmd.href}
                          onClick={() => setCommandPaletteOpen(false)}
                          onMouseEnter={() => setSel(idx)}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                            active ? 'border border-violet-500/20 bg-violet-500/12' : 'border border-transparent hover:bg-[var(--color-surface-2)]',
                          )}
                        >
                          <div className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-lg border',
                            active ? 'border-violet-500/35 bg-violet-500/12 text-violet-400' : 'border-[var(--color-line-default)] bg-[var(--color-bg-base)] text-[var(--color-fg-muted)]',
                          )}><Icon size={14} /></div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium" style={{ color: '#e7e7ee' }}>{cmd.label}</p>
                            <p className="truncate text-[11px]" style={{ color: '#6b6c7a' }}>{cmd.hint}</p>
                          </div>
                          {active && <span className="kbd">↵</span>}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 border-t border-[var(--color-line-subtle)] px-4 py-2 font-mono text-[10px]" style={{ color: '#6b6c7a' }}>
              <span>↑↓ navigate</span><span>↵ open</span><div className="flex-1" /><span>{flat.length} result{flat.length !== 1 ? 's' : ''}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
