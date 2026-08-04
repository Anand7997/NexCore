# AI Workflow Modern UI Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the AI Workflow Orchestrator feature from Nexus-Advanced (Next.js) into Nexus-Modern (Vite+React) as a new "AI Workflow" phase tile, calling nexus-api's Python backend directly, with the same visual design.

**Architecture:** Isolated new files under `Nexus-Modern/src/{lib/ai-workflow-api,components/ai-workflow}`, ported near-verbatim from `Nexus-Advanced/src/{lib/api,app/ai-workflow}`. One small backend CORS change. One small nav wiring change in `Nexus-Modern/src/App.tsx`.

**Tech Stack:** React 18, Vite, react-router-dom v6, @tanstack/react-query v5 (already installed), framer-motion (new dependency), lucide-react (already installed), Tailwind CSS, FastAPI (nexus-api, unmodified except CORS).

## Global Constraints

- Base URL for AI Workflow calls: `import.meta.env.VITE_NEXUS_API_BASE_URL`, default `http://localhost:8000/api` (per spec "Backend wiring").
- No changes to Modern UI's existing shared `components/ui/button.tsx`, existing `:root`/`.dark` CSS tokens in `index.css`, or any other existing page/component (per spec "Out of scope").
- No changes to Nexus-Advanced source files — read-only reference throughout.
- Dark-only: no light-mode support added for this feature; `isLight` is a hardcoded `false` constant, not a real theme toggle (per spec Adaptation #1).
- No new automated test suite — Nexus-Modern has none today; verification is manual (per spec "Testing").

---

### Task 1: Backend CORS — allow Nexus-Modern's dev origin

**Files:**
- Modify: `nexus-api/app/config.py:23`

**Interfaces:**
- Produces: nexus-api accepts cross-origin requests from `http://localhost:3002`.

- [ ] **Step 1: Read the current default**

Confirm the line still reads (adjust step 2 if it has drifted):
```python
cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]
```

- [ ] **Step 2: Add the Nexus-Modern origin**

```python
cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]
```

- [ ] **Step 3: Verify nexus-api starts and serves CORS headers**

Run (from `nexus-api/`): `python -m uvicorn app.main:app --port 8000` (or however it's normally started — check for an existing start script first), then in another shell:
```bash
curl -i -H "Origin: http://localhost:3002" -H "Access-Control-Request-Method: GET" -X OPTIONS http://127.0.0.1:8000/api/ai-workflows/models
```
Expected: response headers include `access-control-allow-origin: http://localhost:3002`.

- [ ] **Step 4: Commit**

```bash
git add nexus-api/app/config.py
git commit -m "feat(nexus-api): allow Nexus-Modern dev origin in CORS"
```

---

### Task 2: Nexus-Modern scaffolding — framer-motion, env var, QueryClientProvider

**Files:**
- Modify: `Nexus-Modern/package.json`
- Modify: `Nexus-Modern/src/main.tsx`
- Create: `Nexus-Modern/.env.local` (or modify existing env file — check what's already there first)
- Create: `Nexus-Modern/src/vite-env.d.ts` (modify if it already declares `ImportMetaEnv`)

**Interfaces:**
- Produces: `framer-motion` importable from any Nexus-Modern file; a mounted `QueryClient` available to any component via `@tanstack/react-query` hooks; `import.meta.env.VITE_NEXUS_API_BASE_URL` typed and readable.

- [ ] **Step 1: Install framer-motion**

Run (from `Nexus-Modern/`): `npm install framer-motion@^11`

- [ ] **Step 2: Add the env var**

Check `Nexus-Modern/.env.local` (or `.env`) for existing contents first — append rather than overwrite:
```
VITE_NEXUS_API_BASE_URL=http://localhost:8000/api
```

- [ ] **Step 3: Declare the env var type**

Read `Nexus-Modern/src/vite-env.d.ts` first. If it already has an `ImportMetaEnv` interface, add a line to it; otherwise create:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEXUS_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4: Wire QueryClientProvider**

Replace `Nexus-Modern/src/main.tsx` contents with:
```tsx
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
```

- [ ] **Step 5: Verify the dev server still boots**

Run (from `Nexus-Modern/`): `npm run dev`
Expected: Vite starts on port 3002 with no errors, existing Dashboard page still renders at `/`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/main.tsx src/vite-env.d.ts .env.local
git commit -m "feat(nexus-modern): add framer-motion, QueryClientProvider, nexus-api env var"
```

---

### Task 3: AI Workflow API layer — types, client, React Query hooks

**Files:**
- Create: `Nexus-Modern/src/lib/ai-workflow-api/types.ts`
- Create: `Nexus-Modern/src/lib/ai-workflow-api/client.ts`
- Create: `Nexus-Modern/src/lib/ai-workflow-api/aiWorkflow.ts`

**Interfaces:**
- Consumes: `import.meta.env.VITE_NEXUS_API_BASE_URL` (Task 2).
- Produces (consumed by Task 6): types `AIWorkflowState`, `AIScenarioPreview`, `AIWorkflowStateResponse`, `AIWorkflowActivityItem`, `AIScrapedCandidatePreview`, `AIWorkflowCreateRequest`, `AIWorkflowRollbackRequest`, `AIBrdExtractResponse`, `AIModelInfo`, `AIModelsResponse`, `AIScenarioConfirmRequest`, `AIReviewItem`, `AILowConfidenceLocator`, `AIReviewResponse`; hooks `useAIModels()`, `extractAIBrdFile(file: File)`, `useAIWorkflow(workflowId: string | null, enabled: boolean)`, `useCreateAIWorkflow()`, `useGenerateScenarios(workflowId: string)`, `useConfirmScenarios(workflowId: string)`, `useGenerateTestCases(workflowId: string)`, `useRollbackAIWorkflow(workflowId: string)`, `useStopAIWorkflow(workflowId: string)`, `useAIWorkflowReview(workflowId: string | null)`; class `ApiError` from `client.ts`.

- [ ] **Step 1: Copy the types**

Copy `Nexus-Advanced/src/lib/api/types.ts` lines 1099-1237 (the `// ── AI Workflow ──` section) verbatim into `Nexus-Modern/src/lib/ai-workflow-api/types.ts`, unchanged — these are plain TypeScript interfaces/types with no imports, no Next.js/zustand dependencies.

- [ ] **Step 2: Port the API client**

Create `Nexus-Modern/src/lib/ai-workflow-api/client.ts` as a copy of `Nexus-Advanced/src/lib/api/client.ts`, with exactly these changes:
- Remove the `'use client';` line (not a Next.js app).
- Replace the two base-URL constants:
```ts
const REQUEST_BASE_URL = import.meta.env.VITE_NEXUS_API_BASE_URL || 'http://localhost:8000/api';
```
  (drop `DIRECT_BASE_URL` entirely — Vite has no server-side `/api/proxy` route, so there is only one base URL, always hit directly.)
- Update the final export line to:
```ts
export { ApiError };
```
Everything else (`ApiError` class, `request()`, the `api` object with `get/post/postForm/put/patch/delete`) copies unchanged.

- [ ] **Step 3: Port the React Query hooks**

Create `Nexus-Modern/src/lib/ai-workflow-api/aiWorkflow.ts` as a copy of `Nexus-Advanced/src/lib/api/aiWorkflow.ts` in full (all of `aiWorkflowKeys`, `useAIModels`, `extractAIBrdFile`, `useAIWorkflow`, `useCreateAIWorkflow`, `useGenerateScenarios`, `useConfirmScenarios`, `useGenerateTestCases`, `useRollbackAIWorkflow`, `useStopAIWorkflow`, `useAIWorkflowReview`), with exactly these changes:
- Remove the `'use client';` line.
- Change `import { api } from './client';` — keep as-is (same relative path, file exists in this directory now).
- Change the `import type { ... } from './types';` — keep as-is.

- [ ] **Step 4: Typecheck**

Run (from `Nexus-Modern/`): `npx tsc --noEmit`
Expected: no errors referencing `lib/ai-workflow-api/*` (errors elsewhere in the pre-existing codebase, if any, are out of scope — note them but don't fix).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-workflow-api
git commit -m "feat(nexus-modern): port AI Workflow API client and React Query hooks"
```

---

### Task 4: Design tokens — scoped CSS custom properties

**Files:**
- Modify: `Nexus-Modern/src/index.css`

**Interfaces:**
- Produces: CSS custom properties `--color-bg-base`, `--color-surface-1`, `--color-surface-2`, `--color-surface-3`, `--color-surface-overlay`, `--color-fg-default`, `--color-fg-muted`, `--color-fg-subtle`, `--color-fg-inverse`, `--color-line-subtle`, `--color-line-default`, `--color-line-strong`, `--color-line-active`, all scoped under a `.ai-workflow-scope` class selector (only active on elements inside the ported feature's root div).

- [ ] **Step 1: Read the current end of the file**

Read `Nexus-Modern/src/index.css` in full first, to find a safe append point (after the existing `.dark` block and any `@layer` blocks) and confirm no existing `.ai-workflow-scope` selector already exists.

- [ ] **Step 2: Append the scoped token block**

Add to the end of `Nexus-Modern/src/index.css`:
```css
.ai-workflow-scope {
  --color-bg-base: #031118;
  --color-surface-1: #071a20;
  --color-surface-2: #0b242a;
  --color-surface-3: #10323a;
  --color-surface-overlay: rgba(3, 17, 24, 0.86);

  --color-fg-default: #ecfeff;
  --color-fg-muted: #b8d7dc;
  --color-fg-subtle: #7ea3aa;
  --color-fg-inverse: #031118;

  --color-line-subtle: rgba(148, 255, 255, 0.055);
  --color-line-default: rgba(148, 255, 255, 0.09);
  --color-line-strong: rgba(148, 255, 255, 0.16);
  --color-line-active: rgba(34, 211, 238, 0.45);

  background: var(--color-bg-base);
  color: var(--color-fg-default);
}
```

- [ ] **Step 3: Visually verify no collision**

Run `npm run dev` (from `Nexus-Modern/`), load the existing `/` Dashboard page, confirm it renders exactly as before (unaffected — the new block is scoped to a class not yet used anywhere).

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat(nexus-modern): add scoped AI Workflow design tokens"
```

---

### Task 5: Scoped Button component (ghost/glass/neon/danger variants)

**Files:**
- Create: `Nexus-Modern/src/components/ai-workflow/Button.tsx`

**Interfaces:**
- Produces: `<Button variant="ghost"|"glass"|"neon"|"danger" size="xs"|"sm"|"md" ...props>` — a `motion.button`-based component, default export... actually named export `Button`, matching Nexus-Advanced's usage (`import { Button } from '...'`).

- [ ] **Step 1: Copy the source file**

Read `Nexus-Advanced/src/components/ui/Button.tsx` in full, then create `Nexus-Modern/src/components/ai-workflow/Button.tsx` as an unchanged copy — it only depends on `class-variance-authority` (already a Nexus-Modern dependency via shadcn setup — verify with `grep class-variance-authority Nexus-Modern/package.json`; if missing, `npm install class-variance-authority`), `framer-motion` (Task 2), and a `cn()` utility.

- [ ] **Step 2: Point `cn()` at Nexus-Modern's existing utility**

Check the import line in the copied file (likely `import { cn } from '@/lib/utils';`). Confirm `Nexus-Modern/src/lib/utils.ts` exports a `cn()` function (it does — shadcn setups always include one; verify with `grep "export function cn" Nexus-Modern/src/lib/utils.ts`). If the import path differs from Nexus-Advanced's, fix it to `@/lib/utils` to match Nexus-Modern's actual file location.

- [ ] **Step 3: Typecheck**

Run (from `Nexus-Modern/`): `npx tsc --noEmit`
Expected: no errors referencing `components/ai-workflow/Button.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-workflow/Button.tsx
git commit -m "feat(nexus-modern): add scoped AI Workflow Button component"
```

---

### Task 6: Port the AI Workflow page (6-step orchestrator)

**Files:**
- Create: `Nexus-Modern/src/components/ai-workflow/AIWorkflowPage.tsx`

**Interfaces:**
- Consumes: everything from Task 3 (`lib/ai-workflow-api/*`) and Task 5 (`components/ai-workflow/Button.tsx`).
- Produces: `export default function AIWorkflowPage({ initialPlatform }: { initialPlatform?: 'web' | 'mobile' | 'api' | 'desktop' })` — consumed by Task 7.

This is a large, mechanical, near-line-for-line port of a single 2561-line source file. To avoid duplicating thousands of lines of already-read code in this plan document, the instructions below are copy-source + exact-diff instructions rather than full code blocks — the source has already been read in full during design (see spec's "File layout" section) and is stable, unchanged, read-only reference.

- [ ] **Step 1: Copy the whole source file as a starting point**

Copy the full contents of `Nexus-Advanced/src/app/ai-workflow/page.tsx` (2561 lines) into `Nexus-Modern/src/components/ai-workflow/AIWorkflowPage.tsx`.

- [ ] **Step 2: Apply the import-line adaptations**

At the top of the file, replace:
```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { /* lucide icons, unchanged */ } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUIStore } from '@/lib/stores/uiStore';
import {
  extractAIBrdFile,
  useAIModels,
  useAIWorkflow,
  useAIWorkflowReview,
  useConfirmScenarios,
  useCreateAIWorkflow,
  useGenerateScenarios,
  useGenerateTestCases,
  useRollbackAIWorkflow,
  useStopAIWorkflow,
} from '@/lib/api/aiWorkflow';
import type {
  AIModelInfo,
  AIScenarioPreview,
  AIScrapedCandidatePreview,
  AIWorkflowState,
  AIWorkflowStateResponse,
} from '@/lib/api/types';
```
with:
```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { /* same lucide icon list, unchanged */ } from 'lucide-react';
import { Button } from './Button';
import {
  extractAIBrdFile,
  useAIModels,
  useAIWorkflow,
  useAIWorkflowReview,
  useConfirmScenarios,
  useCreateAIWorkflow,
  useGenerateScenarios,
  useGenerateTestCases,
  useRollbackAIWorkflow,
  useStopAIWorkflow,
} from '../../lib/ai-workflow-api/aiWorkflow';
import type {
  AIModelInfo,
  AIScenarioPreview,
  AIScrapedCandidatePreview,
  AIWorkflowState,
  AIWorkflowStateResponse,
} from '../../lib/ai-workflow-api/types';
```
(Drop `'use client'` — not Next.js. Drop the `useUIStore` import entirely — replaced in Step 3. Keep the full, unchanged lucide-react icon import list from the source file: `Activity, AlertTriangle, BookOpen, Bot, CheckCircle2, ChevronLeft, Circle, ClipboardList, Code2, Copy, Cpu, Database, ExternalLink, FileText, Globe, ListChecks, Loader2, Monitor, MousePointerClick, Play, Radio, RefreshCw, Route, Search, Settings2, SlidersHorizontal, Smartphone, Sparkles, Target, Upload, Wand2, Zap, XCircle`.)

- [ ] **Step 3: Replace every `useUIStore` usage with a hardcoded constant**

There are exactly two call sites in the source (in `InputStep` and in the default-exported `AIWorkflowPage`):
```tsx
const isLight = useUIStore((s) => s.theme === 'light');
```
Replace both occurrences with:
```tsx
const isLight = false;
```
Leave every downstream `isLight ? X : Y` conditional untouched — they now always evaluate to the dark-theme (`Y`) branch, which is the intended behavior per spec Adaptation #1.

- [ ] **Step 4: Rename the default export's props to accept `initialPlatform`**

Change:
```tsx
export default function AIWorkflowPage() {
  const isLight = false;
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<StepId>('input');
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());
  const [selectedModel, setSelectedModel] = useState<AIModelInfo | null>(null);
  const [errorStep, setErrorStep] = useState<StepId | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<WorkflowPlatform>('web');
```
to:
```tsx
export default function AIWorkflowPage({
  initialPlatform = 'web',
}: {
  initialPlatform?: WorkflowPlatform;
}) {
  const isLight = false;
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<StepId>('input');
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());
  const [selectedModel, setSelectedModel] = useState<AIModelInfo | null>(null);
  const [errorStep, setErrorStep] = useState<StepId | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<WorkflowPlatform>(initialPlatform);
```
(`WorkflowPlatform` is already defined earlier in the same file — `type WorkflowPlatform = 'web' | 'mobile' | 'api' | 'desktop';` — no new import needed.)

- [ ] **Step 5: Wrap the returned JSX root in the scoped class**

Find the outermost returned element:
```tsx
  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-[var(--color-bg-base)]">
```
Change the `className` to also include the scope class:
```tsx
  return (
    <div className="ai-workflow-scope relative flex h-full min-h-0 overflow-hidden bg-[var(--color-bg-base)]">
```
This is the only place the scope class needs to be added — the CSS variables cascade to every descendant (all step components, panels, etc. render inside this div).

- [ ] **Step 6: Fix the two dead `background: 'var(--light-bg-none)'` decorative layers**

The source file has two decorative `<div aria-hidden>` background-pattern layers early in the return block that reference a token (`--light-bg-none`) not defined anywhere (dead/unused in the source too — confirmed not in `globals.css`). Leave them exactly as-is; they render as `none` and are visually inert in both codebases. Do not "fix" or remove them — this must match the source's actual current behavior, not a guessed improvement.

- [ ] **Step 7: Typecheck**

Run (from `Nexus-Modern/`): `npx tsc --noEmit`
Expected: no errors referencing `components/ai-workflow/AIWorkflowPage.tsx`. Fix any type errors that surface by comparing against the exact types produced in Task 3 — do not loosen types with `any` to silence errors; trace the mismatch back to source and correct it.

- [ ] **Step 8: Commit**

```bash
git add src/components/ai-workflow/AIWorkflowPage.tsx
git commit -m "feat(nexus-modern): port AI Workflow 6-step orchestrator page"
```

---

### Task 7: Wire into navigation

**Files:**
- Modify: `Nexus-Modern/src/App.tsx`
- Create: `Nexus-Modern/src/components/ai-workflow/index.ts`

**Interfaces:**
- Consumes: `AIWorkflowPage` default export (Task 6).
- Produces: route `/automation/:automationId/ai-workflow` renders the ported feature for every automation type.

- [ ] **Step 1: Add the barrel export**

Create `Nexus-Modern/src/components/ai-workflow/index.ts`:
```ts
export { default } from './AIWorkflowPage';
```

- [ ] **Step 2: Import it in App.tsx**

In `Nexus-Modern/src/App.tsx`, add near the other dashboard imports (after `import CicdPipelineDashboard from '@/components/CicdPipelineDashboard';`):
```tsx
import AIWorkflowPage from '@/components/ai-workflow';
```
Also add `Sparkles` to the existing `lucide-react` import list at the top of the file (it currently imports `ArrowLeft, ArrowRight, BarChart3, ClipboardList, Code2, Globe, Layers3, Lightbulb, Monitor, Play, Server, ServerCog, Smartphone, type LucideIcon` — add `Sparkles` alphabetically).

- [ ] **Step 3: Extend `PhaseId` and `phases`**

Change:
```tsx
type PhaseId =
  | 'requirements'
  | 'planning'
  | 'development'
  | 'execution'
  | 'reporting'
  | 'cicd';
```
to:
```tsx
type PhaseId =
  | 'requirements'
  | 'planning'
  | 'development'
  | 'execution'
  | 'reporting'
  | 'cicd'
  | 'ai-workflow';
```
Add a new entry to the end of the `phases: PhaseBlock[]` array (after the `cicd` entry):
```tsx
  {
    id: 'ai-workflow',
    title: 'AI Workflow',
    phase: 'AI',
    description: 'Generate scenarios, test cases, and executable steps from a BRD with AI',
    icon: Sparkles,
    border: 'border-l-violet-600',
    hoverBorder: 'hover:border-violet-300',
    tile: 'bg-violet-500',
    badge: 'bg-violet-100 text-violet-800 border-violet-200',
    arrow: 'text-violet-500',
  },
```

- [ ] **Step 4: Render it in `PhaseContent`, mapping automation type to platform**

Change:
```tsx
const PhaseContent = ({ phaseId }: { phaseId: PhaseId }) => {
```
to:
```tsx
const PhaseContent = ({ phaseId, automationId }: { phaseId: PhaseId; automationId?: string }) => {
```
Add, as the first branch inside the function body (before the existing `if (phaseId === 'requirements')` check):
```tsx
  if (phaseId === 'ai-workflow') {
    const platform =
      automationId === 'desktop' || automationId === 'mobile' || automationId === 'api'
        ? automationId
        : 'web';
    return <AIWorkflowPage initialPlatform={platform} />;
  }
```

- [ ] **Step 5: Pass `automationId` through at the call site**

Find where `<PhaseContent phaseId={phase.id} />` is rendered inside `AutomationPhasePage` (inside the `<div className="rounded-lg border bg-card p-4 shadow-sm">` block) and change it to:
```tsx
<PhaseContent phaseId={phase.id} automationId={automation.id} />
```

- [ ] **Step 6: Typecheck and smoke-test in the browser**

Run (from `Nexus-Modern/`): `npx tsc --noEmit`, then `npm run dev`.
Navigate to `http://localhost:3002/automation/web/ai-workflow` — expect the ported page to render its Input step (dark-themed card, BRD dropzone, platform picker, project/page name fields, "Start AI Workflow" neon button). Confirm the 7-tile phase grid at `/automation/web` now shows an "AI Workflow" tile with a violet left-border accent alongside the existing 6.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/ai-workflow/index.ts
git commit -m "feat(nexus-modern): add AI Workflow phase tile to automation nav"
```

---

### Task 8: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Start nexus-api**

From `nexus-api/`, start the FastAPI server on port 8000 (check for an existing start script — e.g. `run.py`, or `uvicorn app.main:app --reload --port 8000`).

- [ ] **Step 2: Start Nexus-Modern**

From `Nexus-Modern/`: `npm run dev` (port 3002).

- [ ] **Step 3: Run the full 6-step flow**

Navigate to `http://localhost:3002/automation/web/ai-workflow`. Paste a short BRD (e.g. "As a user I want to log in with email and password"), enter a real reachable URL, a project name, and a page name. Click "Start AI Workflow". Step through: model selection → scenario selection → test generation (watch the token-stream + activity feed animate) → discovery/MCP panel (if the target URL is reachable, confirm scrape candidates populate) → review (confirm summary tiles, needs-review list, "Export JSON" button all render).

- [ ] **Step 4: Compare against Nexus-Advanced side-by-side**

Run Nexus-Advanced's own dev server (check its `package.json` for the dev script/port) and run the identical BRD/URL through its `/ai-workflow` page. Confirm visual parity: same dark surface/glow palette, same step layout, same animations firing (progress bars, staggered card reveals, scan-line pulses on the MCP panel).

- [ ] **Step 5: Note any drift**

If anything differs from Nexus-Advanced's behavior in a way that isn't an intentional adaptation from the spec (dark-only theme, direct nexus-api base URL), record it — do not silently "fix" it with a new design choice; flag it for a follow-up decision instead.
