# Main Dashboard Automation Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Main Dashboard" page to Nexus-Advanced showing the same 5 automation-type cards (Web, Desktop, Mobile, API, Unified) that exist in Nexus-Modern's root dashboard, reachable from the sidebar, each linking to a placeholder detail route.

**Architecture:** One shared config module (`src/lib/automations.ts`) is the single source of truth for the 5 automations (id/title/description/icon/color), consumed by both the new `/main-dashboard` page (renders all 5 as cards) and a new dynamic `/automation/[id]` route (renders one placeholder page per id). A new sidebar entry links to `/main-dashboard`. No backend/data wiring — this is a static content port.

**Tech Stack:** Next.js App Router (this repo's pinned/patched Next — read `node_modules/next/dist/docs/` before touching routing conventions per `AGENTS.md`), React, TypeScript, Tailwind CSS v4 (CSS-variable tokens, no `tailwind.config` color keys), framer-motion, lucide-react.

## Global Constraints

- Reuse Nexus-Advanced's existing CSS variables only (`--color-surface-1`, `--color-line-default`, `--color-fg-default`, `--color-fg-muted`, `--color-fg-subtle`, `--color-accent-default`) — no new global tokens, no Modern's `--cp-*` vars, no `cp-glass` class.
- Card copy (title/description) and per-card accent color must match `Nexus-Modern/src/App.tsx:117-153` exactly (verbatim strings).
- Card layout mirrors `Nexus-Modern/src/App.tsx:277-308`: icon tile + title + description, then a badge pill (text: `Open phases`) + trailing arrow.
- No unit test runner exists in Nexus-Advanced (only `eslint`, `next build` type-checking, and Playwright e2e for API/regression — no per-page UI test convention exists for static pages like `/agents` or `/matrix`). Verification for this plan is `npm run lint`, `npm run build`, and a manual dev-server check (navigate + screenshot), not new automated tests.
- Follow existing repo pattern of defining small presentational sub-components inline inside the page file that uses them (see `ProjectCard`, `MetricCardComponent` inside `src/app/page.tsx`) rather than extracting one-off components to `src/components/dashboard/`.

---

### Task 1: Shared automations config module

**Files:**
- Create: `Nexus-Advanced/src/lib/automations.ts`

**Interfaces:**
- Produces: `AutomationId = 'web' | 'desktop' | 'mobile' | 'api' | 'unified'`; `interface AutomationConfig { id: AutomationId; title: string; description: string; icon: LucideIcon; color: string }`; `export const AUTOMATIONS: AutomationConfig[]`; `export function getAutomation(id: string): AutomationConfig | undefined`.

- [ ] **Step 1: Create the config file**

```ts
// Nexus-Advanced/src/lib/automations.ts
import { Globe, Monitor, Smartphone, Server, Layers3, type LucideIcon } from 'lucide-react';

export type AutomationId = 'web' | 'desktop' | 'mobile' | 'api' | 'unified';

export interface AutomationConfig {
  id: AutomationId;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

export const AUTOMATIONS: AutomationConfig[] = [
  {
    id: 'web',
    title: 'Web Automation',
    description: 'Browser pages, UI flows, locators, test cases, and execution.',
    icon: Globe,
    color: '#60a5fa',
  },
  {
    id: 'desktop',
    title: 'Desktop Automation',
    description: 'Native desktop workflows, modules, screens, and execution.',
    icon: Monitor,
    color: '#94a3b8',
  },
  {
    id: 'mobile',
    title: 'Mobile Automation',
    description: 'Android and iOS pages, gestures, cases, and device runs.',
    icon: Smartphone,
    color: '#34d399',
  },
  {
    id: 'api',
    title: 'API Automation',
    description: 'Services, endpoints, validations, payload cases, and runs.',
    icon: Server,
    color: '#fbbf24',
  },
  {
    id: 'unified',
    title: 'Unified Automation',
    description: 'Web, Desktop, Mobile, and API workflows in one suite.',
    icon: Layers3,
    color: '#a78bfa',
  },
];

export function getAutomation(id: string): AutomationConfig | undefined {
  return AUTOMATIONS.find((automation) => automation.id === id);
}
```

- [ ] **Step 2: Type-check**

Run: `cd Nexus-Advanced && npx tsc --noEmit`
Expected: no errors referencing `src/lib/automations.ts`.

- [ ] **Step 3: Commit**

```bash
git add Nexus-Advanced/src/lib/automations.ts
git commit -m "feat(nexus-advanced): add shared automations config"
```

---

### Task 2: Main Dashboard page with 5 automation cards

**Files:**
- Create: `Nexus-Advanced/src/app/main-dashboard/page.tsx`

**Interfaces:**
- Consumes: `AUTOMATIONS` from `@/lib/automations` (Task 1) — array of `AutomationConfig { id, title, description, icon, color }`.

- [ ] **Step 1: Write the page**

```tsx
// Nexus-Advanced/src/app/main-dashboard/page.tsx
'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { AUTOMATIONS, type AutomationConfig } from '@/lib/automations';

function AutomationCard({ automation, index }: { automation: AutomationConfig; index: number }) {
  const Icon = automation.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="h-full"
    >
      <Link
        href={`/automation/${automation.id}`}
        className="block h-full min-h-[158px] rounded-2xl border p-5 transition-all duration-300"
        style={{
          background: 'var(--color-surface-1)',
          borderColor: 'var(--color-line-default)',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.boxShadow = `0 0 32px ${automation.color}26`;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${automation.color}1f` }}
          >
            <Icon className="h-6 w-6" style={{ color: automation.color }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-fg-default)' }}>
              {automation.title}
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-fg-muted)' }}>
              {automation.description}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span
            className="rounded-full px-2 py-1 font-mono text-[11px]"
            style={{ backgroundColor: `${automation.color}1a`, color: automation.color }}
          >
            Open phases
          </span>
          <ArrowRight className="h-4 w-4" style={{ color: 'var(--color-fg-subtle)' }} />
        </div>
      </Link>
    </motion.div>
  );
}

