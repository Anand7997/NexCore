'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Camera,
  Navigation,
  MousePointer,
  Type,
  Clock,
  Sparkles,
  GitBranch,
  TrendingUp,
  Shield,
  Wrench,
  ChevronRight,
  Activity,
  Eye,
  Terminal,
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ai-workflow/Button';

// ── Types ─────────────────────────────────────────────────────────────────────

type EventType = 'NAV' | 'ASSERT' | 'CLICK' | 'FILL' | 'ERROR' | 'TIMEOUT' | 'SCREENSHOT' | 'AI';

interface StreamEvent {
  time: string;
  type: EventType;
  msg: string;
  status: 'ok' | 'error' | 'warn' | 'ai';
}

interface TerminalLine {
  text: string;
  kind: 'prompt' | 'output' | 'found' | 'patch' | 'ready';
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const STREAM_EVENTS: StreamEvent[] = [
  { time: '14:23:04', type: 'NAV',        msg: 'web.navigate → https://app.airline.com/payment',           status: 'ok'    },
  { time: '14:23:05', type: 'ASSERT',     msg: 'assert_text .payment-title contains "Secure Payment"',      status: 'ok'    },
  { time: '14:23:06', type: 'CLICK',      msg: 'web.click #card-number-field',                               status: 'ok'    },
  { time: '14:23:07', type: 'FILL',       msg: 'web.fill #card-number "4111111111111111"',                   status: 'ok'    },
  { time: '14:23:08', type: 'CLICK',      msg: 'web.click #submit-btn',                                      status: 'error' },
  { time: '14:23:08', type: 'ERROR',      msg: 'ElementNotFoundError: #submit-btn not found in DOM',         status: 'error' },
  { time: '14:23:08', type: 'TIMEOUT',    msg: 'Timeout 5000ms exceeded waiting for #submit-btn',            status: 'error' },
  { time: '14:23:09', type: 'SCREENSHOT', msg: 'Screenshot captured: failure-payment-submit.png',            status: 'warn'  },
  { time: '14:23:09', type: 'AI',         msg: 'AI engine analyzing failure pattern...',                     status: 'ai'    },
  { time: '14:23:10', type: 'AI',         msg: 'Pattern detected: locator change (87% confidence)',          status: 'ai'    },
];

const EXTRA_EVENTS: StreamEvent[] = [
  { time: '14:23:11', type: 'AI',    msg: 'DOM snapshot diff: 3 structural changes found',                  status: 'ai'    },
  { time: '14:23:11', type: 'AI',    msg: 'Matching element found: [data-testid="payment-submit"]',          status: 'ai'    },
  { time: '14:23:12', type: 'AI',    msg: 'Confidence elevated to 94% after DOM comparison',                 status: 'ai'    },
  { time: '14:23:12', type: 'ASSERT',msg: 'Auto-heal candidate identified for TC-003',                       status: 'warn'  },
  { time: '14:23:13', type: 'AI',    msg: 'Patch ready — awaiting approval or auto-apply',                   status: 'ai'    },
];

const ANALYSIS_TEXT = `The #submit-btn selector used in TC-003 step "Payment Submit" was not found in the current DOM. Analysis of the DOM snapshot captured at failure time reveals the button element has been relocated from form#payment to div.checkout-actions, and its ID attribute has been replaced with a data-testid attribute in the recent frontend deployment (v2.14.0). The new stable locator [data-testid="payment-submit"] resolves to the correct element with 94% confidence based on text content, role, and position matching.`;

const TREND_DATA = [
  { day: 'D-29', v: 0 }, { day: 'D-28', v: 1 }, { day: 'D-27', v: 0 }, { day: 'D-26', v: 2 },
  { day: 'D-25', v: 0 }, { day: 'D-24', v: 0 }, { day: 'D-23', v: 1 }, { day: 'D-22', v: 0 },
  { day: 'D-21', v: 3 }, { day: 'D-20', v: 0 }, { day: 'D-19', v: 0 }, { day: 'D-18', v: 1 },
  { day: 'D-17', v: 2 }, { day: 'D-16', v: 0 }, { day: 'D-15', v: 0 }, { day: 'D-14', v: 1 },
  { day: 'D-13', v: 0 }, { day: 'D-12', v: 2 }, { day: 'D-11', v: 0 }, { day: 'D-10', v: 0 },
  { day: 'D-9',  v: 1 }, { day: 'D-8',  v: 0 }, { day: 'D-7',  v: 3 }, { day: 'D-6',  v: 0 },
  { day: 'D-5',  v: 1 }, { day: 'D-4',  v: 0 }, { day: 'D-3',  v: 2 }, { day: 'D-2',  v: 0 },
  { day: 'D-1',  v: 1 }, { day: 'Today',v: 1 },
];

const SIMILAR_FAILURES = [
  { id: 'TC-008', name: 'Mobile Checkout Submit', age: '3 days ago',  confidence: 91 },
  { id: 'TC-015', name: 'Desktop Payment Flow',    age: '8 days ago',  confidence: 88 },
  { id: 'TC-021', name: 'Guest Checkout Button',   age: '21 days ago', confidence: 79 },
];

const TERMINAL_LINES: TerminalLine[] = [
  { text: 'nexcore-ai > Analyzing DOM snapshot from failure timestamp...', kind: 'prompt' },
  { text: 'nexcore-ai > Comparing current DOM with previous passing run...', kind: 'prompt' },
  { text: '[FOUND] Button moved from form#payment to div.checkout-actions', kind: 'found' },
  { text: '[FOUND] ID changed from #submit-btn to data-testid="payment-submit"', kind: 'found' },
  { text: 'nexcore-ai > Generating patch...', kind: 'prompt' },
  { text: "nexcore-ai > PATCH: locator '#submit-btn' → '[data-testid=\"payment-submit\"]'", kind: 'patch' },
  { text: 'nexcore-ai > Confidence: 94% | Risk: LOW | Auto-apply: READY', kind: 'ready' },
  { text: "nexcore-ai > Run 'nexcore heal tc-003 --auto' to apply fix", kind: 'prompt' },
];

// ── Event type config ─────────────────────────────────────────────────────────

const EVENT_CFG: Record<EventType, { color: string; bg: string; border: string; icon: typeof Brain }> = {
  NAV:        { color: 'text-blue-400',   bg: 'bg-blue-500/15',   border: 'border-blue-500/30',   icon: Navigation  },
  ASSERT:     { color: 'text-emerald-400',bg: 'bg-emerald-500/12',border: 'border-emerald-500/25',icon: CheckCircle2},
  CLICK:      { color: 'text-cyan-400',   bg: 'bg-cyan-500/12',   border: 'border-cyan-500/25',   icon: MousePointer},
  FILL:       { color: 'text-violet-400', bg: 'bg-violet-500/12', border: 'border-violet-500/25', icon: Type        },
  ERROR:      { color: 'text-red-400',    bg: 'bg-red-500/15',    border: 'border-red-500/30',    icon: XCircle     },
  TIMEOUT:    { color: 'text-red-400',    bg: 'bg-red-500/15',    border: 'border-red-500/30',    icon: Clock       },
  SCREENSHOT: { color: 'text-amber-400',  bg: 'bg-amber-500/12',  border: 'border-amber-500/25',  icon: Camera      },
  AI:         { color: 'text-purple-400', bg: 'bg-purple-500/12', border: 'border-purple-500/25', icon: Brain       },
};

// ── Typewriter hook ────────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 18): string {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return displayed;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AIInvestigationPage() {
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>(STREAM_EVENTS.slice(0, 4));
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [confidenceVisible, setConfidenceVisible] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const streamIdx = useRef(4);
  const termIdx = useRef(0);
  const analysisText = useTypewriter(ANALYSIS_TEXT, 14);

