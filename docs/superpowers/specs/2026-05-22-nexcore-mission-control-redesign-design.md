# NEXCORE Frontend — Mission Control Redesign

**Date:** 2026-05-22
**Status:** Draft — awaiting user review
**Scope this session:** Foundation (shared shell + dashboard) + /ai-workflow anchor page
**Workspace:** Isolated git worktree off `feat/nexcore-advanced-upgrades`

---

## Goal

Rebuild the NEXCORE QA frontend so the dashboard becomes a *launcher* (not a god-page), every feature has its own dedicated route, and every route is wrapped by a shared "Holographic Command Bridge" shell at mission-control fidelity.

Existing routes do **not** change. URL bookmarks survive. The shell gives every page a new aesthetic immediately; pages are redesigned page-by-page in future sessions.

## Non-goals

- No backend changes.
- No new routes added; no existing routes removed or renamed.
- No redesign of pages other than `/` (home) and `/ai-workflow` in this session — all others render inside the new shell with their current content.
- No light-mode polish pass; current light tokens remain functional, refinements deferred.

## Visual language

Selected direction: **Holographic Command Bridge**, with editorial discipline.

- **Background palette:** `#02020a` (deepest), `#060611` (surface base), `#0d0d18` (lifted surface). Gradients toward `#07071a` at top for ambient violet bloom.
- **Primary accent:** `#8b5cf6` (violet) — active states, primary buttons, edge rails.
- **Secondary accent:** `#06b6d4` (cyan) — live signals, sparklines, radar sweep, "pulse" indicators.
- **Tertiary:** `#a78bfa` (lavender) for text accents, `#67e8f9` for highlights.
- **State colors** (unchanged from current tokens): `#10b981` success, `#f59e0b` warn, `#ef4444` error.
- **Type:** Geist sans (UI), JetBrains Mono (labels / data / coordinates / status). Mono usage is wider than today — every "data" element gets mono treatment.
- **Effects:** corner HUD brackets on shell; slow scanline traveling top→bottom; ambient radial glows; floating particles; per-element neon edge glows on active states; conic-gradient logo orb.
- **Restraint rule:** color is *intent-driven*. Default surfaces are neutral. Violet means "active." Cyan means "live." Green/amber/red mean exactly what they do today. No decorative chroma.

## Information architecture

```
/                           Dashboard (launcher)
├── Hero tiles (3)
│   ├── Executions      [live · pass-rate · count]
│   ├── AI Workflow     [agents online · healed today]
│   └── Test Designer   [cases · dirty · flaky]
└── Library grid (19 rectangular tiles, 4 columns)
    Executions · Execution Control · Workflows · AI Workflow · Agents
    · AI Analysis · AI Investigation · Matrix · Knowledge Graph
    · Test Designer · Test Config · Test Cases · Page Repository
    · Intent Studio · Reports · Architecture · Settings · Workspace · Demo
```

Hero tile metric source = existing WebSocket events + REST endpoints already in use.

## Shared shell — structure

```
┌── 72px sidebar ──┬── 38px primary topbar (breadcrumb · ⌘K · pills) ──┐
│  Logo orb       │── 30px telemetry strip (CPU/MEM/P95/ERR/RPS spark) ┤
│  Mini-telemetry │                                                     │
│  ── OPS ──      │                                                     │
│  [icons]        │                                                     │
│  ── DESIGN ──   │     Page viewport                       320px       │
│  [icons]        │     · hex floor                         right       │
│  ── SYS ──      │     · edge tick rails                   panel       │
│  [icons]        │     · floating particles                (tabbed:    │
│  Theme/Settings │     · mini-radar overlay                AI ·        │
│                 │     · quick-action dock                 Agents ·    │
│                 │                                         Events ·    │
│                 │                                         Telemetry)  │
│                 ├── 32px bottom status (services · pulse waveform) ──┤
├── 16px pulse.aux rail (full-width waveform animation) ───────────────┤
└──────────────────────────────────────────────────────────────────────┘
```

### Sidebar (72 px collapsed, 220 px hover-expanded)

