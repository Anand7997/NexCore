'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Bot,
  Boxes,
  Brain,
  Code2,
  Cpu,
  FlaskConical,
  Grid3X3,
  LayoutDashboard,
  Microscope,
  Network,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  X,
  Zap,
} from 'lucide-react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import TerminalDock from './TerminalDock';
import { AIInspector } from './AIInspector';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { useUIStore } from '@/lib/stores/uiStore';
import { notificationSlide } from '@/lib/motion/variants';
import { cn } from '@/lib/utils';
import { useWebSocket } from '@/hooks/useWebSocket';

interface AppShellProps {
  children: React.ReactNode;
}

type CommandCategory = 'Navigation' | 'Execution' | 'Intelligence' | 'System';

interface Command {
  href: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  category: CommandCategory;
}

const COMMANDS: Command[] = [
  { href: '/',                  label: 'Workspace Command Center',  hint: 'Main dashboard and overview',                  icon: LayoutDashboard, category: 'Navigation' },
  { href: '/workspace/new',     label: 'Create Project',            hint: 'Start a new QA project',                       icon: Plus,            category: 'Navigation' },
  { href: '/architecture',      label: 'Architecture Builder',      hint: 'Design system topology and structure',          icon: Boxes,           category: 'Intelligence' },
  { href: '/intent-studio',     label: 'Business Intent Studio',    hint: 'Capture and refine business intents',           icon: Target,          category: 'Intelligence' },
  { href: '/testcases',         label: 'Testcase Intelligence',     hint: 'AI-generated and curated test cases',           icon: FlaskConical,    category: 'Intelligence' },
  { href: '/test-designer',     label: 'Test Step Designer',        hint: 'Author granular test steps and flows',          icon: Code2,           category: 'Execution' },
  { href: '/execution-control', label: 'Execution Control Center',  hint: 'Orchestrate and monitor test runs',             icon: Cpu,             category: 'Execution' },
  { href: '/agents',            label: 'Execution Agents',          hint: 'Manage distributed test runners',               icon: Bot,             category: 'Execution' },
  { href: '/ai-analysis',       label: 'AI Inspect Lab',            hint: 'Deep failed testcase and workflow diagnosis',   icon: Brain,           category: 'Intelligence' },
  { href: '/ai-investigation',  label: 'AI Investigation',          hint: 'Deep AI failure analysis and root cause',       icon: Microscope,      category: 'Intelligence' },
  { href: '/knowledge-graph',   label: 'Knowledge Graph',           hint: 'Explore entity relationships and coverage',     icon: Network,         category: 'Intelligence' },
  { href: '/matrix',            label: 'Platform Matrix',           hint: 'Cross-platform intent parity overview',         icon: Grid3X3,         category: 'Intelligence' },
  { href: '/settings',          label: 'System Settings',           hint: 'Configure environment and integrations',        icon: Settings2,       category: 'System' },
  { href: '/reports',           label: 'Intelligence Reports',      hint: 'Operational analytics and export',              icon: BarChart3,       category: 'System' },
];

const CATEGORY_ORDER: CommandCategory[] = ['Navigation', 'Execution', 'Intelligence', 'System'];

const CATEGORY_COLORS: Record<CommandCategory, string> = {
  Navigation:   'text-[var(--color-fg-subtle)]',
  Execution:    'text-[var(--color-state-running)]',
  Intelligence: 'text-[var(--color-accent-default)]',
  System:       'text-[var(--color-fg-subtle)]',
};

