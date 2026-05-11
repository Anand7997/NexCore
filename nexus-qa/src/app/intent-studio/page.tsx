'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe,
  Smartphone,
  Monitor,
  Brain,
  Plus,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  X,
  ExternalLink,
  Sparkles,
  AlertCircle,
  Server,
  Layers,
  Link2,
  Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

// ── Types ─────────────────────────────────────────────────────────────────────

type Platform = 'web' | 'mobile' | 'desktop';
type IntentStatus = 'active' | 'draft';
type StepType = 'UI' | 'API' | 'DB' | 'UI+API' | 'UI+DB';

interface JourneyStep {
  step: number;
  action: string;
  type: StepType;
  validations: string[];
  api: string | null;
}

interface Intent {
  id: string;
  name: string;
  module: string;
  platform: Platform[];
  testcases: number;
  status: IntentStatus;
}

// ── Static data ───────────────────────────────────────────────────────────────

const INTENTS: Intent[] = [
  { id: '1', name: 'Book International Flight', module: 'Booking',  platform: ['web', 'mobile', 'desktop'], testcases: 14, status: 'active' },
  { id: '2', name: 'Process Payment',           module: 'Payment',  platform: ['web', 'mobile'],            testcases: 8,  status: 'active' },
  { id: '3', name: 'Generate Invoice PDF',       module: 'Invoice',  platform: ['web', 'desktop'],           testcases: 5,  status: 'draft'  },
  { id: '4', name: 'User Registration Flow',     module: 'Auth',     platform: ['web', 'mobile'],            testcases: 11, status: 'active' },
  { id: '5', name: 'Seat Selection & Upgrade',   module: 'Booking',  platform: ['web', 'mobile'],            testcases: 7,  status: 'draft'  },
];

const JOURNEY_MAP: Record<string, JourneyStep[]> = {
  '1': [
    {
      step: 1,
      action: 'Search Flights',
      type: 'UI',
      validations: ['Assert search form visible', 'Validate airport autocomplete', 'Assert date picker enabled'],
      api: 'GET /api/flights/search',
    },
    {
      step: 2,
      action: 'Select Flight',
      type: 'UI',
      validations: ['Assert flight list loaded', 'Validate price format (currency + decimal)', 'Assert sort controls present'],
      api: null,
    },
    {
      step: 3,
      action: 'Enter Passenger Details',
      type: 'UI+API',
      validations: ['Form validation rules enforced', 'Passport number format (9 chars)', 'DOB age restriction check'],
      api: 'POST /api/booking/passengers',
    },
    {
      step: 4,
      action: 'Payment Processing',
      type: 'UI+API',
      validations: ['Validate payment gateway response code', 'Assert booking ID generated', '3DS redirect handled'],
      api: 'POST /api/payment/process',
    },
    {
      step: 5,
      action: 'Booking Confirmation',
      type: 'UI+DB',
      validations: ['Assert confirmation email dispatched', 'Validate DB record integrity', 'PDF invoice generated', 'Assert PNR code visible'],
      api: 'GET /api/booking/{id}/confirmation',
    },
  ],
  '2': [
    { step: 1, action: 'Enter Card Details', type: 'UI',     validations: ['Luhn card number validation', 'CVV length check'], api: null },
    { step: 2, action: 'Initiate Payment',   type: 'UI+API', validations: ['3DS redirect assertion', 'Error handling on decline'], api: 'POST /api/payment/initiate' },
    { step: 3, action: 'Confirm Transaction',type: 'UI+DB',  validations: ['Assert receipt generated', 'Validate transaction record'], api: 'GET /api/payment/{txn}/confirm' },
  ],
  '3': [
    { step: 1, action: 'Generate Invoice',   type: 'API',    validations: ['Assert PDF content-type', 'Validate invoice number format'], api: 'POST /api/invoice/generate' },
    { step: 2, action: 'Download PDF',       type: 'UI',     validations: ['Assert download trigger fires', 'File size > 0'], api: null },
    { step: 3, action: 'Persist to DB',      type: 'DB',     validations: ['Assert invoice record saved', 'Validate FK constraints'], api: null },
  ],
  '4': [
    { step: 1, action: 'Open Registration',  type: 'UI',     validations: ['Assert form fields present', 'Email format validation'], api: null },
    { step: 2, action: 'Submit Credentials', type: 'UI+API', validations: ['Password strength enforced', 'Duplicate email rejected'], api: 'POST /api/auth/register' },
    { step: 3, action: 'Email Verification', type: 'UI+API', validations: ['Verify email sent', 'Token expiry handling'], api: 'POST /api/auth/verify-email' },
    { step: 4, action: 'Account Activated',  type: 'UI+DB',  validations: ['Assert session created', 'Validate user record state'], api: 'GET /api/auth/session' },
  ],
  '5': [
    { step: 1, action: 'View Seat Map',        type: 'UI',     validations: ['Assert seat map rendered', 'Validate available seat count'], api: 'GET /api/booking/{id}/seats' },
    { step: 2, action: 'Select Seat',          type: 'UI',     validations: ['Occupied seat blocked', 'Exit row age check'], api: null },
    { step: 3, action: 'Confirm Seat Upgrade', type: 'UI+API', validations: ['Upgrade price applied', 'Boarding pass updated'], api: 'POST /api/booking/{id}/seat-upgrade' },
  ],
};

