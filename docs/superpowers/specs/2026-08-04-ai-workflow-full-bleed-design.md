# AI Workflow: full-viewport layout instead of centered card

## Problem

AI Workflow renders through the same shared shell as the other 6 phase
dashboards (`AutomationPhasePage` in `Nexus-Modern/src/App.tsx:322-370`):
`main.p-6` → `div.mx-auto.max-w-7xl` (caps content at 1280px, centered) →
breadcrumb + title header → `div.rounded-lg.border.bg-card.p-4.shadow-sm`
wrapping the phase content. AI Workflow's own root (`AIWorkflowPage.tsx`)
was authored as a full-viewport 3-panel app shell (`h-full flex`, meant to
fill the whole screen edge-to-edge, matching its origin as a standalone page
in Nexus-Advanced) — squeezing that into a 1280px centered card with a
border makes it read as a boxed widget instead of a real page.

## Decision

- Scope: **AI Workflow only.** The other 6 dashboards keep the existing
  shared shell exactly as-is — they're simpler content pages, not full-app
  layouts, and weren't part of this complaint.
- AI Workflow **drops the breadcrumb/title header entirely** and takes over
  the full viewport (`h-screen`), matching how it felt as a standalone page.
  Since that removes the only way back to the phase grid, AI Workflow gains
  its own small "Back to Phases" link inside its left sidebar.

## Implementation

1. `Nexus-Modern/src/App.tsx`, in `AutomationPhasePage`: add an early branch
   — when `phase.id === 'ai-workflow'`, return
   `<div className="h-screen w-full overflow-hidden"><PhaseContent phaseId={phase.id} automationId={automation.id} /></div>`
   directly, skipping the `main`/breadcrumb/header/card wrapper entirely.
   The existing return path (unchanged) still handles all other 6 phases.
2. `Nexus-Modern/src/App.tsx`, in `PhaseContent`'s existing `'ai-workflow'`
   branch: pass a new `backHref={`/automation/${automationId ?? 'web'}`}`
   prop to `<AIWorkflowPage>`.
3. `Nexus-Modern/src/components/ai-workflow/AIWorkflowPage.tsx`: accept a
   new optional prop `backHref?: string` (default `'/'`). Import `Link`
   from `react-router-dom`. Add a small back link (`ArrowLeft` icon +
   "Back to Phases" text, `text-xs`, muted-to-default hover, matching the
   dark scoped theme) at the top of the left sidebar panel, above the
   "N-stage pipeline" card.

No other AIWorkflowPage layout/logic changes — this is purely about how its
root is hosted by the router, plus one small navigation affordance.

## Testing

Manual: navigate to `/automation/web/ai-workflow`, confirm it now fills the
full viewport with no breadcrumb/header/card border above or around it, the
new back link navigates to `/automation/web`. Confirm the other 6 phases
(e.g. `/automation/web/requirements`) are visually unchanged.
