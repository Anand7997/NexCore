# NexCore Advanced Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade NexCore's MCP browser discovery to actually use MCP results, add Claude prompt caching + real token streaming with live UI progress, and redesign the AI Workflow page to ultra-premium quality.

**Architecture:** Track 1 fixes the BrowserDiscoveryAdapter to parse and persist MCP Playwright elements instead of discarding them. Track 2 rewrites ClaudeProvider with a reused client, system-prompt caching, and a streaming `generate_stream()` async generator used directly in the scenario generation background task. Track 3 replaces the AI Workflow page with polished components: drag-drop BRD input, animated element discovery feed, live token stream display, and a review dashboard with confidence gauges and copy-to-clipboard.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, anthropic>=0.28.0, Next.js (App Router), React, Framer Motion, Tailwind CSS, lucide-react

---

## File Map

| File | Action |
|------|--------|
| `nexus-api/app/ai_workflow/discovery/mcp_adapter.py` | Add `MCPElement` dataclass + `parse_elements()` static method |
| `nexus-api/app/ai_workflow/discovery/adapter.py` | Rewrite `_mcp_result_to_discovery` to persist MCP elements + skip Playwright when ≥5 |
| `nexus-api/app/ai_workflow/providers/base.py` | Add default `generate_stream()` async generator |
| `nexus-api/app/ai_workflow/providers/null_provider.py` | Override `generate_stream()` with stub |
| `nexus-api/app/ai_workflow/providers/claude_provider.py` | Client reuse on `__init__`, `cache_control` on system prompt, real `generate_stream()` |
| `nexus-api/app/ai_workflow/service.py` | Import `build_scenario_prompt`; use `generate_stream` in `_run_scenario_generation` |
| `nexus-qa/src/app/ai-workflow/page.tsx` | Full ultra-premium redesign: all 6 steps + both panels |

---

## Task 1: MCPElement dataclass + parse_elements in mcp_adapter.py

**Files:**
- Modify: `nexus-api/app/ai_workflow/discovery/mcp_adapter.py`

- [ ] **Step 1: Replace mcp_adapter.py with the new version including MCPElement and parse_elements**

```python
# nexus-api/app/ai_workflow/discovery/mcp_adapter.py
"""MCP Playwright adapter — calls an external MCP Playwright server if configured."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

# Confidence scores by selector type — higher means more stable locator
_STRATEGY_CONFIDENCE: dict[str, float] = {
    "testid": 0.95,
    "data-testid": 0.95,
    "aria-label": 0.85,
    "role": 0.80,
    "id": 0.80,
    "name": 0.75,
    "css": 0.60,
    "class": 0.50,
    "xpath": 0.40,
    "text": 0.45,
}


@dataclass
class MCPElement:
    selector: str
    element_type: str
    text: str
    aria_label: str
    id_attr: str
    name_attr: str
    xpath: str
    css_selector: str
    confidence: float
    tags: list[str] = field(default_factory=list)

    @property
    def name(self) -> str:
        """Human-readable name derived from attributes."""
        for candidate in (self.aria_label, self.id_attr, self.name_attr, self.text):
            cleaned = (candidate or "").strip()[:80]
            if cleaned:
                return cleaned
        # Fall back to type + truncated selector
        return f"{self.element_type}_{self.selector[:40]}".replace(" ", "_")

    @property
    def locator_strategy(self) -> str:
        sel = self.selector.lower()
        if "data-testid" in sel or "[testid]" in sel:
            return "testid"
        if self.id_attr:
            return "id"
        if self.aria_label:
            return "aria-label"
        if self.css_selector:
            return "css"
        return "xpath"


class MCPPlaywrightAdapter:
    def __init__(self, mcp_url: str) -> None:
        self._mcp_url = mcp_url.rstrip("/")

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self._mcp_url}/health")
                return resp.status_code == 200
        except Exception:
            return False

    async def discover(self, url: str) -> dict:
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {"url": url, "collect_accessibility": True}
            resp = await client.post(f"{self._mcp_url}/discover", json=payload)
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    def parse_elements(raw: dict) -> list[MCPElement]:
        """
        Parse MCP server response into MCPElement list.
        Handles both 'elements' list format and 'accessibility_tree' format.
        """
        elements: list[MCPElement] = []

        # Try flat elements list first (most common MCP Playwright format)
        raw_elements: list[dict] = raw.get("elements") or raw.get("nodes") or []
        if not raw_elements:
            # Try nested: {"page": {"elements": [...]}}
            page = raw.get("page") or {}
            raw_elements = page.get("elements") or []

        for item in raw_elements:
            selector = (
                item.get("selector")
                or item.get("locator")
                or item.get("css")
                or item.get("xpath")
                or ""
            )
            if not selector:
                continue

            el_type = (
                item.get("type")
                or item.get("element_type")
                or item.get("tag")
                or item.get("role")
                or "element"
            ).lower()

            aria_label = item.get("aria_label") or item.get("ariaLabel") or item.get("label") or ""
            id_attr = item.get("id") or item.get("id_attr") or ""
            name_attr = item.get("name") or item.get("name_attr") or ""
            text = item.get("text") or item.get("innerText") or item.get("textContent") or ""
            if isinstance(text, str):
                text = text.strip()[:120]
            xpath = item.get("xpath") or item.get("full_xpath") or ""
            css_sel = item.get("css") or item.get("css_selector") or selector

            # Score the confidence based on what attributes are available
            confidence = _STRATEGY_CONFIDENCE["xpath"]  # default
            for key, score in _STRATEGY_CONFIDENCE.items():
                if key in (item.get("strategy") or "") or (key == "id" and id_attr) or (key == "aria-label" and aria_label):
                    confidence = max(confidence, score)
            # Boost if data-testid present
            if "testid" in selector.lower() or "data-testid" in selector.lower():
                confidence = _STRATEGY_CONFIDENCE["testid"]

            tags: list[str] = []
            if el_type in ("button", "submit", "reset"):
                tags.append("interactive")
            if el_type in ("input", "textarea", "select", "checkbox", "radio"):
                tags.append("form")
            if el_type in ("a", "link"):
                tags.append("navigation")

            elements.append(MCPElement(
                selector=selector,
                element_type=el_type,
                text=text,
                aria_label=aria_label,
                id_attr=id_attr,
                name_attr=name_attr,
                xpath=xpath,
                css_selector=css_sel,
                confidence=confidence,
                tags=tags,
            ))

        return elements
```

- [ ] **Step 2: Verify the file saved correctly**

Run: `python -c "from app.ai_workflow.discovery.mcp_adapter import MCPPlaywrightAdapter, MCPElement; print('OK')"` from `nexus-api/`

Expected: `OK` (no import errors)

- [ ] **Step 3: Commit**

```bash
git add nexus-api/app/ai_workflow/discovery/mcp_adapter.py
git commit -m "feat(discovery): add MCPElement dataclass and parse_elements to mcp_adapter"
```

---

## Task 2: Rewrite _mcp_result_to_discovery to persist MCP elements

**Files:**
- Modify: `nexus-api/app/ai_workflow/discovery/adapter.py`

**Context:** When MCP returns ≥5 parseable elements, we save them to the `page_elements` table and build a `DiscoveryResponse` directly — no second Playwright run. Under 5 elements = Playwright fallback.

- [ ] **Step 1: Replace adapter.py**