// ── Platform icon helper ───────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<Platform, { icon: React.ElementType; label: string }> = {
  web:     { icon: Globe,       label: 'Web' },
  mobile:  { icon: Smartphone,  label: 'Mobile' },
  desktop: { icon: Monitor,     label: 'Desktop' },
};

// ── Step type badge config ────────────────────────────────────────────────────

const STEP_TYPE_STYLE: Record<StepType, string> = {
  'UI':     'bg-blue-500/15 text-blue-400 border-blue-500/25',
  'API':    'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  'DB':     'bg-orange-500/15 text-orange-400 border-orange-500/25',
  'UI+API': 'bg-violet-500/15 text-violet-400 border-violet-500/25',
  'UI+DB':  'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
};

const STEP_TYPE_ICON: Record<StepType, React.ElementType> = {
  'UI':     Layers,
  'API':    Server,
  'DB':     Database,
  'UI+API': Link2,
  'UI+DB':  Link2,
};

// ── Module color map ───────────────────────────────────────────────────────────

const MODULE_COLORS: Record<string, string> = {
  Booking: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
  Payment: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  Invoice: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  Auth:    'bg-blue-500/15 text-blue-400 border-blue-500/25',
};

// ── AI suggestions per-intent ─────────────────────────────────────────────────

const AI_HINTS: Record<string, string[]> = {
  '1': [
    'Add database validation to step 5 — booking record integrity unchecked',
    'iOS locator missing for passenger form — mobile coverage incomplete',
    'Step 2 lacks a negative-path: flight unavailable scenario',
  ],
  '2': [
    'Add timeout assertion on 3DS redirect (max 30s)',
    'Decline response handling not covered on Android',
  ],
  '3': [
    'Validate PDF metadata fields (author, creation date)',
    'Desktop download path assertion missing',
  ],
  '4': [
    'Add CAPTCHA bypass for automated runs',
    'iOS deep-link to verification email unverified',
  ],
  '5': [
    'Assert seat map reloads on browser back navigation',
    'Upgrade pricing formula unvalidated against DB tariff table',
  ],
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlatformIcon({ platform, active }: { platform: Platform; active: boolean }) {
  const cfg = PLATFORM_CONFIG[platform];
  const Icon = cfg.icon;
  return (
    <div
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-md border text-[10px] transition-all',
        active
          ? 'border-[var(--color-accent-default)] bg-[var(--color-accent-soft)] text-[var(--color-accent-default)]'
          : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)]',
      )}
      title={cfg.label}
    >
      <Icon size={10} />
    </div>
  );
}

