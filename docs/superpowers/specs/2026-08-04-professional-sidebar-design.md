# Wire ProfessionalSidebar into Nexus-Modern as a persistent app-wide nav

## Context

Nexus-Modern already contains a byte-identical copy of Auto_Aws's
`ProfessionalSidebar.tsx` (472 lines: 72px icon rail + expandable grouped
sections + search + theme toggle, built on shadcn's `Sidebar`/`SidebarProvider`
primitives at `src/components/ui/sidebar.tsx`) plus `AuthenticationDashboard.tsx`
and `MaintenanceDashboard.tsx` — all copied over from Auto_Aws but never wired
into `App.tsx`. Auto_Aws itself (`src/pages/Index.tsx`) drives this sidebar
with a single `currentView` state string and no router at all — no concept of
"automation type" (web/desktop/mobile/api/unified) exists there.

Nexus-Modern was rebuilt on react-router
(`/automation/:automationId/:phaseId`). This task adapts the sidebar's
*data and visual design* faithfully while replacing its *navigation
mechanism* with router calls, since the callback-prop/local-state approach
from Auto_Aws doesn't fit Nexus-Modern's URL-driven structure.

## Decisions (confirmed with user)

1. Sidebar is **persistent and app-wide** — visible on `/`, `/automation/:id`,
   and `/automation/:id/:phaseId`, wrapping the whole `<Routes>` tree.
2. **Authentication** and **Maintenance** are added as two new phases
   (their dashboards already exist, unused) — same treatment as the other 7
   (new `PhaseId` values, new `phases[]` entries with tile/icon/description,
   new `PhaseContent` branches rendering `<AuthenticationDashboard />` /
   `<MaintenanceDashboard />` with no props, matching how `CicdPipelineDashboard`
   is already rendered prop-free today).
3. Quick actions (sub-items like "Upload Document", "Allure Reports") **just
   navigate to their parent phase** for this pass — no deep-linking into
   dashboard sub-views yet (follow-up, not in scope now).
4. `ai-workflow` (Nexus-Modern's own addition, not in Auto_Aws) gets its own
   sidebar entry too, in a new group (`"AI"`), since the sidebar is becoming
   the primary nav — every currently-reachable phase must stay reachable.

## Automation-type handling (no user prompt needed — mechanical default)

The sidebar has no per-type awareness (Auto_Aws never had automation types).
Section clicks navigate to `/automation/${currentAutomationId ?? 'web'}/${phaseId}`,
reading `currentAutomationId` from the current route via `useParams` when
already inside `/automation/:automationId/*`, defaulting to `'web'`
elsewhere (e.g. on `/`). **The existing Dashboard page and automation-type
phase-grid cards are left completely intact** — they remain the only way to
switch automation type (desktop/mobile/api/unified); this task is additive,
not a removal of existing navigation.

## Callout: interaction with AI Workflow's full-viewport layout

The prior session's work made AI Workflow bypass the shared shell to fill
`h-screen` (no breadcrumb/card border), specifically to stop it feeling like
a boxed widget. Adding a persistent left sidebar means AI Workflow will now
render inside `SidebarInset` (viewport width minus the sidebar's width —
72px collapsed, 24rem/384px expanded) instead of the true full viewport.
This is the standard "persistent slim nav rail + full-bleed content pane"
pattern (VSCode, Linear, Notion) and is not considered a regression of the
full-bleed fix — but it does mean AI Workflow's own left panel (currently
`w-80`) will sit immediately next to the ProfessionalSidebar's rail/panel
when expanded. No special-casing planned; flagging this so it's not a
surprise. If it reads as too cramped once built, collapsing the
ProfessionalSidebar (existing collapse-to-icon-rail behavior, already built
into the component) is the built-in mitigation — no new code needed for
that.

## Implementation

### 1. `Nexus-Modern/src/App.tsx`

- Add `'authentication'` and `'maintenance'` to the `PhaseId` union and to
  the `phases[]` array (icon: `Shield` / `Settings` respectively — both
  already imported or importable from `lucide-react`; tile colors picked to
  not collide with existing 7: e.g. rose for authentication, slate for
  maintenance).
