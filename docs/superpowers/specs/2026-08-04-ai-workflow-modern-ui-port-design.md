# AI Workflow port: Nexus-Advanced → Nexus-Modern

## Goal

Port the "AI Workflow Orchestrator" feature (BRD → discovery → scenarios → test
generation → review, 6-step wizard) from Nexus-Advanced (Next.js, at
`Nexus-Advanced/src/app/ai-workflow/page.tsx`, 2561 lines) into Nexus-Modern
(Vite + react-router, at `Nexus-Modern/`), reproducing the same visual design,
as a new "AI Workflow" block reachable from Modern UI's navigation.

## Backend wiring

Nexus-Modern's existing backend (`nexus-dotnet-backend`, C#) has no AI Workflow
endpoints — that logic lives entirely in the Python `nexus-api` (FastAPI),
mounted at `/api/ai-workflows/*` (see `nexus-api/app/ai_workflow/router.py:28`
+ `nexus-api/app/main.py:251`), running on `http://127.0.0.1:8000`.

Decision: Nexus-Modern calls `nexus-api` directly for all AI Workflow calls,
via a new `VITE_NEXUS_API_BASE_URL` env var (default
`http://localhost:8000/api`). This is separate from Modern's existing
`VITE_API_BASE_URL` (which stays pointed at the .NET backend for everything
else). No proxy layer, no backend duplication.