function IntentCard({
  intent,
  selected,
  onClick,
}: {
  intent: Intent;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full rounded-xl border px-3 py-2.5 text-left transition-all',
        selected
          ? 'border-[var(--color-accent-default)]/50 bg-[var(--color-accent-soft)] shadow-[0_0_16px_rgba(139,121,255,0.12)]'
          : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]',
      )}
    >
      {/* Name + status row */}
      <div className="flex items-start justify-between gap-1.5">
        <p
          className={cn(
            'text-[11px] font-medium leading-tight',
            selected ? 'text-[var(--color-fg-default)]' : 'text-[var(--color-fg-default)]',
          )}
        >
          {intent.name}
        </p>
        <span
          className={cn(
            'shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] capitalize',
            intent.status === 'active'
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
              : 'border-[var(--color-line-default)] bg-[var(--color-surface-3)] text-[var(--color-fg-subtle)]',
          )}
        >
          {intent.status}
        </span>
      </div>

      {/* Module badge */}
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className={cn(
            'rounded border px-1.5 py-0.5 font-mono text-[9px]',
            MODULE_COLORS[intent.module] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20',
          )}
        >
          {intent.module}
        </span>
        <span className="font-mono text-[9px] text-[var(--color-fg-subtle)]">
          {intent.testcases} tests
        </span>
      </div>

      {/* Platform icons */}
      <div className="mt-2 flex items-center gap-1">
        {(['web', 'mobile', 'desktop'] as Platform[]).map((p) => (
          <PlatformIcon key={p} platform={p} active={intent.platform.includes(p)} />
        ))}
      </div>
    </button>
  );
}