- Animated logo: conic-gradient orb in a slowly rotating outline ring.
- Mini-telemetry block under the logo (e.g. live pass rate). One number, one label, mono.
- Sections labeled with mono micro-labels: **OPS · DESIGN · SYS**.
- Per-icon live status dot (top-right of icon): green=ok, amber=warn, red=err, gray=idle.
- Per-icon optional count badge (top-left): e.g. `7` on Executions when 7 runs are live.
- Active icon: violet inner gradient + outer glow + 3 px violet/cyan rail on its left edge with `box-shadow` glow.
- Footer: theme toggle + settings.
- Hover expansion shows icon + label + section labels; no width thrash on click — only hover or pinned.

### Primary topbar (38 px)

- Left: breadcrumb (`NEXCORE / <section> / <page>`) with current segment in white, others muted. `LIVE` pill (red, pulsing) appears when any execution is running.
- Center: universal search/command trigger — pill that opens the command palette. Width 380 px. `⌘K` chip on the right of the trigger.
- Right cluster:
  - Time pill (UTC, mono).
  - Agents pill (count, green if all healthy).
  - Warnings pill (amber, only if `> 0`).
  - Buttons: theme · notifications · AI panel toggle · profile.

### Secondary telemetry strip (30 px)

Always visible. Slim. JetBrains Mono throughout.