const COPILOT_SUGGESTIONS: Record<string, string[]> = {
  '/':                  ['Review execution health', 'Check failed test runs', 'Open latest report'],
  '/architecture':      ['Analyze component dependencies', 'Detect orphan nodes', 'Suggest test boundaries'],
  '/intent-studio':     ['Refine ambiguous intents', 'Generate acceptance criteria', 'Map to test scenarios'],
  '/testcases':         ['Generate edge cases with AI', 'Identify coverage gaps', 'Cluster similar tests'],
  '/test-designer':     ['Auto-complete step sequence', 'Suggest assertions', 'Convert to data-driven'],
  '/execution-control': ['Parallelize slow test suite', 'Prioritize flaky tests', 'Schedule nightly run'],
  '/ai-analysis':       ['Scan all failed executions', 'Review implementation plans', 'Open root-cause lab'],
  '/ai-investigation':  ['Root cause analysis', 'Compare with last passing run', 'Correlate error patterns'],
  '/knowledge-graph':   ['Expand coverage paths', 'Find untested entities', 'Trace impact chains'],
  '/matrix':            ['Identify parity gaps', 'Platform-specific failures', 'Generate parity report'],
  '/agents':            ['Rebalance agent load', 'Scale for peak load', 'Diagnose idle agents'],
  '/settings':          ['Validate API connections', 'Audit environment config', 'Rotate credentials'],
  '/reports':           ['Generate executive summary', 'Export to PDF', 'Schedule weekly digest'],
};

