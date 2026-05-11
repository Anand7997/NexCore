# Frontend Boundary Audit

## Current Implementation Summary

Frontend app:

- `nexus-qa/src/app/layout.tsx`
- `nexus-qa/src/components/layout/AppShell.tsx`
- `nexus-qa/src/components/layout/Sidebar.tsx`
- `nexus-qa/src/components/layout/TopBar.tsx`
- `nexus-qa/src/components/layout/TerminalDock.tsx`
- `nexus-qa/src/components/layout/AIInspector.tsx`

Workspace routes:

- `/`: Requirements & Planning.
- `/workflows`: Workflow Development.
- `/executions`: Execution Monitoring.
- `/ai-analysis`: AI Investigation.
- `/matrix`: Cross-Platform Matrix.
- `/reports`: Reporting & Optimization.
- `/settings`: Environment & Integrations.
- `/agents`: Runner capacity view.

## Alignment With Phase 2

### Design Tokens

Status:

- Implemented in `globals.css`.

Notes:

- Tokens cover background, surfaces, foreground, lines, accent, state colors, glow, elevation, motion, and shell dimensions.
- Geist, Inter, and JetBrains Mono are available.

### Shell Layout

Status:

- Implemented.

Notes:

- Sidebar is collapsible.
- Top context bar is present.
- Right AI inspector is optional.
- Bottom terminal drawer is optional.
- Command palette is available with `Ctrl K`.

### Workspace Navigation

Status:

- Implemented.

Notes:

- Sidebar now uses workspace labels instead of generic dashboard navigation.
- Home route now opens Planning instead of a metrics dashboard.

### Reusable Components

Status:

- Partially implemented and sufficient for Phase 2 foundation.

Known primitives:

- Buttons.
- Badges.
- Tooltips.
- Status indicators.
- Timeline rows.
- Terminal container.
- Event stream panel.
- Inspector rail.

Phase 3 risk:

- Workflow builder may need stronger field, select, inspector-section, and canvas-toolbar primitives.

### Motion System

Status:

- Implemented through CSS tokens and Framer Motion usage.

Notes:

- Shell transitions are restrained.
- Command palette uses a short fade and slide.
- Existing realtime elements pulse for active state.

### Theme Engine

Status:

- Dark-first token system implemented.

Risk:

- Some older components still use direct Tailwind colors such as slate, violet, indigo, red, and emerald.
- Phase 3 should opportunistically convert touched workflow builder components to tokens.

### Responsive Behavior

Status:

- Baseline responsive behavior exists.

Risk:

- Matrix, reports, and execution details need deeper mobile verification in later UI hardening.
- Phase 3 workflow canvas needs explicit mobile and tablet behavior.

## Design Debt Register

1. Some existing pages still contain dashboard-era copy or analytics-heavy layout patterns.
2. Some components use hard-coded color classes instead of design tokens.
3. Reports route is allowed, but must remain secondary and not become the default product mental model.
4. AI panels exist in more than one place; Phase 6 should consolidate investigation behavior around evidence.
5. Workflow node inspector needs a stronger design-system primitive before Phase 3 exit.

## Phase 2 Control Decision

Phase 2 is complete enough to unblock Phase 3 because the shell, tokens, navigation model, command palette, inspector, terminal, and primitive boundaries are now documented and present.

Phase 3 must not reintroduce dashboard architecture into the Workflow Development workspace.

