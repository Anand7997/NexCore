# Dashboard density fix: remove global zoom, rework AI Workflow spacing

## Problem

User feedback: all Nexus-Modern dashboards feel congested, AI Workflow named
as the worst example. Investigation found two distinct, additive causes:

1. **App-wide 90% shrink.** `Nexus-Modern/src/index.css:106` applies
   `zoom: var(--app-zoom)` to `<body>`, with `--app-zoom: 0.9` defined at
   `index.css:8`. This scales every dashboard's rendered output to 90% of its
   authored size, app-wide — a `text-sm` (14px authored) renders at ~12.6px.
   `app-zoom` has no other usage anywhere in `Nexus-Modern/src` (confirmed via
   grep) — it exists only to be read at line 106.
2. **AI Workflow's own sizing is an outlier.** The other 6 phase dashboards
   (Requirements/Planning/Development/Execution/Reporting/Cicd) exclusively
   use Tailwind's named type scale (`text-xs` and up, 12px+) and lean on
   `p-4`/`p-6`/`p-8` padding. `AIWorkflowPage.tsx` (the file ported from
   Nexus-Advanced in the prior session) uses arbitrary `text-[9px]`/
   `text-[10px]`/`text-[11px]` throughout and tight `p-2`/`p-2.5`/`p-3`
   padding — meaningfully smaller/tighter than every other dashboard, on top
   of the 90% shrink from cause #1.

## Scope

- Fix #1 (global zoom) — affects all 7 dashboards at once.
- Fix #2 (AI Workflow typography/spacing) — rework
  `Nexus-Modern/src/components/ai-workflow/AIWorkflowPage.tsx` to match the
  other 6 dashboards' conventions.
- Explicitly OUT of scope: `AutomationDevelopmentDashboard.tsx` (the next-
  tightest of the other 6, `p-2` used 40×) — deferred; revisit only if it
  still feels tight after the zoom fix lands. No other dashboard files are
  touched. No changes to the shared `AutomationPhasePage` shell in `App.tsx`
  (outer `max-w-7xl`/padding stays as-is for all 7 dashboards).

## Fix #1: Remove the global zoom

In `Nexus-Modern/src/index.css`:
- Remove `--app-zoom: 0.9;` (index.css:8).
- Remove `zoom: var(--app-zoom);` (index.css:106).

No replacement needed — removing the property entirely restores 100% scale,
which is what every dashboard was actually authored against (their Tailwind
class choices already assume 1:1 rendering).

## Fix #2: AI Workflow typography/spacing rework

Systematic size-tier bump applied throughout `AIWorkflowPage.tsx`, preserving
all logic/structure/behavior exactly — this is a styling-only pass, no JSX
structure, props, state, or handlers change. Mapping used throughout:

| Element type | Current | New |
|---|---|---|
| Micro labels/badges (smallest text) | `text-[8px]`, `text-[9px]` | `text-[10px]` |
| Secondary/meta text | `text-[10px]` | `text-xs` (12px) |
| Body/primary text | `text-[11px]`, `text-xs` (12px) used as body | `text-sm` (14px) |
| Headings already using named sizes (`text-lg`, `text-xl`, `text-[22px]`) | unchanged | unchanged |
| Tight card/panel padding | `p-2`, `p-2.5` | `p-3`, `p-4` |
| Medium padding | `p-3` | `p-4` |
| Larger container padding | `p-4`, `p-5` | `p-5`, `p-6` |
| Tight gaps | `gap-1`, `gap-1.5`, `space-y-1`, `space-y-1.5` | `gap-2`, `space-y-2` |
| Medium gaps | `gap-2`, `gap-2.5`, `space-y-2` | `gap-3`, `space-y-3` |
| Small icons (`size={9}`–`size={13}`) | as-is | bumped one step (e.g. `size={9}`→`size={11}`, `size={13}`→`size={15}`) to stay proportional to the larger text |
| Sidebar widths (`w-72` left, `w-60` right) | 288px / 240px | `w-80` (320px) / `w-72` (288px) — gives the larger text room without new truncation |

This is not a mechanical global find-replace (context matters — e.g. a
`text-[9px]` badge inside a dense candidate-stream row should become
`text-[10px]`, not jump straight to `text-sm`, or the MCP candidate list
would overflow its fixed-height scroll container). Each occurrence is
adjusted per the table above using judgment about its role, then the whole
file is re-verified against the mapping for consistency.

No animation, data-fetching, or business logic changes. `framer-motion`
transition values, `AnimatePresence` usage, and all React Query hook wiring
stay untouched.

## Testing

- `npx tsc --noEmit` — must stay at 0 errors (no logic changed, but full
  rewrite risks a stray typo).
- Manual visual check via chrome-devtools MCP: screenshot
  `/automation/web/ai-workflow` before/after, confirm text is legible at
  100% zoom without any layout overflow/clipping in the MCP candidate list,
  sidebar timelines, or metric card grids.
- Manual visual check on at least one other dashboard (e.g.
  `/automation/web/requirements`) before/after the zoom removal, to confirm
  it now renders at full size with no broken layout (their spacing was
  authored assuming no zoom, so removing it should only make things bigger,
  not break anything — but confirm visually).
- No automated test suite exists for Nexus-Modern (consistent with prior
  session's spec) — verification is manual/visual, as before.