function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? COMMANDS.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.hint.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase()),
      )
    : COMMANDS;

  const grouped = CATEGORY_ORDER.reduce<Record<string, Command[]>>((acc, cat) => {
    const items = filtered.filter((c) => c.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  // Flat list for keyboard nav
  const flatFiltered = CATEGORY_ORDER.flatMap((cat) => grouped[cat] ?? []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const toggle = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (toggle) {
        event.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (event.key === 'Escape') setCommandPaletteOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const cmd = flatFiltered[selectedIndex];
      if (cmd) {
        setCommandPaletteOpen(false);
        router.push(cmd.href);
      }
    }
  }

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-[rgba(3,17,24,0.72)] px-4 pt-[10vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={() => setCommandPaletteOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
            className="w-full max-w-[780px] overflow-hidden rounded-2xl glass-ultra shadow-[var(--shadow-modal)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3.5 border-b border-[var(--color-line-default)] px-5 py-4">
              <Search size={18} className="shrink-0 text-[var(--color-accent-default)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Navigate to a workspace or run a command..."
                className="flex-1 bg-transparent text-[15px] leading-6 text-[var(--color-fg-default)] outline-none placeholder:text-[var(--color-fg-subtle)]"
              />
              <span className="kbd shrink-0">Esc</span>
            </div>

            {/* Results */}
            <div className="max-h-[520px] overflow-y-auto p-3">
              {flatFiltered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Search size={20} className="text-[var(--color-fg-subtle)]" />
                  <p className="text-sm text-[var(--color-fg-muted)]">No results for &quot;{query}&quot;</p>
                  <p className="text-[11px] text-[var(--color-fg-subtle)]">Try a route name or category</p>
                </div>
              ) : (
                CATEGORY_ORDER.map((cat) => {
                  const items = grouped[cat];
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={cat} className="mb-1">
                      <p className={cn('mb-1.5 mt-3 px-3 text-[11px] font-mono uppercase tracking-[0.18em]', CATEGORY_COLORS[cat])}>
                        {cat}
                      </p>
                      {items.map((command) => {
                        const globalIdx = flatFiltered.indexOf(command);
                        const isSelected = globalIdx === selectedIndex;
                        const Icon = command.icon;
                        return (
                          <Link
                            key={command.href}
                            href={command.href}
                            onClick={() => setCommandPaletteOpen(false)}
                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                            className={cn(
                              'flex items-center gap-4 rounded-xl px-3.5 py-3 text-left transition-all duration-100',
                              isSelected
                                ? 'bg-[rgba(34,211,238,0.12)] border border-[rgba(34,211,238,0.22)]'
                                : 'border border-transparent hover:bg-[var(--color-surface-2)]',
                            )}
                          >
                            <div
                              className={cn(
                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors duration-100',
                                isSelected
                                  ? 'border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.12)] text-[var(--color-accent-default)]'
                                  : 'border-[var(--color-line-default)] bg-[var(--color-bg-base)] text-[var(--color-fg-muted)]',
                              )}
                            >
                              <Icon size={17} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={cn('text-[15px] font-semibold', isSelected ? 'text-[var(--color-fg-default)]' : 'text-[var(--color-fg-default)]')}>
                                {command.label}
                              </p>
                              <p className="truncate text-[13px] leading-5 text-[var(--color-fg-subtle)]">
                                {command.hint}
                              </p>
                            </div>
                            {isSelected && (
                              <span className="shrink-0 text-[10px] font-mono text-[var(--color-fg-subtle)] kbd">↵</span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 border-t border-[var(--color-line-subtle)] px-5 py-3">
              <span className="text-[10px] text-[var(--color-fg-subtle)] font-mono">↑↓ navigate</span>
              <span className="text-[10px] text-[var(--color-fg-subtle)] font-mono">↵ open</span>
              <div className="flex-1" />
              <span className="text-[12px] text-[var(--color-fg-subtle)]">
                {flatFiltered.length} result{flatFiltered.length !== 1 ? 's' : ''}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── AI Copilot Panel ────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'init-1',
    role: 'assistant',
    content: 'Execution analysis opens when you select a specific run. This chat panel is not connected to live AI yet, so I will only give deterministic workspace guidance here.',
    timestamp: new Date().toISOString(),
  },
];

function AICopilotPanel() {
  const pathname = usePathname();
  const { closeInspector } = useUIStore();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = COPILOT_SUGGESTIONS[pathname] ??
    COPILOT_SUGGESTIONS[Object.keys(COPILOT_SUGGESTIONS).find((k) => k !== '/' && pathname.startsWith(k)) ?? '/'] ??
    COPILOT_SUGGESTIONS['/'];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  function simulateStream(content: string) {
    setIsStreaming(true);
    setStreamingContent('');
    let idx = 0;
    const words = content.split('');
    const interval = setInterval(() => {
      if (idx < words.length) {
        setStreamingContent((prev) => prev + words[idx]);
        idx++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content,
            timestamp: new Date().toISOString(),
          },
        ]);
        setStreamingContent('');
      }
    }, 18);
  }

  function getAssistantReply(message: string): string {
    const normalized = message.toLowerCase();
    if (pathname.startsWith('/executions')) {
      if (normalized.includes('error') || normalized.includes('failed') || normalized.includes('failure')) {
        return 'Select a failed execution row, then open Analyze. The inspector will load the persisted failed node, evidence-backed insights, and any suggested selector/config fixes from the backend.';
      }
      return 'On Executions, the useful signal comes from a selected run. Open a specific execution to see node status, artifacts, timeline, and failure evidence.';
    }
    if (normalized.includes('playwright')) {
      return 'For Playwright failures, check the failed node error first. Common causes are the target app not running on the configured URL, missing browser binaries, or a selector that no longer matches the page.';
    }
    return 'I cannot answer from live workspace data in this generic chat panel yet. Open a specific execution to use the evidence-backed analysis view.';
  }

  function handleSend(text?: string) {
    const content = (text ?? inputValue).trim();
    if (!content || isStreaming) return;
    setInputValue('');
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setTimeout(() => {
      simulateStream(getAssistantReply(content));
    }, 400);
  }

  return (
    <div className="flex h-full w-96 flex-col bg-[var(--color-surface-1)] border-l border-[var(--color-line-default)]">
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between border-b border-[var(--color-line-default)] px-4 py-3"
        style={{
          background: 'linear-gradient(135deg, rgba(34,211,238,0.10) 0%, rgba(34,197,94,0.055) 100%)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{
              background: 'linear-gradient(135deg, rgba(34,211,238,0.25) 0%, rgba(34,197,94,0.15) 100%)',
              border: '1px solid rgba(34,211,238,0.30)',
              boxShadow: 'var(--glow-violet-sm)',
            }}
          >
            <Brain size={13} className="text-[var(--color-accent-default)]" />
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-tight text-[var(--color-fg-default)]">
              NEXCORE <span className="text-[var(--color-accent-default)]">AI</span>
            </p>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-state-success)] shadow-[0_0_4px_rgba(16,185,129,0.6)]" />
              <p className="text-[9px] font-mono text-[var(--color-state-success)]">Context-Aware</p>
            </div>
          </div>
        </div>
        <button
          onClick={closeInspector}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]"
        >
          <X size={12} />
        </button>
      </div>

      {/* Context pill */}
      <div className="shrink-0 border-b border-[var(--color-line-subtle)] px-3 py-2">
        <div className="flex items-center gap-1.5 rounded-md bg-[var(--color-surface-2)] px-2 py-1.5">
          <Zap size={9} className="text-[var(--color-accent-default)]" />
          <span className="text-[10px] font-mono text-[var(--color-fg-muted)] truncate">
            {pathname === '/' ? 'workspace' : pathname.replace('/', '')}
          </span>
        </div>
      </div>

      {/* Quick suggestions */}
      <div className="shrink-0 border-b border-[var(--color-line-subtle)] px-3 py-2.5">
        <p className="mb-2 text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
          Suggestions
        </p>
        <div className="flex flex-col gap-1">
          {suggestions.slice(0, 3).map((suggestion, i) => (
            <button
              key={i}
              onClick={() => handleSend(suggestion)}
              disabled={isStreaming}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                'border border-transparent',
                'hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-subtle)]',
                'text-[11px] text-[var(--color-fg-muted)]',
                isStreaming && 'opacity-50 cursor-not-allowed',
              )}
            >
              <Sparkles size={9} className="shrink-0 text-[var(--color-accent-default)]" />
              <span className="truncate">{suggestion}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-[12px] leading-relaxed',
                msg.role === 'assistant'
                  ? 'bg-[var(--color-surface-2)] border border-[var(--color-line-subtle)] text-[var(--color-fg-default)]'
                  : 'bg-[rgba(34,211,238,0.14)] border border-[rgba(34,211,238,0.22)] text-[var(--color-fg-default)]',
              )}
            >
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-1 mb-1">
                  <Brain size={9} className="text-[var(--color-accent-default)]" />
                  <span className="text-[9px] font-mono text-[var(--color-accent-default)]">AI</span>
                </div>
              )}
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {isStreaming && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg border border-[var(--color-line-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-fg-default)]">
              <div className="flex items-center gap-1 mb-1">
                <Brain size={9} className="text-[var(--color-accent-default)] animate-pulse" />
                <span className="text-[9px] font-mono text-[var(--color-accent-default)]">AI</span>
              </div>
              {streamingContent}
              <span className="animate-blink-caret inline-block ml-0.5 h-3 w-0.5 bg-[var(--color-accent-default)]" />
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-[var(--color-line-subtle)] bg-[var(--color-surface-2)] px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <Brain size={10} className="text-[var(--color-accent-default)] animate-pulse" />
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-default)] opacity-60 animate-bounce"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[var(--color-line-default)] p-3">
        <div
          className={cn(
            'flex items-end gap-2 rounded-lg border px-3 py-2 transition-colors',
            'bg-[var(--color-surface-2)] border-[var(--color-line-default)]',
            'focus-within:border-[rgba(34,211,238,0.38)]',
          )}
        >
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask NEXCORE AI..."
            rows={1}
            disabled={isStreaming}
            className={cn(
              'flex-1 resize-none bg-transparent text-[12px] text-[var(--color-fg-default)]',
              'outline-none placeholder:text-[var(--color-fg-subtle)]',
              'min-h-[20px] max-h-[80px]',
              isStreaming && 'opacity-50',
            )}
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isStreaming}
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all',
              inputValue.trim() && !isStreaming
                ? 'bg-[var(--color-accent-default)] text-white hover:brightness-110'
                : 'bg-[var(--color-surface-3)] text-[var(--color-fg-subtle)] cursor-not-allowed',
            )}
          >
            <Sparkles size={11} />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[9px] text-[var(--color-fg-subtle)] font-mono">
          ↵ send · shift+↵ newline
        </p>
      </div>
    </div>
  );
}