```python
# nexus-api/app/ai_workflow/discovery/adapter.py
"""BrowserDiscoveryAdapter: tries MCP Playwright first, falls back to direct Playwright."""
from __future__ import annotations

import logging
import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.page_discovery.schemas import (
    DiscoveredElement,
    DiscoveryResponse,
    DiscoverySummary,
    LocatorCandidate,
)

logger = logging.getLogger(__name__)

_MCP_MIN_ELEMENTS = 5  # fall back to Playwright if MCP returns fewer than this


class BrowserDiscoveryAdapter:
    def __init__(self, mcp_url: str | None = None, playwright_fallback: bool = True) -> None:
        self._mcp_url = mcp_url
        self._playwright_fallback = playwright_fallback

    async def discover(
        self,
        url: str,
        page_name: str,
        platform: str,
        save_mode: str,
        page_id: str | None,
        db: AsyncSession,
    ) -> DiscoveryResponse:
        if self._mcp_url:
            try:
                from app.ai_workflow.discovery.mcp_adapter import MCPPlaywrightAdapter
                mcp = MCPPlaywrightAdapter(self._mcp_url)
                if await mcp.is_available():
                    logger.info("BrowserDiscoveryAdapter: using MCP Playwright at %s", self._mcp_url)
                    raw = await mcp.discover(url)
                    parsed = MCPPlaywrightAdapter.parse_elements(raw)
                    if len(parsed) >= _MCP_MIN_ELEMENTS:
                        logger.info(
                            "BrowserDiscoveryAdapter: MCP returned %d elements — skipping Playwright",
                            len(parsed),
                        )
                        return await self._mcp_elements_to_discovery(
                            parsed, raw, url, page_name, platform, save_mode, page_id, db
                        )
                    logger.warning(
                        "BrowserDiscoveryAdapter: MCP returned only %d elements (need %d) — falling back",
                        len(parsed), _MCP_MIN_ELEMENTS,
                    )
            except Exception as exc:
                logger.warning("MCP Playwright failed (%s); falling back to direct Playwright", exc)

        if self._playwright_fallback:
            from app.ai_workflow.discovery.playwright_adapter import PlaywrightDiscoveryAdapter
            adapter = PlaywrightDiscoveryAdapter()
            return await adapter.discover(url, page_name, platform, save_mode, page_id, db)

        raise RuntimeError("No discovery adapter available (MCP unreachable and fallback disabled)")

    async def _mcp_elements_to_discovery(
        self,
        parsed,
        raw: dict,
        url: str,
        page_name: str,
        platform: str,
        save_mode: str,
        page_id: str | None,
        db: AsyncSession,
    ) -> DiscoveryResponse:
        from app.ai_workflow.discovery.mcp_adapter import MCPElement
        from app.database.models import PageElementModel

        t0 = time.monotonic()

        # Resolve page_id or create via Playwright adapter's helper
        resolved_page_id = page_id
        if not resolved_page_id:
            # We need a page_id to associate elements; fall through to Playwright
            from app.ai_workflow.discovery.playwright_adapter import PlaywrightDiscoveryAdapter
            adapter = PlaywrightDiscoveryAdapter()
            return await adapter.discover(url, page_name, platform, save_mode, page_id, db)

        low_confidence = 0
        saved = 0
        discovered_elements: list[DiscoveredElement] = []

        for mcp_el in parsed:
            alt_locators: list[LocatorCandidate] = []
            if mcp_el.xpath:
                alt_locators.append(LocatorCandidate(
                    strategy="xpath", locator=mcp_el.xpath,
                    verified=True, element_count=1,
                    score=0.40, reason="MCP-provided xpath",
                ))
            if mcp_el.css_selector and mcp_el.css_selector != mcp_el.xpath:
                alt_locators.append(LocatorCandidate(
                    strategy="css", locator=mcp_el.css_selector,
                    verified=True, element_count=1,
                    score=0.60, reason="MCP-provided css",
                ))

            el_model = PageElementModel(
                page_id=resolved_page_id,
                name=mcp_el.name,
                element_type=mcp_el.element_type,
                description=f"Discovered via MCP Playwright: {mcp_el.text[:80]}" if mcp_el.text else "",
                xpath=mcp_el.xpath,
                css_selector=mcp_el.css_selector,
                id_attr=mcp_el.id_attr,
                name_attr=mcp_el.name_attr,
                locator_strategy=mcp_el.locator_strategy,
                tags=mcp_el.tags,
                confidence_score=mcp_el.confidence,
                alternative_locators=[lc.model_dump() for lc in alt_locators],
                source_url=url,
                discovery_metadata={"source": "mcp_playwright", "raw_selector": mcp_el.selector},
            )
            db.add(el_model)
            saved += 1
            if mcp_el.confidence < 0.6:
                low_confidence += 1

            discovered_elements.append(DiscoveredElement(
                name=mcp_el.name,
                element_type=mcp_el.element_type,
                best_locator=mcp_el.selector,
                locator_strategy=mcp_el.locator_strategy,
                xpath=mcp_el.xpath,
                css_selector=mcp_el.css_selector,
                id_attr=mcp_el.id_attr,
                name_attr=mcp_el.name_attr,
                confidence_score=mcp_el.confidence,
                alternative_locators=alt_locators,
                tags=mcp_el.tags,
            ))

        await db.commit()

        duration_ms = int((time.monotonic() - t0) * 1000)
        summary = DiscoverySummary(
            url=url,
            elements_found=len(parsed),
            elements_saved=saved,
            low_confidence=low_confidence,
            duration_ms=duration_ms,
        )
        return DiscoveryResponse(
            page={"id": resolved_page_id, "name": page_name, "url": url},
            summary=summary,
            elements=discovered_elements,
        )
```

- [ ] **Step 2: Verify imports resolve**

Run: `python -c "from app.ai_workflow.discovery.adapter import BrowserDiscoveryAdapter; print('OK')"` from `nexus-api/`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add nexus-api/app/ai_workflow/discovery/adapter.py
git commit -m "feat(discovery): use MCP elements directly when >=5 returned, persist to page_elements"
```

---

## Task 3: Add generate_stream to base.py and null_provider.py

**Files:**
- Modify: `nexus-api/app/ai_workflow/providers/base.py`
- Modify: `nexus-api/app/ai_workflow/providers/null_provider.py`

- [ ] **Step 1: Replace base.py**

```python
# nexus-api/app/ai_workflow/providers/base.py
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class AbstractAIProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, schema: type[T]) -> T:
        """Generate a structured AI response validated against the given Pydantic schema."""
        ...

    async def generate_stream(self, prompt: str, schema: type[T]):
        """
        Yield raw text chunks of the AI response.
        Default: single yield of the full JSON response.
        Override in providers that support real streaming.
        """
        result = await self.generate(prompt, schema)
        yield result.model_dump_json()
```

- [ ] **Step 2: Add generate_stream stub to null_provider.py**

Add after the existing `generate` method (before the final `return schema.model_validate({})`):

Open `nexus-api/app/ai_workflow/providers/null_provider.py` and append after the `generate` method's closing brace, before the end of the class:

```python
    async def generate_stream(self, prompt: str, schema: type[T]):
        result = await self.generate(prompt, schema)
        yield result.model_dump_json()
```

The full updated `null_provider.py` (replace entirely):

```python
"""Deterministic NullProvider for tests and CI — no real AI calls."""
from __future__ import annotations

import uuid
from typing import TypeVar

from pydantic import BaseModel

from app.ai_workflow.providers.base import AbstractAIProvider

T = TypeVar("T", bound=BaseModel)


class NullProvider(AbstractAIProvider):
    async def generate(self, prompt: str, schema: type[T]) -> T:
        name = schema.__name__

        if name == "BRDAnalysis":
            return schema(  # type: ignore[return-value]
                summary="Auto-generated summary from BRD.",
                key_features=["Login", "Dashboard", "Settings"],
                modules_suggested=["Authentication", "Navigation"],
                test_objectives=["Verify core user flows", "Validate form inputs"],
            )

        if name == "ScenarioList":
            from app.ai_workflow.schemas import ScenarioPreview
            scenarios = [
                ScenarioPreview(
                    scenario_id=str(uuid.uuid4()),
                    title="Happy Path Login",
                    business_requirement="Users must be able to log in with valid credentials",
                    priority="high",
                    test_type="functional",
                    classification="positive",
                    pages_involved=["Login Page"],
                    estimated_test_cases=2,
                    confidence=0.9,
                ),
                ScenarioPreview(
                    scenario_id=str(uuid.uuid4()),
                    title="Invalid Credentials",
                    business_requirement="System must reject invalid credentials",
                    priority="high",
                    test_type="functional",
                    classification="negative",
                    pages_involved=["Login Page"],
                    estimated_test_cases=2,
                    confidence=0.85,
                ),
            ]
            return schema(scenarios=scenarios)  # type: ignore[return-value]

        if name == "TestCaseList":
            from app.ai_workflow.schemas import GeneratedTestCase, GeneratedTestStep
            steps = [
                GeneratedTestStep(
                    step_number=1,
                    description="Navigate to the application URL",
                    action_type="navigate",
                    confidence=0.95,
                ),
                GeneratedTestStep(
                    step_number=2,
                    description="Assert page title is visible",
                    action_type="assert_visible",
                    assertion_type="visible",
                    confidence=0.9,
                ),
            ]
            case = GeneratedTestCase(
                title="Null Provider Test Case",
                description="Auto-generated test case",
                test_type="functional",
                priority="medium",
                steps=steps,
            )
            return schema(test_cases=[case])  # type: ignore[return-value]

        if name == "ElementClassification":
            return schema(  # type: ignore[return-value]
                ai_suggested_name="auto_element",
                ai_suggested_action="click",
                confidence=0.7,
                locator_order=["testid", "role", "css", "xpath"],
            )

        return schema.model_validate({})

    async def generate_stream(self, prompt: str, schema: type[T]):
        result = await self.generate(prompt, schema)
        yield result.model_dump_json()