- Cells: `CPU` · `MEM` · `P95 latency` · `ERR rate` · `RPS` · `UPTIME`. Each shows a label + value + 60×16 sparkline.
- Right side: `RUN E-XXXX` current execution id · `SHARD region · n/total`.
- Sparklines pull from a single `useTelemetry()` hook that subscribes to backend `/api/telemetry/stream` (or falls back to `/api/telemetry/snapshot` polled every 5 s if the stream isn't available).

### Viewport background

- Hex SVG floor at 6% alpha, masked with a radial fade so it's strongest at the center.
- 5 floating particle dots (violet and cyan), independent CSS `@keyframes floatp` loop with staggered delays.
- Vertical tick rails on the inner left and right edges of the viewport, drawn from `<div class="rail-tick">` elements. Long ticks every third row in cyan, others in violet at 40% alpha.
- Slow scanline `1.5 px` traveling top→bottom every 6 s.
- Radial ambient glow ellipses at top and bottom-right corners.

### Mini-radar overlay (bottom-right of viewport)

- 130×130 px circular, frosted glass.
- Rotating cyan sweep, 4 s/loop.
- Blip dots represent "things to look at" — currently: failed runs in the last 5 min, anomalies in telemetry, AI-flagged events.
- Top-left mono label `▸ RADAR` · bottom-right detected count.
- Click radar → opens an "events of interest" inspector.

### Floating quick-action dock (bottom-center, viewport)

- Pill shape, frosted glass, violet rim.
- 5 buttons: jump-to-executions · search · **create-execution (primary, gradient)** · ai-workflow · pause-all.
- Always visible. Doesn't reflow page content.

### Right panel (320 px, tabbed)

Replaces the existing single-purpose AICopilotPanel.

- **Tabs:** `AI` · `AGENTS` · `EVENTS` · `TELEMETRY`. Each tab has a small count badge.
- **AI tab** (default): orb avatar + context pill (`▸ context: /current-route`) + route-specific suggestions + chat input. Existing `COPILOT_SUGGESTIONS` map carries forward.
- **Agents tab:** list of live agents. Each row = status dot + name/role + load mini-bar + load %. Click row → drill into agent. Sourced from `/api/agents` + WS updates.
- **Events tab:** color-coded vertical feed (left-border colored by severity). 24 most recent events. Filters at top: All · Heals · Failures · Completions. WS-driven.
- **Telemetry tab:** larger versions of the strip's sparklines, plus latency histogram, error rate breakdown.

### Bottom status strip (32 px)

- System services pills: `DB · CACHE · VECTOR · QUEUE · WS clients`. Each shows live count or latency.
- Inline EKG pulse waveform (`<svg>` rendered, points cycled by JS).
- Right side: build version + `▸ Terminal · F1` (clicking opens existing TerminalDock).

### Pulse.aux rail (16 px, full-width including under the sidebar)

- Slim cardio-monitor waveform that runs the full width of the app.
- Animated by translating an SVG path leftward, looping.
- Decorative + reassuring "the system is alive" indicator. Pauses on `prefers-reduced-motion`.

### Chrome details

- 4 corner HUD brackets (1.5 px violet at 55% alpha).
- Top edge: 2 px gradient line (violet → cyan → violet).
- All shell elements (`sidebar`, `topbar`, `right panel`, `status`, `pulse`) share a single grid that uses `position: relative` so brackets and scanline can `position: absolute` over them.

## Component breakdown (build list)

Below is the implementation surface. Files marked `+` are new, `~` are rewrites of existing files, `=` are extensions of existing files.

```
nexus-qa/src/components/shell/                                      # NEW directory
+ AppFrame.tsx              # outer grid + scanline + corner brackets + ambient glows
+ Sidebar.tsx               # icon rail + logo orb + mini-telemetry + sections
+ TopBar.tsx                # breadcrumb + ⌘K trigger + status pills + button cluster
+ TelemetryStrip.tsx        # CPU/MEM/P95/ERR/RPS sparklines
+ ViewportChrome.tsx        # hex floor + particles + edge tick rails
+ MiniRadar.tsx             # 130x130 rotating-sweep radar with blips
+ QuickDock.tsx             # floating pill with 5 actions
+ RightPanel.tsx            # tabbed container (AI/Agents/Events/Telemetry)
+ panels/AIPanel.tsx        # extracts AI copilot from current AppShell
+ panels/AgentsPanel.tsx    # live agents list
+ panels/EventsPanel.tsx    # color-coded event feed
+ panels/TelemetryPanel.tsx # expanded telemetry views
+ StatusStrip.tsx           # services + inline EKG waveform
+ PulseRail.tsx             # full-width animated waveform
+ CornerBrackets.tsx        # 4 HUD brackets

nexus-qa/src/components/shell/primitives/                           # NEW
+ Sparkline.tsx             # reusable inline SVG sparkline (data[], color, w/h)
+ Waveform.tsx              # reusable EKG-style animated waveform
+ StatusDot.tsx             # animated status dot (ok/warn/err/idle)
+ Pill.tsx                  # standard status pill (label, value, color, optional dot)

nexus-qa/src/lib/shell/                                             # NEW
+ useTelemetry.ts           # subscribes to telemetry stream / falls back to polling
+ useShellState.ts          # active route, breadcrumb, hero metric snapshots
+ shellTokens.ts            # exported design tokens (durations, easings, grid sizes)

nexus-qa/src/components/layout/AppShell.tsx                         # ~ REWRITE
   Become a thin wrapper that composes AppFrame + Sidebar + TopBar + ...
   Preserves: TooltipProvider, useWebSocket(), CommandPalette, theme sync,
              notification stack.
   Removes: inline AICopilotPanel (moves to panels/AIPanel.tsx),
            inline ambient decorations (moves to AppFrame).

nexus-qa/src/app/page.tsx                                           # ~ REWRITE
   Replaces current command-center god-page with hybrid launcher:
   - 3 hero tiles (live metrics)
   - 19 rectangular library tiles, 4-column grid
   - Header strip: title + mono subtitle + live time + 3 status pills
   Keeps the existing live-metrics polling pattern.

nexus-qa/src/app/globals.css                                        # = EXTEND
   New tokens:
     --shell-hex-floor (background-image url)
     --shell-corner-color, --shell-corner-width
     --shell-scanline-duration
     --shell-particle-color-{a,b}
     --shell-rail-tick-{normal,long}
   New utility classes:
     .shell-grid, .shell-corner-bracket, .shell-scanline,
     .hud-pill, .hud-pill-live, .telemetry-cell,
     .neon-rail-active, .holo-card
   Keyframes:
     @keyframes shell-scanline, @keyframes shell-pulse-wave,
     @keyframes shell-orb-rotate

nexus-qa/src/app/ai-workflow/page.tsx                               # ~ REDESIGN
   Apply new shell-aware visual language.
   Changes (see "/ai-workflow redesign" section below).
```

## /ai-workflow redesign (anchor page)

The existing `/ai-workflow` is the 3-panel orchestrator with drag-drop file zone, TokenStream, ElementFeed, ConfidenceGauge. Redesign tightens the existing layout against the new aesthetic — does not rewire data flow.

- **Header strip:**
  - Page title `AI Workflow Orchestrator` + mono subtitle `▸ DISCOVERY · PLAN · HEAL · v1`.
  - Right side: agent ring (3-node circular SVG, each node = an agent with status dot, connected with animated gradient lines).
- **Drag-drop zone (left panel):** holographic "upload portal":
  - Hex-tile background appears inside the drop zone with a slow radial scan when idle.
  - On dragover: violet glow pulses outward; corner brackets brighten.
  - On drop: scan-line traverses the dropped file representation; metadata appears in mono.
- **Center pane (live workflow):**
  - TokenStream component gets a neon-edge frame with a top-strip showing token count + token/s rate + model name (mono).
  - ElementFeed rows get a 2-px left edge accent based on element type (action=violet, assertion=cyan, error=red).
  - Steps render as a vertical "operation log" with timestamp · step name · status · evidence count, much closer to a tactical-display feel than today.
- **Right pane (ConfidenceGauge):**
  - Gauge becomes a holographic radial dial (matches the screen-A mockup): arc-gradient cyan, center large numeric + `PCT.OK` mono label.
  - Below the gauge: 3 mini stat cards — `Heals` / `Avg confidence` / `Time saved`.
  - At the bottom: an "Agent Output" stream with role-colored tags.

Behavioral additions:

- The RightPanel's `AI tab` becomes context-aware on this route, surfacing workflow-specific suggestions (`Adjust heal threshold`, `Investigate flaky locator pattern`, `Compare with last run`).
- The MiniRadar's blips on this route show "elements flagged for review" by the AI.
- The QuickDock primary button on this route becomes "Trigger heal cycle" instead of "Create execution."

## Data wiring (preserved, not new)

- WebSocket bridge (`useWebSocket`) keeps current contract. New components subscribe to its event bus via the existing `useUIStore` notification stack and (new) `useShellState` for shell-level updates.
- Telemetry stream: try `wss://.../api/telemetry/stream`; on connect failure, fall back to polling `/api/telemetry/snapshot` every 5 s. Component receives a normalized shape `{ cpu, mem, p95, errRate, rps, uptime, runId, shard }`.
- Agents data: existing `/api/agents` + WS events.
- Events feed: same event bus already used for notifications.

No backend endpoints invented in this spec. If telemetry endpoint doesn't exist, hook gracefully degrades to showing static "—" placeholders rather than failing.

## Animation budget

To prevent the "tactical display" from becoming visual noise:

- **Continuous animations:** scanline, pulse rail, logo orb rotate, radar sweep, ambient particles. All under `prefers-reduced-motion: reduce` get suspended.
- **Reactive animations:** hover lift, button press, edge glow on active. Always on.
- **Event animations:** notification slide-in, route transition (8 px slide + fade, 0.28 s, `cubic-bezier(0.22, 0.61, 0.36, 1)`).
- Cap simultaneous animations on a single component: max 2 concurrent (e.g. pulse + hover OK; pulse + hover + glow-breathe = too much).
- Use `will-change` sparingly; only on the scanline, pulse rail, and radar sweep elements that animate continuously.

## Accessibility

- Every status pill / sparkline cell gets an `aria-label` describing its current value in plain words.
- `prefers-reduced-motion: reduce` suspends scanline, pulse rail, particles, radar sweep, and logo orb rotation. Static substitutes remain.
- All interactive elements are keyboard-focusable; focus ring uses `outline: 1.5px solid var(--color-accent-default); outline-offset: 1px` (already in `globals.css`).
- Sidebar icons announce their label on focus even when collapsed.
- Color is never the only signal: state dots are also paired with `aria-label` and, in dense lists, with an icon (✓ ! ⚠).

## Build sequence (this session)

1. **Worktree setup:** create isolated worktree off `feat/nexcore-advanced-upgrades` on branch `feat/mission-control-redesign`.
2. **Token extensions** in `globals.css` — add new keyframes and utility classes; no existing tokens removed.
3. **Primitives** — `Sparkline`, `Waveform`, `StatusDot`, `Pill`, `CornerBrackets`.
4. **Shell components** — `AppFrame`, `Sidebar`, `TopBar`, `TelemetryStrip`, `ViewportChrome`, `MiniRadar`, `QuickDock`, `StatusStrip`, `PulseRail`.
5. **Right panel** — `RightPanel` tabbed container + 4 panel implementations.
6. **AppShell rewrite** — recompose using new components; keep external API (`children`) identical.
7. **Dashboard rewrite** — `app/page.tsx` to hybrid hero + library.
8. **AI Workflow redesign** — `app/ai-workflow/page.tsx`.
9. **Manual verification in browser** — start dev server, walk through every route, confirm the shell wraps each one without breaking it. Use `chrome-devtools-mcp` to take comparison screenshots for the README.
10. **Reduced-motion check** — toggle OS reduced-motion and confirm graceful degradation.

## Per-page redesign — future sessions (tiers)

Spec defines what comes *after* this session. Each tier is its own follow-up session (own spec, own plan).

- **Tier 1 — Anchor experiences (daily heavy use):**
  - `/executions` — runs list + drill-in
  - `/workflows` — orchestration canvas
- **Tier 2 — Design surfaces:**
  - `/test-designer` · `/testcases` · `/test-configuration`
- **Tier 3 — Intelligence:**
  - `/ai-investigation` · `/ai-analysis` · `/knowledge-graph` · `/matrix`
- **Tier 4 — Supporting ops:**
  - `/agents` · `/execution-control` · `/page-repository` · `/intent-studio` · `/reports`
- **Tier 5 — System / edges:**
  - `/architecture` · `/settings` · `/workspace` · `/demo`

Each tier session redesigns its pages against the shell, applies tier-specific patterns (e.g. canvas pages get a different viewport treatment than form pages), and lives in its own worktree/branch.

## Acceptance criteria (this session)

- All 20 routes still load without runtime errors.
- New shell visible on every route: sidebar · topbar · telemetry strip · status strip · pulse rail · corner brackets.
- Dashboard (`/`) renders 3 hero tiles with live data + 19 library tiles in 4-column grid.
- `/ai-workflow` shows the new aesthetic (agent ring, holographic drop zone, radial confidence gauge, contextual right panel) and the existing workflow still functions (drag-drop, token stream, element feed).
- `⌘K` command palette opens and navigates as today.
- AI panel (now a tab in the right panel) still works for chat.
- WebSocket-driven notifications still arrive in the top-right notification stack.
- Theme toggle still works (light + dark).
- `prefers-reduced-motion: reduce` suspends continuous animations.
- TypeScript compiles with no new errors in the redesigned files.
- Dev server starts cleanly; no unhandled console errors on the redesigned pages.

## Risk register

- **AppShell rewrite:** existing AppShell is 680 lines and owns CommandPalette + AICopilotPanel + notifications + WS + theme + ambient decorations. The rewrite must preserve all of these. Mitigation: rewrite is a *recomposition* — every responsibility is moved into a child component, not removed.
- **CSS regression risk:** existing pages depend on legacy `var(--color-*)` tokens, `glass-*` classes, and animation utilities. Mitigation: all new tokens are additive; nothing existing is renamed or removed.
- **Animation perf:** mission-control shell has 5+ continuous animations. Mitigation: contain them with `transform`/`opacity` only, use `will-change`, kill on reduced-motion, lazy-mount the pulse rail (only renders after first paint).
- **Telemetry endpoint absent:** if backend doesn't expose telemetry, sparklines show `—`. Acceptance criteria explicitly allows this graceful degradation.
- **/ai-workflow data wiring:** redesign must not break the existing orchestrator flow. Mitigation: keep all data hooks, only swap presentational components.

## Out-of-scope (explicit reminders)

- No backend endpoints added.
- No new routes.
- No mobile layout pass (desktop-first; existing mobile behavior unchanged).
- No e2e tests written (manual verification this session; tests come in a follow-up).
- No light-mode visual polish beyond ensuring nothing breaks.
- No design-token renames (only additions).

---

**Next step after user approval:** invoke `writing-plans` skill to break this spec into an executable implementation plan.