- Add matching branches in `PhaseContent`:
  ```tsx
  if (phaseId === 'authentication') return <AuthenticationDashboard />;
  if (phaseId === 'maintenance') return <MaintenanceDashboard />;
  ```
  Import both components at the top of the file.
- Wrap the router tree: `App`'s top-level `<Router><Routes>...</Routes></Router>`
  becomes
  ```tsx
  <Router>
    <SidebarProvider>
      <ProfessionalSidebar />
      <SidebarInset>
        <Routes>...(unchanged)...</Routes>
      </SidebarInset>
    </SidebarProvider>
  </Router>
  ```
  (`ProfessionalSidebar` no longer takes the Auto_Aws callback props — see
  below — so this becomes a plain, prop-free mount.)

### 2. `Nexus-Modern/src/components/ProfessionalSidebar.tsx` (modified in place)

- Remove the `ProfessionalSidebarProps` callback interface
  (`onSectionAction`, `onQuickAction`, `navigationFlow`, `onSectionSelect`,
  `onHomeClick`) and the component's now-unused local `activeSections` /
  `navigationFlow`-derived step-tracking UI (the per-quick-action
  current-step/completed checkmark logic in the original only makes sense
  for Auto_Aws's project→module→test-case→test-step linear flow state,
  which doesn't exist in Nexus-Modern's routed model — quick actions become
  plain nav links here, so this logic is dropped, not adapted).
- Add `import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';`.
- Replace `automationSections` data: keep every existing Auto_Aws section
  (`requirements`, `authentication`, `planning`, `development`, `execution`,
  `reporting`, `maintenance`, `cicd`) with their exact titles/icons/groups/
  quickActions verbatim, and append one new entry:
  ```ts
  {
    id: 'ai-workflow',
    title: 'AI Workflow',
    shortTitle: 'AI Workflow',
    group: 'AI',
    icon: Sparkles,
    railIcon: Sparkles,
    isPlaceholder: false,
    quickActions: [],
  },
  ```
- Replace navigation logic: `handleSectionClick`/`handleQuickActionClick` no
  longer call `onSectionAction`/`onQuickAction` — they call
  `navigate(\`/automation/${automationId ?? 'web'}/${sectionId}\`)`, where
  `automationId` comes from `useParams<{ automationId?: string }>()`.
- Replace "active section" derivation: instead of local
  `activeSections` state set on click, derive it from the current route —
  `const { phaseId } = useParams()`, `const isActive = phaseId === section.id`
  — so the highlighted item always matches the actual URL (survives
  back/forward navigation, direct link loads, and page refresh, unlike the
  original's click-tracked local state).
- `expandedSections` stays local UI state exactly as today (purely
  presentational — which groups are visually expanded — not tied to
  navigation).
- `onHomeClick` behavior: replace with a `Link to="/"` (or `navigate('/')`)
  — no prop needed since it doesn't depend on parent state.
- Search filtering behavior (`groupedSections` useMemo) is unchanged.
- Theme toggle behavior (`localStorage` + `document.documentElement.classList.toggle('dark', ...)`)
  is unchanged — verified compatible with Nexus-Modern's existing `.dark`
  class-based CSS variables in `index.css`.

### 3. No new files

`AuthenticationDashboard.tsx`, `MaintenanceDashboard.tsx`, and the sidebar
primitives all already exist and are used as-is (Authentication rendered
with no props, matching its all-optional prop defaults; Maintenance takes no
props at all).

## Out of scope

- Quick-action deep-linking into dashboard sub-views (follow-up).
- Any change to the Dashboard page or automation-type phase-grid cards.
- Any change to AI Workflow's internal layout beyond it now living inside
  `SidebarInset` rather than the raw viewport.

## Testing

Manual, via chrome-devtools MCP: navigate to `/`, `/automation/web`,
`/automation/web/requirements`, `/automation/web/authentication`,
`/automation/web/maintenance`, `/automation/web/ai-workflow` — confirm the
sidebar renders on all of them, section highlighting matches the current
URL, clicking a different section navigates correctly, collapsing the
sidebar (icon-rail mode) works, and `npx tsc --noEmit` stays at 0 errors.
