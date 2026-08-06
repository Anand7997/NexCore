# Backend Control Plane Dashboard Visual Upgrade

## Problem

`Nexus-Modern/src/components/BackendControlPlane.tsx` powers all 6 backend dashboards (Health & Readiness, AI Gateway, Intent Control Plane, Execution Orchestration, Runtime Fleet, Test Management). They already fetch real data from the .NET backend and render correctly, but visually are plain shadcn tables with flat text badges — no motion, no status affordance beyond a colored `Badge`.

`Nexus-Advanced` has a polished dark-glass dashboard aesthetic (`GlassCard`, `MetricCard`, `StatusBadge`, `StatusPulse`, `NodeHealthIndicator`) using framer-motion for entrance animation and animated status dots. We want to port the *visual language* (not the literal dark-glass theme, since Modern supports light/dark toggle and most of the app is light-first) into Modern's existing dashboards.

## Scope

All 6 `BackendControlPlane` blocks get the same upgrade, since they all render through shared `renderMetrics()` / `renderContent()` / header code.

## Approach

Theme-aware, not a forced dark-glass scope (unlike the existing `.ai-workflow-scope` used by the AI Workflow page). Cards continue to use Modern's `--card` / `--foreground` / `--border` CSS variable tokens so they respect the app's light/dark toggle. Only the status *dot* itself uses a fixed semantic hex (green/blue/amber/red/slate) via inline style + glow — this is intentional, since a status color should read the same in light or dark mode.

Existing tables and their columns are unchanged — this is additive polish, not a data/layout rework.

## New files

- `Nexus-Modern/src/lib/status.ts` — `getStatusTone(status: string): string` mapping arbitrary backend status strings (`live/ready/healthy/online/success/running/queued/busy/degraded/error/offline/failed/blocked/cancelled/skipped/unavailable`, case-insensitive, unknown → slate) to a semantic hex color.
- `Nexus-Modern/src/components/backend/StatusPulse.tsx` — animated dot (framer-motion ring pulse for "active" tones: running/busy/queued) + optional text label, colored via `getStatusTone`. Ported from `Nexus-Advanced/src/components/ui/StatusPulse.tsx`, decoupled from Advanced's `ExecutionStatus` type (takes a plain string).
- `Nexus-Modern/src/components/backend/MetricTile.tsx` — icon + big value + label metric card with hover glow and fade/stagger-in via framer-motion. Ported from `Nexus-Advanced/src/components/ui/MetricCard.tsx`, restyled onto `bg-card`/`border-border` so it works in both themes (Advanced's version hardcodes a dark `glass` class).

## Changed files

`Nexus-Modern/src/components/BackendControlPlane.tsx`:
- Header `CardTitle` gets a `StatusPulse` next to it reflecting the block's primary signal:
  - `health` → `live.status`
  - `ai` → "running" if any job queued/running else "success"
  - `intent` → "success" if runtime validation shows all platforms ready else "degraded"
  - `orchestration` → "running" if any execution running else "success"
  - `runtime` → "error" if any agent status is `error`/`offline`, else "success"
  - `test-management` → "success" if any executions exist else "skipped"
- `renderMetrics()` output renders as `MetricTile` cards (staggered `delay` prop) instead of the current plain `div` grid. Same 3 metrics per block, same labels/values — just a richer visual per tile, each with a small semantic icon (e.g. `Activity`, `Clock`, `AlertCircle` chosen per metric meaning).
- Table status cells — the Live/Health/Ready badges in the health view, and the status column in the AI jobs / orchestration executions / runtime agents / runtime queue / test-management executions tables — render a `StatusPulse` dot next to the existing text instead of plain text-only.

No backend/API changes. No new dependencies (`framer-motion`, `lucide-react` already present in `Nexus-Modern/package.json`).

## Out of scope

- No change to `renderTable` column structure or data fetching logic.
- No change to the dashboard grid / routing in `App.tsx`.
- No literal copy of Advanced's dark-glass `.glass` background — that stays exclusive to the AI Workflow page's existing `.ai-workflow-scope`.
