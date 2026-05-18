'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronRight,
  Database,
  Globe,
  Layers,
  Loader2,
  Monitor,
  Rocket,
  Shield,
  Smartphone,
  Sparkles,
  Tag,
  ToggleLeft,
  ToggleRight,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  projectName: string;
  description: string;
  tags: string;
  appType: string;
  platforms: string[];
  executionStrategy: string;
  validations: string[];
  aiProfile: Record<string, boolean>;
  environment: string;
  browser: string;
  headless: boolean;
  timeout: number;
}

// ─── Step metadata ────────────────────────────────────────────────────────────

const STEPS = [
  { id: 0, label: 'Project Identity', short: 'Identity' },
  { id: 1, label: 'Application Type', short: 'App Type' },
  { id: 2, label: 'Platform Selection', short: 'Platforms' },
  { id: 3, label: 'Execution Strategy', short: 'Strategy' },
  { id: 4, label: 'Validation Intelligence', short: 'Validation' },
  { id: 5, label: 'AI Orchestration Profile', short: 'AI Profile' },
  { id: 6, label: 'Runtime Configuration', short: 'Runtime' },
];

// ─── App Types ────────────────────────────────────────────────────────────────

const APP_TYPES = [
  { id: 'web', label: 'Web App', desc: 'Browser-based applications', icon: Globe, color: '#5b8cff' },
  { id: 'mobile', label: 'Mobile App', desc: 'iOS and Android native', icon: Smartphone, color: '#45c08a' },
  { id: 'desktop', label: 'Desktop App', desc: 'Windows, macOS applications', icon: Monitor, color: '#4dd1e1' },
  { id: 'api', label: 'API Service', desc: 'REST, GraphQL, gRPC services', icon: Zap, color: '#a195ff' },
  { id: 'multi', label: 'Multi-Platform', desc: 'All platforms unified', icon: Layers, color: '#f0b558' },
];

// ─── Platforms ─────────────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: 'chrome', label: 'Chrome', color: '#5b8cff' },
  { id: 'firefox', label: 'Firefox', color: '#f0b558' },
  { id: 'safari', label: 'Safari', color: '#4dd1e1' },
  { id: 'android', label: 'Android', color: '#45c08a' },
  { id: 'ios', label: 'iOS', color: '#f06262' },
  { id: 'windows', label: 'Windows Desktop', color: '#a195ff' },
  { id: 'macos', label: 'macOS', color: '#8b8c97' },
];

// ─── Execution Strategies ──────────────────────────────────────────────────────

const STRATEGIES = [
  { id: 'sequential', label: 'Sequential', desc: 'Tests run one after another in defined order. Predictable, easy to debug.', color: '#5b8cff', badge: 'Simple' },
  { id: 'parallel', label: 'Parallel', desc: 'Maximum speed via concurrent execution across workers. Requires isolation.', color: '#45c08a', badge: 'Fast' },
  { id: 'ai-driven', label: 'Smart AI-driven', desc: 'AI analyzes dependencies and risk, schedules optimally with auto-retry.', color: '#a195ff', badge: 'Recommended' },
  { id: 'custom-dag', label: 'Custom DAG', desc: 'Define your own directed acyclic graph for full orchestration control.', color: '#f0b558', badge: 'Advanced' },
];

// ─── Validations ───────────────────────────────────────────────────────────────

const VALIDATIONS = [
  { id: 'ui', label: 'UI Assertions', color: '#5b8cff' },
  { id: 'api', label: 'API Validation', color: '#a195ff' },
  { id: 'db', label: 'Database Checks', color: '#4dd1e1' },
  { id: 'ocr', label: 'PDF / OCR', color: '#f0b558' },
  { id: 'screenshot', label: 'Screenshot Diff', color: '#45c08a' },
  { id: 'performance', label: 'Performance Baseline', color: '#f06262' },
];

// ─── AI Profile toggles ────────────────────────────────────────────────────────