// ── Main AppShell ───────────────────────────────────────────────────────────

export default function AppShell({ children }: AppShellProps) {
  const { inspectorOpen, inspectorExecutionId, notifications, dismissNotification, theme, setTheme } = useUIStore();

  useWebSocket();

  // Sync theme → <html data-theme="..."> + localStorage
  useEffect(() => {
    const saved = localStorage.getItem('nexcore-theme') as 'dark' | 'light' | null;
    if (saved && saved !== theme) setTheme(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nexcore-theme', theme);
  }, [theme]);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="nex-shell relative flex h-screen w-screen overflow-hidden bg-[var(--color-bg-base)] noise-overlay">
        {/* Subtle dot grid */}
        <div className="pointer-events-none absolute inset-0 z-0 bg-grid opacity-100" />

        {/* Topology ambient decorations */}
        <div
          className="pointer-events-none absolute left-[20%] top-[30%] h-px w-[200px] opacity-20 animate-beam-line"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.50), transparent)',
            animationDuration: '6s',
          }}
        />
        <div
          className="pointer-events-none absolute right-[25%] bottom-[40%] h-px w-[150px] opacity-15 animate-beam-line"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.34), transparent)',
            animationDuration: '8s',
            animationDelay: '3s',
          }}
        />
        <div
          className="pointer-events-none absolute left-[60%] top-[60%] h-px w-[100px] opacity-10 animate-beam-line"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(103,232,249,0.35), transparent)',
            animationDuration: '10s',
            animationDelay: '5s',
          }}
        />

        {/* Radial ambient glow — AI Inspect cyan core */}
        <div
          className="pointer-events-none absolute left-1/4 top-0 h-[400px] w-[600px] rounded-full opacity-[0.035] animate-glow-breathe"
          style={{
            background: 'radial-gradient(ellipse, rgba(34,211,238,0.85) 0%, transparent 70%)',
            transform: 'translate(-50%, -30%)',
            filter: 'blur(40px)',
          }}
        />

        {/* Top accent line */}
        <div
          className="pointer-events-none fixed left-0 right-0 top-0 z-50 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.45) 35%, rgba(34,197,94,0.30) 65%, transparent 100%)',
          }}
        />

        {/* Layout */}
        <Sidebar />

        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <TopBar />

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <main className="nex-main min-h-0 flex-1 overflow-y-auto scroll-smooth">
              {children}
            </main>

            {/* AI Copilot Panel */}
            <AnimatePresence>
              {inspectorOpen && (
                <motion.div
                  key="copilot-panel"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 384, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="nex-inspector shrink-0 overflow-hidden"
                  style={{ minWidth: 0 }}
                >
                  {inspectorExecutionId ? <AIInspector /> : <AICopilotPanel />}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <TerminalDock />
        </div>

        <CommandPalette />

        {/* Notification stack */}
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {notifications.map((n) => (
              <motion.div
                key={n.id}
                variants={notificationSlide}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={cn(
                  'pointer-events-auto flex min-w-[280px] max-w-[340px] items-start gap-3 rounded-xl px-3.5 py-3',
                  'shadow-[var(--shadow-pop)]',
                  n.severity === 'error'   && 'glass-md border border-red-500/20',
                  n.severity === 'success' && 'glass-md border border-emerald-500/20',
                  n.severity === 'warn'    && 'glass-md border border-amber-500/20',
                  n.severity === 'info'    && 'glass-md border border-cyan-500/20',
                )}
              >
                {/* Severity icon dot */}
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
                    n.severity === 'error'   && 'bg-red-500/15 text-red-400',
                    n.severity === 'success' && 'bg-emerald-500/15 text-emerald-400',
                    n.severity === 'warn'    && 'bg-amber-500/15 text-amber-400',
                    n.severity === 'info'    && 'bg-cyan-500/15 text-cyan-300',
                  )}
                >
                  {n.severity === 'error' ? '!' : n.severity === 'success' ? '✓' : n.severity === 'warn' ? '!' : 'i'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-[var(--color-fg-default)]">{n.title}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--color-fg-muted)] leading-relaxed">{n.message}</p>
                </div>
                <button
                  onClick={() => dismissNotification(n.id)}
                  className="shrink-0 mt-0.5 text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg-default)]"
                >
                  <X size={12} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </TooltipProvider>
  );
}