export default function MainDashboardPage() {
  return (
    <main className="flex min-h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-4 sm:px-5 lg:px-7 lg:py-5">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl" style={{ color: 'var(--color-fg-default)' }}>
            Main Dashboard
          </h1>
          <p className="text-base md:text-lg" style={{ color: 'var(--color-fg-muted)' }}>
            Web, Desktop, Mobile, API, and Unified automation in a single grid.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {AUTOMATIONS.map((automation, index) => (
            <AutomationCard key={automation.id} automation={automation} index={index} />
          ))}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd Nexus-Advanced && npx tsc --noEmit`
Expected: no errors referencing `src/app/main-dashboard/page.tsx`.

- [ ] **Step 3: Lint**

Run: `cd Nexus-Advanced && npm run lint`
Expected: no new errors/warnings for the new file.

- [ ] **Step 4: Commit**

```bash
git add Nexus-Advanced/src/app/main-dashboard/page.tsx
git commit -m "feat(nexus-advanced): add Main Dashboard page with 5 automation cards"
```

---

### Task 3: Placeholder automation detail route

**Files:**
- Create: `Nexus-Advanced/src/app/automation/[id]/page.tsx`

**Interfaces:**
- Consumes: `getAutomation(id: string)` from `@/lib/automations` (Task 1).

- [ ] **Step 1: Write the dynamic route**

```tsx
// Nexus-Advanced/src/app/automation/[id]/page.tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getAutomation } from '@/lib/automations';

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const automation = getAutomation(id);

  if (!automation) {
    notFound();
  }

  const Icon = automation.icon;

  return (
    <main className="flex min-h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-4 sm:px-5 lg:px-7 lg:py-5">
        <Link
          href="/main-dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Main Dashboard
        </Link>

        <div
          className="rounded-2xl border p-6"
          style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-line-default)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${automation.color}1f` }}
            >
              <Icon className="h-6 w-6" style={{ color: automation.color }} />
            </div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-fg-default)' }}>
              {automation.title}
            </h1>
          </div>
          <p className="mt-3 text-sm" style={{ color: 'var(--color-fg-muted)' }}>
            {automation.description}
          </p>
          <p className="mt-6 text-sm" style={{ color: 'var(--color-fg-subtle)' }}>
            Coming soon.
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd Nexus-Advanced && npx tsc --noEmit`
Expected: no errors referencing `src/app/automation/[id]/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "Nexus-Advanced/src/app/automation/[id]/page.tsx"
git commit -m "feat(nexus-advanced): add placeholder automation detail route"
```

---

### Task 4: Sidebar nav entry

**Files:**
- Modify: `Nexus-Advanced/src/components/layout/Sidebar.tsx:7-28` (icon imports), `Nexus-Advanced/src/components/layout/Sidebar.tsx:45-53` (`command` group items)

**Interfaces:**
- Consumes: existing `NavItem`/`NavGroup` types and `GROUPS` array already defined in this file (no new types).

- [ ] **Step 1: Add the `Layers3` icon import**

In `Nexus-Advanced/src/components/layout/Sidebar.tsx`, the import block currently reads (lines 7-28):

```tsx
import {
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  Brain,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  FlaskConical,
  GitBranch,
  Grid3X3,
  LayoutDashboard,
  Monitor,
  Network,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Target,
} from 'lucide-react';
```

Change it to add `Layers3` in alphabetical position:

```tsx
import {
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  Brain,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  FlaskConical,
  GitBranch,
  Grid3X3,
  LayoutDashboard,
  Layers3,
  Monitor,
  Network,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Target,
} from 'lucide-react';
```

- [ ] **Step 2: Add the nav item to the `command` group**

The `command` group currently reads (lines 45-53):

```tsx
  {
    id: 'command',
    label: '',
    items: [
      { href: '/', label: 'Workspace', icon: LayoutDashboard },
      { href: '/workspace/new', label: 'Create Project', icon: Plus },
    ],
  },
```

Change it to:

```tsx
  {
    id: 'command',
    label: '',
    items: [
      { href: '/', label: 'Workspace', icon: LayoutDashboard },
      { href: '/main-dashboard', label: 'Main Dashboard', icon: Layers3 },
      { href: '/workspace/new', label: 'Create Project', icon: Plus },
    ],
  },
```

- [ ] **Step 3: Type-check and lint**

Run: `cd Nexus-Advanced && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add Nexus-Advanced/src/components/layout/Sidebar.tsx
git commit -m "feat(nexus-advanced): add Main Dashboard sidebar entry"
```

---

### Task 5: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `cd Nexus-Advanced && npm run dev` (background)
Expected: server starts on its configured port without compile errors.

- [ ] **Step 2: Navigate and check the sidebar**

Open the app in a browser. Confirm a "Main Dashboard" entry appears in the sidebar's top group, between "Workspace" and "Create Project", and is not visually identical/colliding with any other icon in that group.

- [ ] **Step 3: Check the Main Dashboard page**

Click "Main Dashboard". Confirm `/main-dashboard` renders 5 cards in order: Web Automation, Desktop Automation, Mobile Automation, API Automation, Unified Automation — each with the icon/color/description from Task 1, a rounded card with hover glow, an "Open phases" badge, and a trailing arrow.

- [ ] **Step 4: Check each placeholder route**

Click each of the 5 cards in turn. Confirm each navigates to `/automation/<id>` and renders that automation's icon/title/description plus "Coming soon.", with a working "Main Dashboard" back-link.

- [ ] **Step 5: Check an invalid automation id**

Navigate to `/automation/does-not-exist`. Confirm Next's not-found page renders (via `notFound()`), not a crash.

- [ ] **Step 6: Full build check**

Run: `cd Nexus-Advanced && npm run build`
Expected: build succeeds with no type or lint errors from the new/modified files.

- [ ] **Step 7: Stop the dev server**

Stop the background `npm run dev` process started in Step 1.