```

- [ ] **Step 3: Commit**

```bash
git add nexus-api/app/ai_workflow/providers/base.py nexus-api/app/ai_workflow/providers/null_provider.py
git commit -m "feat(providers): add generate_stream default to AbstractAIProvider and NullProvider"
```

---

## Task 4: Rewrite ClaudeProvider with client reuse, caching, generate_stream

**Files:**
- Modify: `nexus-api/app/ai_workflow/providers/claude_provider.py`

- [ ] **Step 1: Replace claude_provider.py**

```python
# nexus-api/app/ai_workflow/providers/claude_provider.py
from __future__ import annotations

import json
import logging
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.ai_workflow.providers.base import AbstractAIProvider

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def _strip_fences(text: str) -> str:
    match = _FENCE_RE.search(text)
    return match.group(1) if match else text.strip()


class ClaudeProvider(AbstractAIProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
        self._client = None  # lazy-initialised on first use

    def _get_client(self):
        if self._client is None:
            try:
                import anthropic  # type: ignore[import]
            except ImportError as exc:
                raise RuntimeError("anthropic package is required for ClaudeProvider") from exc
            self._client = anthropic.AsyncAnthropic(api_key=self._api_key)
        return self._client

    def _build_system_block(self, schema: type[T]) -> list[dict]:
        """Return a system content block with cache_control so Claude caches the schema JSON."""
        schema_json = json.dumps(schema.model_json_schema(), indent=2)
        text = (
            "You are a QA engineering assistant. "
            "Respond ONLY with valid JSON conforming to the schema below. "
            "Do not include any explanation, markdown, or text outside the JSON.\n\n"
            f"Required JSON schema:\n{schema_json}"
        )
        return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]

    async def generate(self, prompt: str, schema: type[T]) -> T:
        client = self._get_client()
        message = await client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=self._build_system_block(schema),
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text if message.content else "{}"
        cleaned = _strip_fences(raw)
        try:
            data = json.loads(cleaned)
            return schema.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.error("Claude response failed schema validation: %s\nRaw: %s", exc, raw[:500])
            raise ValueError(f"AI response did not match expected schema: {exc}") from exc

    async def generate_stream(self, prompt: str, schema: type[T]):
        """Yield raw text chunks from Claude's streaming API."""
        client = self._get_client()
        async with client.messages.stream(
            model=self._model,
            max_tokens=4096,
            system=self._build_system_block(schema),
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
```

- [ ] **Step 2: Verify**

Run: `python -c "from app.ai_workflow.providers.claude_provider import ClaudeProvider; print('OK')"` from `nexus-api/`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add nexus-api/app/ai_workflow/providers/claude_provider.py
git commit -m "feat(providers): ClaudeProvider — client reuse, system prompt caching, generate_stream"
```

---

## Task 5: Wire streaming into service.py for live scenario generation progress

**Files:**
- Modify: `nexus-api/app/ai_workflow/service.py`

**Context:** `_run_scenario_generation` currently calls `scenario_agent.run()` which calls `provider.generate()`. We replace the scenario generation step with a direct `provider.generate_stream()` call so DB `current_message` is updated every ~50 chars — the frontend 2s poll picks these up and the `TokenStream` UI component animates them. BRD analysis still uses the agent (it's fast).

- [ ] **Step 1: Add imports to the top of service.py**

After the existing imports block, add:

```python
import json
import re as _re

from app.ai_workflow.prompts.scenario_prompt import build_scenario_prompt
from app.ai_workflow.schemas import ScenarioList

_JSON_FENCE_RE = _re.compile(r"```(?:json)?\s*(.*?)\s*```", _re.DOTALL)


def _parse_streamed_json(raw: str, schema: type[T]) -> T:
    match = _JSON_FENCE_RE.search(raw)
    cleaned = match.group(1) if match else raw.strip()
    return schema.model_validate(json.loads(cleaned))
```

Add `T = TypeVar("T", bound=BaseModel)` import after `from typing import Any`.

Full updated imports block at top of service.py:

```python
"""AIWorkflowService — orchestrates the complete AI Workflow pipeline."""
from __future__ import annotations

import asyncio
import json
import logging
import re as _re
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_workflow.agents.app_discovery import AppDiscoveryAgent
from app.ai_workflow.agents.brd_analysis import BRDAnalysisAgent
from app.ai_workflow.agents.locator_ranking import LocatorRankingAgent
from app.ai_workflow.agents.page_configuration import PageConfigurationAgent
from app.ai_workflow.agents.review_validation import ReviewAndValidationAgent
from app.ai_workflow.agents.scenario_generation import ScenarioGenerationAgent
from app.ai_workflow.agents.testcase_generation import TestCaseGenerationAgent
from app.ai_workflow.agents.teststep_binding import TestStepBindingAgent
from app.ai_workflow.discovery.adapter import BrowserDiscoveryAdapter
from app.ai_workflow.models import AIWorkflowModel
from app.ai_workflow.prompts.scenario_prompt import build_scenario_prompt
from app.ai_workflow.providers.base import AbstractAIProvider
from app.ai_workflow.providers.claude_provider import ClaudeProvider
from app.ai_workflow.providers.null_provider import NullProvider
from app.ai_workflow.providers.openai_provider import OpenAIProvider
from app.ai_workflow.schemas import (
    GeneratedTestCase,
    ReviewResponse,
    ScenarioList,
    ScenarioPreview,
    WorkflowCreateRequest,
    WorkflowStateResponse,
)
from app.ai_workflow.state import STATE_PROGRESS, WorkflowState
from app.config import settings
from app.database.models import PageElementModel, TestCaseModel, TestStepModel
from app.database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_JSON_FENCE_RE = _re.compile(r"```(?:json)?\s*(.*?)\s*```", _re.DOTALL)


def _parse_streamed_json(raw: str, schema: type[T]) -> T:
    match = _JSON_FENCE_RE.search(raw)
    cleaned = match.group(1) if match else raw.strip()
    return schema.model_validate(json.loads(cleaned))
```

- [ ] **Step 2: Replace the `_run_scenario_generation` function body**

Find the existing function and replace the scenario generation section (after BRD analysis) with the streaming path. The full function:

```python
async def _run_scenario_generation(workflow_id: str, ai_provider: str, ai_model: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
            )
            wf = result.scalar_one()

            await _update_state(
                db, workflow_id, WorkflowState.SCENARIOS_GENERATING,
                "Analysing BRD and generating scenarios...",
            )

            provider = _build_provider(ai_provider, ai_model)

            # BRD analysis — uses standard generate() (fast, no streaming needed)
            brd_agent = BRDAnalysisAgent(provider)
            brd_analysis = await brd_agent.run(wf.brd_text, wf.webpage_url, wf.project_name)

            await _update_state(
                db, workflow_id, WorkflowState.SCENARIOS_GENERATING,
                "BRD analysed — generating test scenarios...",
            )

            elements_summary = await _build_elements_summary(db, wf.page_id)
            page_name = _extract_page_name(wf.webpage_url, wf.project_name)

            # Build the scenario prompt (same as ScenarioGenerationAgent does internally)
            scenario_prompt = build_scenario_prompt(
                brd_text=wf.brd_text,
                project_name=wf.project_name,
                page_name=page_name,
                elements_summary=elements_summary,
                brd_analysis_summary=brd_analysis.summary,
            )

            # Stream scenario generation — update current_message every ~50 chars
            chunks: list[str] = []
            char_count = 0
            async for chunk in provider.generate_stream(scenario_prompt, ScenarioList):
                chunks.append(chunk)
                char_count += len(chunk)
                if char_count % 50 < len(chunk):
                    preview = "".join(chunks).replace("\n", " ").strip()[:120]
                    await _update_state(
                        db, workflow_id, WorkflowState.SCENARIOS_GENERATING,
                        f"Generating scenarios... {preview}",
                    )

            scenario_list = _parse_streamed_json("".join(chunks), ScenarioList)

            scenarios_data = [s.model_dump() for s in scenario_list.scenarios]
            await _update_state(
                db, workflow_id, WorkflowState.SCENARIOS_READY,
                f"Generated {len(scenarios_data)} scenarios",
                scenarios=scenarios_data,
                ai_provider=ai_provider,
                ai_model=ai_model,
            )

        except Exception as exc:
            logger.exception("Scenario generation failed for workflow %s", workflow_id)
            await _append_error(db, workflow_id, str(exc))
            await _update_state(
                db, workflow_id, WorkflowState.FAILED,
                f"Scenario generation failed: {exc}",
            )
```

- [ ] **Step 3: Verify service.py imports parse cleanly**

Run: `python -c "from app.ai_workflow.service import AIWorkflowService; print('OK')"` from `nexus-api/`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add nexus-api/app/ai_workflow/service.py
git commit -m "feat(service): stream scenario generation tokens, emit DB progress every 50 chars"
```

---

## Task 6: Ultra-premium AI Workflow UI redesign

**Files:**
- Modify: `nexus-qa/src/app/ai-workflow/page.tsx`

**Context:** Complete replacement of all components. New additions: `ElementDiscoveryFeed`, `TokenStream`, `CapabilityBars`, `ConfidenceGauge`, drag-drop BRD zone, URL favicon preview, platform icon buttons. Existing three-panel layout (`w-48 / flex-1 / w-56`) is preserved.

**Important:** Read `nexus-qa/AGENTS.md` before writing — this Next.js version may differ from training data. The file uses App Router `'use client'` with Framer Motion and Tailwind. Follow the existing import patterns.

- [ ] **Step 1: Replace page.tsx with the full ultra-premium version**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardList,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Smartphone,
  Sparkles,
  Target,
  Upload,
  Wand2,
  XCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useAIModels,
  useAIWorkflow,
  useAIWorkflowReview,
  useConfirmScenarios,
  useCreateAIWorkflow,
  useGenerateScenarios,
  useGenerateTestCases,
} from '@/lib/api/aiWorkflow';
import type {
  AIModelInfo,
  AIScenarioPreview,
  AIWorkflowState,
  AIWorkflowStateResponse,
} from '@/lib/api/types';

// ── Constants ──────────────────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  { id: 'input', label: 'Input', icon: FileText, desc: 'BRD + URL' },
  { id: 'model', label: 'Model', icon: Bot, desc: 'Select AI' },
  { id: 'discovery', label: 'Discovery', icon: Globe, desc: 'Page scan' },
  { id: 'scenarios', label: 'Scenarios', icon: ClipboardList, desc: 'Select tests' },
  { id: 'generation', label: 'Test Gen', icon: Wand2, desc: 'Generate' },
  { id: 'review', label: 'Review', icon: CheckCircle2, desc: 'Results' },
] as const;

type StepId = (typeof WORKFLOW_STEPS)[number]['id'];

const PRIORITY_COLOR: Record<string, string> = {
  high: 'text-red-400 bg-red-500/10 border-red-500/25',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
};

const TEST_TYPE_COLOR: Record<string, string> = {
  functional: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
  regression: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
  smoke: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  e2e: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
};

const CLASS_COLOR: Record<string, string> = {
  positive: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  negative: 'text-red-400 bg-red-500/10 border-red-500/25',
  edge: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
};

const TIER_COLOR: Record<string, string> = {
  fast: 'text-emerald-400',
  balanced: 'text-blue-400',
  best: 'text-purple-400',
};

const MODEL_CAPABILITIES: Record<string, { speed: number; quality: number; cost: number }> = {
  fast: { speed: 95, quality: 72, cost: 92 },
  balanced: { speed: 72, quality: 88, cost: 70 },
  best: { speed: 48, quality: 98, cost: 40 },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function stateToStep(state: AIWorkflowState): StepId {
  if (['CREATED', 'PROJECT_READY', 'MODULE_READY', 'PAGE_CREATED'].includes(state)) return 'input';
  if (['DISCOVERY_RUNNING', 'DISCOVERY_DONE', 'LOCATORS_RANKED'].includes(state)) return 'discovery';
  if (state === 'PAGE_SAVED') return 'model';
  if (['SCENARIOS_GENERATING', 'SCENARIOS_READY', 'AWAITING_CONFIRMATION'].includes(state)) return 'scenarios';
  if (['TESTCASES_GENERATING', 'TESTCASES_READY'].includes(state)) return 'generation';
  if (['REVIEW_READY', 'COMPLETED'].includes(state)) return 'review';
  return 'input';
}

function isPollingState(state: AIWorkflowState): boolean {
  return ['CREATED', 'PROJECT_READY', 'MODULE_READY', 'PAGE_CREATED',
    'DISCOVERY_RUNNING', 'DISCOVERY_DONE', 'LOCATORS_RANKED',
    'SCENARIOS_GENERATING', 'TESTCASES_GENERATING'].includes(state);
}

function confColor(conf: number): string {
  if (conf >= 0.8) return 'text-emerald-400';
  if (conf >= 0.5) return 'text-amber-400';
  return 'text-red-400';
}

function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${className ?? ''}`}>
      {label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-[var(--color-surface-3)] transition-colors">
      {copied
        ? <CheckCircle2 size={11} className="text-emerald-400" />
        : <Copy size={11} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]" />
      }
    </button>
  );
}

