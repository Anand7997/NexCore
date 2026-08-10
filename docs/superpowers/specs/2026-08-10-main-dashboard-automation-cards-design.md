# Main Dashboard — 5 Automation Cards (Nexus-Advanced)

## Purpose

Nexus-Modern's root dashboard (`Nexus-Modern/src/App.tsx`) shows 5 automation-type cards (Web, Desktop, Mobile, API, Unified). Nexus-Advanced has no equivalent page. Add a "Main Dashboard" page to Nexus-Advanced containing the same 5 cards, with the same content (title/description/icon/color), ported to Advanced's own design-token system.

## Source of truth (Nexus-Modern)

`Nexus-Modern/src/App.tsx:117-153` — `automations` array:

| id | title | description | icon | glow |
|---|---|---|---|---|
| web | Web Automation | Browser pages, UI flows, locators, test cases, and execution. | Globe | #60a5fa |
| desktop | Desktop Automation | Native desktop workflows, modules, screens, and execution. | Monitor | #94a3b8 |
| mobile | Mobile Automation | Android and iOS pages, gestures, cases, and device runs. | Smartphone | #34d399 |
| api | API Automation | Services, endpoints, validations, payload cases, and runs. | Server | #fbbf24 |
| unified | Unified Automation | Web, Desktop, Mobile, and API workflows in one suite. | Layers3 | #a78bfa |

Card chrome reference: `Nexus-Modern/src/App.tsx:277-308` (icon tile, title, description, badge pill, trailing arrow) wrapped in `GlassPanel` (`Nexus-Modern/src/components/backend/GlassPanel.tsx`) — rounded-2xl glass card, hover glow via inline box-shadow, staggered fade/slide-in via framer-motion.

## New page: Nexus-Advanced

- Route: `src/app/main-dashboard/page.tsx` → `/main-dashboard`.
- Local `AUTOMATIONS` array, same 5 entries/copy/icons above, using `lucide-react` icons already available in Advanced (`Globe`, `Monitor`, `Smartphone`, `Server`, `Layers3`).
- Card visuals rebuilt with Advanced's own tokens (`var(--color-surface-1)`, `var(--color-line-default)`, `var(--color-fg-default)`, `var(--color-fg-muted)`, `var(--color-fg-subtle)`) instead of Modern's `--cp-*`/`cp-glass`, matching the existing card patterns already used on Advanced's Command Center page (`src/app/page.tsx`, e.g. `ProjectCard`/`MetricCardComponent`: rounded-xl/2xl border, `motion.div` fade+slide stagger).
- Layout: heading + subtext, then `grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3` of 5 cards (matches Modern's grid).
- Each card is a `next/link` `Link` to `/automation/{id}` (web/desktop/mobile/api/unified).
- Badge text: "Open phases" (matches Modern's `dashboardBlocks` badge for automation entries).

## New placeholder routes

5 stub pages, one per automation id: `src/app/automation/web/page.tsx`, `.../desktop/`, `.../mobile/`, `.../api/`, `.../unified/page.tsx`. Each renders a minimal placeholder (title + "Coming soon" body) — no logic, just so the cards have somewhere real to navigate.

## Sidebar

Add one nav item to `src/components/layout/Sidebar.tsx`'s `command` group (top group, alongside `Workspace` / `Create Project`): `{ href: '/main-dashboard', label: 'Main Dashboard', icon: LayoutDashboard }` (or a distinct icon, e.g. `Grid3X3` is already used for Matrix — use `Boxes` or reuse `LayoutDashboard`; final pick left to implementation, must not collide visually/semantically with existing items). Existing `/` (Workspace/Command Center) page is untouched.

## Out of scope

- No changes to Nexus-Modern.
- No real data/backend wiring for the 5 automation placeholder pages — this spec only covers the dashboard entry point and stub destinations.
- No changes to Advanced's global theme/token files beyond what's needed for the new page's card styling (reuse existing vars only, no new tokens).
