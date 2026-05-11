# NEXUS QA Phase 2 Frontend Design System Contract

## Design Principle

The frontend uses Layered Workspace Architecture. Each workspace owns one primary purpose and reveals advanced details only when context requires them.

The design system must make NEXUS QA feel like an enterprise execution operating system, not a testing dashboard.

## Product Feel

Target references:

- Linear for calm navigation and issue-like focus.
- Vercel for precision, spacing, and premium restraint.
- Temporal for workflow execution semantics.
- Datadog for observability legibility.
- Warp and Raycast for command and terminal surfaces.
- Figma and VSCode for workspace authoring.

## Shell Layout

Canonical shell:

```text
+-----------+--------------------------------+
| Sidebar   | Top Context Bar                |
|           +--------------------------------+
|           | Main Workspace                 |
|           |                                |
|           |                                |
|           |          optional inspector    |
+-----------+--------------------------------+
| Optional Bottom Terminal Drawer            |
+--------------------------------------------+
```

Required shell elements:

- Collapsible sidebar.
- Clean top context bar.
- Optional right inspector.
- Optional bottom terminal drawer.
- Floating command palette.
- Contextual overlays.

Rules:

- Sidebar navigation is workspace-based, not feature-page based.
- Top bar shows context and lightweight operational state only.
- Terminal starts hidden.
- AI inspector starts hidden and appears contextually.
- Workspace content must not be forced into dashboard grids.

## Workspaces

### Requirements & Planning

Purpose:

- Product contracts, phase control, architecture boundaries, and source-of-truth planning.

Primary surface:

- Contract blueprint and phase queue.

### Workflow Development

Purpose:

- Author workflow DAGs.

Primary surface:

- Canvas.

Allowed secondary surfaces:

- Workflow explorer.
- Node palette.
- Node inspector.
- Optional console drawer.

### Execution Monitoring

Purpose:

- Observe live orchestration traversal.

Primary surface:

- Execution graph or timeline.

Allowed secondary surfaces:

- Queue panel.
- Details panel.
- Collapsible terminal.

### AI Investigation

Purpose:

- Debug failure cause from evidence.

Primary surface:

- Investigation workspace with selected failure context.

Allowed secondary surfaces:

- Failure timeline.
- Logs.
- Screenshots.
- Traces.
- AI recommendations.

### Cross-Platform Matrix

Purpose:

- Visualize platform parity across web, mobile, and desktop.

Primary surface:

- Intent-to-platform matrix.

### Reporting & Optimization

Purpose:

- Summarize execution outcomes and future optimization opportunities.

Primary surface:

- Reporting views. These must remain calmer than the execution workspace and must not become the app default.

### Environment & Integrations

Purpose:

- Configure environments, credentials, integrations, and runner settings.

Primary surface:

- Settings and integration controls.

## Design Tokens

Defined in `nexus-qa/src/app/globals.css`.

### Typography

- Sans: Geist, Inter, system sans.
- Mono: JetBrains Mono.

Rules:

- Use mono for ids, timestamps, states, and execution metadata.
- Use sans for workspace structure and readable prose.
- Do not use viewport-scaled font sizes.
- Letter spacing must remain normal except small uppercase metadata labels.

### Background and Surfaces

- `--color-bg-base`: app background.
- `--color-surface-1`: primary shell and panels.
- `--color-surface-2`: lifted controls and nested surfaces.
- `--color-surface-3`: popovers and strong local elevation.
- `--color-surface-overlay`: modal or command overlay.

Rules:

- Prefer neutral surfaces.
- Use glass effects only for overlays and contextual rails.
- Do not stack cards inside cards.

### Lines

- `--color-line-subtle`
- `--color-line-default`
- `--color-line-strong`
- `--color-line-active`

Rules:

- Lines carry structure more often than shadows.
- Active states use a small accent line or restrained tint.

### Accent Colors

- Brand accent: `--color-accent-default`.
- Soft accent: `--color-accent-soft`.
- Running: `--color-state-running`.
- Success: `--color-state-success`.
- Warning/queued: `--color-state-warning`.
- Failed: `--color-state-error`.
- Retrying: `--color-state-retrying`.

Rules:

- Accent color is for focus, active state, and primary action only.
- Status colors are semantic, not decorative.
- Glow is allowed only for live execution state.

### Motion

- `--duration-instant`
- `--duration-fast`
- `--duration-normal`
- `--duration-slow`
- `--ease-smooth`
- `--ease-snappy`

Rules:

- Motion communicates system state.
- Use short fades and slides for progressive disclosure.
- Avoid decorative animation.
- Node traversal may pulse or animate subtly.

## Component Primitives

Existing primitives:

- `Button`
- `Badge`
- `Tooltip`
- `GlassCard`
- `ExecutionChip`
- `NodeHealthIndicator`
- `StatusPulse`
- `TimelineRow`
- `TerminalContainer`
- `EventStreamPanel`
- `FloatingInspector`
- `AIInsightCard`

Primitive rules:

- Buttons represent commands.
- Icon buttons should use lucide icons where available.
- Badges represent status or compact metadata.
- Cards are allowed for repeated items, modals, and framed tools.
- Page sections are not cards by default.
- Terminal and inspector are progressive disclosure surfaces.

## Theme Engine

Current theme mode:

- Dark-first static theme through CSS tokens.

Phase 2 contract:

- New components must consume tokens, not hard-coded colors.
- Future light mode must be implemented by token replacement, not component rewrites.
- Runtime theme state must not affect execution logic.

## Responsive Model

Desktop:

- Sidebar plus top context bar plus workspace.
- Optional inspector and terminal may be open.
- Dense engineering controls are allowed when scoped to one workspace.

Tablet:

- Sidebar may collapse.
- Inspector should overlay or collapse.
- Tables and matrices should preserve scan order.

Mobile:

- Sidebar should be collapsed by default or replaced by overlay navigation.
- Main workspace should prioritize one vertical task flow.
- Terminal and inspector should be overlays, not permanent columns.

## Accessibility Rules

- Interactive controls require accessible labels or visible text.
- Color cannot be the only status indicator.
- Focus visible rings must use tokenized accent.
- Toasts and overlays should not trap users without escape.

## Phase 2 Definition of Done

- Design tokens documented.
- Shell layout and workspace architecture documented.
- Component primitive boundaries documented.
- Motion semantics documented.
- Theme strategy documented.
- Responsive behavior documented.
- Current frontend shell aligns to workspace navigation.