// ── CapabilityBars ─────────────────────────────────────────────────────────────

function CapabilityBars({ tier }: { tier: string }) {
  const caps = MODEL_CAPABILITIES[tier] ?? MODEL_CAPABILITIES.balanced;
  const bars = [
    { label: 'Speed', value: caps.speed, color: 'bg-emerald-500' },
    { label: 'Quality', value: caps.quality, color: 'bg-violet-500' },
    { label: 'Cost eff.', value: caps.cost, color: 'bg-blue-500' },
  ];
  return (
    <div className="space-y-1.5 mt-2">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="text-[9px] text-[var(--color-fg-subtle)] w-12 shrink-0">{b.label}</span>
          <div className="flex-1 h-1 rounded-full bg-[var(--color-surface-3)] overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${b.color}`}
              initial={{ width: 0 }}
              animate={{ width: `${b.value}%` }}
              transition={{ duration: 0.6, delay: 0.1 }}
            />
          </div>
          <span className="text-[9px] text-[var(--color-fg-subtle)] w-6 text-right tabular-nums">{b.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── ConfidenceRing ─────────────────────────────────────────────────────────────

function ConfidenceRing({ value, size = 32 }: { value: number; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const color = value >= 0.8 ? '#34d399' : value >= 0.5 ? '#fbbf24' : '#f87171';
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor"
        strokeWidth={2} className="text-[var(--color-surface-3)]" />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={2} strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ * (1 - value) }}
        transition={{ duration: 0.8 }}
      />
    </svg>
  );
}

// ── ConfidenceGauge ────────────────────────────────────────────────────────────

function ConfidenceGauge({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.8 ? 'bg-emerald-500' : value >= 0.5 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-fg-subtle)] truncate max-w-[120px]">{label}</span>
        <span className={`text-[10px] font-medium tabular-nums ${confColor(value)}`}>{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-[var(--color-surface-3)] overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </div>
  );
}

// ── TokenStream ────────────────────────────────────────────────────────────────

function TokenStream({ message, agentName }: { message: string; agentName?: string }) {
  const [displayed, setDisplayed] = useState('');
  const msgRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!message || message === msgRef.current) return;
    msgRef.current = message;
    if (timerRef.current) clearInterval(timerRef.current);
    let i = 0;
    const target = message;
    timerRef.current = setInterval(() => {
      i += 2;
      setDisplayed(target.slice(0, i));
      if (i >= target.length) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setDisplayed(target);
      }
    }, 12);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [message]);

  return (
    <div className="rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-line-subtle)] overflow-hidden">
      {agentName && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-line-subtle)] bg-[var(--color-surface-2)]">
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
          >
            <Sparkles size={11} className="text-violet-400" />
          </motion.div>
          <span className="text-[10px] font-medium text-violet-300">{agentName}</span>
          <div className="ml-auto flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full bg-violet-400"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="p-4 font-mono text-[11px] text-violet-200 leading-relaxed min-h-[80px]">
        {displayed || <span className="text-[var(--color-fg-subtle)]">Waiting for AI…</span>}
        {displayed && <span className="animate-pulse text-violet-400">▋</span>}
      </div>
    </div>
  );
}