function JourneyStepCard({ step, isLast }: { step: JourneyStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const TypeIcon = STEP_TYPE_ICON[step.type];

  return (
    <div className="relative flex gap-3">
      {/* Timeline spine */}
      {!isLast && (
        <div
          className="absolute left-[15px] top-[30px] w-px bg-[var(--color-line-default)]"
          style={{ height: 'calc(100% + 16px)' }}
        />
      )}

      {/* Step circle */}
      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-accent-default)]/40 bg-[var(--color-accent-soft)]">
        <span className="font-mono text-[10px] font-bold text-[var(--color-accent-default)]">
          {step.step}
        </span>
      </div>

      {/* Card */}
      <div className="mb-4 min-w-0 flex-1">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left transition-all hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-xs font-semibold text-[var(--color-fg-default)]">
                {step.action}
              </span>
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px]',
                  STEP_TYPE_STYLE[step.type],
                )}
              >
                <TypeIcon size={8} />
                {step.type}
              </span>
            </div>
            {expanded ? (
              <ChevronDown size={11} className="shrink-0 text-[var(--color-fg-subtle)]" />
            ) : (
              <ChevronRight size={11} className="shrink-0 text-[var(--color-fg-subtle)]" />
            )}
          </div>

          {/* API chip always visible if present */}
          {step.api && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-fg-subtle)]">
                {step.api}
              </span>
            </div>
          )}
        </button>

        {/* Expanded validations */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="mt-1.5 rounded-xl border border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] p-3">
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                  Validations
                </p>
                <ul className="space-y-1.5">
                  {step.validations.map((v, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2
                        size={11}
                        className="mt-0.5 shrink-0 text-[var(--color-accent-default)]"
                      />
                      <span className="text-[11px] text-[var(--color-fg-muted)]">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── New Intent slide-in panel ─────────────────────────────────────────────────

interface NewIntentPanelProps {
  onClose: () => void;
  onCreated: (intent: Intent) => void;
}

function NewIntentPanel({ onClose, onCreated }: NewIntentPanelProps) {
  const [name, setName] = useState('');
  const [module, setModule] = useState('Booking');
  const [platforms, setPlatforms] = useState<Platform[]>(['web']);
  const [steps, setSteps] = useState<string[]>(['']);

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const addStep = () => setSteps((s) => [...s, '']);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));
  const updateStep = (i: number, val: string) =>
    setSteps((s) => s.map((v, idx) => (idx === i ? val : v)));

  const handleCreate = () => {
    if (!name.trim()) return;
    const newIntent: Intent = {
      id: `new-${Date.now()}`,
      name: name.trim(),
      module,
      platform: platforms,
      testcases: 0,
      status: 'draft',
    };
    onCreated(newIntent);
    onClose();
  };

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
      className="fixed right-0 top-0 z-50 flex h-full w-[420px] flex-col border-l border-[var(--color-line-strong)] bg-[var(--color-surface-1)] shadow-[var(--shadow-modal)]"
    >
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-[var(--color-line-default)] px-5">
        <div className="flex items-center gap-2">
          <Plus size={13} className="text-[var(--color-accent-default)]" />
          <span className="text-sm font-semibold text-[var(--color-fg-default)]">New Intent</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-fg-default)]"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Intent name */}
        <div>
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
            Intent Name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Book International Flight"
            className="w-full rounded-xl border border-[var(--color-line-default)] bg-[var(--color-bg-base)] px-4 py-3 text-sm font-medium text-[var(--color-fg-default)] outline-none transition-colors placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-accent-default)]"
          />
        </div>

        {/* Module selector */}
        <div>
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
            Module
          </label>
          <select
            value={module}
            onChange={(e) => setModule(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-line-default)] bg-[var(--color-bg-base)] px-4 py-2.5 text-sm text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)]"
          >
            {['Booking', 'Payment', 'Invoice', 'Auth', 'Validation', 'Notification', 'API Gateway', 'Database'].map(
              (m) => (
                <option key={m} value={m} className="bg-[#101016]">
                  {m}
                </option>
              ),
            )}
          </select>
        </div>

        {/* Platform scope */}
        <div>
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
            Platform Scope
          </label>
          <div className="flex gap-2">
            {(['web', 'mobile', 'desktop'] as Platform[]).map((p) => {
              const cfg = PLATFORM_CONFIG[p];
              const Icon = cfg.icon;
              const active = platforms.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-medium transition-all',
                    active
                      ? 'border-[var(--color-accent-default)] bg-[var(--color-accent-soft)] text-[var(--color-accent-default)]'
                      : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg-muted)]',
                  )}
                >
                  <Icon size={11} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Journey steps */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
              Journey Steps
            </label>
            <button
              onClick={addStep}
              className="flex items-center gap-1 rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-[9px] text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-accent-default)] hover:text-[var(--color-accent-default)]"
            >
              <Plus size={9} />
              Add Step
            </button>
          </div>

          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-accent-default)]/30 bg-[var(--color-accent-soft)]">
                  <span className="font-mono text-[9px] font-bold text-[var(--color-accent-default)]">
                    {i + 1}
                  </span>
                </div>
                <input
                  value={step}
                  onChange={(e) => updateStep(i, e.target.value)}
                  placeholder={`Step ${i + 1} action`}
                  className="flex-1 rounded-lg border border-[var(--color-line-default)] bg-[var(--color-bg-base)] px-3 py-1.5 text-xs text-[var(--color-fg-default)] outline-none transition-colors placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-accent-default)]"
                />
                {steps.length > 1 && (
                  <button
                    onClick={() => removeStep(i)}
                    className="shrink-0 text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-state-error)]"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--color-line-default)] p-4 flex gap-2">
        <Button variant="ghost" size="md" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="neon"
          size="md"
          className="flex-1"
          onClick={handleCreate}
          disabled={!name.trim() || platforms.length === 0}
        >
          <CheckCircle2 size={12} />
          Create Intent
        </Button>
      </div>
    </motion.div>
  );
}

// ── Execution preview matrix ──────────────────────────────────────────────────

