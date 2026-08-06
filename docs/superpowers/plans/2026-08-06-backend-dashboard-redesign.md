# Backend Control Plane Dark-Glass Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain shadcn-table look of Nexus-Modern's 6 backend dashboards (Health & Readiness, AI Gateway, Intent Control Plane, Execution Orchestration, Runtime Fleet, Test Management) and the top-level Dashboard picker grid with a permanently dark, glassmorphic, ops-console aesthetic ported from Nexus-Advanced's design language.

**Architecture:** New reusable presentational components (`StatusPulse`, `GlassPanel`, `MetricTile`, `EmptyState`) plus a status-tone helper (`getStatusTone`/`getStatusColor`) live under `Nexus-Modern/src/components/backend/` and `Nexus-Modern/src/lib/status.ts`. A new scoped CSS class `.control-plane-scope` (sibling to the existing `.ai-workflow-scope` pattern already in `index.css`) provides the dark background, glass surfaces, and Fira Code/Fira Sans typography, independent of the app's light/dark toggle. `BackendControlPlane.tsx` and the `Dashboard`/`BackendBlockPage` components in `App.tsx` are rewritten to use these primitives. No backend/API/data changes.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, framer-motion (already installed), lucide-react (already installed).

## Global Constraints

- No backend or API contract changes — same endpoints, same data shapes, same fetch logic in `BackendControlPlane.tsx`'s `load()` function.
- No new npm dependencies — `framer-motion` and `lucide-react` are already in `Nexus-Modern/package.json`.
- No test runner (vitest/jest) is configured anywhere in `Nexus-Modern` — this is the codebase's existing pattern (verified: no `*.test.*`/`*.spec.*` files, no test script in `package.json`). Do not introduce one as part of this plan. Verification gate for every task is: `npx tsc --noEmit -p .` (type-check), `npm run lint` (ESLint), and `npm run build` (production bundle) — all run from `Nexus-Modern/`. The final task adds a manual visual check via the dev server.
- All animations must respect `prefers-reduced-motion` (via framer-motion's `useReducedMotion()` hook, or the existing CSS media-query pattern).
- The redesign is scoped to: the top-level `Dashboard` grid, `BackendBlockPage`, and `BackendControlPlane.tsx`. Do not touch `AutomationPhasesPage`, `AutomationPhasePage`, the AI Workflow page, or any other dashboard component.
- Text contrast against `#020617`/`#0f172a` dark surfaces must stay ≥4.5:1 for body text — the palette values specified in each task were chosen for this (verify visually in Task 9, not just by code review).

---

### Task 1: Design tokens — `.control-plane-scope` + Fira fonts

**Files:**
- Modify: `Nexus-Modern/src/index.css`

**Interfaces:**
- Produces: CSS class `.control-plane-scope` (root scope, sets dark bg/fg/font), utility classes `.cp-glass`, `.cp-surface`, `.cp-mono` usable by any component nested inside `.control-plane-scope`, and CSS custom properties `--cp-bg-base`, `--cp-surface-1`, `--cp-surface-2`, `--cp-border`, `--cp-border-hover`, `--cp-fg`, `--cp-fg-muted`, `--cp-fg-subtle` — all later tasks reference these exact names.

- [ ] **Step 1: Add the Google Fonts import as the very first line of the file**

Insert at line 1 (before the existing blank line and `@tailwind base;`):

```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```

- [ ] **Step 2: Append the scope block after the existing `.ai-workflow-scope .glass` rule**

The file currently ends (after the `.ai-workflow-scope .glass { ... }` block) at line 417/418. Append this new block at the end of the file:

```css

.control-plane-scope {
  --cp-bg-base: #020617;
  --cp-surface-1: rgba(15, 23, 42, 0.62);
  --cp-surface-2: #1a1e2f;
  --cp-border: rgba(148, 163, 184, 0.12);
  --cp-border-hover: rgba(148, 163, 184, 0.22);
  --cp-fg: #f8fafc;
  --cp-fg-muted: #94a3b8;
  --cp-fg-subtle: #64748b;

  background: var(--cp-bg-base);
  color: var(--cp-fg);
  font-family: 'Fira Sans', 'Public Sans', sans-serif;
}

.control-plane-scope .cp-mono {
  font-family: 'Fira Code', 'Courier New', monospace;
  font-variant-numeric: tabular-nums;
}

.control-plane-scope .cp-glass {
  background: var(--cp-surface-1);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid var(--cp-border);
}

.control-plane-scope .cp-glass:hover {
  border-color: var(--cp-border-hover);
}

.control-plane-scope .cp-surface {
  background: var(--cp-surface-2);
  border: 1px solid var(--cp-border);
}

@media (prefers-reduced-motion: reduce) {
  .control-plane-scope * {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 3: Verify the file still parses**

Run (from `Nexus-Modern/`): `npm run build`
Expected: build succeeds (no CSS parse errors). It's fine that nothing yet references `.control-plane-scope` — this only adds unused CSS at this point.

- [ ] **Step 4: Commit**

```bash
git add Nexus-Modern/src/index.css
git commit -m "feat(nexus-modern): add control-plane-scope dark-glass design tokens"
```

---

### Task 2: Status tone helper

**Files:**
- Create: `Nexus-Modern/src/lib/status.ts`

**Interfaces:**
- Produces: `getStatusTone(status: string | null | undefined): StatusTone`, `getStatusColor(status: string | null | undefined): string`, and the exported type `StatusTone = 'success' | 'active' | 'warning' | 'danger' | 'neutral'`. Task 3 (`StatusPulse`) imports both functions.

- [ ] **Step 1: Create the file**

```ts
export type StatusTone = 'success' | 'active' | 'warning' | 'danger' | 'neutral';

const TONE_COLOR: Record<StatusTone, string> = {
  success: '#34d399',
  active: '#38bdf8',
  warning: '#fbbf24',
  danger: '#f87171',
  neutral: '#64748b',
};

const TONE_KEYWORDS: Array<[StatusTone, string[]]> = [
  ['danger', ['error', 'failed', 'offline', 'blocked', 'unhealthy', 'unavailable']],
  ['warning', ['degraded', 'queued', 'pending', 'retry']],
  ['active', ['running', 'busy', 'live', 'in_progress', 'in progress']],
  ['success', ['success', 'healthy', 'ready', 'online', 'ok', 'completed', 'passed', 'up']],
  ['neutral', ['skipped', 'cancelled', 'unknown', 'idle', 'empty']],
];

export function getStatusTone(status: string | null | undefined): StatusTone {
  const value = (status ?? '').toLowerCase();
  for (const [tone, keywords] of TONE_KEYWORDS) {
    if (keywords.some((keyword) => value.includes(keyword))) {
      return tone;
    }
  }
  return 'neutral';
}

export function getStatusColor(status: string | null | undefined): string {
  return TONE_COLOR[getStatusTone(status)];
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p .` (from `Nexus-Modern/`)
Expected: no errors related to `src/lib/status.ts`.

- [ ] **Step 3: Manual smoke check**

There is no test runner in this project (see Global Constraints), so verify behavior by temporarily adding `console.log(getStatusTone('running'), getStatusTone('FAILED'), getStatusTone('ready'), getStatusTone('unknown-thing'))` at the bottom of the file, running `npx tsx Nexus-Modern/src/lib/status.ts` if `tsx`/`ts-node` is available, or otherwise importing it from a throwaway `.tsx` page and checking the browser console during Task 9's dev-server check. Remove the temporary `console.log` line before committing — it must not ship.

Expected values: `active`, `danger`, `success`, `neutral`.

- [ ] **Step 4: Commit**

```bash
git add Nexus-Modern/src/lib/status.ts
git commit -m "feat(nexus-modern): add status tone/color helper for backend dashboards"
```

---

### Task 3: `StatusPulse` component

**Files:**
- Create: `Nexus-Modern/src/components/backend/StatusPulse.tsx`

**Interfaces:**
- Consumes: `getStatusColor`, `getStatusTone` from `Nexus-Modern/src/lib/status.ts` (Task 2).
- Produces: `StatusPulse` (named export + default export), props `{ status: string; label?: string; size?: 'sm' | 'md' | 'lg'; className?: string }`. Task 7 (`BackendControlPlane.tsx`) imports and uses this directly, including inside a local `StatusCell` wrapper.

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { getStatusColor, getStatusTone } from '@/lib/status';

interface StatusPulseProps {
  status: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE = {
  sm: { dot: 8, ring: 14, outer: 20 },
  md: { dot: 9, ring: 16, outer: 24 },
  lg: { dot: 11, ring: 20, outer: 28 },
};

export function StatusPulse({ status, label, size = 'md', className }: StatusPulseProps) {
  const color = getStatusColor(status);
  const tone = getStatusTone(status);
  const isAnimated = tone === 'active' || tone === 'warning';
  const reduceMotion = useReducedMotion();
  const s = SIZE[size];

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <span className="relative flex items-center justify-center shrink-0" style={{ width: s.outer, height: s.outer }}>
        {isAnimated && !reduceMotion && (
          <motion.span
            className="absolute rounded-full"
            style={{ width: s.outer, height: s.outer, backgroundColor: color, opacity: 0.3 }}
            animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <span
          className="absolute rounded-full border"
          style={{ width: s.ring, height: s.ring, borderColor: `${color}55` }}
        />
        <span
          className="rounded-full relative z-10"
          style={{ width: s.dot, height: s.dot, backgroundColor: color, boxShadow: `0 0 6px ${color}90` }}
        />
      </span>
      {label && (
        <span className="cp-mono text-xs uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
      )}
    </span>
  );
}

export default StatusPulse;
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p .`
Expected: no errors related to `src/components/backend/StatusPulse.tsx`.

- [ ] **Step 3: Commit**

```bash
git add Nexus-Modern/src/components/backend/StatusPulse.tsx
git commit -m "feat(nexus-modern): add StatusPulse component"
```

---

### Task 4: `GlassPanel` component

**Files:**
- Create: `Nexus-Modern/src/components/backend/GlassPanel.tsx`

**Interfaces:**
- Consumes: `.cp-glass` CSS class from Task 1.
- Produces: `GlassPanel` (named + default export), props `{ children: React.ReactNode; className?: string; glow?: string; hover?: boolean; animate?: boolean; delay?: number; onClick?: () => void }`. Tasks 7 and 8 use this for all hero/card surfaces. `glow` is a hex color string (e.g. `'#34d399'`), not a Tailwind class name.

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  glow?: string;
  hover?: boolean;
  animate?: boolean;
  delay?: number;
  onClick?: () => void;
}

export function GlassPanel({
  children,
  className = '',
  glow,
  hover = true,
  animate = true,
  delay = 0,
  onClick,
}: GlassPanelProps) {
  const reduceMotion = useReducedMotion();

  const content = (
    <div
      className={`cp-glass rounded-2xl transition-all duration-300 relative overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      onMouseEnter={(event) => {
        if (!hover || !glow) return;
        event.currentTarget.style.boxShadow = `0 0 32px ${glow}26`;
      }}
      onMouseLeave={(event) => {
        if (!hover || !glow) return;
        event.currentTarget.style.boxShadow = 'none';
      }}
    >
      {children}
    </div>
  );

  if (!animate || reduceMotion) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {content}
    </motion.div>
  );
}

export default GlassPanel;
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p .`
Expected: no errors related to `src/components/backend/GlassPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add Nexus-Modern/src/components/backend/GlassPanel.tsx
git commit -m "feat(nexus-modern): add GlassPanel component"
```

---

### Task 5: `MetricTile` component

**Files:**
- Create: `Nexus-Modern/src/components/backend/MetricTile.tsx`

**Interfaces:**
- Consumes: `.cp-glass`, `.cp-mono` CSS classes (Task 1); `LucideIcon` type from `lucide-react`.
- Produces: `MetricTile` (named + default export), props `{ label: string; value: string; icon: LucideIcon; glow?: string; delay?: number }`. Task 7 renders one `MetricTile` per metric in `renderMetrics()`.

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface MetricTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  glow?: string;
  delay?: number;
}

export function MetricTile({ label, value, icon: Icon, glow = '#38bdf8', delay = 0 }: MetricTileProps) {
  const reduceMotion = useReducedMotion();

  const content = (
    <div className="cp-glass rounded-xl p-4 relative overflow-hidden group">
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${glow}22, transparent 70%)` }}
      />
      <div className="relative z-10 flex items-start justify-between">
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${glow}1a` }}>
          <Icon size={18} style={{ color: glow }} />
        </div>
      </div>
      <div className="relative z-10 mt-3 space-y-0.5">
        <p className="cp-mono text-2xl font-semibold" style={{ color: 'var(--cp-fg)' }}>
          {value}
        </p>
        <p className="text-xs font-medium" style={{ color: 'var(--cp-fg-muted)' }}>
          {label}
        </p>
      </div>
    </div>
  );

  if (reduceMotion) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {content}
    </motion.div>
  );
}