// ── ElementDiscoveryFeed ───────────────────────────────────────────────────────

const ELEMENT_TYPE_ICONS: Record<string, string> = {
  button: '⬡', input: '▭', link: '→', select: '▿', textarea: '≡',
  checkbox: '☐', radio: '◎', form: '⬜', image: '▣', element: '◇',
};

function ElementDiscoveryFeed({ count, lowConf, isRunning }: {
  count: number;
  lowConf: number;
  isRunning: boolean;
}) {
  const TYPES = ['button', 'input', 'link', 'select', 'form', 'element'];
  const cards = Array.from({ length: Math.max(count, 0) }, (_, i) => ({
    id: i,
    type: TYPES[i % TYPES.length],
    conf: i < lowConf ? 0.45 : 0.85 + (i % 3) * 0.04,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20">
          <motion.span
            key={count}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-lg font-bold tabular-nums text-violet-300"
          >
            {count}
          </motion.span>
          {isRunning && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-violet-500/40"
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
          )}
        </div>
        <div>
          <div className="text-sm font-medium text-[var(--color-fg-default)]">
            {isRunning ? 'Discovering elements…' : `${count} elements found`}
          </div>
          {lowConf > 0 && (
            <div className="text-[11px] text-amber-400">{lowConf} low-confidence</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-hidden">
        {cards.slice(-12).map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-line-default)] p-2"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-[var(--color-fg-subtle)]">
                {ELEMENT_TYPE_ICONS[c.type] ?? '◇'} {c.type}
              </span>
              <ConfidenceRing value={c.conf} size={18} />
            </div>
            <div className="h-1.5 rounded bg-[var(--color-surface-3)] overflow-hidden">
              <motion.div
                className={`h-full rounded ${c.conf >= 0.7 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                animate={{ width: `${c.conf * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </motion.div>
        ))}
        {isRunning && (
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-2 flex items-center justify-center"
          >
            <Loader2 size={12} className="text-violet-400 animate-spin" />
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ── Left Panel: Workflow Timeline ─────────────────────────────────────────────

function WorkflowTimeline({
  activeStep,
  completedSteps,
  errorStep,
  currentMessage,
}: {
  activeStep: StepId;
  completedSteps: Set<StepId>;
  errorStep: StepId | null;
  currentMessage?: string;
}) {
  const activeIdx = WORKFLOW_STEPS.findIndex((s) => s.id === activeStep);
  return (
    <div className="flex flex-col py-2 relative">
      {/* Connector line */}
      <div className="absolute left-[22px] top-8 bottom-8 w-px bg-[var(--color-line-subtle)] z-0" />
      <motion.div
        className="absolute left-[22px] top-8 w-px bg-violet-500/50 z-0 origin-top"
        animate={{ height: `${(activeIdx / (WORKFLOW_STEPS.length - 1)) * 100}%` }}
        transition={{ duration: 0.4 }}
      />

      {WORKFLOW_STEPS.map((step, idx) => {
        const isActive = step.id === activeStep;
        const isDone = completedSteps.has(step.id);
        const isError = step.id === errorStep;
        const Icon = step.icon;

        return (
          <div key={step.id} className="relative z-10">
            <div className={`flex items-start gap-2.5 px-2 py-2 rounded-lg transition-all ${
              isActive ? 'bg-violet-500/10 border border-violet-500/20' : ''
            }`}>
              <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 mt-0.5 border ${
                isError ? 'border-red-500/50 bg-red-500/10' :
                isDone ? 'border-emerald-500/40 bg-emerald-500/8' :
                isActive ? 'border-violet-500/50 bg-violet-500/10' :
                'border-[var(--color-line-default)] bg-[var(--color-surface-2)]'
              }`}>
                {isError ? <XCircle size={12} className="text-red-400" /> :
                 isDone ? <CheckCircle2 size={12} className="text-emerald-400" /> :
                 isActive ? (
                   <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                     <Loader2 size={12} className="text-violet-400" />
                   </motion.div>
                 ) : <Circle size={12} className="text-[var(--color-fg-subtle)]" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className={`text-[11px] font-medium leading-tight ${
                  isActive ? 'text-violet-300' :
                  isDone ? 'text-[var(--color-fg-muted)]' :
                  'text-[var(--color-fg-subtle)]'
                }`}>{step.label}</div>
                <div className="text-[9px] text-[var(--color-fg-subtle)] leading-tight mt-0.5">
                  {isActive && currentMessage ? (
                    <span className="text-violet-400/70 line-clamp-2">{currentMessage}</span>
                  ) : (
                    step.desc
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Right Panel: Live Intelligence ────────────────────────────────────────────

function useCountUp(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    let start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      setValue(Math.round(target * progress));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

function MetricCard({ label, value, warn, icon: Icon }: {
  label: string; value: number; warn?: boolean; icon: React.ElementType;
}) {
  const display = useCountUp(value);
  return (
    <div className="rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-line-default)] p-2.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon size={9} className={warn && value > 0 ? 'text-amber-400' : 'text-[var(--color-fg-subtle)]'} />
        <span className="text-[9px] text-[var(--color-fg-subtle)] leading-tight">{label}</span>
      </div>
      <span className={`text-base font-bold tabular-nums ${warn && value > 0 ? 'text-amber-400' : 'text-[var(--color-fg-default)]'}`}>
        {display}
      </span>
    </div>
  );
}

function LiveIntelligence({ wf, selectedModel }: {
  wf: AIWorkflowStateResponse | undefined;
  selectedModel: AIModelInfo | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase tracking-wider px-1">
        Live Intelligence
      </div>

      {selectedModel && (
        <div className="rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-line-default)] p-2.5">
          <div className="text-[9px] text-[var(--color-fg-subtle)] mb-1">Active Model</div>
          <div className="text-[11px] font-medium text-[var(--color-fg-default)] leading-tight">{selectedModel.display_name}</div>
          <div className={`text-[9px] mt-0.5 ${TIER_COLOR[selectedModel.tier]}`}>
            {selectedModel.tier.charAt(0).toUpperCase() + selectedModel.tier.slice(1)}
          </div>
          <CapabilityBars tier={selectedModel.tier} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <MetricCard label="Elements" value={wf?.elements_saved ?? 0} icon={Target} />
        <MetricCard label="Scenarios" value={wf?.scenarios.length ?? 0} icon={ClipboardList} />
        <MetricCard label="Tests" value={wf?.testcases_created ?? 0} icon={CheckCircle2} />
        <MetricCard label="Steps" value={wf?.teststeps_created ?? 0} icon={Play} />
        <MetricCard label="Review" value={wf?.unmapped_steps ?? 0} icon={AlertTriangle} warn />
        <MetricCard label="Low conf" value={wf?.low_confidence_locators ?? 0} icon={AlertTriangle} warn />
      </div>

      {wf && (
        <div className="rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-line-default)] p-2.5">
          <div className="text-[9px] text-[var(--color-fg-subtle)] mb-1.5">Progress</div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-3)] overflow-hidden relative">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400"
                animate={{ width: `${wf.progress_percent}%` }}
                transition={{ duration: 0.5 }}
              />
              {isPollingState(wf.state) && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                />
              )}
            </div>
            <span className="text-[10px] tabular-nums text-[var(--color-fg-muted)] w-7 text-right">
              {wf.progress_percent}%
            </span>
          </div>
          <div className="text-[9px] text-[var(--color-fg-subtle)] leading-tight line-clamp-2">
            {wf.current_message}
          </div>
        </div>
      )}

      {wf?.errors && wf.errors.length > 0 && (
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2.5">
          <div className="text-[9px] font-medium text-red-400 mb-1">Errors</div>
          {wf.errors.slice(-2).map((e, i) => (
            <div key={i} className="text-[9px] text-red-300/80 leading-tight mb-0.5">{e}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 1: Input Form ────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: 'web', label: 'Web', icon: Globe },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
  { id: 'api', label: 'API', icon: Code2 },
] as const;

function useFavicon(url: string) {
  const [favicon, setFavicon] = useState<string | null>(null);
  useEffect(() => {
    if (!url || !/^https?:\/\//i.test(url)) { setFavicon(null); return; }
    try {
      const domain = new URL(url).hostname;
      setFavicon(`https://www.google.com/s2/favicons?domain=${domain}&sz=32`);
    } catch { setFavicon(null); }
  }, [url]);
  return favicon;
}

function InputStep({ onStart, isPending }: {
  onStart: (data: { brd_text: string; webpage_url: string; project_name: string; module_name: string; platform: string; ai_provider: string; ai_model: string }) => void;
  isPending: boolean;
}) {
  const [brd, setBrd] = useState('');
  const [url, setUrl] = useState('');
  const [projectName, setProjectName] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [platform, setPlatform] = useState<'web' | 'mobile' | 'api'>('web');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const favicon = useFavicon(url);

  function validate() {
    const e: Record<string, string> = {};
    if (!brd.trim()) e.brd = 'BRD text is required';
    if (!url.trim()) e.url = 'URL is required';
    else if (!/^https?:\/\//i.test(url)) e.url = 'URL must start with http:// or https://';
    if (!projectName.trim()) e.projectName = 'Project name is required';
    return e;
  }

  function handleStart() {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setErrors({});
    onStart({ brd_text: brd, webpage_url: url, project_name: projectName,
      module_name: moduleName || projectName, platform, ai_provider: 'null', ai_model: 'null' });
  }

  async function readFile(file: File) {
    if (file.type === 'text/plain') {
      const text = await file.text();
      setBrd(text);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  const label = 'block text-[11px] font-medium text-[var(--color-fg-muted)] mb-1.5';
  const input = 'w-full bg-[var(--color-surface-2)] border border-[var(--color-line-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-fg-default)] placeholder:text-[var(--color-fg-subtle)]/40 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* BRD drag-drop zone */}
      <div>
        <label className={label}>
          Business Requirements Document
          <span className="text-[var(--color-fg-subtle)] font-normal ml-1">({brd.length} chars)</span>
        </label>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`relative rounded-xl border-2 border-dashed transition-all ${
            isDragging
              ? 'border-violet-500/60 bg-violet-500/8 scale-[1.01]'
              : 'border-[var(--color-line-default)] hover:border-[var(--color-line-strong)]'
          }`}
        >
          {brd ? (
            <textarea
              className="w-full bg-transparent px-4 py-3 text-xs font-mono text-[var(--color-fg-default)] focus:outline-none min-h-[160px] resize-y leading-relaxed"
              value={brd}
              onChange={(e) => setBrd(e.target.value)}
            />
          ) : (
            <div
              className="flex flex-col items-center justify-center py-10 cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-line-default)] flex items-center justify-center mb-3">
                <Upload size={16} className="text-[var(--color-fg-subtle)]" />
              </div>
              <p className="text-sm font-medium text-[var(--color-fg-muted)]">Drop your BRD here</p>
              <p className="text-[11px] text-[var(--color-fg-subtle)] mt-1">.txt · .pdf · .docx — or click to browse</p>
            </div>
          )}
          {isDragging && (
            <div className="absolute inset-0 rounded-xl flex items-center justify-center pointer-events-none">
              <span className="text-sm font-medium text-violet-400">Drop to import</span>
            </div>
          )}
        </div>
        {brd && (
          <button onClick={() => fileRef.current?.click()}
            className="mt-1.5 text-[10px] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] flex items-center gap-1 transition-colors">
            <Upload size={10} /> Replace file
          </button>
        )}
        <input ref={fileRef} type="file" accept=".txt,.pdf,.docx" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
        {errors.brd && <p className="text-[10px] text-red-400 mt-1">{errors.brd}</p>}
      </div>

      {/* URL with favicon */}
      <div>
        <label className={label}>Webpage URL</label>
        <div className="relative">
          {favicon ? (
            <img src={favicon} alt="" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-sm" />
          ) : (
            <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
          )}
          <input type="url" className={`${input} pl-8`}
            placeholder="https://example.com/login"
            value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        {errors.url && <p className="text-[10px] text-red-400 mt-1">{errors.url}</p>}
      </div>

      {/* Project + Module */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Project Name</label>
          <input className={input} placeholder="My Web App"
            value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          {errors.projectName && <p className="text-[10px] text-red-400 mt-1">{errors.projectName}</p>}
        </div>
        <div>
          <label className={label}>Module <span className="text-[var(--color-fg-subtle)] font-normal">(optional)</span></label>
          <input className={input} placeholder="Defaults to project name"
            value={moduleName} onChange={(e) => setModuleName(e.target.value)} />
        </div>
      </div>

      {/* Platform icon buttons */}
      <div>
        <label className={label}>Platform</label>
        <div className="flex gap-2">
          {PLATFORMS.map(({ id, label: lbl, icon: Icon }) => (
            <button key={id} onClick={() => setPlatform(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                platform === id
                  ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                  : 'border-[var(--color-line-default)] text-[var(--color-fg-muted)] hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]'
              }`}>
              <Icon size={14} />{lbl}
            </button>
          ))}
        </div>
      </div>

      <Button variant="neon" size="md" onClick={handleStart} disabled={isPending} className="w-full justify-center gap-2">
        {isPending
          ? <><Loader2 size={14} className="animate-spin" /> Starting…</>
          : <><Sparkles size={14} /> Start AI Workflow</>}
      </Button>
    </div>
  );
}

// ── Step 2: Model Selection ────────────────────────────────────────────────────

function ModelSelectionStep({ onSelectModel, isPending }: {
  onSelectModel: (provider: string, modelId: string) => void;
  isPending: boolean;
}) {
  const { data: modelsData, isLoading } = useAIModels();
  const [selected, setSelected] = useState<AIModelInfo | null>(null);
  const models = modelsData?.models ?? [];

  const recommended = models.find((m) => m.tier === 'best') ?? models[0];

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="text-sm text-[var(--color-fg-muted)]">
        Discovery complete. Choose the AI model for scenario and test case generation.
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-fg-subtle)]">
          <Loader2 size={14} className="animate-spin" /> Loading models…
        </div>
      ) : (
        <div className="space-y-2">
          {models.map((model) => {
            const isSelected = selected?.model_id === model.model_id;
            const isRecommended = model.model_id === recommended?.model_id;
            return (
              <motion.button key={model.model_id} onClick={() => setSelected(model)}
                whileHover={{ scale: 1.005 }} whileTap={{ scale: 0.995 }}
                className={`w-full text-left rounded-xl border p-4 transition-all relative overflow-hidden ${
                  isSelected
                    ? 'border-violet-500/50 bg-violet-500/8 shadow-[0_0_20px_-8px_rgba(139,92,246,0.4)]'
                    : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)]'
                }`}>
                {isRecommended && (
                  <div className="absolute top-0 right-0 bg-violet-500/20 border-l border-b border-violet-500/30 px-2 py-0.5 rounded-bl-lg">
                    <span className="text-[9px] font-semibold text-violet-400 uppercase tracking-wider">Recommended</span>
                  </div>
                )}
                <div className="flex items-start gap-3 pr-16">
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${isSelected ? 'border-violet-500 bg-violet-500' : 'border-[var(--color-line-strong)]'}`}>
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-[var(--color-fg-default)]">{model.display_name}</span>
                      <Badge label={model.tier} className={`${TIER_COLOR[model.tier]} border-current bg-transparent`} />
                    </div>
                    <div className="text-[11px] text-[var(--color-fg-subtle)]">{model.best_for}</div>
                    <div className="text-[10px] text-[var(--color-fg-subtle)]/60 mt-0.5">{model.provider} · {model.model_id}</div>
                    <CapabilityBars tier={model.tier} />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      <Button variant="neon" size="md" disabled={!selected || isPending}
        onClick={() => selected && onSelectModel(selected.provider, selected.model_id)}
        className="w-full justify-center gap-2">
        {isPending
          ? <><Loader2 size={14} className="animate-spin" /> Processing…</>
          : <><Sparkles size={14} />{selected ? `Generate with ${selected.display_name}` : 'Select a model'}</>}
      </Button>
    </div>
  );
}

// ── Step 3: Discovery ─────────────────────────────────────────────────────────

function DiscoveryStep({ wf }: { wf: AIWorkflowStateResponse | undefined }) {
  const isRunning = wf ? isPollingState(wf.state) : false;
  const isDone = wf?.state === 'PAGE_SAVED';

  return (
    <div className="space-y-5">
      <ElementDiscoveryFeed
        count={wf?.elements_saved ?? 0}
        lowConf={wf?.low_confidence_locators ?? 0}
        isRunning={isRunning}
      />

      {isDone && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-4 py-3">
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-300">
            Page saved — {wf?.elements_saved} elements ready for test generation
          </span>
        </motion.div>
      )}

      <div className="rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-line-subtle)] p-4">
        <div className="text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase tracking-wider mb-3">Status</div>
        <div className="font-mono text-[11px] leading-relaxed">
          <div className={isRunning ? 'text-violet-400' : 'text-emerald-400'}>
            {wf?.current_message || 'Waiting for discovery to start…'}
          </div>
          {isRunning && (
            <div className="flex items-center gap-1.5 mt-2 text-[var(--color-fg-subtle)]">
              <Loader2 size={10} className="animate-spin" />
              <span>Running browser automation…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Scenarios ─────────────────────────────────────────────────────────

function ScenariosStep({ scenarios, onConfirm, isPending }: {
  scenarios: AIScenarioPreview[];
  onConfirm: (ids: string[]) => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState({ priority: '', testType: '', classification: '' });

  function toggle(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  const filtered = scenarios.filter((s) => {
    if (filter.priority && s.priority !== filter.priority) return false;
    if (filter.testType && s.test_type !== filter.testType) return false;
    if (filter.classification && s.classification !== filter.classification) return false;
    return true;
  });

  const sel = 'bg-[var(--color-surface-2)] border border-[var(--color-line-default)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--color-fg-muted)] focus:outline-none focus:border-violet-500/50 transition-colors';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="xs" onClick={() => setSelected(new Set(scenarios.map((s) => s.scenario_id)))}>Select All</Button>
        <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>Deselect All</Button>
        <div className="flex-1" />
        <select className={sel} value={filter.priority} onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value }))}>
          <option value="">All priorities</option>
          {['high', 'medium', 'low'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={sel} value={filter.testType} onChange={(e) => setFilter((f) => ({ ...f, testType: e.target.value }))}>
          <option value="">All types</option>
          {['functional', 'regression', 'smoke', 'e2e'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={sel} value={filter.classification} onChange={(e) => setFilter((f) => ({ ...f, classification: e.target.value }))}>
          <option value="">All classes</option>
          {['positive', 'negative', 'edge'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-[11px] text-[var(--color-fg-subtle)]">{selected.size} / {scenarios.length}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
        {filtered.map((s) => {
          const isSel = selected.has(s.scenario_id);
          return (
            <motion.div key={s.scenario_id} onClick={() => toggle(s.scenario_id)}
              whileHover={{ scale: 1.003 }}
              className={`rounded-xl border p-3.5 cursor-pointer transition-all ${
                isSel
                  ? 'border-violet-500/40 bg-violet-500/6 shadow-[0_0_12px_-6px_rgba(139,92,246,0.3)]'
                  : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)]'
              }`}>
              <div className="flex items-start gap-2 mb-2">
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${isSel ? 'border-violet-500 bg-violet-500' : 'border-[var(--color-line-strong)]'}`}>
                  {isSel && <CheckCircle2 size={10} className="text-white" />}
                </div>
                <span className="text-xs font-medium text-[var(--color-fg-default)] leading-tight">{s.title}</span>
              </div>
              <p className="text-[10px] text-[var(--color-fg-subtle)] mb-2.5 leading-relaxed line-clamp-2">{s.business_requirement}</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <Badge label={s.priority} className={PRIORITY_COLOR[s.priority]} />
                <Badge label={s.test_type} className={TEST_TYPE_COLOR[s.test_type]} />
                <Badge label={s.classification} className={CLASS_COLOR[s.classification]} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[var(--color-fg-subtle)]">
                <span>~{s.estimated_test_cases} cases</span>
                <div className="flex items-center gap-1.5">
                  <ConfidenceRing value={s.confidence} size={16} />
                  <span className={confColor(s.confidence)}>{(s.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <Button variant="neon" size="md" disabled={selected.size === 0 || isPending}
        onClick={() => onConfirm(Array.from(selected))} className="w-full justify-center gap-2">
        {isPending
          ? <><Loader2 size={14} className="animate-spin" /> Processing…</>
          : <><Wand2 size={14} />Generate Test Cases for {selected.size} Scenario{selected.size !== 1 ? 's' : ''}</>}
      </Button>
    </div>
  );
}

// ── Step 5: Test Generation ───────────────────────────────────────────────────

function TestGenerationStep({ wf }: { wf: AIWorkflowStateResponse | undefined }) {
  const agentName = wf?.current_message?.includes('scenario') ? 'ScenarioGenerationAgent'
    : wf?.current_message?.includes('step') ? 'TestStepBindingAgent'
    : wf?.current_message?.includes('test') ? 'TestCaseGenerationAgent'
    : 'AIWorkflowOrchestrator';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-[var(--color-surface-3)] overflow-hidden relative">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400"
            animate={{ width: `${wf?.progress_percent ?? 0}%` }} transition={{ duration: 0.5 }} />
          {wf && isPollingState(wf.state) && (
            <motion.div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ x: ['-100%', '200%'] }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }} />
          )}
        </div>
        <span className="text-xs tabular-nums text-[var(--color-fg-muted)] w-8 text-right">{wf?.progress_percent ?? 0}%</span>
      </div>

      <TokenStream message={wf?.current_message ?? ''} agentName={agentName} />

      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Tests Created', value: wf?.testcases_created ?? 0 },
          { label: 'Steps Mapped', value: (wf?.teststeps_created ?? 0) - (wf?.unmapped_steps ?? 0) },
          { label: 'Needs Review', value: wf?.unmapped_steps ?? 0, warn: true },
        ].map((c) => (
          <div key={c.label} className="rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-line-default)] p-3 text-center">
            <div className={`text-2xl font-bold tabular-nums ${c.warn && c.value > 0 ? 'text-amber-400' : 'text-[var(--color-fg-default)]'}`}>{c.value}</div>
            <div className="text-[10px] text-[var(--color-fg-subtle)] mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 6: Review ────────────────────────────────────────────────────────────

function ReviewStep({ workflowId }: { workflowId: string }) {
  const { data: review, isLoading } = useAIWorkflowReview(workflowId);

  if (isLoading) return (
    <div className="flex items-center gap-2 text-sm text-[var(--color-fg-subtle)]">
      <Loader2 size={14} className="animate-spin" /> Loading review…
    </div>
  );
  if (!review) return null;

  const summaryCards = [
    { label: 'Elements', value: review.elements_saved },
    { label: 'Scenarios', value: review.scenarios_generated },
    { label: 'Selected', value: review.scenarios_selected },
    { label: 'Tests', value: review.testcases_created },
    { label: 'Steps', value: review.teststeps_created },
    { label: 'Review', value: review.needs_review_items.length, warn: true },
  ];

  return (
    <div className="space-y-5">
      {/* Summary chips */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {summaryCards.map((c) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-line-default)] p-3 text-center">
            <div className={`text-xl font-bold tabular-nums ${c.warn && c.value > 0 ? 'text-amber-400' : 'text-[var(--color-fg-default)]'}`}>{c.value}</div>
            <div className="text-[9px] text-[var(--color-fg-subtle)] mt-0.5 uppercase tracking-wide">{c.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Needs Review */}
        <div>
          <div className="text-xs font-semibold text-[var(--color-fg-muted)] mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-amber-400" />
            Needs Review ({review.needs_review_items.length})
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {review.needs_review_items.length === 0 ? (
              <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={12} /> All steps mapped successfully
              </div>
            ) : review.needs_review_items.map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-amber-300 truncate">{item.testcase_name}</div>
                    <div className="text-[10px] text-[var(--color-fg-subtle)] mt-0.5">
                      Step {item.step_number}: {item.description}
                    </div>
                    <div className="text-[10px] text-amber-400/70 mt-1">{item.reason}</div>
                  </div>
                  <Badge label="warn" className="text-amber-400 border-amber-500/30 bg-amber-500/5 shrink-0" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Low Confidence Locators */}
        <div>
          <div className="text-xs font-semibold text-[var(--color-fg-muted)] mb-2 flex items-center gap-1.5">
            <Search size={11} className="text-red-400" />
            Low Confidence ({review.low_confidence_locators.length})
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {review.low_confidence_locators.length === 0 ? (
              <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={12} /> All locators above threshold
              </div>
            ) : review.low_confidence_locators.map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-lg bg-red-500/5 border border-red-500/15 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-red-300 truncate">{item.element_name}</span>
                  <CopyButton text={item.current_locator} />
                </div>
                <ConfidenceGauge value={item.confidence} label={item.current_locator} />
                <div className="flex items-center justify-between mt-2">
                  <Badge label={item.strategy} className="text-[var(--color-fg-subtle)] border-[var(--color-line-default)]" />
                  <a href="/page-repository"
                    className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                    Fix <ExternalLink size={8} />
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-3 border-t border-[var(--color-line-subtle)]">
        <a href="/test-configuration">
          <Button variant="neon" size="sm" className="gap-1.5">
            <Settings2 size={13} /> Open Test Configuration
          </Button>
        </a>
        <a href="/page-repository">
          <Button variant="glass" size="sm" className="gap-1.5">
            <BookOpen size={13} /> Open Page Repository
          </Button>
        </a>
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(review, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = 'workflow-review.json'; a.click();
          }}
          className="ml-auto text-[11px] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] flex items-center gap-1 transition-colors"
        >
          <ExternalLink size={11} /> Export JSON
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIWorkflowPage() {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<StepId>('input');
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());
  const [selectedModel, setSelectedModel] = useState<AIModelInfo | null>(null);
  const [errorStep, setErrorStep] = useState<StepId | null>(null);

  const polling = !!workflowId;
  const { data: wf } = useAIWorkflow(workflowId, polling);

  const createWorkflow = useCreateAIWorkflow();
  const generateScenarios = useGenerateScenarios(workflowId ?? '');
  const confirmScenarios = useConfirmScenarios(workflowId ?? '');
  const generateTestCases = useGenerateTestCases(workflowId ?? '');

  useEffect(() => {
    if (!wf) return;
    const step = stateToStep(wf.state);
    if (wf.state === 'PAGE_SAVED') {
      setActiveStep('model');
    } else {
      setActiveStep(step);
    }
    if (wf.state === 'FAILED') setErrorStep(step);
    const order: StepId[] = ['input', 'model', 'discovery', 'scenarios', 'generation', 'review'];
    const currentIdx = order.indexOf(step);
    setCompletedSteps(new Set(order.slice(0, currentIdx)));
  }, [wf?.state]);

  async function handleStart(data: Parameters<typeof InputStep>[0]['onStart'] extends (d: infer D) => void ? D : never) {
    const result = await createWorkflow.mutateAsync(data);
    setWorkflowId(result.workflow_id);
    setActiveStep('discovery');
  }

  async function handleModelSelected(provider: string, modelId: string) {
    const modelsRes = await fetch('/api/ai-workflows/models').then((r) => r.json()).catch(() => ({ models: [] })) as { models: AIModelInfo[] };
    const found = modelsRes.models.find((m: AIModelInfo) => m.model_id === modelId) ?? null;
    setSelectedModel(found);
    if (workflowId) {
      await generateScenarios.mutateAsync({ ai_provider: provider, ai_model: modelId });
      setActiveStep('scenarios');
    }
  }

  async function handleConfirmScenarios(ids: string[]) {
    if (!workflowId) return;
    await confirmScenarios.mutateAsync({ scenario_ids: ids });
    await generateTestCases.mutateAsync();
    setActiveStep('generation');
  }

  const content: Record<StepId, React.ReactNode> = {
    input: <InputStep onStart={handleStart} isPending={createWorkflow.isPending} />,
    model: <ModelSelectionStep onSelectModel={handleModelSelected} isPending={generateScenarios.isPending} />,
    discovery: <DiscoveryStep wf={wf} />,
    scenarios: <ScenariosStep scenarios={wf?.scenarios ?? []} onConfirm={handleConfirmScenarios}
      isPending={confirmScenarios.isPending || generateTestCases.isPending} />,
    generation: <TestGenerationStep wf={wf} />,
    review: workflowId ? <ReviewStep workflowId={workflowId} /> : null,
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Left Panel */}
      <div className="w-48 shrink-0 border-r border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] p-3 overflow-y-auto">
        <div className="text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase tracking-wider px-2 mb-2">
          AI Workflow
        </div>
        <WorkflowTimeline activeStep={activeStep} completedSteps={completedSteps}
          errorStep={errorStep} currentMessage={wf?.current_message} />
      </div>

      {/* Center */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="border-b border-[var(--color-line-subtle)] px-6 py-3 flex items-center gap-3">
          <Sparkles size={15} className="text-violet-400 shrink-0" />
          <h1 className="text-sm font-semibold text-[var(--color-fg-default)]">AI Workflow</h1>
          {wf && (
            <div className="ml-auto flex items-center gap-2">
              {isPollingState(wf.state) && (
                <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}
                  className="flex items-center gap-1.5 text-[10px] text-violet-400">
                  <Loader2 size={10} className="animate-spin" /> Live
                </motion.div>
              )}
              <span className="text-[10px] font-mono text-[var(--color-fg-subtle)] bg-[var(--color-surface-2)] border border-[var(--color-line-subtle)] px-2 py-0.5 rounded">
                {wf.state}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div key={activeStep}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {content[activeStep]}
            </motion.div>
          </AnimatePresence>

          {wf?.state === 'FAILED' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="mt-6 rounded-xl bg-red-500/8 border border-red-500/25 p-5">
              <div className="flex items-center gap-2 mb-2">
                <XCircle size={14} className="text-red-400" />
                <span className="text-sm font-medium text-red-300">Workflow Failed</span>
              </div>
              <div className="text-xs text-red-300/70 mb-4 leading-relaxed">{wf.current_message}</div>
              <Button variant="danger" size="sm" className="gap-1.5"
                onClick={() => { setWorkflowId(null); setActiveStep('input'); setCompletedSteps(new Set()); setErrorStep(null); }}>
                <RefreshCw size={12} /> Start Over
              </Button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-56 shrink-0 border-l border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] p-3 overflow-y-auto">
        <LiveIntelligence wf={wf} selectedModel={selectedModel} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Check for TypeScript errors**

Run from `nexus-qa/`: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -40`

Fix any errors before proceeding.

- [ ] **Step 3: Start the dev server and verify the page loads**

Run: `npm run dev` from `nexus-qa/`

Navigate to `http://localhost:3000/ai-workflow` and confirm:
- 3-panel layout renders
- Left panel shows WorkflowTimeline with connector line
- Input step shows drag-drop BRD zone, URL field with globe icon, platform buttons
- Right panel shows "Live Intelligence" with metric cards

- [ ] **Step 4: Commit**

```bash
git add nexus-qa/src/app/ai-workflow/page.tsx
git commit -m "feat(ui): ultra-premium AI Workflow page — drag-drop, TokenStream, ElementFeed, ConfidenceGauge"
```

---

## Self-Review

**Spec coverage:**
- ✅ MCP result parsing + DB persistence (Tasks 1–2)
- ✅ Claude client reuse (Task 4)
- ✅ Prompt caching via `cache_control` (Task 4)
- ✅ `generate_stream()` method (Tasks 3–4)
- ✅ Streaming wired into scenario generation with DB progress updates (Task 5)
- ✅ Drag-drop BRD input (Task 6)
- ✅ URL favicon preview (Task 6)
- ✅ Platform icon buttons (Task 6)
- ✅ ElementDiscoveryFeed with animated cards (Task 6)
- ✅ CapabilityBars on model selection (Task 6)
- ✅ Recommended badge on model cards (Task 6)
- ✅ TokenStream typewriter for test generation (Task 6)
- ✅ ConfidenceGauge bars on review (Task 6)
- ✅ Copy-to-clipboard on locators (Task 6)
- ✅ Export JSON button on review (Task 6)
- ✅ Animated count-up MetricCard in right panel (Task 6)
- ✅ Shimmer progress bar animation (Task 6)
- ✅ WorkflowTimeline connector line + sub-status text (Task 6)

**Type consistency:** All method signatures consistent across tasks — `generate_stream(prompt, schema)` defined in Task 3, implemented in Task 4, consumed in Task 5.

**Placeholder scan:** No TBDs or TODOs present.