function ExecutionPreview({
  intent,
  activePlatforms,
}: {
  intent: Intent;
  activePlatforms: Platform[];
}) {
  const journey = JOURNEY_MAP[intent.id] ?? [];
  const allPlatforms: Platform[] = ['web', 'mobile', 'desktop'];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="pb-1.5 pr-2 text-left font-mono uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
              Step
            </th>
            {allPlatforms.map((p) => {
              const cfg = PLATFORM_CONFIG[p];
              const Icon = cfg.icon;
              const active = activePlatforms.includes(p) && intent.platform.includes(p);
              return (
                <th
                  key={p}
                  className={cn(
                    'pb-1.5 px-1.5 text-center font-mono uppercase tracking-[0.12em]',
                    active ? 'text-[var(--color-accent-default)]' : 'text-[var(--color-fg-subtle)] opacity-40',
                  )}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <Icon size={10} />
                    <span>{cfg.label}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {journey.map((step) => (
            <tr key={step.step} className="border-t border-[var(--color-line-subtle)]">
              <td className="py-1.5 pr-2 font-mono text-[9px] text-[var(--color-fg-muted)]">
                {step.step}. {step.action.length > 16 ? step.action.slice(0, 14) + '…' : step.action}
              </td>
              {allPlatforms.map((p) => {
                const supported = activePlatforms.includes(p) && intent.platform.includes(p);
                return (
                  <td key={p} className="px-1.5 py-1.5 text-center">
                    {supported ? (
                      <CheckCircle2 size={10} className="mx-auto text-emerald-400" />
                    ) : (
                      <Circle size={10} className="mx-auto text-[var(--color-fg-subtle)] opacity-30" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntentStudioPage() {
  const [intents, setIntents] = useState<Intent[]>(INTENTS);
  const [selectedId, setSelectedId] = useState<string>('1');
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [activePlatforms, setActivePlatforms] = useState<Platform[]>(['web', 'mobile', 'desktop']);

  const selectedIntent = intents.find((i) => i.id === selectedId) ?? intents[0];
  const journey = JOURNEY_MAP[selectedIntent.id] ?? [];
  const hints = AI_HINTS[selectedIntent.id] ?? [];

  const togglePlatform = useCallback((p: Platform) => {
    setActivePlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }, []);

  const handleNewIntent = useCallback((intent: Intent) => {
    setIntents((prev) => [...prev, intent]);
    setSelectedId(intent.id);
  }, []);

  return (
    <>
      <div className="flex h-full flex-col">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
              Intent Studio
            </span>
            <span className="h-3 w-px bg-[var(--color-line-default)]" />
            <span className="text-xs font-medium text-[var(--color-fg-muted)]">
              {intents.length} intents
            </span>
          </div>

          <Button variant="neon" size="sm" onClick={() => setShowNewPanel(true)}>
            <Plus size={11} />
            New Intent
          </Button>
        </header>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1">
          {/* ── Left: Intent Library ──────────────────────────────────────── */}
          <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
            <div className="flex h-9 items-center border-b border-[var(--color-line-subtle)] px-4">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
                Intent Library
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {intents.map((intent) => (
                <IntentCard
                  key={intent.id}
                  intent={intent}
                  selected={intent.id === selectedId}
                  onClick={() => setSelectedId(intent.id)}
                />
              ))}
            </div>
          </aside>

          {/* ── Center: Journey Timeline ──────────────────────────────────── */}
          <main className="flex min-w-0 flex-1 flex-col">
            {/* Intent header */}
            <div className="border-b border-[var(--color-line-default)] px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded border px-1.5 py-0.5 font-mono text-[9px]',
                        MODULE_COLORS[selectedIntent.module] ??
                          'bg-slate-500/10 text-slate-400 border-slate-500/20',
                      )}
                    >
                      {selectedIntent.module}
                    </span>
                    <span
                      className={cn(
                        'rounded border px-1.5 py-0.5 font-mono text-[9px] capitalize',
                        selectedIntent.status === 'active'
                          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                          : 'border-[var(--color-line-default)] bg-[var(--color-surface-3)] text-[var(--color-fg-subtle)]',
                      )}
                    >
                      {selectedIntent.status}
                    </span>
                  </div>
                  <h1 className="mt-1.5 text-base font-bold tracking-tight text-[var(--color-fg-default)]">
                    {selectedIntent.name}
                  </h1>
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--color-fg-subtle)]">
                    {journey.length} journey steps · {selectedIntent.testcases} test cases
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {selectedIntent.platform.map((p) => {
                    const cfg = PLATFORM_CONFIG[p];
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={p}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-accent-default)]/30 bg-[var(--color-accent-soft)] text-[var(--color-accent-default)]"
                        title={cfg.label}
                      >
                        <Icon size={12} />
                      </div>
                    );
                  })}
                  <Button variant="ghost" size="sm">
                    <ExternalLink size={10} />
                    Open tests
                  </Button>
                </div>
              </div>
            </div>

            {/* Journey */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {journey.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--color-fg-subtle)]">
                  <Layers size={24} className="mb-2 opacity-40" />
                  <p className="text-sm">No journey steps defined</p>
                  <p className="text-[11px] mt-1">Add steps to define this intent's flow</p>
                </div>
              ) : (
                <div>
                  {journey.map((step, idx) => (
                    <JourneyStepCard
                      key={step.step}
                      step={step}
                      isLast={idx === journey.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>

          {/* ── Right: Execution Preview + Platform Scope ─────────────────── */}
          <aside className="flex w-64 shrink-0 flex-col border-l border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
            {/* Platform scope */}
            <div className="border-b border-[var(--color-line-subtle)] px-4 py-3">
              <p className="mb-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
                Platform Scope
              </p>
              <div className="space-y-1.5">
                {(['web', 'mobile', 'desktop'] as Platform[]).map((p) => {
                  const cfg = PLATFORM_CONFIG[p];
                  const Icon = cfg.icon;
                  const inScope = selectedIntent.platform.includes(p);
                  const active = activePlatforms.includes(p) && inScope;
                  return (
                    <button
                      key={p}
                      onClick={() => inScope && togglePlatform(p)}
                      disabled={!inScope}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg border px-3 py-1.5 transition-all',
                        active
                          ? 'border-[var(--color-accent-default)]/40 bg-[var(--color-accent-soft)]'
                          : inScope
                          ? 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)]'
                          : 'border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] opacity-40 cursor-not-allowed',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          size={11}
                          className={active ? 'text-[var(--color-accent-default)]' : 'text-[var(--color-fg-subtle)]'}
                        />
                        <span
                          className={cn(
                            'text-[11px] font-medium',
                            active ? 'text-[var(--color-fg-default)]' : 'text-[var(--color-fg-muted)]',
                          )}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border',
                          active
                            ? 'border-[var(--color-accent-default)] bg-[var(--color-accent-default)]'
                            : 'border-[var(--color-line-default)] bg-transparent',
                        )}
                      >
                        {active && (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path
                              d="M1.5 4L3 5.5L6.5 2"
                              stroke="white"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Execution preview matrix */}
            <div className="border-b border-[var(--color-line-subtle)] px-4 py-3">
              <p className="mb-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
                Execution Preview
              </p>
              <ExecutionPreview intent={selectedIntent} activePlatforms={activePlatforms} />
            </div>

            {/* AI suggestions */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="mb-2.5 flex items-center gap-1.5">
                <Brain size={10} className="text-[var(--color-accent-default)]" />
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
                  AI Suggestions
                </p>
              </div>

              {hints.length === 0 ? (
                <div className="rounded-lg border border-[var(--color-line-subtle)] p-2.5 text-center">
                  <Sparkles size={12} className="mx-auto mb-1 text-[var(--color-accent-default)]" />
                  <p className="text-[9px] text-[var(--color-fg-subtle)]">No suggestions</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {hints.map((hint, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-[var(--color-line-subtle)] bg-[var(--color-surface-2)] p-2"
                    >
                      <AlertCircle size={10} className="mt-0.5 shrink-0 text-amber-400" />
                      <p className="text-[10px] leading-relaxed text-[var(--color-fg-muted)]">
                        {hint}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ── New Intent slide-in overlay ──────────────────────────────────── */}
      <AnimatePresence>
        {showNewPanel && (
          <>
            {/* Backdrop */}
            <motion.div
              key="ni-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowNewPanel(false)}
            />
            <NewIntentPanel
              key="ni-panel"
              onClose={() => setShowNewPanel(false)}
              onCreated={handleNewIntent}
            />
          </>
        )}
      </AnimatePresence>
    </>
  );
}