const AI_PROFILE_OPTIONS = [
  { id: 'healLocators', label: 'Heal locators', desc: 'Automatically repair broken element selectors using AI vision', color: '#a195ff' },
  { id: 'retryIntelligence', label: 'Retry intelligence', desc: 'Smart retry with exponential backoff and context-aware delay', color: '#5b8cff' },
  { id: 'flakyDetection', label: 'Flaky detection', desc: 'Track test stability over time and surface unreliable tests', color: '#f0b558' },
  { id: 'smartScheduling', label: 'Smart scheduling', desc: 'AI-optimized test ordering to surface failures faster', color: '#45c08a' },
  { id: 'selfHealing', label: 'Self-healing mode', desc: 'Autonomous remediation pipeline on failure with evidence capture', color: '#4dd1e1' },
];

// ─── AI Recommendations per step ──────────────────────────────────────────────

const AI_RECS: Record<number, { title: string; items: string[] }> = {
  0: {
    title: 'Naming Best Practices',
    items: [
      'Use project names that reflect the business domain',
      'Add version tags for multi-release projects',
      'Descriptive names improve AI context for analysis',
    ],
  },
  1: {
    title: 'Application Type Guide',
    items: [
      'Choose Multi-Platform for unified execution intelligence',
      'Web + API combination covers 80% of enterprise apps',
      'Desktop apps require Appium or WinAppDriver adapter',
    ],
  },
  2: {
    title: 'Platform Coverage',
    items: [
      'Chrome + Firefox covers 85% of browser market',
      'iOS testing requires macOS runner with Xcode',
      'Start narrow — add platforms progressively',
    ],
  },
  3: {
    title: 'Strategy Selection',
    items: [
      'AI-driven mode reduces execution time by 40% on average',
      'Parallel mode requires test isolation (no shared state)',
      'Custom DAG unlocks advanced conditional branching',
    ],
  },
  4: {
    title: 'Validation Depth',
    items: [
      'UI + API is minimum viable validation coverage',
      'Screenshot diff catches visual regressions automatically',
      'Database checks confirm state consistency end-to-end',
    ],
  },
  5: {
    title: 'AI Orchestration',
    items: [
      'Locator healing reduces maintenance by up to 70%',
      'Flaky detection requires at least 10 runs to be accurate',
      'Smart scheduling pairs best with parallel execution',
    ],
  },
  6: {
    title: 'Runtime Config',
    items: [
      'Start with staging — never run against production first',
      'Headless mode runs 2-3× faster than headed',
      'Set timeout generously — AI retry adds overhead',
    ],
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function Toggle({ on, onToggle, color }: { on: boolean; onToggle: () => void; color: string }) {
  return (
    <button
      onClick={onToggle}
      className="transition-all"
      style={{ color: on ? color : 'var(--color-fg-subtle)' }}
    >
      {on ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
    </button>
  );
}

// ─── Step contents ─────────────────────────────────────────────────────────────

function StepIdentity({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="mb-2 block text-[11px] font-mono uppercase tracking-widest" style={{ color: 'var(--color-fg-subtle)' }}>
          Project Name *
        </label>
        <input
          value={form.projectName}
          onChange={e => setForm({ ...form, projectName: e.target.value })}
          placeholder="e.g. Airline Booking Suite"
          className="w-full rounded-xl border bg-transparent px-4 py-3 text-sm outline-none transition-all focus:border-[var(--color-accent-default)] placeholder:text-[var(--color-fg-subtle)]"
          style={{
            borderColor: 'rgba(255,255,255,0.1)',
            color: 'var(--color-fg-default)',
            background: 'rgba(255,255,255,0.02)',
          }}
        />
      </div>
      <div>
        <label className="mb-2 block text-[11px] font-mono uppercase tracking-widest" style={{ color: 'var(--color-fg-subtle)' }}>
          Description
        </label>
        <textarea
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          placeholder="What does this project validate? What are the critical user journeys?"
          rows={4}
          className="w-full resize-none rounded-xl border bg-transparent px-4 py-3 text-sm outline-none transition-all focus:border-[var(--color-accent-default)] placeholder:text-[var(--color-fg-subtle)]"
          style={{
            borderColor: 'rgba(255,255,255,0.1)',
            color: 'var(--color-fg-default)',
            background: 'rgba(255,255,255,0.02)',
          }}
        />
      </div>
      <div>
        <label className="mb-2 flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest" style={{ color: 'var(--color-fg-subtle)' }}>
          <Tag size={11} /> Tags
        </label>
        <input
          value={form.tags}
          onChange={e => setForm({ ...form, tags: e.target.value })}
          placeholder="e.g. e2e, critical, payment (comma-separated)"
          className="w-full rounded-xl border bg-transparent px-4 py-3 text-sm outline-none transition-all focus:border-[var(--color-accent-default)] placeholder:text-[var(--color-fg-subtle)]"
          style={{
            borderColor: 'rgba(255,255,255,0.1)',
            color: 'var(--color-fg-default)',
            background: 'rgba(255,255,255,0.02)',
          }}
        />
        {form.tags && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {form.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
              <span
                key={tag}
                className="rounded-full border px-2.5 py-0.5 text-[10px] font-mono"
                style={{ borderColor: 'rgba(139,121,255,0.3)', color: '#a195ff', background: 'rgba(139,121,255,0.08)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StepAppType({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {APP_TYPES.map(type => {
        const Icon = type.icon;
        const selected = form.appType === type.id;
        return (
          <motion.button
            key={type.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setForm({ ...form, appType: type.id })}
            className="relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all"
            style={{
              background: selected ? `${type.color}12` : 'var(--color-surface-2)',
              borderColor: selected ? `${type.color}50` : 'var(--color-line-default)',
              boxShadow: selected ? `0 0 20px ${type.color}18` : 'none',
            }}
          >
            {selected && (
              <div className="absolute right-3 top-3">
                <CheckCircle2 size={14} style={{ color: type.color }} />
              </div>
            )}
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `${type.color}18`, border: `1px solid ${type.color}30` }}
            >
              <Icon size={18} style={{ color: type.color }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: selected ? type.color : 'var(--color-fg-default)' }}>
                {type.label}
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>{type.desc}</p>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function StepPlatforms({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  const toggle = (id: string) => {
    const next = form.platforms.includes(id)
      ? form.platforms.filter(p => p !== id)
      : [...form.platforms, id];
    setForm({ ...form, platforms: next });
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
        Select all platforms this project must validate against.
      </p>
      <div className="flex flex-wrap gap-2.5">
        {PLATFORMS.map(p => {
          const on = form.platforms.includes(p.id);
          return (
            <motion.button
              key={p.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggle(p.id)}
              className="rounded-xl border px-4 py-2.5 text-sm font-medium transition-all"
              style={{
                background: on ? `${p.color}14` : 'var(--color-surface-2)',
                borderColor: on ? `${p.color}50` : 'var(--color-line-default)',
                color: on ? p.color : 'var(--color-fg-muted)',
                boxShadow: on ? `0 0 12px ${p.color}18` : 'none',
              }}
            >
              {on && <CheckCircle2 size={12} className="mr-1.5 inline" />}
              {p.label}
            </motion.button>
          );
        })}
      </div>
      {form.platforms.length > 0 && (
        <div
          className="rounded-xl border p-3"
          style={{ background: 'rgba(139,121,255,0.05)', borderColor: 'rgba(139,121,255,0.15)' }}
        >
          <p className="text-[11px]" style={{ color: '#a195ff' }}>
            {form.platforms.length} platform{form.platforms.length > 1 ? 's' : ''} selected · AI will generate adapter configurations for each.
          </p>
        </div>
      )}
    </div>
  );
}

function StepStrategy({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {STRATEGIES.map(s => {
        const selected = form.executionStrategy === s.id;
        return (
          <motion.button
            key={s.id}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setForm({ ...form, executionStrategy: s.id })}
            className="flex items-start gap-4 rounded-xl border p-4 text-left transition-all"
            style={{
              background: selected ? `${s.color}10` : 'var(--color-surface-2)',
              borderColor: selected ? `${s.color}45` : 'var(--color-line-default)',
            }}
          >
            <div
              className="mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 transition-all"
              style={{
                borderColor: selected ? s.color : 'var(--color-line-strong)',
                background: selected ? s.color : 'transparent',
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold" style={{ color: selected ? s.color : 'var(--color-fg-default)' }}>
                  {s.label}
                </p>
                <span
                  className="rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase"
                  style={{
                    borderColor: `${s.color}30`,
                    color: s.color,
                    background: `${s.color}10`,
                  }}
                >
                  {s.badge}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-4" style={{ color: 'var(--color-fg-subtle)' }}>{s.desc}</p>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function StepValidations({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  const toggle = (id: string) => {
    const next = form.validations.includes(id)
      ? form.validations.filter(v => v !== id)
      : [...form.validations, id];
    setForm({ ...form, validations: next });
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
        Select every validation type this project should run. AI will configure assertion engines automatically.
      </p>
      <div className="flex flex-wrap gap-2.5">
        {VALIDATIONS.map(v => {
          const on = form.validations.includes(v.id);
          return (
            <motion.button
              key={v.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggle(v.id)}
              className="rounded-xl border px-4 py-3 text-sm font-medium transition-all"
              style={{
                background: on ? `${v.color}14` : 'var(--color-surface-2)',
                borderColor: on ? `${v.color}50` : 'var(--color-line-default)',
                color: on ? v.color : 'var(--color-fg-muted)',
              }}
            >
              {on && <CheckCircle2 size={12} className="mr-1.5 inline" />}
              {v.label}
            </motion.button>
          );
        })}
      </div>
      {form.validations.length >= 2 && (
        <div
          className="rounded-xl border p-3"
          style={{ background: 'rgba(69,192,138,0.05)', borderColor: 'rgba(69,192,138,0.18)' }}
        >
          <p className="text-[11px]" style={{ color: '#45c08a' }}>
            Strong coverage selected — AI will generate test assertions for all {form.validations.length} validation layers.
          </p>
        </div>
      )}
    </div>
  );
}

function StepAIProfile({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  const toggle = (id: string) => {
    setForm({ ...form, aiProfile: { ...form.aiProfile, [id]: !form.aiProfile[id] } });
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
        Configure the AI orchestration layer for this project. These settings control how the AI agents behave during execution.
      </p>
      {AI_PROFILE_OPTIONS.map(opt => {
        const on = !!form.aiProfile[opt.id];
        return (
          <div
            key={opt.id}
            className="flex items-center gap-4 rounded-xl border p-4 transition-all"
            style={{
              background: on ? `${opt.color}08` : 'var(--color-surface-2)',
              borderColor: on ? `${opt.color}30` : 'var(--color-line-default)',
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: on ? opt.color : 'var(--color-fg-default)' }}>
                {opt.label}
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>{opt.desc}</p>
            </div>
            <Toggle on={on} onToggle={() => toggle(opt.id)} color={opt.color} />
          </div>
        );
      })}
    </div>
  );
}

function StepRuntime({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Environment */}
      <div>
        <label className="mb-2 block text-[11px] font-mono uppercase tracking-widest" style={{ color: 'var(--color-fg-subtle)' }}>
          Target Environment
        </label>
        <div className="flex gap-2">
          {['staging', 'production', 'local'].map(env => (
            <button
              key={env}
              onClick={() => setForm({ ...form, environment: env })}
              className="flex-1 rounded-xl border py-2.5 text-sm font-medium capitalize transition-all"
              style={{
                background: form.environment === env ? 'rgba(139,121,255,0.12)' : 'var(--color-surface-2)',
                borderColor: form.environment === env ? 'rgba(139,121,255,0.45)' : 'var(--color-line-default)',
                color: form.environment === env ? '#a195ff' : 'var(--color-fg-muted)',
              }}
            >
              {env}
            </button>
          ))}
        </div>
      </div>

      {/* Browser */}
      <div>
        <label className="mb-2 block text-[11px] font-mono uppercase tracking-widest" style={{ color: 'var(--color-fg-subtle)' }}>
          Default Browser
        </label>
        <div className="flex gap-2">
          {['Chromium', 'Firefox', 'WebKit'].map(b => (
            <button
              key={b}
              onClick={() => setForm({ ...form, browser: b })}
              className="flex-1 rounded-xl border py-2.5 text-sm font-medium transition-all"
              style={{
                background: form.browser === b ? 'rgba(91,140,255,0.12)' : 'var(--color-surface-2)',
                borderColor: form.browser === b ? 'rgba(91,140,255,0.45)' : 'var(--color-line-default)',
                color: form.browser === b ? '#5b8cff' : 'var(--color-fg-muted)',
              }}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Headless */}
      <div
        className="flex items-center justify-between rounded-xl border p-4"
        style={{
          background: form.headless ? 'rgba(69,192,138,0.06)' : 'var(--color-surface-2)',
          borderColor: form.headless ? 'rgba(69,192,138,0.25)' : 'var(--color-line-default)',
        }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: form.headless ? '#45c08a' : 'var(--color-fg-default)' }}>
            Headless mode
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Run browsers without a display. Significantly faster, ideal for CI/CD.
          </p>
        </div>
        <Toggle on={form.headless} onToggle={() => setForm({ ...form, headless: !form.headless })} color="#45c08a" />
      </div>

      {/* Timeout */}
      <div>
        <label className="mb-2 flex items-center justify-between text-[11px] font-mono uppercase tracking-widest" style={{ color: 'var(--color-fg-subtle)' }}>
          <span>Step Timeout</span>
          <span style={{ color: '#f0b558' }}>{form.timeout}s</span>
        </label>
        <input
          type="range"
          min={10}
          max={120}
          step={5}
          value={form.timeout}
          onChange={e => setForm({ ...form, timeout: Number(e.target.value) })}
          className="w-full accent-[#f0b558]"
          style={{ accentColor: '#f0b558' }}
        />
        <div className="mt-1 flex justify-between text-[10px] font-mono" style={{ color: 'var(--color-fg-subtle)' }}>
          <span>10s</span>
          <span>60s</span>
          <span>120s</span>
        </div>
      </div>
    </div>
  );
}

// ─── Success State ─────────────────────────────────────────────────────────────

function SuccessState({ projectName }: { projectName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
      className="flex h-full flex-col items-center justify-center px-8 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.15 }}
        className="mb-6 flex h-20 w-20 items-center justify-center rounded-full"
        style={{
          background: 'rgba(69,192,138,0.12)',
          border: '2px solid rgba(69,192,138,0.4)',
          boxShadow: '0 0 40px rgba(69,192,138,0.2)',
        }}
      >
        <CheckCircle2 size={36} style={{ color: '#45c08a' }} />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-2xl font-bold"
        style={{
          background: 'linear-gradient(90deg, #ffffff, #45c08a)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        Execution Universe Created
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-2 font-mono text-sm"
        style={{ color: '#45c08a' }}
      >
        {projectName || 'Unnamed Project'}
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-2 max-w-sm text-sm"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        Your AI-powered execution environment is ready. Choose where to proceed.
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.57 }}
        className="mt-6 text-[10px] font-mono uppercase tracking-[0.18em]"
        style={{ color: 'var(--color-fg-subtle)' }}
      >
        Complete these steps in order
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mt-3 flex flex-col gap-2 w-full max-w-md"
      >
        {[
          { step: 1, label: 'Configure Test Cases & Modules',   href: '/test-configuration', icon: Brain,  color: '#5b8cff', note: 'Create projects, modules, and test cases' },
          { step: 2, label: 'Configure Pages & Object Repository', href: '/page-repository',  icon: Database, color: '#4dd1e1', note: 'Add pages, elements, and locators' },
          { step: 3, label: 'Configure Test Steps',             href: '/test-configuration', icon: Zap,    color: '#45c08a', note: 'Map steps to pages, elements, and actions' },
          { step: 4, label: 'Build Test Architecture',          href: '/architecture',       icon: Layers, color: '#a195ff', note: 'Connect test cases into execution workflows' },
          { step: 5, label: 'Run Execution',                    href: '/executions',         icon: Rocket, color: '#f0b558', note: 'Execute workflow and view live results' },
        ].map(({ step, label, href, icon: Icon, color, note }, i) => (
          <motion.div
            key={`${href}-${step}`}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.65 + i * 0.07 }}
          >
            <Link
              href={href}
              className="group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all hover:scale-[1.005]"
              style={{ background: `${color}08`, borderColor: `${color}28` }}
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-mono font-bold"
                style={{ background: `${color}18`, border: `1px solid ${color}35`, color }}
              >
                {step}
              </div>
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${color}15`, border: `1px solid ${color}28` }}
              >
                <Icon size={14} style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium" style={{ color: 'var(--color-fg-default)' }}>{label}</p>
                <p className="text-[10px] font-mono" style={{ color: 'var(--color-fg-subtle)' }}>{note}</p>
              </div>
              <ArrowRight size={12} className="shrink-0 opacity-30 transition-opacity group-hover:opacity-80" style={{ color }} />
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const DEFAULT_FORM: FormData = {
  projectName: '',
  description: '',
  tags: '',
  appType: '',
  platforms: [],
  executionStrategy: '',
  validations: [],
  aiProfile: {
    healLocators: true,
    retryIntelligence: true,
    flakyDetection: false,
    smartScheduling: false,
    selfHealing: false,
  },
  environment: 'staging',
  browser: 'Chromium',
  headless: true,
  timeout: 30,
};

export default function NewWorkspacePage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);

  const canProceed = useCallback(() => {
    if (currentStep === 0) return form.projectName.trim().length > 0;
    if (currentStep === 1) return form.appType.length > 0;
    if (currentStep === 2) return form.platforms.length > 0;
    if (currentStep === 3) return form.executionStrategy.length > 0;
    return true;
  }, [currentStep, form]);

  const goNext = () => {
    if (!canProceed()) return;
    if (currentStep === STEPS.length - 1) {
      handleLaunch();
      return;
    }
    setDirection(1);
    setCurrentStep(s => s + 1);
  };

  const goBack = () => {
    if (currentStep === 0) return;
    setDirection(-1);
    setCurrentStep(s => s - 1);
  };

  const handleLaunch = async () => {
    setLaunching(true);
    await new Promise(r => setTimeout(r, 1800));
    setLaunching(false);
    setLaunched(true);
  };

  if (launched) {
    return (
      <div className="flex h-full items-stretch">
        <SuccessState projectName={form.projectName} />
      </div>
    );
  }

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
  };

  const rec = AI_RECS[currentStep];

  return (
    <div className="create-project-page flex h-full flex-col overflow-hidden">

      {/* ── TOP STEP RAIL ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex shrink-0 items-center gap-1 border-b px-6 py-3"
        style={{ borderColor: 'var(--color-line-default)', background: 'var(--color-surface-1)' }}
      >
        <span className="mr-3 text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--color-fg-subtle)' }}>
          New Project
        </span>
        {STEPS.map((step, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div key={step.id} className="flex items-center gap-1">
              <button
                onClick={() => { if (done) { setDirection(i < currentStep ? -1 : 1); setCurrentStep(i); } }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono transition-all ${done ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                style={{
                  background: active ? 'rgba(139,121,255,0.15)' : done ? 'rgba(69,192,138,0.08)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(139,121,255,0.4)' : done ? 'rgba(69,192,138,0.25)' : 'var(--color-line-default)'}`,
                  color: active ? '#a195ff' : done ? '#45c08a' : 'var(--color-fg-subtle)',
                }}
              >
                {done ? <CheckCircle2 size={10} /> : (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px]"
                    style={{ background: active ? '#a195ff' : 'var(--color-surface-2)', color: active ? '#fff' : 'inherit' }}>
                    {i + 1}
                  </span>
                )}
                <span className="hidden lg:inline">{step.short}</span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight size={10} style={{ color: 'var(--color-fg-subtle)', opacity: 0.4 }} />
              )}
            </div>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          <div
            className="h-1 w-32 overflow-hidden rounded-full"
            style={{ background: 'var(--color-surface-3)' }}
          >
            <motion.div
              animate={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #8b79ff, #a195ff)' }}
            />
          </div>
          <span className="ml-2 text-[10px] font-mono" style={{ color: 'var(--color-fg-subtle)' }}>
            {currentStep + 1}/{STEPS.length}
          </span>
        </div>
      </motion.div>

      {/* ── MAIN BODY ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">

        {/* LEFT RAIL: step list */}
        <motion.aside
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="flex w-[220px] shrink-0 flex-col border-r pt-6"
          style={{ borderColor: 'var(--color-line-default)', background: 'var(--color-surface-1)' }}
        >
          <div className="px-4">
            <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--color-fg-default)' }}>Creating Universe</p>
            <p className="text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>AI-Native Execution Project</p>
          </div>
          <div className="mt-5 flex flex-col gap-1 px-3">
            {STEPS.map((step, i) => {
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <button
                  key={step.id}
                  onClick={() => { if (done) { setDirection(i < currentStep ? -1 : 1); setCurrentStep(i); } }}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[11px] transition-all ${done ? 'cursor-pointer' : 'cursor-default'}`}
                  style={{
                    background: active ? 'rgba(139,121,255,0.12)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(139,121,255,0.35)' : 'transparent'}`,
                    color: active ? '#a195ff' : done ? '#45c08a' : 'var(--color-fg-subtle)',
                  }}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-mono"
                    style={{
                      background: active ? '#a195ff' : done ? 'rgba(69,192,138,0.2)' : 'var(--color-surface-2)',
                      color: active ? '#fff' : done ? '#45c08a' : 'inherit',
                    }}
                  >
                    {done ? <CheckCircle2 size={10} /> : i + 1}
                  </span>
                  <span className="font-medium">{step.label}</span>
                </button>
              );
            })}
          </div>

          {/* Summary of choices */}
          {form.projectName && (
            <div
              className="mx-3 mt-auto mb-4 rounded-xl border p-3"
              style={{ background: 'rgba(139,121,255,0.06)', borderColor: 'rgba(139,121,255,0.18)' }}
            >
              <p className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--color-fg-subtle)' }}>Project</p>
              <p className="text-[11px] font-medium truncate" style={{ color: '#a195ff' }}>{form.projectName}</p>
              {form.appType && (
                <p className="mt-1 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                  {APP_TYPES.find(a => a.id === form.appType)?.label}
                </p>
              )}
              {form.platforms.length > 0 && (
                <p className="mt-0.5 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                  {form.platforms.length} platform{form.platforms.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}
        </motion.aside>

        {/* CENTER: step content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 py-6">
          <div className="mb-6 shrink-0">
            <motion.h2
              key={`title-${currentStep}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="text-xl font-semibold"
              style={{ color: 'var(--color-fg-default)' }}
            >
              {STEPS[currentStep].label}
            </motion.h2>
            <div
              className="mt-2 h-0.5 w-8 rounded-full"
              style={{ background: 'linear-gradient(90deg, #8b79ff, transparent)' }}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentStep}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
              >
                {currentStep === 0 && <StepIdentity form={form} setForm={setForm} />}
                {currentStep === 1 && <StepAppType form={form} setForm={setForm} />}
                {currentStep === 2 && <StepPlatforms form={form} setForm={setForm} />}
                {currentStep === 3 && <StepStrategy form={form} setForm={setForm} />}
                {currentStep === 4 && <StepValidations form={form} setForm={setForm} />}
                {currentStep === 5 && <StepAIProfile form={form} setForm={setForm} />}
                {currentStep === 6 && <StepRuntime form={form} setForm={setForm} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT RAIL: AI Recommendations */}
        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex w-[240px] shrink-0 flex-col border-l pt-6"
          style={{ borderColor: 'var(--color-line-default)', background: 'var(--color-surface-1)' }}
        >
          <div className="px-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={13} style={{ color: '#a195ff' }} />
              <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#a195ff' }}>
                AI Recommendations
              </p>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl border p-3"
                style={{ background: 'rgba(139,121,255,0.06)', borderColor: 'rgba(139,121,255,0.18)' }}
              >
                <p className="mb-2 text-[11px] font-semibold" style={{ color: '#a195ff' }}>{rec.title}</p>
                <ul className="space-y-2">
                  {rec.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#a195ff', opacity: 0.6 }} />
                      <span className="text-[10px] leading-4" style={{ color: 'var(--color-fg-muted)' }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Live preview summary */}
          {(form.appType || form.executionStrategy) && (
            <div className="mt-4 px-4">
              <p className="mb-2 text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--color-fg-subtle)' }}>
                Project Preview
              </p>
              <div className="space-y-1.5">
                {form.appType && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>Type:</span>
                    <span className="text-[10px] font-medium" style={{ color: APP_TYPES.find(a => a.id === form.appType)?.color }}>
                      {APP_TYPES.find(a => a.id === form.appType)?.label}
                    </span>
                  </div>
                )}
                {form.executionStrategy && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>Strategy:</span>
                    <span className="text-[10px] font-medium" style={{ color: STRATEGIES.find(s => s.id === form.executionStrategy)?.color }}>
                      {STRATEGIES.find(s => s.id === form.executionStrategy)?.label}
                    </span>
                  </div>
                )}
                {form.platforms.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>Platforms:</span>
                    <span className="text-[10px]" style={{ color: '#4dd1e1' }}>
                      {form.platforms.slice(0, 3).join(', ')}{form.platforms.length > 3 ? ` +${form.platforms.length - 3}` : ''}
                    </span>
                  </div>
                )}
                {form.validations.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>Validations:</span>
                    <span className="text-[10px]" style={{ color: '#45c08a' }}>{form.validations.length} layers</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Confidence */}
          {currentStep >= 3 && (
            <div className="mx-4 mt-4 rounded-xl border p-3" style={{ background: 'rgba(69,192,138,0.05)', borderColor: 'rgba(69,192,138,0.18)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Brain size={11} style={{ color: '#45c08a' }} />
                <span className="text-[10px] font-mono" style={{ color: '#45c08a' }}>AI Confidence</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-3)' }}>
                <motion.div
                  animate={{ width: `${Math.min(100, 55 + currentStep * 7)}%` }}
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #45c08a, #6adba0)' }}
                />
              </div>
              <p className="mt-1.5 text-[9px]" style={{ color: 'var(--color-fg-subtle)' }}>
                {Math.min(100, 55 + currentStep * 7)}% — add more detail to improve
              </p>
            </div>
          )}
        </motion.aside>
      </div>

      {/* ── BOTTOM NAV ─────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center justify-between border-t px-6 py-3"
        style={{ borderColor: 'var(--color-line-default)', background: 'var(--color-surface-1)' }}
      >
        <button
          onClick={goBack}
          disabled={currentStep === 0}
          className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-30"
          style={{ borderColor: 'var(--color-line-strong)', color: 'var(--color-fg-muted)' }}
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full transition-all"
              style={{
                width: i === currentStep ? '20px' : '6px',
                background: i < currentStep ? '#45c08a' : i === currentStep ? '#8b79ff' : 'var(--color-surface-3)',
              }}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          disabled={!canProceed() || launching}
          className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-40 active:scale-95"
          style={{
            background: currentStep === STEPS.length - 1
              ? 'linear-gradient(135deg, #45c08a, #3aab78)'
              : 'linear-gradient(135deg, #8b79ff, #6b5ce7)',
            color: '#fff',
            boxShadow: currentStep === STEPS.length - 1
              ? '0 0 0 1px rgba(69,192,138,0.4), 0 0 20px rgba(69,192,138,0.2)'
              : '0 0 0 1px rgba(139,121,255,0.4), 0 0 20px rgba(139,121,255,0.2)',
          }}
        >
          {launching ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Creating Universe...
            </>
          ) : currentStep === STEPS.length - 1 ? (
            <>
              <Rocket size={14} />
              Launch Project
            </>
          ) : (
            <>
              Continue
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
