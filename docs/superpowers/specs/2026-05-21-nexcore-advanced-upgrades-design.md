# NexCore Advanced Upgrades Design
_Date: 2026-05-21_

## Overview

Three parallel upgrades to the NexCore QA platform:
1. **BrowserDiscoveryAdapter** — real MCP result parsing (MCP as primary, Playwright as fallback)
2. **ClaudeProvider** — prompt caching + streaming with `AsyncIterator[str]`
3. **AI Workflow UI** — ultra-premium redesign across all 6 steps

---

## 1. BrowserDiscoveryAdapter — Real MCP Result Parsing

### Problem
`_mcp_result_to_discovery` fetches MCP data then discards it entirely and re-runs Playwright. MCP round-trip is wasted. Elements are always Playwright-sourced even when MCP is available and richer.

### Design

**`mcp_adapter.py`**
- `discover(url)` already returns a `dict` from POST `/discover`
- Add `parse_elements(raw: dict) -> list[MCPElement]` — maps MCP response fields to a typed dataclass: `selector`, `element_type`, `text`, `aria_label`, `confidence`
- Confidence scoring: `data-testid` → 0.95, `aria-label` → 0.85, `id` → 0.80, `name` → 0.75, CSS class → 0.50, xpath → 0.40

**`adapter.py` — `_mcp_result_to_discovery`**
- Parse MCP result via `MCPPlaywrightAdapter.parse_elements(raw)`
- If parsed element count ≥ 5: build `DiscoveryResponse` directly from MCP elements (no Playwright)
- If parsed element count < 5: run Playwright as enrichment, merge both sources, deduplicate by selector
- Map `MCPElement` → existing page element schema (name, locator, strategy, confidence)

**No changes to `playwright_adapter.py`** — it remains the fallback exactly as today.

### Outcome
- One browser session instead of two when MCP is healthy
- Richer element data (accessibility tree + DOM in one pass)
- Confidence scores on every element from the start

---

## 2. ClaudeProvider — Prompt Caching + Streaming

### Problem
- New `AsyncAnthropic` client created on every `generate()` call (TCP overhead per call)
- System prompt (large JSON schema) re-processed by Claude on every call — no caching
- No streaming — UI must wait for full response before showing anything

### Design

**`claude_provider.py`**
- Move `AsyncAnthropic(api_key=...)` to `__init__` — single client instance reused across all calls
- `generate(prompt, schema) -> T` — kept as-is for backward compat; internally uses streaming + accumulates to validate schema
- System prompt block gets `"cache_control": {"type": "ephemeral"}` — Claude caches the schema JSON across calls from same agent
- New method: `generate_stream(prompt, schema) -> AsyncIterator[str]` — yields raw text chunks as they arrive; caller responsible for accumulation and validation

**`base.py`** — add `generate_stream` abstract method with default implementation (falls back to `generate` for providers that don't support streaming)

**`service.py`** — `_run_scenario_generation` and `_run_testcase_generation` call `generate_stream()` and emit `AIJobProgress` events per chunk (throttled to every 50 chars to avoid flooding WebSocket)

### Outcome
- ~90% input token cost reduction on repeated agent calls (cached system prompts)
- First tokens appear in UI within ~300ms instead of waiting 3-8s for full response
- No breaking changes — `generate()` still works for all existing callers

---

## 3. AI Workflow UI — Ultra-Premium Redesign

### Design Principles
- Dark, glass-morphism aesthetic consistent with existing violet accent palette
- Framer Motion animations on every meaningful state transition
- Every step has a non-empty loading state, error state, and success state
- No placeholder content — all data-driven

### Step-by-Step Changes

**Left Panel — WorkflowTimeline**
- Vertical connector line between steps (animated fill as steps complete)
- Step cards expand to show sub-status text when active
- Completed steps show timestamp

**Step 1 — Input**
- BRD field: drag-and-drop zone with dashed border, file-type icons, accepts .txt/.pdf/.docx; animated on drag-over
- URL field: live favicon fetch preview (inline `<img>` next to input)
- Platform selector: icon buttons (web/mobile/api) instead of dropdown
- Submit button: gradient pulse animation while pending

**Step 2 — Model Selection**
- Model cards: capability bar trio (Speed / Accuracy / Cost) rendered as mini horizontal bars
- "Recommended" badge on best-tier model
- Selected card lifts with box-shadow + violet glow

**Step 3 — Discovery**
- Replace text log with `ElementDiscoveryFeed` — element cards slide in from right as they're found
- Each card: element name, type icon, locator strategy badge, confidence ring (SVG circle)
- Scroll-to-bottom auto-follow; pause-on-hover
- Summary line: "X elements found · Y low-confidence" with animated counter

**Step 5 — Test Generation**
- `TokenStream` component: typewriter cursor, monospace font, violet text on dark surface
- Live tokens from Claude streaming endpoint rendered character by character
- Shows current agent name ("Running: ScenarioGenerationAgent")

**Step 6 — Review**
- Confidence gauge bars (CSS width transition) instead of raw numbers
- Needs-review items: severity icon (critical/warning/info), one-click copy for locator
- Low-confidence locators: inline "Fix in Page Repository" CTA button
- Export button: download full review as JSON

**Right Panel — LiveIntelligence**
- Metric cards: animated count-up on value change
- Active model: provider logo + tier color ring
- Progress bar: gradient fill with shimmer animation while running

### No layout changes
Three-panel structure (`w-48 / flex-1 / w-56`) is kept. All changes are within existing components.

---

## File Map

| File | Change |
|------|--------|
| `nexus-api/app/ai_workflow/discovery/mcp_adapter.py` | Add `MCPElement` dataclass + `parse_elements()` |
| `nexus-api/app/ai_workflow/discovery/adapter.py` | Rewrite `_mcp_result_to_discovery` to use parsed elements |
| `nexus-api/app/ai_workflow/providers/base.py` | Add `generate_stream` abstract method |
| `nexus-api/app/ai_workflow/providers/claude_provider.py` | Client reuse, cache_control, `generate_stream()` |
| `nexus-api/app/ai_workflow/providers/null_provider.py` | Add stub `generate_stream()` |
| `nexus-api/app/ai_workflow/service.py` | Call `generate_stream()` in background tasks, emit progress chunks |
| `nexus-qa/src/app/ai-workflow/page.tsx` | Full premium redesign of all 6 steps + panels |

---

## Out of Scope
- NestJS backend changes
- New API routes
- Database schema changes
- OpenAI provider streaming (separate task)
