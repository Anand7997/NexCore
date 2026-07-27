'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe,
  Type,
  MousePointer,
  CheckSquare,
  Camera,
  Code2,
  Zap,
  Database,
  Brain,
  Play,
  Save,
  Plus,
  Trash2,
  Copy,
  ChevronRight,
  ChevronDown,
  Monitor,
  Smartphone,
  Laptop,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Send,
  ArrowRight,
  RefreshCw,
  Layers3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

// ── Dynamic XTerm import (SSR-safe) ──────────────────────────────────────────
const TerminalContainer = dynamic(
  () => import('@/components/ui/TerminalContainer').then((m) => m.TerminalContainer),
  { ssr: false, loading: () => <MockTerminal /> },
);

function MockTerminal() {
  const LINES = [
    { color: '#8b5cf6', text: 'NEXCORE' },
    { color: '#64748b', text: '— execution terminal ready' },
  ];
  const LOG_LINES = [
    { c: '#94a3b8', t: 'nexcore > Running: Book International Flight — Step 5/7' },
    { c: '#64748b', t: 'nexcore > [API] GET /api/flights/available-dates?origin=LHR&dest=JFK' },
    { c: '#3b82f6', t: 'nexcore > [API] Response: 200 OK (234ms)' },
    { c: '#10b981', t: 'nexcore > [ASSERT] $.available_dates.length > 0 → PASS' },
    { c: '#94a3b8', t: 'nexcore > [INFO] Proceeding to step 6...' },
  ];
  return (
    <div className="flex h-full w-full flex-col px-3 py-2 font-mono text-[11px]">
      <div className="mb-1">
        {LINES.map((l, i) => (
          <span key={i} style={{ color: l.color }}>{l.text} </span>
        ))}
      </div>
      <div className="text-[var(--color-line-strong)]">{'─'.repeat(60)}</div>
      {LOG_LINES.map((l, i) => (
        <div key={i} style={{ color: l.c }} className="leading-5">{l.t}</div>
      ))}
      <div className="mt-1 flex items-center gap-1 text-[var(--color-accent-default)]">
        <span>›</span>
        <span className="animate-pulse">_</span>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type StepStatus = 'completed' | 'running' | 'queued' | 'failed';
type StepType =
  | 'web.navigate' | 'web.fill' | 'web.click' | 'web.assert_text'
  | 'web.screenshot' | 'web.assert_visible' | 'web.assert_value'
  | 'web.select' | 'web.wait' | 'web.upload'
  | 'api.assert_json_path' | 'api.get' | 'api.post'
  | 'api.assert_status' | 'api.extract'
  | 'db.query'
  | 'ai.assert' | 'ai.heal' | 'ai.screenshot_diff';

interface Step {
  id: string;
  order: number;
  type: StepType;
  label: string;
  target: string;
  value?: string;
  expected?: string;
  status: StepStatus;
  duration: string | null;
  healing: boolean;
  healingConfidence?: number;
}

interface AiMessage {
  role: 'ai' | 'user';
  text: string;
  timestamp: string;
}

type Platform = 'web' | 'mobile' | 'desktop';

// ── Data ──────────────────────────────────────────────────────────────────────

const INITIAL_STEPS: Step[] = [
  { id: 's1', order: 1, type: 'web.navigate',         label: 'Navigate to booking site',         target: 'https://app.airline.com/search',  status: 'completed', duration: '0.8s',  healing: false },
  { id: 's2', order: 2, type: 'web.fill',             label: 'Enter origin airport',             target: '#origin-input', value: 'LHR',      status: 'completed', duration: '0.3s',  healing: false },
  { id: 's3', order: 3, type: 'web.fill',             label: 'Enter destination airport',        target: '#destination-input', value: 'JFK',  status: 'completed', duration: '0.3s',  healing: false },
  { id: 's4', order: 4, type: 'web.click',            label: 'Open departure date picker',       target: '#departure-date',                 status: 'completed', duration: '0.2s',  healing: false },
  { id: 's5', order: 5, type: 'api.assert_json_path', label: 'Validate date picker response',    target: '$.available_dates', expected: 'array length > 0', status: 'running', duration: null, healing: false },
  { id: 's6', order: 6, type: 'web.assert_text',      label: 'Verify search results loaded',     target: '.flight-results', expected: 'contains "Available Flights"', status: 'queued', duration: null, healing: false },
  { id: 's7', order: 7, type: 'web.screenshot',       label: 'Capture results screenshot',       target: '#results-panel',                  status: 'queued', duration: null,  healing: false },
];

const INITIAL_AI_MESSAGES: AiMessage[] = [
  {
    role: 'ai',
    text: 'Step 4 locator healed from #date-picker to [data-testid="date-btn"]. Confidence: 96%.',
    timestamp: '14:31:02',
  },
  {
    role: 'user',
    text: 'What should I assert for the API step?',
    timestamp: '14:32:14',
  },
  {
    role: 'ai',
    text: 'For the API validate step, assert: $.response.status=ok and $.available_dates.length > 0 with timeout 5000ms. I\'d also recommend extracting $.available_dates[0].date for downstream use.',
    timestamp: '14:32:15',
  },
];

const AI_SUGGESTIONS: Record<StepType, string[]> = {
  'web.navigate':         ['Assert page title after navigation', 'Add network idle wait', 'Check for 404 error overlay'],
  'web.fill':             ['Validate field max length', 'Test with special characters', 'Assert autocomplete options'],
  'web.click':            ['Assert element is visible before click', 'Add post-click state assertion', 'Consider keyboard shortcut alternative'],
  'web.assert_text':      ['Use regex for dynamic content', 'Assert partial text match', 'Check element ARIA role'],
  'web.screenshot':       ['Configure viewport before capture', 'Mask dynamic content regions', 'Compare with baseline image'],
  'web.assert_visible':   ['Assert element within viewport', 'Check CSS visibility property', 'Validate z-index stacking'],
  'web.assert_value':     ['Trim whitespace before assertion', 'Assert format (e.g. date pattern)', 'Check placeholder vs value'],
  'web.select':           ['Assert dropdown options count', 'Validate selected value label', 'Test keyboard navigation'],
  'web.wait':             ['Replace with network idle condition', 'Use polling with timeout', 'Assert element appearance'],
  'web.upload':           ['Validate file size limit', 'Assert upload progress indicator', 'Check file type restrictions'],
  'api.assert_json_path': ['Add timeout assertion', 'Extract booking_id field', 'Validate response schema'],
  'api.get':              ['Assert response time < 500ms', 'Validate Content-Type header', 'Check pagination structure'],
  'api.post':             ['Assert 201 Created status', 'Validate Location header', 'Extract created resource ID'],
  'api.assert_status':    ['Assert response body on error', 'Validate rate-limit headers', 'Check Retry-After header'],
  'api.extract':          ['Validate extracted value type', 'Store for cross-step reuse', 'Add null-safety assertion'],
  'db.query':             ['Assert row count range', 'Validate column constraints', 'Check timestamp freshness'],
  'ai.assert':            ['Increase confidence threshold', 'Provide negative examples', 'Add fallback text assertion'],
  'ai.heal':              ['Set max healing attempts', 'Define healing scope', 'Log healing event to output'],
  'ai.screenshot_diff':   ['Set pixel tolerance', 'Mask animation regions', 'Configure diff threshold'],
};

const AI_FALLBACK_RESPONSES = [
  'Based on the current step type, I recommend adding a timeout assertion to handle slow network responses gracefully.',
  'I\'ve analyzed the step sequence. Consider adding a visual assertion here to catch layout regressions.',
  'For better reliability, add an explicit wait condition before this interaction step.',
  'This looks like a critical path. I\'d suggest adding an API intercept assertion to validate backend state.',
  'I can auto-generate healing selectors for this element. Want me to scan the DOM for stable attributes?',
];

// ── Step type config ──────────────────────────────────────────────────────────

interface StepTypeConfig {
  icon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
  bg: string;
  category: string;
  label: string;
}

const STEP_TYPE_CONFIG: Record<StepType, StepTypeConfig> = {
  'web.navigate':         { icon: Globe,         color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',   category: 'UI',   label: 'Navigate' },
  'web.fill':             { icon: Type,           color: '#10b981', bg: 'rgba(16,185,129,0.12)',   category: 'UI',   label: 'Fill' },
  'web.click':            { icon: MousePointer,   color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',    category: 'UI',   label: 'Click' },
  'web.assert_text':      { icon: CheckSquare,    color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',   category: 'UI',   label: 'Assert Text' },
  'web.screenshot':       { icon: Camera,         color: '#ec4899', bg: 'rgba(236,72,153,0.12)',   category: 'UI',   label: 'Screenshot' },
  'web.assert_visible':   { icon: CheckSquare,    color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',   category: 'UI',   label: 'Assert Visible' },
  'web.assert_value':     { icon: CheckSquare,    color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',   category: 'UI',   label: 'Assert Value' },
  'web.select':           { icon: Type,           color: '#10b981', bg: 'rgba(16,185,129,0.12)',   category: 'UI',   label: 'Select' },
  'web.wait':             { icon: RefreshCw,      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   category: 'UI',   label: 'Wait' },
  'web.upload':           { icon: Layers3,        color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',    category: 'UI',   label: 'Upload' },
  'api.assert_json_path': { icon: Code2,          color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   category: 'API',  label: 'Assert JSON Path' },
  'api.get':              { icon: Zap,            color: '#f97316', bg: 'rgba(249,115,22,0.12)',   category: 'API',  label: 'GET' },
  'api.post':             { icon: Zap,            color: '#f97316', bg: 'rgba(249,115,22,0.12)',   category: 'API',  label: 'POST' },
  'api.assert_status':    { icon: Code2,          color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   category: 'API',  label: 'Assert Status' },
  'api.extract':          { icon: Code2,          color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   category: 'API',  label: 'Extract' },
  'db.query':             { icon: Database,       color: '#94a3b8', bg: 'rgba(148,163,184,0.10)',  category: 'DB',   label: 'DB Query' },
  'ai.assert':            { icon: Brain,          color: '#a78bfa', bg: 'rgba(167,139,250,0.12)',  category: 'AI',   label: 'AI Assert' },
  'ai.heal':              { icon: Brain,          color: '#a78bfa', bg: 'rgba(167,139,250,0.12)',  category: 'AI',   label: 'AI Heal' },
  'ai.screenshot_diff':   { icon: Brain,          color: '#a78bfa', bg: 'rgba(167,139,250,0.12)',  category: 'AI',   label: 'Screenshot Diff' },
};

function statusConfig(s: StepStatus) {
  if (s === 'completed') return { color: '#10b981', label: 'Done',    bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.3)' };
  if (s === 'running')   return { color: '#3b82f6', label: 'Running', bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.4)' };
  if (s === 'failed')    return { color: '#ef4444', label: 'Failed',  bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.4)' };
  return                        { color: '#5a5b67', label: 'Queued',  bg: 'rgba(90,91,103,0.10)',   border: 'rgba(90,91,103,0.2)' };
}

// ── Step Type Palette ─────────────────────────────────────────────────────────

const STEP_TYPE_GROUPS: { label: string; types: StepType[] }[] = [
  {
    label: 'UI Actions',
    types: ['web.navigate', 'web.click', 'web.fill', 'web.select', 'web.wait', 'web.screenshot', 'web.upload'],
  },
  {
    label: 'Assertions',
    types: ['web.assert_text', 'web.assert_visible', 'web.assert_value'],
  },
  {
    label: 'API',
    types: ['api.get', 'api.post', 'api.assert_status', 'api.assert_json_path', 'api.extract'],
  },
  {
    label: 'AI',
    types: ['ai.assert', 'ai.heal', 'ai.screenshot_diff'],
  },
];

function StepTypePalette({
  onSelect,
  onClose,
}: {
  onSelect: (type: StepType) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full left-0 z-50 mb-2 w-[520px] overflow-hidden rounded-lg border border-[var(--color-line-strong)] bg-[rgba(13,13,18,0.97)] shadow-[var(--shadow-modal)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--color-line-default)] px-4 py-2.5">
        <span className="text-xs font-medium text-[var(--color-fg-default)]">Select Step Type</span>
        <button onClick={onClose} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
          <X size={12} />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-3">
        {STEP_TYPE_GROUPS.map((group) => (
          <div key={group.label} className="mb-3 last:mb-0">
            <p className="mb-1.5 px-1 text-[9px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
              {group.label}
            </p>
            <div className="grid grid-cols-4 gap-1">
              {group.types.map((type) => {
                const cfg = STEP_TYPE_CONFIG[type];
                return (
                  <button
                    key={type}
                    onClick={() => { onSelect(type); onClose(); }}
                    className="flex flex-col items-center gap-1.5 rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-2 text-center transition-all hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: cfg.bg }}>
                      <cfg.icon size={13} style={{ color: cfg.color }} />
                    </div>
                    <span className="text-[9px] font-mono leading-tight text-[var(--color-fg-muted)]">
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Execution Intelligence Block ──────────────────────────────────────────────

function StepBlock({
  step,
  selected,
  onSelect,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  step: Step;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<Step>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const cfg = STEP_TYPE_CONFIG[step.type];
  const sts = statusConfig(step.status);
  const isRunning = step.status === 'running';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      onClick={onSelect}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-lg border transition-all duration-150',
        selected && 'border-[var(--color-accent-default)]/60',
        isRunning && !selected && 'border-blue-500/50',
        !selected && !isRunning && 'border-[var(--color-line-default)] hover:border-[var(--color-line-strong)]',
      )}
      style={
        selected
          ? { boxShadow: '0 0 0 1px rgba(139,92,246,0.35), 0 0 24px rgba(139,92,246,0.12)' }
          : isRunning
          ? { boxShadow: '0 0 0 1px rgba(59,130,246,0.4), 0 0 18px rgba(59,130,246,0.1)', animation: 'none' }
          : undefined
      }
    >
      {/* Running pulse border */}
      {isRunning && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-lg border-2 border-blue-500/60"
          animate={{ opacity: [0.6, 0.2, 0.6] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Header row */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-3 transition-colors',
        selected ? 'bg-[var(--color-surface-3)]' : 'bg-[var(--color-surface-1)] group-hover:bg-[var(--color-surface-2)]',
      )}>
        {/* Order badge */}
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold font-mono"
          style={{ background: isRunning ? 'rgba(59,130,246,0.2)' : selected ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)', color: isRunning ? '#3b82f6' : selected ? '#8b5cf6' : '#5a5b67' }}
        >
          {step.order}
        </div>

        {/* Type badge */}
        <div
          className="flex items-center gap-1.5 rounded-md px-2 py-1 shrink-0"
          style={{ background: cfg.bg }}
        >
          <cfg.icon size={11} style={{ color: cfg.color }} />
          <span className="font-mono text-[10px] font-medium" style={{ color: cfg.color }}>
            {step.type}
          </span>
        </div>

        {/* Label */}
        <span className={cn(
          'min-w-0 flex-1 truncate text-sm',
          selected ? 'text-[var(--color-fg-default)]' : 'text-[var(--color-fg-muted)]',
        )}>
          {step.label}
        </span>

        {/* Right: duration + status chip */}
        <div className="flex shrink-0 items-center gap-2">
          {step.duration && (
            <span className="font-mono text-[10px] text-[var(--color-fg-subtle)]">{step.duration}</span>
          )}
          <span
            className="flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] font-mono uppercase"
            style={{ background: sts.bg, borderColor: sts.border, color: sts.color }}
          >
            {isRunning && (
              <motion.span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: sts.color }}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            )}
            {sts.label}
          </span>
        </div>

        {/* Heal badge */}
        {step.healing && (
          <span className="flex items-center gap-1 rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-mono text-violet-400 shrink-0">
            <Brain size={8} /> Healed
          </span>
        )}
      </div>

      {/* Expanded body (when selected) */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-[var(--color-line-default)] bg-[var(--color-surface-2)]"
          >
            <div className="grid grid-cols-2 gap-3 p-4">
              {/* Target */}
              <div className="col-span-2">
                <label className="mb-1 block text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                  Target / Selector
                </label>
                <input
                  value={step.target}
                  onChange={(e) => onUpdate({ target: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded-md border border-[var(--color-line-default)] bg-[var(--color-bg-base)] px-3 py-2 font-mono text-xs text-[var(--color-fg-muted)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-accent-default)] focus:outline-none transition-colors"
                  placeholder="Selector, URL, or JSON path"
                />
              </div>

              {/* Value */}
              {(step.type === 'web.fill' || step.type === 'web.select') && (
                <div>
                  <label className="mb-1 block text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                    Value
                  </label>
                  <input
                    value={step.value ?? ''}
                    onChange={(e) => onUpdate({ value: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded-md border border-[var(--color-line-default)] bg-[var(--color-bg-base)] px-3 py-2 font-mono text-xs text-[var(--color-fg-muted)] focus:border-[var(--color-accent-default)] focus:outline-none transition-colors"
                    placeholder="Input value"
                  />
                </div>
              )}

              {/* Expected */}
              {(step.type.startsWith('web.assert') || step.type.startsWith('api.assert')) && (
                <div className={step.type === 'web.fill' ? '' : 'col-span-1'}>
                  <label className="mb-1 block text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                    Expected Outcome
                  </label>
                  <input
                    value={step.expected ?? ''}
                    onChange={(e) => onUpdate({ expected: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded-md border border-[var(--color-line-default)] bg-[var(--color-bg-base)] px-3 py-2 font-mono text-xs text-[var(--color-fg-muted)] focus:border-[var(--color-accent-default)] focus:outline-none transition-colors"
                    placeholder="Expected value or condition"
                  />
                </div>
              )}

              {/* AI Healing toggle */}
              <div className="col-span-2 flex items-center justify-between rounded-md border border-[var(--color-line-default)] bg-[var(--color-bg-base)] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Brain size={13} className="text-[var(--color-accent-default)]" />
                  <span className="text-xs text-[var(--color-fg-muted)]">AI Self-Healing</span>
                  <span className="rounded-full bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-accent-default)]">
                    Confidence: {step.healingConfidence ?? 94}%
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdate({ healing: !step.healing }); }}
                  className="text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg-muted)]"
                >
                  {step.healing
                    ? <ToggleRight size={18} className="text-[var(--color-accent-default)]" />
                    : <ToggleLeft size={18} />
                  }
                </button>
              </div>
            </div>

            {/* Block actions */}
            <div className="flex items-center gap-2 border-t border-[var(--color-line-default)] px-4 py-2.5">
              <button
                onClick={(e) => { e.stopPropagation(); /* TODO: add validation */ }}
                className="flex items-center gap-1.5 rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-3)] px-2.5 py-1.5 text-[10px] font-mono text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-accent-default)]/40 hover:text-[var(--color-accent-default)]"
              >
                <Plus size={9} /> Add Validation
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                className="flex items-center gap-1.5 rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-3)] px-2.5 py-1.5 text-[10px] font-mono text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg-default)]"
              >
                <Copy size={9} /> Duplicate
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="flex items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/8 px-2.5 py-1.5 text-[10px] font-mono text-red-400/70 transition-colors hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-400"
              >
                <Trash2 size={9} /> Delete
              </button>
              <div className="flex-1" />
              <button
                onClick={(e) => { e.stopPropagation(); }}
                className="flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/8 px-2.5 py-1.5 text-[10px] font-mono text-violet-400 transition-colors hover:border-violet-500/40 hover:bg-violet-500/15"
              >
                <Brain size={9} /> AI Heal
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); }}
                className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-1.5 text-[10px] font-mono text-emerald-400 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/15"
              >
                <Play size={9} /> Run Step
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Left Panel: Business Flow Tree ────────────────────────────────────────────

function FlowTree({
  steps,
  selectedStep,
  onSelect,
}: {
  steps: Step[];
  selectedStep: number | null;
  onSelect: (order: number) => void;
}) {
  return (
    <div className="h-full overflow-y-auto py-3">
      <p className="px-4 pb-2 text-[9px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
        Business Flow
      </p>

      {/* Intent node */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-[var(--color-line-default)] bg-[var(--color-accent-soft)] px-2.5 py-2">
          <ChevronDown size={10} className="shrink-0 text-[var(--color-accent-default)]" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--color-accent-default)]">
            Book International Flight
          </span>
        </div>
      </div>

      {/* Steps */}
      <div className="px-3 space-y-0.5">
        {steps.map((step) => {
          const cfg = STEP_TYPE_CONFIG[step.type];
          const sts = statusConfig(step.status);
          const isSelected = selectedStep === step.order;
          const isRunning = step.status === 'running';

          return (
            <button
              key={step.id}
              onClick={() => onSelect(step.order)}
              className={cn(
                'group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-all',
                isSelected
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-default)]'
                  : 'text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)]',
              )}
            >
              {/* Status dot / running pulse */}
              <div className="relative shrink-0">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: sts.color }}
                />
                {isRunning && (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ background: sts.color }}
                    animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                )}
              </div>

              {/* Type icon */}
              <cfg.icon size={10} style={{ color: isSelected ? 'var(--color-accent-default)' : cfg.color }} className="shrink-0" />

              {/* Label */}
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {step.order}. {step.label.slice(0, 22)}{step.label.length > 22 ? '…' : ''}
              </span>

              {/* Running indicator */}
              {isRunning && (
                <span className="shrink-0 text-[9px] font-mono text-blue-400">RUNNING</span>
              )}
              {step.status === 'completed' && (
                <Check size={9} className="shrink-0 text-emerald-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Right Panel: AI Copilot ───────────────────────────────────────────────────

function AICopilot({
  selectedStepOrder,
  steps,
  messages,
  onSendMessage,
}: {
  selectedStepOrder: number | null;
  steps: Step[];
  messages: AiMessage[];
  onSendMessage: (text: string) => void;
}) {
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedStep = steps.find((s) => s.order === selectedStepOrder);
  const suggestions = selectedStep ? (AI_SUGGESTIONS[selectedStep.type] ?? []) : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  function handleSend() {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--color-line-default)] px-4 py-3">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-accent-soft)]">
            <Sparkles size={11} className="text-[var(--color-accent-default)]" />
          </div>
          <span className="text-xs font-semibold text-[var(--color-fg-default)]">NEXCORE AI COPILOT</span>
          <motion.div
            className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
        {selectedStep && (
          <p className="text-[10px] text-[var(--color-fg-subtle)]">
            Context: Step {selectedStep.order} — {selectedStep.label.slice(0, 28)}
          </p>
        )}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="shrink-0 border-b border-[var(--color-line-default)] p-3">
          <p className="mb-2 text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
            Suggestions
          </p>
          <div className="space-y-1.5">
            {suggestions.slice(0, 3).map((s, i) => (
              <button
                key={i}
                onClick={() => onSendMessage(s)}
                className="flex w-full items-start gap-2 rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-left transition-colors hover:border-[var(--color-accent-default)]/40 hover:bg-[var(--color-surface-3)]"
              >
                <Zap size={10} className="mt-0.5 shrink-0 text-[var(--color-accent-default)]" />
                <span className="text-[11px] text-[var(--color-fg-muted)]">{s}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message history */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {msg.role === 'ai' && (
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] mt-0.5">
                  <Sparkles size={9} className="text-[var(--color-accent-default)]" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed',
                  msg.role === 'ai'
                    ? 'border border-[var(--color-line-default)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]'
                    : 'border border-[var(--color-accent-default)]/25 bg-[var(--color-accent-soft)] text-[var(--color-fg-default)]',
                )}
              >
                <p>{msg.text}</p>
                <p className="mt-1 text-[9px] font-mono opacity-50">{msg.timestamp}</p>
              </div>
            </motion.div>
          ))}
          {thinking && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
                <Sparkles size={9} className="text-[var(--color-accent-default)]" />
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-default)]"
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[var(--color-line-default)] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 focus-within:border-[var(--color-accent-default)]/40 transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask AI anything about this step…"
            className="flex-1 bg-transparent text-xs text-[var(--color-fg-muted)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || thinking}
            className="shrink-0 text-[var(--color-accent-default)] transition-opacity disabled:opacity-30 hover:opacity-80"
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TestDesignerPage() {
  const [selectedStep, setSelectedStep] = useState<number | null>(5);
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>(INITIAL_AI_MESSAGES);
  const [platform, setPlatform] = useState<Platform>('web');
  const [showTypePalette, setShowTypePalette] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const selectedStepData = steps.find((s) => s.order === selectedStep);

  // Send AI message + simulate response
  const handleSendAiMessage = useCallback((text: string) => {
    const now = new Date().toTimeString().slice(0, 8);
    setAiMessages((prev) => [...prev, { role: 'user', text, timestamp: now }]);

    setTimeout(() => {
      const step = steps.find((s) => s.order === selectedStep);
      const recs = step ? (AI_SUGGESTIONS[step.type] ?? []) : [];
      const fallback = AI_FALLBACK_RESPONSES[Math.floor(Math.random() * AI_FALLBACK_RESPONSES.length)];
      const response = recs.length > 0
        ? `For this ${step?.type} step: ${recs[Math.floor(Math.random() * recs.length)].toLowerCase()}. Also consider: ${recs[(Math.floor(Math.random() * recs.length) + 1) % recs.length].toLowerCase()}.`
        : fallback;

      const responseNow = new Date().toTimeString().slice(0, 8);
      setAiMessages((prev) => [...prev, { role: 'ai', text: response, timestamp: responseNow }]);
    }, 800);
  }, [steps, selectedStep]);

  function updateStep(id: string, updates: Partial<Step>) {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, ...updates } : s));
  }

  function deleteStep(id: string) {
    setSteps((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered.map((s, i) => ({ ...s, order: i + 1 }));
    });
    setSelectedStep(null);
  }

  function duplicateStep(id: string) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const original = prev[idx];
      const newStep: Step = {
        ...original,
        id: `s${Date.now()}`,
        status: 'queued',
        duration: null,
      };
      const next = [
        ...prev.slice(0, idx + 1),
        newStep,
        ...prev.slice(idx + 1),
      ].map((s, i) => ({ ...s, order: i + 1 }));
      return next;
    });
  }

  function addStep(type: StepType) {
    const newStep: Step = {
      id: `s${Date.now()}`,
      order: steps.length + 1,
      type,
      label: `New ${STEP_TYPE_CONFIG[type].label} step`,
      target: '',
      status: 'queued',
      duration: null,
      healing: false,
      healingConfidence: 90,
    };
    setSteps((prev) => [...prev, newStep]);
    setSelectedStep(newStep.order);
  }

  function handleRunAll() {
    setIsRunning(true);
    setTimeout(() => setIsRunning(false), 3000);
  }

  const passedCount = steps.filter((s) => s.status === 'completed').length;
  const runningStep = steps.find((s) => s.status === 'running');

  const PLATFORM_ICONS: Record<Platform, React.FC<{ size?: number; className?: string }>> = {
    web: Monitor,
    mobile: Smartphone,
    desktop: Laptop,
  };

  const TERMINAL_LINES = [
    `nexcore > Running: Book International Flight — Step ${runningStep?.order ?? 5}/${steps.length}`,
    `nexcore > [API] GET /api/flights/available-dates?origin=LHR&dest=JFK`,
    `nexcore > [API] Response: 200 OK (234ms)`,
    `nexcore > [ASSERT] $.available_dates.length > 0 → PASS`,
    `nexcore > [INFO] Proceeding to step ${(runningStep?.order ?? 5) + 1}...`,
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Top Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-4 border-b border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-5 py-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--color-fg-subtle)] shrink-0">
          <span className="text-[var(--color-fg-muted)]">Intent Studio</span>
          <ChevronRight size={10} />
          <span className="text-[var(--color-fg-muted)]">Book International Flight</span>
          <ChevronRight size={10} />
          <span className="text-[var(--color-accent-default)]">Test Steps</span>
        </div>

        <div className="mx-2 h-4 w-px bg-[var(--color-line-default)] shrink-0" />

        {/* TC name + progress */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-sm font-semibold text-[var(--color-fg-default)]">
            International Flight Search with Date Filter
          </span>
          <span className="shrink-0 rounded-full border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-mono text-[var(--color-fg-muted)]">
            {steps.length} steps
          </span>
          <span className={cn(
            'flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono',
            isRunning
              ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
              : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
          )}>
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-current"
              animate={{ opacity: isRunning ? [1, 0.3, 1] : 1 }}
              transition={{ duration: 0.9, repeat: isRunning ? Infinity : 0 }}
            />
            {isRunning ? 'Executing' : `${passedCount}/${steps.length} passed`}
          </span>
        </div>

        <div className="flex-1" />

        {/* Platform selector */}
        <div className="flex shrink-0 items-center rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-0.5">
          {(['web', 'mobile', 'desktop'] as Platform[]).map((p) => {
            const Icon = PLATFORM_ICONS[p];
            return (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                title={p}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-mono capitalize transition-all',
                  platform === p
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-default)]'
                    : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
                )}
              >
                <Icon size={11} />
                <span className="hidden lg:inline">{p}</span>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm">
            <Save size={11} /> Save
          </Button>
          <Button
            variant="neon"
            size="sm"
            onClick={handleRunAll}
            disabled={isRunning}
            className="gap-1.5 bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 hover:border-emerald-400/60 hover:text-emerald-200"
          >
            {isRunning
              ? <><RefreshCw size={11} className="animate-spin" /> Executing…</>
              : <><Play size={11} /> Run All</>
            }
          </Button>
        </div>
      </div>

      {/* ── Main 3-column area ───────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* LEFT: Business Flow Tree */}
        <div className="w-[220px] shrink-0 overflow-hidden border-r border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
          <FlowTree
            steps={steps}
            selectedStep={selectedStep}
            onSelect={setSelectedStep}
          />
        </div>

        {/* CENTER: Execution Canvas */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Canvas header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
                Execution Canvas
              </span>
              <span className="rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-fg-subtle)]">
                {platform}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--color-fg-subtle)]">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {passedCount} done
              </span>
              {runningStep && (
                <span className="flex items-center gap-1">
                  <motion.span
                    className="h-1.5 w-1.5 rounded-full bg-blue-400"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                  1 running
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-fg-subtle)]" /> {steps.filter((s) => s.status === 'queued').length} queued
              </span>
            </div>
          </div>

          {/* Steps canvas */}
          <div className="flex-1 overflow-y-auto p-4">
            <AnimatePresence mode="popLayout">
              {steps.map((step) => (
                <div key={step.id} className="mb-2.5">
                  <StepBlock
                    step={step}
                    selected={selectedStep === step.order}
                    onSelect={() => setSelectedStep(selectedStep === step.order ? null : step.order)}
                    onUpdate={(u) => updateStep(step.id, u)}
                    onDelete={() => deleteStep(step.id)}
                    onDuplicate={() => duplicateStep(step.id)}
                  />
                </div>
              ))}
            </AnimatePresence>

            {/* Add step */}
            <div className="relative mt-4">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center border border-dashed border-[var(--color-line-default)] text-[var(--color-fg-subtle)] hover:border-[var(--color-accent-default)]/40 hover:text-[var(--color-accent-default)] hover:bg-[var(--color-accent-soft)]"
                onClick={() => setShowTypePalette((v) => !v)}
              >
                <Plus size={11} /> Add Step
              </Button>

              <AnimatePresence>
                {showTypePalette && (
                  <StepTypePalette
                    onSelect={addStep}
                    onClose={() => setShowTypePalette(false)}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* RIGHT: AI Copilot */}
        <div className="w-[280px] shrink-0 overflow-hidden border-l border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
          <AICopilot
            selectedStepOrder={selectedStep}
            steps={steps}
            messages={aiMessages}
            onSendMessage={handleSendAiMessage}
          />
        </div>
      </div>

      {/* ── Bottom Terminal ──────────────────────────────────────────────── */}
      <div
        className="shrink-0 border-t border-[var(--color-line-default)] bg-[var(--color-bg-base)]"
        style={{ height: terminalOpen ? 180 : 32 }}
      >
        {/* Terminal header */}
        <div className="flex h-8 items-center justify-between border-b border-[var(--color-line-default)] px-4">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
              Execution Terminal
            </span>
            {runningStep && (
              <span className="font-mono text-[9px] text-blue-400">
                — step {runningStep.order}/{steps.length} executing
              </span>
            )}
          </div>
          <button
            onClick={() => setTerminalOpen((v) => !v)}
            className="flex items-center gap-1 text-[9px] font-mono text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg-muted)]"
          >
            {terminalOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            {terminalOpen ? 'collapse' : 'expand'}
          </button>
        </div>

        {/* Terminal body */}
        <AnimatePresence>
          {terminalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
              style={{ height: 180 - 32 }}
            >
              <TerminalContainer
                className="h-full"
                initialLines={TERMINAL_LINES.map((line, i) => {
                  const level = i === 2 ? 'info' : i === 3 ? 'success' : i === 4 ? 'debug' : 'info';
                  return `\x1b[2m${new Date().toTimeString().slice(0, 8)}\x1b[0m \x1b[${level === 'success' ? '32' : level === 'info' ? '34' : '90'}m${level.toUpperCase().slice(0,4).padEnd(4)}\x1b[0m \x1b[2m[exec]\x1b[0m ${line}`;
                })}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
