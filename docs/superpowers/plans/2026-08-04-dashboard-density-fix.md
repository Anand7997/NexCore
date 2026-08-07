# Dashboard Density Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "congested" feel across Nexus-Modern's dashboards by removing a global 90% body zoom and reworking AI Workflow's outlier-tight typography/spacing to match the app's normal scale.

**Architecture:** Two independent, additive fixes — a one-line CSS removal (affects all 7 dashboards) and a size-tier rework of one component file (`AIWorkflowPage.tsx`), applied via an atomic scripted substitution to avoid sequential-replacement collisions (e.g. a naive `p-2`→`p-3` pass followed by `p-3`→`p-4` would double-shift originally-`p-2` elements).

**Tech Stack:** Tailwind CSS utility classes, React/TSX (no logic changes), a one-off Python script for the atomic text substitution (not committed — throwaway tooling).

## Global Constraints

- No JSX structure, props, state, event handlers, animation config, or data-fetching logic changes in `AIWorkflowPage.tsx` — this is a className-only pass.
- No changes to `AutomationDevelopmentDashboard.tsx` or any other dashboard file — out of scope per the spec.
- No changes to the shared `AutomationPhasePage` shell in `App.tsx`.
- Icon `size={N}` props and fixed icon-container box sizes (`w-4 h-4`, `w-6 h-6`, `w-7 h-7`, `w-8 h-8`, `w-10 h-10`, `w-11 h-11`, etc.) are left unchanged — scoped out to keep this pass low-risk (text/padding/gap/sidebar-width only).

---

### Task 1: Remove the global 90% body zoom

**Files:**
- Modify: `Nexus-Modern/src/index.css:8` (remove `--app-zoom: 0.9;`)
- Modify: `Nexus-Modern/src/index.css:106` (remove `zoom: var(--app-zoom);`)

**Interfaces:** None — pure CSS removal, no other file references `--app-zoom` (confirmed via grep during design).

- [ ] **Step 1: Remove the variable declaration**

In the `:root` block, remove this line:
```css
--app-zoom: 0.9;
```

- [ ] **Step 2: Remove the zoom application**

In the `body` rule inside the second `@layer base` block, remove this line:
```css
zoom: var(--app-zoom);
```
Leave the rest of the `body` rule (`@apply bg-background text-foreground;`, `font-family`, `font-feature-settings`, `-webkit-font-smoothing`, `text-rendering`) untouched.

- [ ] **Step 3: Visual check on a non-AI-Workflow dashboard**

Run `npm run dev` (from `Nexus-Modern/`) if not already running. Open `http://localhost:3002/automation/web/requirements` in a browser (or via chrome-devtools MCP `navigate_page` + `take_screenshot`). Confirm the page renders larger than before (no `zoom` in computed styles for `<body>` in devtools), and no layout breaks (no overlapping text, no cards overflowing their containers).

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "fix(nexus-modern): remove global 90% body zoom

Every dashboard was authored assuming 1:1 rendering; the app-wide
zoom: 0.9 on body was silently shrinking all of them 10%, compounding
with any component that already used small text/tight padding."
```

---

### Task 2: Rework AI Workflow typography and spacing

**Files:**
- Modify: `Nexus-Modern/src/components/ai-workflow/AIWorkflowPage.tsx`

**Interfaces:** None — same component signature (`AIWorkflowPage({ initialPlatform })`), same exports, same behavior. Purely a className rewrite.

This is applied via a one-off script rather than manual edits, because the
same tight classes (`p-2`, `gap-1.5`, etc.) recur dozens of times across the
file and a naive sequential find-replace would double-shift values (e.g. if
`p-2`→`p-3` runs first, a later `p-3`→`p-4` pass would also catch the
already-converted instances). The script applies the full mapping in one
atomic pass per line using a single regex alternation, so every class token
is matched against its *original* value exactly once.

- [ ] **Step 1: Write the substitution script**

Create a temporary script (not committed) — e.g. `Nexus-Modern/scripts/_density-fix.py`:
```python
import re

PATH = "src/components/ai-workflow/AIWorkflowPage.tsx"