`nexus-api/app/config.py:23` — `cors_origins` default list
(`["http://localhost:3000", "http://localhost:3001"]`) gets `"http://localhost:3002"`
added (Nexus-Modern's dev port per `Nexus-Modern/package.json` scripts).

## File layout (new, isolated)

All new code lives under `Nexus-Modern/src/`, isolated from existing shared
components so nothing else in Modern UI is affected:

- `lib/ai-workflow-api/types.ts` — AI Workflow TypeScript types, ported
  verbatim from `Nexus-Advanced/src/lib/api/types.ts:1097-1237`
  (`AIWorkflowState`, `AIScenarioPreview`, `AIWorkflowStateResponse`,
  `AIScrapedCandidatePreview`, `AIModelInfo`, `AIReviewResponse`, etc.)
- `lib/ai-workflow-api/client.ts` — thin fetch wrapper ported from
  `Nexus-Advanced/src/lib/api/client.ts`, base URL swapped to
  `import.meta.env.VITE_NEXUS_API_BASE_URL` (Vite has no server-side proxy
  route like Next.js's `/api/proxy`, so this always calls nexus-api directly)
- `lib/ai-workflow-api/aiWorkflow.ts` — React Query hooks, ported verbatim
  from `Nexus-Advanced/src/lib/api/aiWorkflow.ts` (useAIModels, useAIWorkflow,
  useCreateAIWorkflow, useGenerateScenarios, useConfirmScenarios,
  useGenerateTestCases, useRollbackAIWorkflow, useStopAIWorkflow,
  useAIWorkflowReview, extractAIBrdFile)
- `components/ai-workflow/Button.tsx` — copy of Nexus-Advanced's
  `components/ui/Button.tsx` (cva variants: ghost/glass/neon/danger; sizes:
  xs/sm/md; wraps `motion.button`). Scoped to this feature directory — does
  NOT modify or replace Modern's existing shared `components/ui/button.tsx`
  (shadcn), which other pages depend on.
- `components/ai-workflow/AIWorkflowPage.tsx` — the ported 6-step
  orchestrator: `InputStep`, `ModelSelectionStep`, `DiscoveryStep`,
  `ScenariosStep`, `TestGenerationStep`, `ReviewStep`, plus supporting
  components (`WorkflowTimeline`, `LiveIntelligence`, `McpMissionControlPanel`,
  `PipelineFocusCard`, `WorkflowActivityFeed`, `TokenStream`, `ConfidenceRing`,
  `ConfidenceGauge`, `CapabilityBars`, `MetricCard`, `Badge`, `CopyButton`) and
  all the pure helper functions (`stateToStep`, `pipelineStagesFor`,
  `activePipelineStage`, `isWorkflowRunning`, etc.) — all ported near
  line-for-line from `page.tsx`.
- `components/ai-workflow/index.ts` — re-exports `AIWorkflowPage` as default.

## Adaptations required (behavior-preserving)

1. **Theme**: Modern UI has no light/dark toggle infrastructure (no
   `next-themes` wired, no `data-theme`/`.dark` class flipping — confirmed:
   `Nexus-Modern/src/main.tsx` has no ThemeProvider). Nexus-Advanced's
   `isLight` flag (from `useUIStore((s) => s.theme === 'light')`) is replaced
   with a hardcoded `const isLight = false`. This preserves the dark-theme
   visual (the feature's default/primary look) and keeps all conditional
   branches in the ported code intact structurally — they just always resolve
   to the dark path. No zustand dependency needed.
2. **Design tokens**: Nexus-Advanced's CSS custom properties
   (`--color-surface-1/2/3`, `--color-fg-default/muted/subtle`,
   `--color-line-subtle/default/strong`, `--color-bg-base`,
   `--color-surface-overlay`, accent/glow tokens) are copied from
   `Nexus-Advanced/src/app/globals.css:22-77` (dark block only) into
   `Nexus-Modern/src/index.css`, nested under a `.ai-workflow-scope` class
   (wrapping the whole `AIWorkflowPage` root div) rather than added to `:root`
   — this prevents collision with Modern's existing shadcn HSL tokens
   (`--background`, `--border`, etc.) used everywhere else in the app.
3. **framer-motion**: not currently a Nexus-Modern dependency. Added to
   `package.json` — required for the animations described in the design
   (progress bars, staggered list reveals, pulse/scan-line effects) to match
   "same design" faithfully.
4. **QueryClientProvider**: Nexus-Modern has `@tanstack/react-query` installed
   but no provider mounted anywhere (`main.tsx` is a bare `createRoot(...)`).
   One is added in `main.tsx` wrapping `<App />`, scoped to not disrupt any
   existing data flow (nothing else currently uses react-query in Modern, so
   this is purely additive).

## Navigation placement

Per user decision: new phase tile per automation type. In
`Nexus-Modern/src/App.tsx`:

- Add `'ai-workflow'` to the `PhaseId` union and to the `phases` array (icon:
  `Sparkles`, violet accent, consistent with the other 6 phase tile color
  conventions already in that file).
- In `PhaseContent`, render `<AIWorkflowPage initialPlatform={...} />` for
  `phaseId === 'ai-workflow'`, where `initialPlatform` is derived from the
  current `automationId` route param (`web`→`web`, `desktop`→`desktop`,
  `mobile`→`mobile`, `api`→`api`, `unified`→`web` default). This becomes the
  `AIWorkflowPage`'s initial `selectedPlatform` state — the wizard's own
  Input-step platform picker still lets the user override it, matching
  Nexus-Advanced's behavior exactly.
- Route becomes `/automation/:automationId/ai-workflow`, reachable from every
  automation type's phase grid.

## Out of scope

- No changes to Modern UI's existing shared `button.tsx`, existing theme
  tokens in `:root`/`.dark`, or any other existing page/component.
- No backend logic changes beyond the one-line CORS origin addition.
- No light-mode support for this feature (see Adaptation #1).
- No changes to Nexus-Advanced (source stays as reference, untouched).

## Testing

- Manual verification: start `nexus-api` (port 8000), start Nexus-Modern
  (`npm run dev`, port 3002), navigate to
  `/automation/web/ai-workflow`, run through all 6 steps with a real BRD +
  URL against a configured AI provider, confirm parity with Nexus-Advanced's
  same flow side-by-side.
- No existing automated test suite covers Nexus-Modern's React components
  (none found under `Nexus-Modern/src`), so no new automated tests are added
  as part of this port — consistent with existing project conventions there.