  // Append stream events
  useEffect(() => {
    const interval = setInterval(() => {
      const allEvents = [...STREAM_EVENTS, ...EXTRA_EVENTS];
      if (streamIdx.current < allEvents.length) {
        setStreamEvents((prev) => [...prev, allEvents[streamIdx.current]]);
        streamIdx.current++;
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll stream
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [streamEvents]);

  // Show confidence bar after a delay
  useEffect(() => {
    const t = setTimeout(() => setConfidenceVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  // Append terminal lines
  useEffect(() => {
    const interval = setInterval(() => {
      if (termIdx.current < TERMINAL_LINES.length) {
        setTerminalLines((prev) => [...prev, TERMINAL_LINES[termIdx.current]]);
        termIdx.current++;
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [terminalLines]);

  return (
    <div className="ai-workflow-scope flex min-h-screen flex-col overflow-hidden bg-[var(--color-bg-base)]">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-4 px-6 py-3 border-b border-white/6 bg-[var(--color-surface-1)]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30">
            <Brain size={14} className="text-purple-400" />
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500">Mode 4</p>
            <h1 className="text-base font-bold text-slate-100 tracking-tight">AI Investigation Engine</h1>
          </div>
        </div>
        <ChevronRight size={12} className="text-slate-600" />
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25">
          <XCircle size={11} className="text-red-400" />
          <span className="text-[10px] font-mono text-red-300">TC-003: Payment 3DS — Failed</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/25">
            <Sparkles size={9} className="text-purple-400" />
            <span className="text-[9px] font-mono text-purple-400">AI ACTIVE</span>
          </div>
        </div>
      </div>

      {/* ── 3-column body ─────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ─ LEFT: Raw execution stream ─────────────────────────────── */}
        <div className="w-[30%] shrink-0 flex flex-col border-r border-white/6 bg-[var(--color-surface-1)]">
          <div className="shrink-0 px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={10} className="text-blue-400" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Raw Execution Stream</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-[8px] font-mono text-red-400">LIVE</span>
            </div>
          </div>
          <div ref={streamRef} className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 font-mono text-[9px]">
            <AnimatePresence>
              {streamEvents.map((ev, i) => {
                const cfg = EVENT_CFG[ev.type];
                const Icon = cfg.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25 }}
                    className={cn(
                      'flex items-start gap-2 px-2 py-1.5 rounded-md border',
                      ev.status === 'error'  ? 'bg-red-500/8 border-red-500/20' :
                      ev.status === 'warn'   ? 'bg-amber-500/6 border-amber-500/15' :
                      ev.status === 'ai'     ? 'bg-purple-500/8 border-purple-500/20' :
                      'bg-white/2 border-transparent',
                    )}
                  >
                    <div className={cn('shrink-0 mt-0.5 flex items-center gap-1 px-1 py-0.5 rounded border', cfg.bg, cfg.border)}>
                      <Icon size={7} className={cfg.color} />
                      <span className={cn('text-[7px] font-bold', cfg.color)}>{ev.type}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        'leading-relaxed',
                        ev.status === 'error'  ? 'text-red-300' :
                        ev.status === 'warn'   ? 'text-amber-300' :
                        ev.status === 'ai'     ? 'text-purple-300' :
                        'text-slate-400',
                      )}>{ev.msg}</span>
                    </div>
                    <span className="shrink-0 text-slate-600">{ev.time}</span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {/* blinking cursor */}
            <div className="flex items-center px-2 py-1">
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="text-slate-500"
              >▋</motion.span>
            </div>
          </div>
        </div>

        {/* ─ CENTER: AI Failure Analysis ────────────────────────────── */}
        <div className="flex-1 flex flex-col border-r border-white/6 overflow-y-auto">
          <div className="shrink-0 px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
            <Brain size={10} className="text-purple-400" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">AI Failure Analysis</span>
          </div>

          <div className="flex-1 p-4 space-y-4">
            {/* Failure Pattern header */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-purple-500/25 bg-purple-500/8 p-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
                  <Brain size={16} className="text-purple-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100">Failure Pattern Detected</h2>
                  <p className="text-[10px] font-mono text-slate-500 mt-0.5">AI analysis complete · TC-003 step 8</p>
                </div>
                <div className="ml-auto px-2 py-1 rounded-lg bg-red-500/15 border border-red-500/25">
                  <span className="text-[9px] font-mono font-bold text-red-400">LOCATOR CHANGE</span>
                </div>
              </div>
            </motion.div>

            {/* Analysis card with typewriter */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-xl border border-white/8 bg-white/3 p-4"
            >
              <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                <Brain size={8} className="text-purple-400" />
                AI Reasoning
              </p>
              <p className="text-[11px] leading-relaxed text-slate-300">{analysisText}
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 0.7 }}
                  className="inline-block w-0.5 h-3 bg-purple-400 ml-0.5 align-middle"
                />
              </p>
            </motion.div>

            {/* Confidence meter */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-xl border border-white/8 bg-white/3 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-300">Confidence Score</span>
                <span className="text-2xl font-bold font-mono text-violet-400">94%</span>
              </div>
              <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #7c3aed, #8b5cf6, #06b6d4)' }}
                  initial={{ width: 0 }}
                  animate={{ width: confidenceVisible ? '94%' : 0 }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] font-mono text-slate-600">Low confidence</span>
                <span className="text-[9px] font-mono text-violet-400">High confidence</span>
              </div>
            </motion.div>

            {/* Proposed fix */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="rounded-xl border border-emerald-500/25 bg-emerald-500/6 p-4"
            >
              <p className="text-[9px] font-mono uppercase tracking-widest text-emerald-400 mb-3 flex items-center gap-1.5">
                <Wrench size={8} />
                Proposed Fix
              </p>
              <div className="space-y-2 font-mono text-[10px]">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <span className="text-slate-500 shrink-0">Old:</span>
                  <code className="text-red-300">#submit-btn</code>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-slate-500 shrink-0">New:</span>
                  <code className="text-emerald-300">[data-testid=&quot;payment-submit&quot;]</code>
                </div>
                <div className="p-2 rounded-lg bg-white/3 border border-white/8">
                  <span className="text-slate-500">Method: </span>
                  <span className="text-slate-300">AI DOM diffing (94% confidence)</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="neon" size="sm" className="flex-1 !bg-emerald-600/20 !border-emerald-500/40 !text-emerald-300 hover:!bg-emerald-600/30">
                  <CheckCircle2 size={10} />
                  Apply Auto-Fix
                </Button>
                <Button variant="ghost" size="sm">
                  <Eye size={10} />
                  View Diff
                </Button>
              </div>
            </motion.div>

            {/* Similar failures */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="rounded-xl border border-white/8 bg-white/3 p-4"
            >
              <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                <GitBranch size={8} className="text-cyan-400" />
                Similar Failures in This Project
              </p>
              <div className="space-y-2">
                {SIMILAR_FAILURES.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/3 border border-white/6 hover:bg-white/5 cursor-pointer transition-colors">
                    <span className="text-[9px] font-mono text-slate-500 shrink-0 w-12">{f.id}</span>
                    <span className="text-[10px] text-slate-300 flex-1 truncate">{f.name}</span>
                    <span className="text-[9px] font-mono text-slate-600 shrink-0">{f.age}</span>
                    <span className="text-[9px] font-mono text-violet-400 shrink-0">{f.confidence}%</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* ─ RIGHT: Root Cause Intelligence ─────────────────────────── */}
        <div className="w-[30%] shrink-0 flex flex-col bg-[var(--color-surface-1)] overflow-y-auto">
          <div className="shrink-0 px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
            <Shield size={10} className="text-cyan-400" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Root Cause Intelligence</span>
          </div>

          <div className="flex-1 p-4 space-y-4">
            {/* Category */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
              <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/8 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">Failure Category</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30">
                  <AlertTriangle size={10} className="text-cyan-400" />
                  <span className="text-[10px] font-mono font-bold text-cyan-300">Locator Instability</span>
                </div>
              </div>
            </motion.div>

            {/* Impact */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
              <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-3">
                <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500">Impact Assessment</p>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-red-500/15 border border-red-500/25">
                    <AlertTriangle size={10} className="text-red-400" />
                  </div>
                  <span className="text-[11px] text-slate-300">Blocks <span className="text-red-400 font-semibold">3 downstream</span> test cases</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/12 border border-amber-500/25">
                    <Clock size={10} className="text-amber-400" />
                  </div>
                  <span className="text-[11px] text-slate-300">Occurred <span className="text-amber-400 font-semibold">8 times</span> in last 30 days</span>
                </div>
              </div>
            </motion.div>

            {/* Trend chart */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
              <div className="rounded-xl border border-white/8 bg-white/3 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                    <TrendingUp size={8} className="text-violet-400" />
                    30-day Trend
                  </p>
                  <span className="text-[9px] font-mono text-violet-400">8 total</span>
                </div>
                <div style={{ height: 80 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={TREND_DATA}>
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke="#8b5cf6"
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 3, fill: '#8b5cf6' }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--color-surface-1)',
                          border: '1px solid var(--color-line-default)',
                          borderRadius: 6,
                          fontSize: 12,
                          fontFamily: 'monospace',
                          color: 'var(--color-fg-default)',
                        }}
                        labelStyle={{ color: 'var(--color-fg-muted)' }}
                        itemStyle={{ color: 'var(--color-accent-default)' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>

            {/* Similar failures in other TCs */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
              <div className="rounded-xl border border-white/8 bg-white/3 p-4">
                <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                  <GitBranch size={8} className="text-slate-500" />
                  Similar in Other TCs
                </p>
                <div className="space-y-2">
                  {SIMILAR_FAILURES.map((f) => (
                    <div key={f.id} className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-violet-400 shrink-0" />
                      <span className="text-[9px] text-slate-400 flex-1 truncate">{f.name}</span>
                      <div className="h-1 w-12 rounded-full bg-white/8 overflow-hidden shrink-0">
                        <div className="h-full rounded-full bg-violet-500" style={{ width: `${f.confidence}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Auto-Heal All */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
              <button className="w-full py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/8 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/15 transition-colors flex items-center justify-center gap-2">
                <Zap size={12} />
                Auto-Heal All Similar
              </button>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── Bottom: AI Resolution Terminal ────────────────────────────── */}
      <div className="shrink-0 border-t border-white/6" style={{ height: 200 }}>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
          <Terminal size={10} className="text-emerald-400" />
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">AI Resolution Terminal</span>
          <div className="flex items-center gap-1 ml-auto">
            <div className="w-2 h-2 rounded-full bg-red-500/70" />
            <div className="w-2 h-2 rounded-full bg-amber-500/70" />
            <div className="w-2 h-2 rounded-full bg-emerald-500/70" />
          </div>
        </div>
        <div
          ref={termRef}
          className="h-[calc(200px-36px)] overflow-y-auto px-4 py-3 bg-[var(--color-surface-1)] font-mono text-[10px] space-y-1"
        >
          <AnimatePresence>
            {terminalLines.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                  'leading-relaxed',
                  line.kind === 'prompt' ? 'text-emerald-400' :
                  line.kind === 'found'  ? 'text-cyan-300' :
                  line.kind === 'patch'  ? 'text-amber-300' :
                  line.kind === 'ready'  ? 'text-violet-300' :
                  'text-slate-400',
                )}
              >
                {line.text}
              </motion.div>
            ))}
          </AnimatePresence>
          {terminalLines.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-emerald-400">nexcore-ai &gt; </span>
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="inline-block w-1.5 h-3.5 bg-emerald-400 align-middle"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