export default MetricTile;
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p .`
Expected: no errors related to `src/components/backend/MetricTile.tsx`.

- [ ] **Step 3: Commit**

```bash
git add Nexus-Modern/src/components/backend/MetricTile.tsx
git commit -m "feat(nexus-modern): add MetricTile component"
```

---

### Task 6: `EmptyState` component

**Files:**
- Create: `Nexus-Modern/src/components/backend/EmptyState.tsx`

**Interfaces:**
- Produces: `EmptyState` (named + default export), props `{ message: string; icon?: LucideIcon }` (defaults to `Inbox` from `lucide-react`). Task 7 uses this in `renderTable()` wherever `rows.length === 0`.

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  message: string;
  icon?: LucideIcon;
}

export function EmptyState({ message, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon size={28} style={{ color: 'var(--cp-fg-subtle)' }} />
      <p className="text-sm" style={{ color: 'var(--cp-fg-muted)' }}>
        {message}
      </p>
    </div>
  );
}

export default EmptyState;
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p .`
Expected: no errors related to `src/components/backend/EmptyState.tsx`.

- [ ] **Step 3: Commit**

```bash
git add Nexus-Modern/src/components/backend/EmptyState.tsx
git commit -m "feat(nexus-modern): add EmptyState component"
```

---

### Task 7: Rewrite `BackendControlPlane.tsx`