# Ordered by longest-match-first isn't required here because every key is
# distinguished by its exact suffix/boundary — re.sub with alternation
# tries alternatives left-to-right per position, and re module matches the
# first alternative that fits at each position, so list longer/more-specific
# tokens (e.g. "p-2.5") before shorter ones that could be a prefix ("p-2")
# is good practice; done below.
MAPPING = {
    # text sizes
    "text-[8px]": "text-[10px]",
    "text-[9px]": "text-[10px]",
    "text-[10px]": "text-xs",
    "text-[11px]": "text-sm",
    # padding (all axes)
    "p-2.5": "p-3.5", "px-2.5": "px-3.5", "py-2.5": "py-3.5",
    "p-1.5": "p-2", "px-1.5": "px-2", "py-1.5": "py-2",
    "p-1": "p-2", "px-1": "px-2", "py-1": "py-2",
    "p-2": "p-3", "px-2": "px-3", "py-2": "py-3",
    "p-3": "p-4", "px-3": "px-4", "py-3": "py-4",
    "p-4": "p-5", "px-4": "px-5", "py-4": "py-5",
    "p-5": "p-6", "px-5": "px-6", "py-5": "py-6",
    # gap
    "gap-2.5": "gap-3.5",
    "gap-1.5": "gap-2",
    "gap-1": "gap-2",
    "gap-2": "gap-3",
    "gap-3": "gap-4",
    # space-y / space-x
    "space-y-1.5": "space-y-2",
    "space-y-1": "space-y-2",
    "space-y-2": "space-y-3",
    "space-y-3": "space-y-4",
    "space-x-1.5": "space-x-2",
    "space-x-1": "space-x-2",
    "space-x-2": "space-x-3",
    # sidebar widths (each appears exactly once in this file)
    "w-72": "w-80",
    "w-60": "w-72",
}

# Longest keys first so e.g. "p-2.5" is tried before "p-2".
keys = sorted(MAPPING.keys(), key=len, reverse=True)
pattern = re.compile(
    r"(?<=[\s\"'`])(" + "|".join(re.escape(k) for k in keys) + r")(?=[\s\"'`])"
)

with open(PATH, "r", encoding="utf-8") as f:
    content = f.read()

def replace(match):
    return MAPPING[match.group(1)]

new_content = pattern.sub(replace, content)

with open(PATH, "w", encoding="utf-8", newline="\n") as f:
    f.write(new_content)

print("done")
```

- [ ] **Step 2: Run the script**

Run (from `Nexus-Modern/`): `python scripts/_density-fix.py`
Expected output: `done`

- [ ] **Step 3: Diff-review the result**

Run: `git diff --stat src/components/ai-workflow/AIWorkflowPage.tsx` (expect one file, sizeable insertion/deletion count roughly matching the occurrence counts found during design — dozens of lines). Then read a representative sample of the diff (`git diff src/components/ai-workflow/AIWorkflowPage.tsx | head -200`) to confirm: no `text-[Npx]` tokens remain except `text-[22px]` (the main heading, intentionally untouched — not in the mapping), sidebar `w-80`/`w-72` appear exactly once each, and no unrelated lines changed (e.g. color classes, `border-`, `rounded-`, icon `size={N}` props must be identical to before).

- [ ] **Step 4: Delete the throwaway script**

```bash
rm Nexus-Modern/scripts/_density-fix.py
```
(Only remove this script — do not touch any other file under `Nexus-Modern/scripts/`, e.g. `start-modern.ps1`.)

- [ ] **Step 5: Typecheck**

Run (from `Nexus-Modern/`): `npx tsc --noEmit`
Expected: 0 errors (className-only change; if anything shows up, it means a stray edit hit non-class text — investigate before proceeding, don't just silence it).

- [ ] **Step 6: Visual verification**

Via chrome-devtools MCP or the browser: navigate to `http://localhost:3002/automation/web/ai-workflow`, take a screenshot, and confirm: body text is now comfortably readable (no more 8-11px arbitrary sizes), the MCP Mission Control candidate stream and activity feed lists still scroll cleanly with no clipped rows, and the left/right sidebars (now `w-80`/`w-72`) don't cause horizontal overflow of the 3-column layout at a typical 1440px+ viewport width.

- [ ] **Step 7: Commit**

```bash
git add src/components/ai-workflow/AIWorkflowPage.tsx
git commit -m "fix(nexus-modern): rework AI Workflow typography and spacing

Bumps AI Workflow's outlier-tight text sizes (was text-[9-11px]) and
padding/gap (was p-2/p-2.5) up one tier each, matching the scale the
other 6 dashboards already use, plus widens the two sidebars slightly
to give the larger text room. Styling-only — no logic changes."
```
