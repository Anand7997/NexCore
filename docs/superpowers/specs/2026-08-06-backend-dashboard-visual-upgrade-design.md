# Backend Control Plane Dashboard Redesign (v2 — supersedes v1)

> v1 of this spec (theme-aware light/dark polish of the existing shadcn tables) was rejected by the user: "i didnt liked any dashboard, redesign it with a great passion, build like a pro UI/UX designer." This is the replacement design.

## Problem

`Nexus-Modern`'s backend dashboards (Health & Readiness, AI Gateway, Intent Control Plane, Execution Orchestration, Runtime Fleet, Test Management) and the top-level Dashboard picker grid look like generic shadcn admin boilerplate — flat white cards, plain tables, text-only status badges. `Nexus-Advanced` already has a premium dark-glass aesthetic in this same repo (`GlassCard`, `MetricCard`, `StatusPulse`, `NodeHealthIndicator`, framer-motion). The `ui-ux-pro-max` design engine, queried for "SaaS observability admin dashboard glassmorphism dark mode dense", recommends exactly that direction: **Modern Dark (Cinema)** style — dark-mode-primary, glassmorphism, glow, Fira Code/Fira Sans, dense dashboard spacing — and flags "light mode default" as an anti-pattern for this product type.

## Direction

Dark-glass, dense, ops-console aesthetic — permanently dark regardless of the app's light/dark toggle, the same way the AI Workflow page already scopes itself dark via `.ai-workflow-scope`. This is not a data or backend change — purely presentational, same endpoints, same data shapes.

## Scope

Both of these get the redesign (confirmed with user):
1. Top-level Dashboard picker grid (`Dashboard` component in `App.tsx`) — the block-selector cards.
2. All 6 backend detail pages (`BackendBlockPage` / `BackendControlPlane.tsx`) — one design language across both.

The rest of the app (automation phase dashboards, AI Workflow, etc.) is untouched.

## Design tokens

New scoped CSS class `.control-plane-scope` in `Nexus-Modern/src/index.css`, modeled after the existing `.ai-workflow-scope` block:

- `--cp-bg-base: #020617`
- `--cp-surface-1: #0f172a` (glass panel base, ~62% opacity + `backdrop-filter: blur(16px) saturate(140%)`)
- `--cp-surface-2: #1a1e2f` (raised tiles, tables)
- `--cp-border: rgba(148,163,184,0.12)` default / `rgba(148,163,184,0.22)` hover
- `--cp-fg: #f8fafc`, `--cp-fg-muted: #94a3b8`, `--cp-fg-subtle: #64748b`
- Accent per block reuses each block's existing accent hue (emerald/violet/blue/amber/cyan/rose) — these already exist as Tailwind classes in `backendBlocks`, just re-themed for dark glass (glow via `box-shadow`/`radial-gradient`, not flat `bg-*-100` badges).
- Typography: `Fira Sans` for labels/body, `Fira Code` for all data — IDs, timestamps, percentages, counts (tabular figures, `font-variant-numeric: tabular-nums`).
- Both fonts added via `@import` in `index.css` (Google Fonts), scoped so they only apply inside `.control-plane-scope` — the rest of the app keeps "Public Sans".

## New components (`Nexus-Modern/src/components/backend/`)

- `StatusPulse.tsx` — animated dot + optional ring pulse (framer-motion) for "active" tones (running/busy/queued), colored via a new `getStatusTone(status: string): string` helper in `Nexus-Modern/src/lib/status.ts` (semantic hex: emerald=healthy/ready/online/success, blue=running/busy, amber=queued/degraded, red=error/failed/offline/blocked, slate=unknown/skipped/cancelled — case-insensitive substring match). Ported from `Nexus-Advanced/src/components/ui/StatusPulse.tsx`, decoupled from Advanced's `ExecutionStatus` union to accept any string.
- `GlassPanel.tsx` — the glass card primitive (border, blur, optional glow-on-hover keyed to a block accent, optional framer-motion fade+rise entrance with `delay`). Ported from `Nexus-Advanced/src/components/ui/GlassCard.tsx`, generalized (no Next.js `'use client'` needed, no hardcoded `.glass` class dependency — inlines the token-based styles so it isn't coupled to the `.ai-workflow-scope` class).
- `MetricTile.tsx` — icon + large tabular-figure value + label, ambient radial-gradient glow on hover, stagger-in animation. Ported from `Nexus-Advanced/src/components/ui/MetricCard.tsx`.
- `EmptyState.tsx` — icon + message for empty tables/lists, replacing today's bare `<p>No X yet.</p>` strings.

## Page changes

`Dashboard` (top-level grid, in `App.tsx`):
- Wrap in `.control-plane-scope`.
- Cards become `GlassPanel`s with per-block glow color, icon tile, staggered entrance (30-50ms per card), hover lift + glow — same click-through behavior and routes as today.

`BackendBlockPage` + `BackendControlPlane.tsx`:
- Wrap in `.control-plane-scope`.
- Header becomes a large `GlassPanel` hero: block icon in a glow tile, title, description, a `StatusPulse` reflecting the block's primary signal (mapping unchanged from v1 spec — health→`live.status`, ai→running if any job queued/running else success, intent→success if all platforms ready else degraded, orchestration→running if any execution running, runtime→error if any agent error/offline, test-management→success if any executions exist else skipped), API base + Refresh button restyled to match (icon button, spinner on refresh already exists via `RefreshCw`, just re-skinned).
- `renderMetrics()` output becomes a row of `MetricTile`s (replaces the current plain grid of `div`s) — same 3 metrics per block, same labels/values, one semantic icon per metric (e.g. `Activity`/`Clock`/`AlertCircle` chosen per metric meaning).
- Tables (`renderTable` / `renderContent`) restyled onto `--cp-surface-2`: monospace tabular data cells, status columns get `StatusPulse` + text instead of bare text, hover row highlight, empty states use the new `EmptyState` component instead of a bare paragraph.
- Endpoint badges footer restyled as small monospace chips on the glass surface.

## Out of scope

- No backend/API changes.
- No change to routing (`App.tsx` routes stay `/`, `/backend/:id`, `/automation/:id[/:phase]`).
- No change to any other page's theme (automation dashboards, AI Workflow scope, etc.).
- No new runtime dependencies beyond Google Fonts import — `framer-motion` and `lucide-react` are already present in `Nexus-Modern/package.json`.

## Risks / notes

- Fira Code/Fira Sans `@import` adds a network font fetch — scope it so it only loads/applies when `.control-plane-scope` is mounted (still an eager `@import` in the stylesheet, matching how `.ai-workflow-scope` already does its own scoped design tokens — acceptable, same precedent already in the codebase).
- Must keep contrast ratios ≥4.5:1 for body text and ≥3:1 for large/status text against the `#020617`/`#0f172a` surfaces (dark theme, checked against the ui-ux-pro-max color set which was generated with this pairing).
- Respect `prefers-reduced-motion` for all entrance/pulse animations (framer-motion `useReducedMotion` or a CSS media query fallback).