**Files:**
- Modify: `Nexus-Modern/src/components/BackendControlPlane.tsx` (full-file replace)

**Interfaces:**
- Consumes: `StatusPulse` (Task 3), `GlassPanel` (Task 4), `MetricTile` (Task 5), `EmptyState` (Task 6), `.control-plane-scope`/`.cp-surface`/`.cp-mono` CSS (Task 1).
- Produces: `BackendControlPlane` (default export, unchanged signature `{ blockId: BackendBlockId }`), `backendBlocks` (named export, **shape changed**: each entry is now `{ id, title, description, icon, glow, endpoints }` — the old `accent`/`tile`/`badge` Tailwind-class fields are removed and replaced by a single `glow: string` hex field), `BackendBlockId` (named export, type unchanged), `BackendBlockDefinition` (named export, interface updated to match). Task 8 (`App.tsx`) consumes the new `backendBlocks` shape and must be updated in the same PR/commit sequence — do not merge Task 7 without Task 8, or `App.tsx` will fail to compile.

- [ ] **Step 1: Replace the entire file contents**

```tsx
import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bot,
  Clock,
  ClipboardList,
  Gauge,
  Layers,
  ListChecks,
  Play,
  Radio,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { buildApiUrl } from '@/config/api';
import { formatExecutionDate } from '@/lib/utils';
import { StatusPulse } from '@/components/backend/StatusPulse';
import { GlassPanel } from '@/components/backend/GlassPanel';
import { MetricTile } from '@/components/backend/MetricTile';
import { EmptyState } from '@/components/backend/EmptyState';

export type BackendBlockId = 'health' | 'ai' | 'intent' | 'orchestration' | 'runtime' | 'test-management';

export interface BackendBlockDefinition {
  id: BackendBlockId;
  title: string;
  description: string;
  icon: LucideIcon;
  glow: string;
  endpoints: string[];
}

interface BackendControlPlaneProps {
  blockId: BackendBlockId;
}

type ControlPlaneState = {
  health: any | null;
  ai: any[];
  intent: any | null;
  orchestration: any[];
  runtime: { agents: any[]; queue: any[] };
  testManagement: { projects: any[]; executions: any[] };
};

export const backendBlocks: BackendBlockDefinition[] = [
  {
    id: 'health',
    title: 'Health & Readiness',
    description: 'Live health, dependency readiness, and enterprise readiness signals.',
    icon: Activity,
    glow: '#34d399',
    endpoints: ['/api/health/live', '/api/health', '/api/health/ready', '/api/enterprise/readiness'],
  },
  {
    id: 'ai',
    title: 'AI Gateway',
    description: 'AI job queue visibility and worker result ingestion from the .NET backend.',
    icon: Sparkles,
    glow: '#a78bfa',
    endpoints: ['/api/ai/jobs', '/api/ai/results'],
  },
  {
    id: 'intent',
    title: 'Intent Control Plane',
    description: 'Intent catalog, capability matrix, parity summary, and runtime validation.',
    icon: ClipboardList,
    glow: '#60a5fa',
    endpoints: ['/api/intent/catalog', '/api/intent/capability-matrix', '/api/intent/parity-report/summary', '/api/intent/runtime/validate'],
  },
  {
    id: 'orchestration',
    title: 'Execution Orchestration',
    description: 'Execution lifecycle, progress tracking, and orchestration status.',
    icon: Play,
    glow: '#fbbf24',
    endpoints: ['/api/orchestration/executions', '/api/orchestration/executions/{id}/status'],
  },
  {
    id: 'runtime',
    title: 'Runtime Fleet',
    description: 'Registered agents, lease state, and runtime queue inventory.',
    icon: Bot,
    glow: '#22d3ee',
    endpoints: ['/api/runtime/agents', '/api/runtime/queue'],
  },
  {
    id: 'test-management',
    title: 'Test Management',
    description: 'Modern project and execution records from the current backend contract.',
    icon: ServerCog,
    glow: '#fb7185',
    endpoints: ['/api/test-management/projects', '/api/test-management/executions'],
  },
];

const emptyState: ControlPlaneState = {
  health: null,
  ai: [],
  intent: null,
  orchestration: [],
  runtime: { agents: [], queue: [] },
  testManagement: { projects: [], executions: [] },
};

const fetchJson = async (endpoint: string) => {
  const response = await fetch(buildApiUrl(endpoint), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
};

const StatusCell = ({ status }: { status: string }) => <StatusPulse status={status} label={status} size="sm" />;

const getPrimarySignal = (blockId: BackendBlockId, data: ControlPlaneState): string => {
  if (blockId === 'health') return data.health?.live?.status ?? 'unavailable';

  if (blockId === 'ai') {
    const active = data.ai.some((job) => job.status === 'queued' || job.status === 'running');
    return active ? 'running' : 'success';
  }

  if (blockId === 'intent') {
    const platforms = Object.values(data.intent?.validation?.platforms ?? {});
    const allReady = platforms.length > 0 && platforms.every((platform: any) => platform.ready);
    return allReady ? 'success' : 'degraded';
  }

  if (blockId === 'orchestration') {
    const running = data.orchestration.some((item) => item.status === 'running');
    return running ? 'running' : 'success';
  }

  if (blockId === 'runtime') {
    const unhealthy = data.runtime.agents.some((agent) => agent.status === 'error' || agent.status === 'offline');
    return unhealthy ? 'error' : 'success';
  }

  return data.testManagement.executions.length > 0 ? 'success' : 'skipped';
};

const BackendControlPlane: React.FC<BackendControlPlaneProps> = ({ blockId }) => {
  const [data, setData] = useState<ControlPlaneState>(emptyState);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const block = backendBlocks.find((item) => item.id === blockId) ?? backendBlocks[0];
  const BlockIcon = block.icon;

  const load = async () => {
    setRefreshing(true);
    setError(null);

    try {
      if (blockId === 'health') {
        const [live, health, ready, enterprise] = await Promise.all([
          fetchJson('/api/health/live'),
          fetchJson('/api/health'),
          fetchJson('/api/health/ready'),
          fetchJson('/api/enterprise/readiness'),
        ]);
        setData({ ...emptyState, health: { live, health, ready, enterprise } });
      } else if (blockId === 'ai') {
        setData({ ...emptyState, ai: await fetchJson('/api/ai/jobs') });
      } else if (blockId === 'intent') {
        const [catalog, capabilityMatrix, paritySummary, validation] = await Promise.all([
          fetchJson('/api/intent/catalog'),
          fetchJson('/api/intent/capability-matrix'),
          fetchJson('/api/intent/parity-report/summary'),
          fetchJson('/api/intent/runtime/validate'),
        ]);
        setData({ ...emptyState, intent: { catalog, capabilityMatrix, paritySummary, validation } });
      } else if (blockId === 'orchestration') {
        setData({ ...emptyState, orchestration: await fetchJson('/api/orchestration/executions') });
      } else if (blockId === 'runtime') {
        const [agents, queue] = await Promise.all([
          fetchJson('/api/runtime/agents'),
          fetchJson('/api/runtime/queue'),
        ]);
        setData({ ...emptyState, runtime: { agents, queue } });
      } else {
        const [projects, executions] = await Promise.all([
          fetchJson('/api/test-management/projects'),
          fetchJson('/api/test-management/executions'),
        ]);
        setData({ ...emptyState, testManagement: { projects, executions } });
      }

      setUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      setData(emptyState);
      setError(loadError instanceof Error ? loadError.message : 'Request failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
  }, [blockId]);

  const renderTable = (headers: string[], rows: Array<Array<React.ReactNode>>, empty: string) =>
    rows.length === 0 ? (
      <EmptyState message={empty} />
    ) : (
      <div className="cp-surface rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--cp-border)' }}>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--cp-fg-subtle)' }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b transition-colors hover:bg-white/[0.03]" style={{ borderColor: 'var(--cp-border)' }}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${rowIndex}-${cellIndex}`}
                    className={`px-4 py-3 ${cellIndex === 0 ? 'cp-mono font-medium' : ''}`}
                    style={{ color: 'var(--cp-fg)' }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const renderMetrics = (): Array<{ label: string; value: string; icon: LucideIcon }> => {
    if (blockId === 'health') {
      return [
        { label: 'Live', value: data.health?.live?.status ?? 'unavailable', icon: Radio },
        { label: 'Dependencies', value: String(Object.keys(data.health?.health?.details ?? {}).length), icon: Layers },
        { label: 'Enterprise', value: String(Object.keys(data.health?.enterprise ?? {}).length), icon: ShieldCheck },
      ];
    }

    if (blockId === 'ai') {
      return [
        { label: 'Jobs', value: String(data.ai.length), icon: ListChecks },
        { label: 'Active', value: String(data.ai.filter((job) => job.status === 'queued' || job.status === 'running').length), icon: Clock },
        { label: 'Latest', value: data.ai[0]?.status ?? 'empty', icon: AlertCircle },
      ];
    }

    if (blockId === 'intent') {
      return [
        { label: 'Intents', value: String(data.intent?.paritySummary?.totalIntents ?? 0), icon: ListChecks },
        { label: 'Platforms', value: String(data.intent?.paritySummary?.supportedPlatforms ?? 0), icon: Layers },
        { label: 'Coverage', value: `${data.intent?.paritySummary?.coveragePercent ?? 0}%`, icon: Gauge },
      ];
    }

    if (blockId === 'orchestration') {
      return [
        { label: 'Executions', value: String(data.orchestration.length), icon: ListChecks },
        { label: 'Running', value: String(data.orchestration.filter((item) => item.status === 'running').length), icon: Clock },
        { label: 'Latest', value: data.orchestration[0]?.status ?? 'empty', icon: AlertCircle },
      ];
    }

    if (blockId === 'runtime') {
      return [
        { label: 'Agents', value: String(data.runtime.agents.length), icon: Bot },
        { label: 'Online', value: String(data.runtime.agents.filter((agent) => agent.status === 'online').length), icon: Radio },
        { label: 'Queue', value: String(data.runtime.queue.length), icon: ListChecks },
      ];
    }

    return [
      { label: 'Projects', value: String(data.testManagement.projects.length), icon: Layers },
      { label: 'Executions', value: String(data.testManagement.executions.length), icon: ListChecks },
      { label: 'Latest', value: data.testManagement.executions[0]?.status ?? 'empty', icon: AlertCircle },
    ];
  };

  const renderContent = () => {
    if (blockId === 'health') {
      if (!data.health) return <EmptyState message="Health data is not available." />;
      const dependencyKeys = Array.from(
        new Set([...Object.keys(data.health.health.details ?? {}), ...Object.keys(data.health.ready.details ?? {})]),
      );
      return (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <StatusPulse status={data.health.live.status} label={`Live: ${data.health.live.status}`} />
            <StatusPulse status={data.health.health.status} label={`Health: ${data.health.health.status}`} />
            <StatusPulse status={data.health.ready.status} label={`Ready: ${data.health.ready.status}`} />
            <span className="cp-mono text-xs" style={{ color: 'var(--cp-fg-subtle)' }}>
              Signal: {formatExecutionDate(data.health.ready.timestamp)}
            </span>
          </div>
          {renderTable(
            ['Capability', 'Status'],
            Object.entries(data.health.enterprise ?? {}).map(([key, value]) => [key, String(value)]),
            'No enterprise readiness signals available.',
          )}
          {renderTable(
            ['Dependency', 'Health', 'Ready'],
            dependencyKeys.map((key) => [
              key,
              <StatusCell key="h" status={String(data.health.health.details?.[key] ?? 'n/a')} />,
              <StatusCell key="r" status={String(data.health.ready.details?.[key] ?? 'n/a')} />,
            ]),
            'No dependency checks available.',
          )}
        </div>
      );
    }

    if (blockId === 'ai') {
      return renderTable(
        ['Job', 'Type', 'Status', 'Updated'],
        data.ai.map((job) => [job.id, job.type, <StatusCell key="s" status={job.status} />, formatExecutionDate(job.updatedAt)]),
        'No AI jobs are stored yet.',
      );
    }

    if (blockId === 'intent') {
      const platforms = Object.values(data.intent?.validation?.platforms ?? {});
      return (
        <div className="space-y-6">
          {renderTable(
            ['Intent', 'Schema', 'Platforms'],
            (data.intent?.catalog?.intents ?? []).map((intent: any) => [intent.name, intent.schemaVersion, intent.platforms.join(', ')]),
            'No intents returned by the backend.',
          )}
          {renderTable(
            ['Platform', 'Ready', 'Missing Capabilities'],
            platforms.map((platform: any) => [
              platform.platform,
              <StatusCell key="s" status={platform.ready ? 'ready' : 'blocked'} />,
              platform.missingCapabilities?.length ? platform.missingCapabilities.join(', ') : 'none',
            ]),
            'No runtime validation results available.',
          )}
        </div>
      );
    }

    if (blockId === 'orchestration') {
      return renderTable(
        ['Execution', 'Platform', 'Status', 'Progress', 'Updated'],
        data.orchestration.map((item) => [
          item.id,
          item.platform ?? 'n/a',
          <StatusCell key="s" status={item.status} />,
          `${item.progress}%`,
          formatExecutionDate(item.updatedAt),
        ]),
        'No orchestration executions have been started yet.',
      );
    }

    if (blockId === 'runtime') {
      return (
        <div className="space-y-6">
          {renderTable(
            ['Agent', 'Platforms', 'Status', 'Lease'],
            data.runtime.agents.map((agent) => [
              agent.name,
              agent.platforms.join(', '),
              <StatusCell key="s" status={agent.status} />,
              formatExecutionDate(agent.leaseExpiresAt),
            ]),
            'No runtime agents are currently registered.',
          )}
          {renderTable(
            ['Queue Item', 'Platform', 'Status', 'Capabilities'],
            data.runtime.queue.map((item) => [
              item.id,
              item.platform,
              <StatusCell key="s" status={item.status} />,
              item.requiredCapabilities?.join(', ') || 'none',
            ]),
            'The runtime queue is currently empty.',
          )}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {renderTable(
          ['Project', 'Description', 'Updated'],
          data.testManagement.projects.map((project) => [project.name, project.description ?? 'n/a', formatExecutionDate(project.updatedAt)]),
          'No test-management projects are stored yet.',
        )}
        {renderTable(
          ['Execution', 'Status', 'Project', 'Updated'],
          data.testManagement.executions.map((execution) => [
            execution.id,
            <StatusCell key="s" status={execution.status} />,
            execution.projectId ?? 'n/a',
            formatExecutionDate(execution.updatedAt),
          ]),
          'No test-management executions have been started yet.',
        )}
      </div>
    );
  };

  const primarySignal = getPrimarySignal(blockId, data);

  return (
    <div className="space-y-6">
      <GlassPanel glow={block.glow} className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
              style={{ backgroundColor: `${block.glow}1f` }}
            >
              <BlockIcon size={22} style={{ color: block.glow }} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold" style={{ color: 'var(--cp-fg)' }}>
                  {block.title}
                </h1>
                <StatusPulse status={primarySignal} label={primarySignal} />
              </div>
              <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--cp-fg-muted)' }}>
                {block.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="cp-mono text-right text-xs" style={{ color: 'var(--cp-fg-subtle)' }}>
              <div>API BASE</div>
              <div className="font-medium" style={{ color: 'var(--cp-fg)' }}>
                {buildApiUrl('')}
              </div>
            </div>
            <button
              onClick={() => void load()}
              className="cp-glass flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-white/[0.04]"
              style={{ color: 'var(--cp-fg)' }}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs cp-mono" style={{ color: 'var(--cp-fg-subtle)' }}>
          <span>{loading ? 'LOADING…' : 'LIVE'}</span>
          <span>·</span>
          <span>Last updated: {updatedAt ? formatExecutionDate(updatedAt) : 'not yet loaded'}</span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          {renderMetrics().map((metric, index) => (
            <MetricTile key={metric.label} label={metric.label} value={metric.value} icon={metric.icon} glow={block.glow} delay={0.05 * index} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {block.endpoints.map((endpoint) => (
            <span key={endpoint} className="cp-mono cp-surface rounded-md px-2 py-1 text-[11px]" style={{ color: 'var(--cp-fg-subtle)' }}>
              {endpoint}
            </span>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel glow={block.glow} delay={0.1} className="p-6">
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--cp-fg)' }}>
          {block.title} Data
        </h2>
        {error ? (
          <div className="cp-surface rounded-lg border p-4 text-sm" style={{ borderColor: 'rgba(248,113,113,0.35)', color: '#f87171' }}>
            This dashboard could not be loaded from the backend: {error}
          </div>
        ) : (
          renderContent()
        )}
      </GlassPanel>
    </div>
  );
};

export default BackendControlPlane;
```

- [ ] **Step 2: Verify types compile (expect App.tsx errors — that's Task 8, not a regression here)**

Run: `npx tsc --noEmit -p .`
Expected: errors in `src/App.tsx` referencing the removed `tile`/`badge`/`accent` fields on `backendBlocks` entries. No errors in `BackendControlPlane.tsx` itself. This is expected and resolved by Task 8 — do not attempt to fix `App.tsx` in this task.

- [ ] **Step 3: Commit**

```bash
git add Nexus-Modern/src/components/BackendControlPlane.tsx
git commit -m "feat(nexus-modern): rewrite BackendControlPlane with dark-glass design"
```

---

### Task 8: Rewrite `Dashboard` grid and `BackendBlockPage` in `App.tsx`

**Files:**
- Modify: `Nexus-Modern/src/App.tsx`

**Interfaces:**
- Consumes: `backendBlocks` new shape from Task 7 (`{ id, title, description, icon, glow, endpoints }`), `GlassPanel` from Task 4.
- Produces: no external interface changes — routes (`/`, `/backend/:backendBlockId`, `/automation/:automationId[/:phaseId]`) and component names are unchanged.

- [ ] **Step 1: Add the `GlassPanel` import**

Find (near the top, after the other `@/components` imports):

```tsx
import BackendControlPlane, { backendBlocks, type BackendBlockId } from '@/components/BackendControlPlane';
```

Replace with:

```tsx
import BackendControlPlane, { backendBlocks, type BackendBlockId } from '@/components/BackendControlPlane';
import { GlassPanel } from '@/components/backend/GlassPanel';
```

- [ ] **Step 2: Add `glow` to `AutomationBlock` and update the `automations` array**

Find:

```tsx
interface AutomationBlock {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
}
```

Replace with:

```tsx
interface AutomationBlock {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  glow: string;
}
```

Find the `automations` array (5 entries: `web`, `desktop`, `mobile`, `api`, `unified`) and replace each `accent: 'border-l-...'` line with a `glow` hex line, keeping every other field identical:

- `web`: `accent: 'border-l-blue-600',` → `glow: '#60a5fa',`
- `desktop`: `accent: 'border-l-slate-600',` → `glow: '#94a3b8',`
- `mobile`: `accent: 'border-l-emerald-600',` → `glow: '#34d399',`
- `api`: `accent: 'border-l-amber-600',` → `glow: '#fbbf24',`
- `unified`: `accent: 'border-l-violet-600',` → `glow: '#a78bfa',`

- [ ] **Step 3: Replace the `DashboardBlock` interface and `dashboardBlocks` construction**

Find:

```tsx
interface DashboardBlock {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  tileClass: string;
  badgeClass?: string;
  badgeText: string;
  href: string;
}
```

Replace with:

```tsx
interface DashboardBlock {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  glow: string;
  badgeText: string;
  href: string;
}
```

Find:

```tsx
const dashboardBlocks: DashboardBlock[] = [
  ...automations.map((automation) => ({
    ...automation,
    tileClass: 'bg-primary',
    badgeText: 'Open phases',
    href: `/automation/${automation.id}`,
  })),
  ...backendBlocks.map((block) => ({
    ...block,
    tileClass: block.tile,
    badgeClass: block.badge,
    badgeText: 'Backend dashboard',
    href: `/backend/${block.id}`,
  })),
];
```

Replace with:

```tsx
const dashboardBlocks: DashboardBlock[] = [
  ...automations.map((automation) => ({
    id: automation.id,
    title: automation.title,
    description: automation.description,
    icon: automation.icon,
    glow: automation.glow,
    badgeText: 'Open phases',
    href: `/automation/${automation.id}`,
  })),
  ...backendBlocks.map((block) => ({
    id: block.id,
    title: block.title,
    description: block.description,
    icon: block.icon,
    glow: block.glow,
    badgeText: 'Backend dashboard',
    href: `/backend/${block.id}`,
  })),
];
```

- [ ] **Step 4: Replace the `Dashboard` component**

Find the entire `const Dashboard = () => ( ... );` block and replace it with:

```tsx
const Dashboard = () => (
  <main className="control-plane-scope min-h-screen p-6 md:p-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl" style={{ color: 'var(--cp-fg)' }}>
          Automation Dashboard
        </h1>
        <p className="text-base md:text-lg" style={{ color: 'var(--cp-fg-muted)' }}>
          Platform automation and backend control surfaces in a single block grid
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {dashboardBlocks.map((block, index) => {
          const BlockIcon = block.icon;

          return (
            <Link className="block" key={block.id} to={block.href}>
              <GlassPanel glow={block.glow} delay={index * 0.04} className="h-full min-h-[158px] p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: `${block.glow}1f` }}>
                    <BlockIcon className="h-6 w-6" style={{ color: block.glow }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--cp-fg)' }}>
                      {block.title}
                    </h2>
                    <p className="mt-1 text-sm" style={{ color: 'var(--cp-fg-muted)' }}>
                      {block.description}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span
                    className="cp-mono rounded-full px-2 py-1 text-[11px]"
                    style={{ backgroundColor: `${block.glow}1a`, color: block.glow }}
                  >
                    {block.badgeText}
                  </span>
                  <ArrowRight className="h-4 w-4" style={{ color: 'var(--cp-fg-subtle)' }} />
                </div>
              </GlassPanel>
            </Link>
          );
        })}
      </div>
    </div>
  </main>
);
```

- [ ] **Step 5: Replace the `BackendBlockPage` component**

Find the entire `const BackendBlockPage = () => { ... };` block and replace it with:

```tsx
const BackendBlockPage = () => {
  const { backendBlockId } = useParams();
  const block = backendBlocks.find((item) => item.id === backendBlockId);

  if (!block) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="control-plane-scope min-h-screen p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
          style={{ color: 'var(--cp-fg-muted)' }}
          to="/"
        >
          <ArrowLeft className="h-4 w-4" />
          Main Dashboard
        </Link>

        <BackendControlPlane blockId={block.id as BackendBlockId} />
      </div>
    </main>
  );
};
```

- [ ] **Step 6: Check for now-unused imports**

`Badge` and `Card`/`CardContent`/`CardHeader`/`CardTitle` are still used by `AutomationPhasesPage` and `AutomationPhasePage` later in the file — leave those imports in place. Do not remove any imports; only verify with the type-check in Step 7 that nothing is flagged as unused by the linter.

- [ ] **Step 7: Verify types and lint**

Run (from `Nexus-Modern/`):
```bash
npx tsc --noEmit -p .
npm run lint
```
Expected: both pass with zero errors. If lint flags an unused import, remove only that specific import — do not restructure surrounding code.

- [ ] **Step 8: Verify production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add Nexus-Modern/src/App.tsx
git commit -m "feat(nexus-modern): apply dark-glass redesign to dashboard grid and backend block page"
```

---

### Task 9: Manual visual verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Start the dev server**

Run (from `Nexus-Modern/`): `npm run dev`
Expected: Vite starts on `http://localhost:3002` (per the `dev` script's `--port 3002`).

- [ ] **Step 2: Visually check the top-level Dashboard grid**

Navigate to `/`. Confirm:
- Background is dark (`#020617`), not the previous light theme.
- Every card (5 automation + 6 backend = 11 total) renders as a glass tile with a colored icon square and a colored pill badge matching that block's `glow` color.
- Cards fade/rise in with a staggered delay on load (not all appearing simultaneously) unless the OS "reduce motion" setting is on, in which case they should appear instantly with no animation.
- Hovering a card shows a soft glow matching its color and a border brightening.

- [ ] **Step 3: Visually check each of the 6 backend dashboards**

Navigate to `/backend/health`, `/backend/ai`, `/backend/intent`, `/backend/orchestration`, `/backend/runtime`, `/backend/test-management` in turn. For each, confirm:
- Header glass panel shows the block icon, title, an animated `StatusPulse` dot next to the title, and the description.
- Three `MetricTile` cards render below the header with an icon, a large monospace value, and a label.
- The "Refresh" button works (click it, confirm the icon spins briefly and data reloads — check the Network tab or console for the expected API calls listed in `block.endpoints`).
- Below, the data table (or tables) renders on a darker surface with monospace first-column text and a `StatusPulse` dot + label in every status column.
- If the backend isn't running and a fetch fails, the red error panel renders instead of a crash — confirm by temporarily stopping the `.NET` backend (or just note whether it's currently running; if all 6 pages show live data with no error panel, this path is implicitly covered when the backend is later restarted and a request fails).
- If any table has zero rows, the `EmptyState` icon + message renders instead of a blank table.

- [ ] **Step 4: Accessibility spot-check**

- Enable "reduce motion" at the OS level (Windows: Settings → Accessibility → Visual effects → Animation effects → off) and reload `/` and one backend page — confirm no pulsing/staggering animation plays, content still appears immediately.
- Tab through the top-level Dashboard grid with the keyboard — confirm each card link shows a visible focus outline (this comes from the browser's default focus ring on `<a>`/`Link`; if it's invisible against the dark background, that's a real finding — report it, don't silently ship it).
- Zoom the browser to 200% on one backend page — confirm no horizontal scroll appears and text stays legible.

- [ ] **Step 5: Report results**

Summarize pass/fail for each check in Step 2-4. If anything fails, fix it in `BackendControlPlane.tsx`, `App.tsx`, `GlassPanel.tsx`, or `index.css` as appropriate, then re-run Steps 2-4 for the affected page only, and commit the fix separately (`git commit -m "fix(nexus-modern): <what was fixed>"`).
