"""AIWorkflowService — orchestrates the complete AI Workflow pipeline."""
from __future__ import annotations

import asyncio
import importlib.util
import json
import logging
import re as _re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_workflow.agents.app_discovery import AppDiscoveryAgent
from app.ai_workflow.agents.brd_analysis import BRDAnalysisAgent
from app.ai_workflow.agents.page_configuration import PageConfigurationAgent
from app.ai_workflow.agents.review_validation import ReviewAndValidationAgent
from app.ai_workflow.agents.testcase_generation import TestCaseGenerationAgent
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
from app.page_discovery.schemas import DiscoveredElement as DiscoveryElement

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)
_GENERATED_CASE_BATCH = tuple[int, ScenarioPreview, list[GeneratedTestCase]]

_JSON_FENCE_RE = _re.compile(r"```(?:json)?\s*(.*?)\s*```", _re.DOTALL)

_MODEL_GENERATION_PROFILES: dict[str, dict[str, str]] = {
    "fast": {
        "scenario_count": "4 to 6",
        "analysis_depth": (
            "average-depth coverage focused on smoke, happy-path, and obvious negative flows"
        ),
    },
    "balanced": {
        "scenario_count": "6 to 10",
        "analysis_depth": (
            "balanced coverage of critical, common, negative, edge, and regression flows"
        ),
    },
    "best": {
        "scenario_count": "10 to 16",
        "analysis_depth": (
            "deep analysis of business rules, cross-page flows, edge cases, regressions, "
            "risk areas, and failure modes"
        ),
    },
}

_MODEL_TIER_HINTS: tuple[tuple[str, str], ...] = (
    ("nano", "fast"),
    ("haiku", "fast"),
    ("mini", "balanced"),
    ("sonnet", "balanced"),
    ("opus", "best"),
    ("gpt-5.5", "best"),
    ("gpt-5.4", "best"),
    ("gpt-5", "best"),
    ("gpt-4.1", "best"),
)


def _parse_streamed_json(raw: str, schema: type[T]) -> T:
    from pydantic import ValidationError
    match = _JSON_FENCE_RE.search(raw)
    cleaned = match.group(1) if match else raw.strip()
    try:
        return schema.model_validate(json.loads(cleaned))
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.error("Streamed JSON parse failed: %s\nRaw (first 500): %s", exc, raw[:500])
        raise ValueError(f"Streamed AI response did not match expected schema: {exc}") from exc


def _model_generation_tier(ai_model: str) -> str:
    model = ai_model.lower()
    for needle, tier in _MODEL_TIER_HINTS:
        if needle in model:
            return tier
    return "balanced"


def _model_generation_profile(ai_model: str) -> dict[str, str]:
    return _MODEL_GENERATION_PROFILES[_model_generation_tier(ai_model)]


def _require_provider_package(provider_name: str, package_name: str) -> None:
    if importlib.util.find_spec(package_name) is None:
        raise ValueError(
            f"{provider_name} backend package is not installed. "
            "Run pip install -r requirements.txt in nexus-api, then restart npm start."
        )


def _format_provider_error(exc: Exception) -> str:
    message = str(exc) or exc.__class__.__name__
    for nested in (exc.__cause__, exc.__context__):
        if nested is None:
            continue
        nested_message = str(nested) or nested.__class__.__name__
        if nested_message and nested_message not in message:
            return f"{message} ({nested.__class__.__name__}: {nested_message})"
    return message


def _build_provider(ai_provider: str, ai_model: str) -> AbstractAIProvider:
    provider = ai_provider.lower()
    if provider in ("null", "test", "ci"):
        return NullProvider()
    if provider == "openai":
        key = settings.openai_api_key
        if not key:
            raise ValueError("OPENAI_API_KEY is required for OpenAI scenario generation")
        _require_provider_package("OpenAI", "openai")
        return OpenAIProvider(api_key=key, model=ai_model)
    if provider in ("claude", "anthropic"):
        key = settings.anthropic_api_key
        if not key:
            raise ValueError("ANTHROPIC_API_KEY is required for Anthropic scenario generation")
        _require_provider_package("Anthropic", "anthropic")
        return ClaudeProvider(api_key=key, model=ai_model)
    raise ValueError(f"Unknown AI provider '{ai_provider}'")


def _workflow_to_response(wf: AIWorkflowModel) -> WorkflowStateResponse:
    scenarios = [ScenarioPreview(**s) for s in (wf.scenarios or [])]
    return WorkflowStateResponse(
        workflow_id=wf.id,
        state=WorkflowState(wf.state),
        progress_percent=wf.progress_percent,
        current_message=wf.current_message,
        project_id=wf.project_id,
        module_id=wf.module_id,
        page_id=wf.page_id,
        page_name=wf.page_name,
        elements_saved=wf.elements_saved,
        scenarios=scenarios,
        testcases_created=wf.testcases_created,
        teststeps_created=wf.teststeps_created,
        unmapped_steps=wf.unmapped_steps,
        low_confidence_locators=wf.low_confidence_locators,
        errors=wf.errors or [],
        activity_log=wf.activity_log or [],
        scraped_candidates=wf.scraped_candidates or [],
        selected_elements=wf.selected_elements or [],
    )


async def _update_state(
    db: AsyncSession,
    workflow_id: str,
    state: WorkflowState,
    message: str,
    detail: str | None = None,
    log_event: bool = True,
    **kwargs: Any,
) -> None:
    result = await db.execute(
        select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
    )
    wf = result.scalar_one()
    wf.state = state.value
    wf.progress_percent = STATE_PROGRESS.get(state, wf.progress_percent)
    wf.current_message = message
    if log_event:
        activity_log: list[dict[str, Any]] = list(wf.activity_log or [])
        activity_log.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "state": state.value,
            "message": message,
            "detail": detail,
        })
        wf.activity_log = activity_log[-80:]
    for k, v in kwargs.items():
        setattr(wf, k, v)
    await db.commit()


async def _append_error(db: AsyncSession, workflow_id: str, error: str) -> None:
    result = await db.execute(
        select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
    )
    wf = result.scalar_one()
    errors: list = list(wf.errors or [])
    errors.append(error)
    wf.errors = errors
    await db.commit()


# ---------------------------------------------------------------------------
# Background task: discovery phase (CREATED → PAGE_SAVED)
# ---------------------------------------------------------------------------

async def _run_workspace_phase(workflow_id: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
            )
            wf = result.scalar_one()

            # 1. Create/reuse project
            await _update_state(
                db,
                workflow_id,
                WorkflowState.CREATED,
                "Creating project workspace...",
                detail=f"Project name: {wf.project_name}",
            )
            page_cfg = PageConfigurationAgent()
            project = await page_cfg.ensure_project(db, wf.project_name)
            await _update_state(
                db, workflow_id, WorkflowState.PROJECT_READY,
                f"Project '{project.name}' ready",
                detail="Project record is ready for modules, pages, test cases, and test steps.",
                project_id=project.id,
            )

            # 2. Create/reuse module
            module_name = wf.module_name or wf.project_name
            await _update_state(
                db,
                workflow_id,
                WorkflowState.PROJECT_READY,
                f"Creating module '{module_name}'...",
                detail="The module will group the generated test cases.",
            )
            module = await page_cfg.ensure_module(db, project.id, module_name)
            await _update_state(
                db, workflow_id, WorkflowState.MODULE_READY,
                f"Module '{module.name}' ready",
                detail="Module context is attached to this workflow.",
                module_id=module.id,
            )

            # 3. Hold page creation until after test steps are drafted.
            await _update_state(
                db,
                workflow_id,
                WorkflowState.MODULE_READY,
                "Workspace ready - choose an LLM",
                detail=(
                    "Project and module are ready. The page will be created after "
                    "test cases and test steps are drafted."
                ),
            )

        except Exception as exc:
            logger.exception("Workspace phase failed for workflow %s", workflow_id)
            await _append_error(db, workflow_id, str(exc))
            await _update_state(
                db, workflow_id, WorkflowState.FAILED,
                f"Workspace setup failed: {exc}",
            )


def _extract_page_name(url: str, fallback: str) -> str:
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path = parsed.path.strip("/")
        last = path.split("/")[-1] if path else ""
        if last:
            return last.replace("-", " ").replace("_", " ").title()
        return parsed.netloc.split(".")[0].title() or fallback
    except Exception:
        return fallback


# ---------------------------------------------------------------------------
# Background task: scenario generation phase
# ---------------------------------------------------------------------------

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
                detail=(
                    f"Using {ai_provider}/{ai_model} with the BRD. Page scraping runs after "
                    "test steps are drafted so only necessary elements are saved."
                ),
                ai_provider=ai_provider,
                ai_model=ai_model,
            )

            provider = _build_provider(ai_provider, ai_model)

            # BRD analysis — uses standard generate() (fast, no streaming needed)
            brd_agent = BRDAnalysisAgent(provider)
            brd_analysis = await brd_agent.run(wf.brd_text, wf.webpage_url, wf.project_name)

            await _update_state(
                db, workflow_id, WorkflowState.SCENARIOS_GENERATING,
                "BRD analysed — generating test scenarios...",
            )

            elements_summary = (
                "Page scraping has not run yet. Generate behavior-focused scenarios from the BRD; "
                "locators will be selected after test steps exist."
            )
            page_name = wf.page_name or _extract_page_name(wf.webpage_url, wf.project_name)
            generation_profile = _model_generation_profile(ai_model)

            # Build the scenario prompt (same as ScenarioGenerationAgent does internally)
            scenario_prompt = build_scenario_prompt(
                brd_text=wf.brd_text,
                project_name=wf.project_name,
                page_name=page_name,
                elements_summary=elements_summary,
                brd_analysis_summary=brd_analysis.summary,
                scenario_count=generation_profile["scenario_count"],
                analysis_depth=generation_profile["analysis_depth"],
            )

            # Stream scenario generation — update current_message every ~50 chars
            chunks: list[str] = []
            char_count = 0
            last_db_update = 0
            async for chunk in provider.generate_stream(scenario_prompt, ScenarioList):
                chunks.append(chunk)
                char_count += len(chunk)
                if char_count - last_db_update >= 50:
                    last_db_update = char_count
                    preview = "".join(chunks).replace("\n", " ").strip()[:120]
                    await _update_state(
                        db, workflow_id, WorkflowState.SCENARIOS_GENERATING,
                        f"Generating scenarios... {preview}",
                        log_event=False,
                    )

            scenario_list = _parse_streamed_json("".join(chunks), ScenarioList)

            scenarios_data = [s.model_dump() for s in scenario_list.scenarios]
            await _update_state(
                db, workflow_id, WorkflowState.SCENARIOS_READY,
                f"Generated {len(scenarios_data)} scenarios",
                detail="Select the scenarios you want converted into test cases and test steps.",
                scenarios=scenarios_data,
                ai_provider=ai_provider,
                ai_model=ai_model,
            )

        except Exception as exc:
            logger.exception("Scenario generation failed for workflow %s", workflow_id)
            error_detail = _format_provider_error(exc)
            await _append_error(db, workflow_id, error_detail)
            await _update_state(
                db, workflow_id, WorkflowState.FAILED,
                f"Scenario generation failed with {ai_provider}/{ai_model}: {error_detail}",
            )


async def _build_elements_summary(db: AsyncSession, page_id: str | None) -> str:
    if not page_id:
        return "(no elements available)"
    result = await db.execute(
        select(PageElementModel).where(PageElementModel.page_id == page_id).limit(50)
    )
    elements = result.scalars().all()
    if not elements:
        return "(no elements discovered)"
    lines = [f"- {el.name} ({el.element_type}, {el.locator_strategy})" for el in elements]
    return "\n".join(lines)


def _text_similarity(a: str, b: str) -> float:
    if not a.strip() or not b.strip():
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _token_overlap(a: str, b: str) -> float:
    left = {token for token in _re.findall(r"[a-z0-9]+", a.lower()) if len(token) > 2}
    right = {token for token in _re.findall(r"[a-z0-9]+", b.lower()) if len(token) > 2}
    if not left or not right:
        return 0.0
    return len(left & right) / max(len(left), 1)


def _best_locator_payload(element: DiscoveryElement) -> tuple[str, str, str, str]:
    usable = [
        locator for locator in element.alternative_locators
        if locator.locator and locator.element_count != 0
    ]
    best = next(
        (
            locator for locator in usable
            if locator.verified and locator.element_count == 1
        ),
        usable[0] if usable else None,
    )
    strategy = best.strategy if best else element.locator_strategy
    locator = (best.locator if best else element.best_locator) or element.css_selector or element.xpath
    xpath = element.xpath
    css_selector = element.css_selector
    if best and best.strategy == "xpath":
        xpath = best.locator
    elif best and best.strategy != "xpath":
        css_selector = best.locator
    return strategy or "xpath", locator or "", xpath or "", css_selector or ""


def _best_xpath(element: DiscoveryElement) -> str:
    verified_xpaths = [
        locator for locator in element.alternative_locators
        if locator.strategy == "xpath" and locator.locator and locator.verified and locator.element_count == 1
    ]
    if verified_xpaths:
        verified_xpaths.sort(key=lambda locator: locator.score, reverse=True)
        return verified_xpaths[0].locator
    scored_xpaths = [
        locator for locator in element.alternative_locators
        if locator.strategy == "xpath" and locator.locator and locator.element_count != 0
    ]
    if scored_xpaths:
        scored_xpaths.sort(key=lambda locator: locator.score, reverse=True)
        return scored_xpaths[0].locator
    return element.xpath or ""


def _candidate_from_discovered(element: DiscoveryElement, index: int) -> dict[str, Any]:
    strategy, locator, xpath, css_selector = _best_locator_payload(element)
    xpath = _best_xpath(element) or xpath
    return {
        "candidate_id": f"scraped-{index + 1}",
        "name": element.name,
        "element_type": element.element_type or "element",
        "description": element.description or "",
        "locator_strategy": strategy,
        "best_locator": locator,
        "xpath": xpath,
        "css_selector": css_selector,
        "id_attr": element.id_attr or "",
        "name_attr": element.name_attr or "",
        "input_type": element.input_type or "",
        "placeholder": element.placeholder or "",
        "label": element.label or "",
        "test_data_hints": element.test_data_hints or {},
        "locator_quality": _locator_quality(element),
        "confidence_score": element.confidence_score or 0.0,
        "tags": element.tags or [],
        "selected": False,
        "match_reason": None,
        "matched_steps": [],
    }


def _locator_quality(element: DiscoveryElement | dict[str, Any]) -> float:
    if isinstance(element, dict):
        confidence = float(element.get("confidence_score") or 0.0)
        strategy = str(element.get("locator_strategy") or "").lower()
        locator = str(element.get("best_locator") or element.get("xpath") or element.get("css_selector") or "")
    else:
        confidence = float(element.confidence_score or 0.0)
        strategy = str(element.locator_strategy or "").lower()
        locator = str(element.best_locator or element.xpath or element.css_selector or "")
    strategy_bonus = {
        "testid": 0.14,
        "data-testid": 0.14,
        "role": 0.12,
        "aria-label": 0.10,
        "id": 0.10,
        "name": 0.07,
        "css": 0.04,
        "xpath": 0.02,
    }.get(strategy, 0.0)
    short_locator_bonus = 0.04 if locator and len(locator) <= 100 else 0.0
    return min(1.0, confidence * 0.75 + strategy_bonus + short_locator_bonus)


def _candidate_text(candidate: dict[str, Any]) -> str:
    return " ".join(
        str(part)
        for part in (
            candidate.get("name", ""),
            candidate.get("description", ""),
            candidate.get("element_type", ""),
            " ".join(candidate.get("tags") or []),
            candidate.get("id_attr", ""),
            candidate.get("name_attr", ""),
            candidate.get("placeholder", ""),
            candidate.get("label", ""),
            " ".join(str(v) for v in (candidate.get("test_data_hints") or {}).values()),
        )
        if part
    )


def _step_data_intent(step: GeneratedTestStep) -> str:
    text = " ".join(
        part for part in (
            step.description,
            step.action_type,
            step.input_value or "",
            step.expected_result or "",
        ) if part
    ).lower()
    if any(token in text for token in ("date", "dob", "birth", "calendar")):
        return "date"
    if "email" in text:
        return "email"
    if "password" in text:
        return "password"
    if any(token in text for token in ("phone", "mobile", "telephone")):
        return "phone"
    if any(token in text for token in ("amount", "quantity", "count", "age", "number")):
        return "number"
    return ""


def _data_type_bonus(step: GeneratedTestStep, candidate: dict[str, Any]) -> float:
    intent = _step_data_intent(step)
    if not intent:
        return 0.0
    hints = candidate.get("test_data_hints") or {}
    data_type = str(hints.get("data_type") or candidate.get("input_type") or "").lower()
    candidate_text = _candidate_text(candidate).lower()
    if intent == data_type or intent in candidate_text:
        return 0.20
    if intent == "date" and str(candidate.get("input_type") or "").lower() == "date":
        return 0.24
    return -0.12


def _action_element_bonus(action_type: str, element_type: str) -> float:
    action = action_type.lower()
    element = element_type.lower()
    if action in {"fill", "clear", "upload"} and element in {"input", "textarea", "select"}:
        return 0.22
    if action in {"click", "submit"} and element in {"button", "link", "checkbox", "radio"}:
        return 0.18
    if action.startswith("assert") and element in {"label", "text", "element", "button", "link"}:
        return 0.10
    if action == "select" and element in {"select", "option", "input"}:
        return 0.20
    return 0.0


def _infer_workflow_action(step: GeneratedTestStep, element_type: str = "") -> str:
    text = " ".join(
        part for part in (
            step.action_type,
            step.description,
            step.input_value or "",
            step.expected_result or "",
        ) if part
    ).lower()
    element = element_type.lower()

    if any(word in text for word in ("navigate", "open url", "go to", "launch page")):
        return "navigate"
    if any(word in text for word in ("wait", "pause", "loading")):
        return "wait"
    if any(word in text for word in ("scroll", "swipe")):
        return "scroll"
    if any(word in text for word in ("upload", "attach file", "choose file")):
        return "upload"
    if any(word in text for word in ("clear", "remove text", "empty field")):
        return "clear"
    if any(word in text for word in ("type", "enter", "input", "fill", "provide")):
        return "select" if element == "select" else "fill"
    if any(word in text for word in ("select", "choose", "dropdown", "pick option")):
        return "select"
    if any(word in text for word in ("assert", "verify", "validate", "should see", "check that", "confirm")):
        return "assert_text" if (step.expected_result or " text " in f" {text} ") else "assert_visible"
    if any(word in text for word in ("hover", "mouse over")):
        return "hover"
    if "submit" in text:
        return "submit"
    if element in {"input", "textarea"} and step.input_value:
        return "fill"
    if element == "select":
        return "select"
    if element in {"button", "link", "checkbox", "radio"}:
        return "click"
    return (step.action_type or "click").lower()


def _score_candidate(step: GeneratedTestStep, candidate: dict[str, Any]) -> float:
    inferred_action = _infer_workflow_action(step, str(candidate.get("element_type") or ""))
    step_text = " ".join(
        part for part in (
            step.description,
            inferred_action,
            step.input_value or "",
            step.expected_result or "",
        ) if part
    )
    candidate_text = _candidate_text(candidate)
    name = str(candidate.get("name") or "")
    score = max(
        _text_similarity(step.description, name),
        _text_similarity(step_text, candidate_text),
        _token_overlap(step_text, candidate_text),
    )
    score += _action_element_bonus(inferred_action, str(candidate.get("element_type") or ""))
    score += _data_type_bonus(step, candidate)
    score += min(float(candidate.get("locator_quality") or 0.0), 1.0) * 0.14
    if str(candidate.get("name") or "").lower() in step_text.lower():
        score += 0.12
    return min(score, 1.0)


def _select_candidates_for_steps(
    test_cases: list[GeneratedTestCase],
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    selected_by_id: dict[str, dict[str, Any]] = {}
    for test_case in test_cases:
        for step in test_case.steps:
            inferred_action = _infer_workflow_action(step)
            if inferred_action in {"navigate", "wait", "scroll"}:
                continue
            best: dict[str, Any] | None = None
            best_score = 0.0
            for candidate in candidates:
                score = _score_candidate(step, candidate)
                if score > best_score:
                    best = candidate
                    best_score = score
            if best and best_score >= 0.34:
                candidate_id = best["candidate_id"]
                existing = selected_by_id.setdefault(candidate_id, {**best, "matched_steps": []})
                existing["selected"] = True
                existing["match_reason"] = (
                    f"Matched {inferred_action} step intent with {best_score:.0%} confidence"
                )
                existing["matched_steps"].append(f"{test_case.title}: step {step.step_number}")

    return list(selected_by_id.values())


async def _save_selected_candidates(
    db: AsyncSession,
    *,
    page_id: str,
    workflow_id: str,
    url: str,
    selected_candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    result = await db.execute(select(PageElementModel).where(PageElementModel.page_id == page_id))
    existing_elements = result.scalars().all()
    existing_by_name = {element.name.strip().lower(): element for element in existing_elements}
    existing_by_locator: dict[str, PageElementModel] = {}
    for element in existing_elements:
        for locator in (element.css_selector, element.xpath, element.id_attr, element.name_attr):
            if locator:
                existing_by_locator[locator.strip()] = element

    saved: list[dict[str, Any]] = []
    now = datetime.utcnow()
    for candidate in selected_candidates:
        locator_key = (
            candidate.get("best_locator")
            or candidate.get("css_selector")
            or candidate.get("xpath")
            or ""
        ).strip()
        element = existing_by_locator.get(locator_key) if locator_key else None
        if element is None:
            element = existing_by_name.get(str(candidate.get("name") or "").strip().lower())

        alt_locators = []
        if candidate.get("xpath"):
            alt_locators.append({
                "strategy": "xpath",
                "locator": candidate["xpath"],
                "verified": True,
                "element_count": 1,
                "score": candidate.get("confidence_score", 0.0),
                "reason": "Selected from post-test-step scrape",
            })
        if candidate.get("css_selector"):
            alt_locators.append({
                "strategy": "css",
                "locator": candidate["css_selector"],
                "verified": True,
                "element_count": 1,
                "score": candidate.get("confidence_score", 0.0),
                "reason": "Selected from post-test-step scrape",
            })

        tags = sorted(set((candidate.get("tags") or []) + ["ai-selected", "workflow-required"]))
        if element:
            element.element_type = candidate.get("element_type") or element.element_type
            element.description = candidate.get("description") or element.description
            element.xpath = candidate.get("xpath") or element.xpath
            element.css_selector = candidate.get("css_selector") or element.css_selector
            element.id_attr = candidate.get("id_attr") or element.id_attr
            element.name_attr = candidate.get("name_attr") or element.name_attr
            element.locator_strategy = candidate.get("locator_strategy") or element.locator_strategy
            element.tags = sorted(set((element.tags or []) + tags))
            element.confidence_score = candidate.get("confidence_score")
            element.alternative_locators = alt_locators
            element.source_url = url
            element.last_verified_at = now
            element.discovery_metadata = {
                "workflow_id": workflow_id,
                "source": "post_teststep_scrape",
                "matched_steps": candidate.get("matched_steps", []),
                "input_type": candidate.get("input_type") or "",
                "placeholder": candidate.get("placeholder") or "",
                "label": candidate.get("label") or "",
                "test_data_hints": candidate.get("test_data_hints") or {},
                "locator_quality": candidate.get("locator_quality") or candidate.get("confidence_score"),
            }
            element.updated_at = now
        else:
            element = PageElementModel(
                page_id=page_id,
                name=candidate.get("name") or "Discovered element",
                element_type=candidate.get("element_type") or "element",
                description=candidate.get("description") or "",
                xpath=candidate.get("xpath") or "",
                css_selector=candidate.get("css_selector") or "",
                id_attr=candidate.get("id_attr") or "",
                name_attr=candidate.get("name_attr") or "",
                locator_strategy=candidate.get("locator_strategy") or "xpath",
                tags=tags,
                confidence_score=candidate.get("confidence_score"),
                alternative_locators=alt_locators,
                source_url=url,
                last_verified_at=now,
                discovery_metadata={
                    "workflow_id": workflow_id,
                    "source": "post_teststep_scrape",
                    "matched_steps": candidate.get("matched_steps", []),
                    "input_type": candidate.get("input_type") or "",
                    "placeholder": candidate.get("placeholder") or "",
                    "label": candidate.get("label") or "",
                    "test_data_hints": candidate.get("test_data_hints") or {},
                    "locator_quality": candidate.get("locator_quality") or candidate.get("confidence_score"),
                },
            )
            db.add(element)
            await db.flush()

        saved.append({**candidate, "element_id": element.id})

    await db.flush()
    return saved


def _bind_cases_to_saved_elements(
    test_cases: list[GeneratedTestCase],
    page_id: str,
    saved_elements: list[dict[str, Any]],
) -> list[GeneratedTestCase]:
    bound_cases: list[GeneratedTestCase] = []
    for test_case in test_cases:
        bound_steps = []
        for step in test_case.steps:
            inferred_action = _infer_workflow_action(step)
            if inferred_action in {"navigate", "wait", "scroll"}:
                bound_steps.append(step.model_copy(update={
                    "page_id": page_id,
                    "action_type": inferred_action,
                }))
                continue

            best: dict[str, Any] | None = None
            best_score = 0.0
            for element in saved_elements:
                score = _score_candidate(step, element)
                if score > best_score:
                    best = element
                    best_score = score

            if best and best_score >= 0.34:
                final_action = _infer_workflow_action(step, str(best.get("element_type") or ""))
                bound_steps.append(step.model_copy(update={
                    "page_id": page_id,
                    "page_element_id": best.get("element_id"),
                    "action_type": final_action,
                    "confidence": best_score,
                }))
            else:
                bound_steps.append(step.model_copy(update={
                    "page_id": page_id,
                    "action_type": inferred_action,
                    "needs_review": True,
                    "review_reason": "No necessary scraped element matched this step",
                    "confidence": best_score,
                }))
        bound_cases.append(test_case.model_copy(update={"steps": bound_steps}))
    return bound_cases


def _resolved_locator(element: dict[str, Any]) -> str:
    strategy = str(element.get("locator_strategy") or "").lower()
    if strategy == "css" and element.get("css_selector"):
        return str(element["css_selector"])
    if strategy == "xpath" and element.get("xpath"):
        return str(element["xpath"])
    return str(
        element.get("best_locator")
        or element.get("xpath")
        or element.get("css_selector")
        or ""
    )


def _workflow_action_to_test_config(action_type: str, element: dict[str, Any] | None = None) -> str:
    action = (action_type or "click").lower()
    element_type = str((element or {}).get("element_type") or "").lower()
    if action == "navigate":
        return "NAVIGATE_TO_URL"
    if action == "fill":
        return "CLEAR_AND_TYPE"
    if action == "select":
        return "SELECT"
    if action == "submit":
        return "CLICK"
    if action == "hover":
        return "MOUSE_OVER"
    if action == "upload":
        return "UPLOAD_FILE"
    if action == "clear":
        return "CLEAR_AND_TYPE"
    if action == "wait":
        return "WAIT"
    if action == "scroll":
        return "HANDLE"
    if action in {"assert_visible", "assert_text", "assert_enabled"}:
        return "ASSERTION"
    if action == "click" and element_type == "checkbox":
        return "HANDLE_CHECKBOX"
    if action == "click" and element_type == "radio":
        return "RADIO_BUTTON"
    return "CLICK"


def _step_configured_input_value(step: GeneratedTestStep, element: dict[str, Any] | None) -> str:
    if step.input_value:
        return step.input_value
    hints = (element or {}).get("test_data_hints") or {}
    action = _infer_workflow_action(step, str((element or {}).get("element_type") or ""))
    if action in {"fill", "select"}:
        return str(hints.get("sample_value") or "")
    return ""


def _build_step_bindings(
    *,
    page_id: str | None,
    page_name: str,
    step: GeneratedTestStep,
    element: dict[str, Any] | None,
) -> dict[str, dict[str, Any]]:
    action = _workflow_action_to_test_config(step.action_type, element)
    web_binding: dict[str, Any] = {
        "page": page_name,
        "page_id": page_id or step.page_id,
        "action_type": action,
        "workflow_action_type": step.action_type,
        "source": "ai_workflow",
        "confidence": step.confidence,
    }
    if element:
        locator = _resolved_locator(element)
        hints = element.get("test_data_hints") or {}
        web_binding.update({
            "page_element_id": element.get("element_id"),
            "element_name": element.get("name"),
            "element_type": element.get("element_type"),
            "input_type": element.get("input_type") or hints.get("input_type") or "",
            "data_type": hints.get("data_type") or "",
            "date_format": hints.get("date_format") or "",
            "locator_strategy": element.get("locator_strategy") or "xpath",
            "selector": locator,
            "xpath": element.get("xpath") or locator,
            "css_selector": element.get("css_selector") or "",
            "locator_quality": element.get("locator_quality") or element.get("confidence_score"),
            "match_reason": element.get("match_reason"),
        })
    return {"web": web_binding}


# ---------------------------------------------------------------------------
# Background task: test case generation phase
# ---------------------------------------------------------------------------

async def _run_testcase_generation(workflow_id: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
            )
            wf = result.scalar_one()

            await _update_state(
                db, workflow_id, WorkflowState.TESTCASES_GENERATING,
                "Generating test cases and drafting test steps...",
                detail="Selected scenarios are being converted before page scraping starts.",
            )

            provider = _build_provider(wf.ai_provider, wf.ai_model)
            selected = [
                ScenarioPreview(**s)
                for s in (wf.scenarios or [])
                if s.get("selected")
            ]

            if not selected:
                await _update_state(
                    db, workflow_id, WorkflowState.FAILED,
                    "No scenarios selected for test case generation",
                )
                return

            elements_summary = (
                "Page elements are intentionally unavailable at this stage. Draft clear "
                "business-level test steps; locator binding will happen after scraping."
            )
            page_name = wf.page_name or _extract_page_name(wf.webpage_url, wf.project_name)

            tc_agent = TestCaseGenerationAgent(provider)
            all_test_cases: list[GeneratedTestCase] = []
            timeout_seconds = settings.ai_workflow_llm_call_timeout_seconds
            concurrency = max(1, min(settings.ai_workflow_testcase_concurrency, len(selected)))
            semaphore = asyncio.Semaphore(concurrency)

            async def generate_for_scenario(
                index: int,
                scenario: ScenarioPreview,
            ) -> _GENERATED_CASE_BATCH:
                async with semaphore:
                    try:
                        tc_list = await asyncio.wait_for(
                            tc_agent.run(scenario, page_name, elements_summary),
                            timeout=timeout_seconds,
                        )
                    except TimeoutError as exc:
                        raise TimeoutError(
                            f"Scenario {index}/{len(selected)} '{scenario.title}' "
                            f"exceeded {timeout_seconds}s"
                        ) from exc
                    except Exception as exc:
                        raise ValueError(
                            f"Scenario {index}/{len(selected)} '{scenario.title}' failed: "
                            f"{_format_provider_error(exc)}"
                        ) from exc
                    return index, scenario, tc_list.test_cases

            await _update_state(
                db, workflow_id, WorkflowState.TESTCASES_GENERATING,
                f"Generating test cases for {len(selected)} selected scenarios "
                f"({concurrency} at a time)...",
                detail="Each selected scenario is being converted into detailed test cases.",
            )

            tasks = [
                asyncio.create_task(generate_for_scenario(index, scenario))
                for index, scenario in enumerate(selected, start=1)
            ]
            generated_batches: list[_GENERATED_CASE_BATCH] = []
            completed = 0
            try:
                for task in asyncio.as_completed(tasks):
                    index, scenario, test_cases = await task
                    completed += 1
                    generated_batches.append((index, scenario, test_cases))
                    await _update_state(
                        db, workflow_id, WorkflowState.TESTCASES_GENERATING,
                        f"Generated test cases for {completed}/{len(selected)} scenarios: "
                        f"{scenario.title}",
                        detail=f"Created {len(test_cases)} test case draft(s) for this scenario.",
                    )
            except Exception as exc:
                for task in tasks:
                    task.cancel()
                raise ValueError(f"Test case generation timed out or failed: {_format_provider_error(exc)}") from exc

            generated_batches.sort(key=lambda item: item[0])
            total_generated = sum(len(test_cases) for _, _, test_cases in generated_batches)
            all_test_cases = [
                tc
                for _, _, test_cases in generated_batches
                for tc in test_cases
            ]
            total_steps = sum(len(tc.steps) for tc in all_test_cases)
            await _update_state(
                db,
                workflow_id,
                WorkflowState.TESTCASES_GENERATING,
                f"Generated {total_generated} test case drafts - generating {total_steps} test step drafts...",
                detail=(
                    "The workflow is now expanding each case into ordered actions before "
                    "the page scrape starts."
                ),
                testcases_created=total_generated,
                teststeps_created=total_steps,
            )
            await _update_state(
                db, workflow_id, WorkflowState.TESTCASES_READY,
                f"Created {total_generated} test case drafts and {total_steps} test steps",
                detail="Now creating the page and scraping raw element candidates for selective binding.",
                testcases_created=total_generated,
                teststeps_created=total_steps,
            )

            page_cfg = PageConfigurationAgent()
            project = await page_cfg.ensure_project(db, wf.project_name)
            module = await page_cfg.ensure_module(
                db, project.id, wf.module_name or wf.project_name
            )
            wf.project_id = project.id
            wf.module_id = module.id
            await db.commit()

            await _update_state(
                db,
                workflow_id,
                WorkflowState.PAGE_CREATED,
                f"Creating page '{page_name}' after test step draft...",
                detail=f"Page Repository entry is created only after {total_steps} drafted steps exist.",
                project_id=project.id,
                module_id=module.id,
            )
            page = await page_cfg.ensure_page(
                db, project.id, module.id, page_name, wf.webpage_url, wf.platform
            )
            await _update_state(
                db,
                workflow_id,
                WorkflowState.PAGE_CREATED,
                f"Page '{page_name}' created",
                detail="Scraping starts now; raw candidates will stay in the workflow panel first.",
                page_id=page.id,
            )

            discovery_engine = "MCP Playwright server" if settings.mcp_playwright_url else "local Playwright"
            await _update_state(
                db, workflow_id, WorkflowState.DISCOVERY_RUNNING,
                f"{discovery_engine} is scraping raw element candidates...",
                detail=(
                    "The scrape is running in preview mode. Nothing is saved to the Page "
                    "Repository until the test steps choose the necessary elements."
                ),
            )
            adapter = BrowserDiscoveryAdapter(
                mcp_url=settings.mcp_playwright_url or None,
                playwright_fallback=settings.playwright_fallback,
            )
            discovery_agent = AppDiscoveryAgent(adapter)
            discovery_result = await discovery_agent.run(
                url=wf.webpage_url,
                page_name=page_name,
                platform=wf.platform,
                save_mode="preview",
                page_id=page.id,
                db=db,
            )
            if discovery_result.summary.has_error:
                raise RuntimeError(discovery_result.summary.error or "Page scraping failed")

            scraped_candidates = [
                _candidate_from_discovered(element, index)
                for index, element in enumerate(discovery_result.elements)
            ]
            await _update_state(
                db, workflow_id, WorkflowState.DISCOVERY_DONE,
                f"Scraped {len(scraped_candidates)} raw candidates into the mini panel",
                detail="These candidates are not Page Repository records yet.",
                scraped_candidates=scraped_candidates,
            )

            selected_candidates = _select_candidates_for_steps(all_test_cases, scraped_candidates)
            selected_by_id = {candidate["candidate_id"]: candidate for candidate in selected_candidates}
            scraped_candidates = [
                {**candidate, **selected_by_id.get(candidate["candidate_id"], {})}
                for candidate in scraped_candidates
            ]
            await _update_state(
                db, workflow_id, WorkflowState.LOCATORS_RANKED,
                f"AI selected {len(selected_candidates)} necessary elements from {len(scraped_candidates)} scraped candidates",
                detail=(
                    "Generated test steps were compared with scraped names, roles, text, "
                    "IDs, and locator candidates."
                ),
                scraped_candidates=scraped_candidates,
                selected_elements=selected_candidates,
            )

            saved_elements = await _save_selected_candidates(
                db,
                page_id=page.id,
                workflow_id=workflow_id,
                url=wf.webpage_url,
                selected_candidates=selected_candidates,
            )
            low_conf = sum(
                1 for element in saved_elements
                if float(element.get("confidence_score") or 0.0) < 0.6
            )
            await _update_state(
                db, workflow_id, WorkflowState.PAGE_SAVED,
                f"Saved {len(saved_elements)} necessary elements to '{page_name}'",
                detail=(
                    f"Skipped {max(len(scraped_candidates) - len(saved_elements), 0)} scraped candidates "
                    "because no generated test step needed them."
                ),
                elements_saved=len(saved_elements),
                low_confidence_locators=low_conf,
                selected_elements=saved_elements,
                scraped_candidates=scraped_candidates,
            )

            await _update_state(
                db,
                workflow_id,
                WorkflowState.PAGE_SAVED,
                "Configuring test steps with matched page, actions, elements, and XPath...",
                detail=(
                    "Each generated step is being mapped to the created page and the "
                    "best matching saved element from the scrape."
                ),
            )
            bound_cases = _bind_cases_to_saved_elements(all_test_cases, page.id, saved_elements)
            saved_element_lookup = {
                str(element.get("element_id")): element
                for element in saved_elements
                if element.get("element_id")
            }
            total_steps = sum(len(tc.steps) for tc in bound_cases)
            unmapped = sum(1 for tc in bound_cases for step in tc.steps if step.needs_review)
            persisted = 0
            for tc in bound_cases:
                await _persist_test_case(
                    db,
                    tc,
                    module.id,
                    project.id,
                    page_name=page_name,
                    element_lookup=saved_element_lookup,
                )
                persisted += 1
                await _update_state(
                    db, workflow_id, WorkflowState.PAGE_SAVED,
                    f"Configured test case {persisted}/{len(bound_cases)} with page, element, action, and XPath",
                    detail=f"{len(tc.steps)} test step(s) stored under '{tc.title}'.",
                    testcases_created=persisted,
                    teststeps_created=sum(len(case.steps) for case in bound_cases[:persisted]),
                    unmapped_steps=sum(
                        1 for case in bound_cases[:persisted]
                        for step in case.steps if step.needs_review
                    ),
                )

            page_elements = [
                {
                    "id": element.get("element_id"),
                    "name": element.get("name"),
                    "confidence_score": element.get("confidence_score"),
                    "xpath": element.get("xpath"),
                    "alternative_locators": [{
                        "strategy": element.get("locator_strategy") or "xpath",
                        "locator": (
                            element.get("best_locator")
                            or element.get("xpath")
                            or element.get("css_selector")
                            or ""
                        ),
                    }],
                }
                for element in saved_elements
            ]
            # Build review data
            reviewer = ReviewAndValidationAgent()
            review = reviewer.build_review(
                workflow_id=workflow_id,
                project_id=project.id,
                module_id=module.id,
                page_id=page.id,
                elements_saved=len(saved_elements),
                scenarios_generated=len(wf.scenarios or []),
                scenarios_selected=len(selected),
                test_cases=bound_cases,
                page_elements=page_elements,
            )

            review_update = {
                "testcases_created": len(bound_cases),
                "teststeps_created": total_steps,
                "unmapped_steps": unmapped,
                "low_confidence_locators": len(review.low_confidence_locators),
                "elements_saved": len(saved_elements),
                "page_id": page.id,
                "selected_elements": saved_elements,
                "scraped_candidates": scraped_candidates,
                "review_data": review.model_dump(),
            }
            await _update_state(
                db, workflow_id, WorkflowState.REVIEW_READY,
                "Review summary ready",
                detail=(
                    f"Validated {len(bound_cases)} test cases and {total_steps} test steps. "
                    f"{unmapped} step(s) need review."
                ),
                **review_update,
            )
            await _update_state(
                db, workflow_id, WorkflowState.COMPLETED,
                f"Completed: {len(bound_cases)} test cases, {total_steps} steps",
                detail="AI Workflow finished. Test Configuration and Page Repository are ready to inspect.",
                **review_update,
            )

        except Exception as exc:
            logger.exception("Test case generation failed for workflow %s", workflow_id)
            await _append_error(db, workflow_id, str(exc))
            await _update_state(
                db, workflow_id, WorkflowState.FAILED,
                f"Test case generation failed: {exc}",
            )


async def _persist_test_case(
    db: AsyncSession,
    tc: GeneratedTestCase,
    module_id: str,
    project_id: str,
    *,
    page_name: str = "",
    element_lookup: dict[str, dict[str, Any]] | None = None,
) -> None:
    if not module_id:
        return
    case_model = TestCaseModel(
        module_id=module_id,
        project_id=project_id,
        name=tc.title,
        description=tc.description,
        test_type=tc.test_type,
        priority=tc.priority,
    )
    db.add(case_model)
    await db.flush()

    for i, step in enumerate(tc.steps, 1):
        element = (
            element_lookup.get(step.page_element_id or "")
            if element_lookup and step.page_element_id
            else None
        )
        configured_action = _workflow_action_to_test_config(step.action_type, element)
        bindings = _build_step_bindings(
            page_id=step.page_id,
            page_name=page_name,
            step=step,
            element=element,
        )
        web_binding = bindings.get("web", {})
        locator = str(web_binding.get("selector") or web_binding.get("xpath") or "")
        element_name = str(element.get("name") or "") if element else ""
        test_data_hints = (element or {}).get("test_data_hints") or {}
        configured_input_value = _step_configured_input_value(step, element)
        target = element_name or (page_name if step.action_type == "navigate" else "")
        test_data = {
            **(step.test_data or {}),
            "value": configured_input_value,
            "action_type": configured_action,
            "workflow_action_type": step.action_type,
            "page": page_name,
            "page_id": step.page_id,
            "page_element_id": step.page_element_id,
            "element_name": element_name,
            "input_type": web_binding.get("input_type") or test_data_hints.get("input_type") or "",
            "data_type": test_data_hints.get("data_type") or "",
            "date_format": test_data_hints.get("date_format") or "",
            "sample_value": test_data_hints.get("sample_value") or "",
            "locator": locator,
            "xpath": str(web_binding.get("xpath") or locator),
            "css_selector": str(web_binding.get("css_selector") or ""),
            "locator_quality": web_binding.get("locator_quality") or "",
            "binding_confidence": step.confidence,
        }
        if step.assertion_type:
            test_data["assertion_type"] = step.assertion_type

        step_model = TestStepModel(
            test_case_id=case_model.id,
            step_order=i,
            name=(step.description or configured_action)[:255],
            description=step.description,
            action_type=configured_action,
            page_id=step.page_id,
            page_element_id=step.page_element_id,
            input_value=configured_input_value,
            assertion_type=step.assertion_type or "",
            expected_result=step.expected_result or "",
            intent=configured_action,
            target=target,
            test_data=test_data,
            tags=step.tags,
            bindings=bindings,
        )
        db.add(step_model)
    await db.commit()


# ---------------------------------------------------------------------------
# Public service API
# ---------------------------------------------------------------------------

class AIWorkflowService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create_workflow(self, req: WorkflowCreateRequest) -> WorkflowStateResponse:
        wf = AIWorkflowModel(
            state=WorkflowState.CREATED.value,
            progress_percent=STATE_PROGRESS[WorkflowState.CREATED],
            current_message="Workflow created",
            brd_text=req.brd_text,
            webpage_url=req.webpage_url,
            project_name=req.project_name,
            module_name=req.module_name or req.project_name,
            page_name=req.page_name or _extract_page_name(req.webpage_url, req.project_name),
            platform=req.platform,
            save_mode=req.save_mode,
            ai_provider=req.ai_provider,
            ai_model=req.ai_model,
            scenarios=[],
            errors=[],
            scraped_candidates=[],
            selected_elements=[],
        )
        self._db.add(wf)
        await self._db.commit()
        await self._db.refresh(wf)

        asyncio.create_task(_run_workspace_phase(wf.id))
        return _workflow_to_response(wf)

    async def get_workflow(self, workflow_id: str) -> WorkflowStateResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")
        return _workflow_to_response(wf)

    async def generate_scenarios(
        self, workflow_id: str, ai_provider: str | None, ai_model: str | None
    ) -> WorkflowStateResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")

        provider = ai_provider or wf.ai_provider
        model = ai_model or wf.ai_model

        asyncio.create_task(_run_scenario_generation(workflow_id, provider, model))
        return _workflow_to_response(wf)

    async def confirm_scenarios(
        self, workflow_id: str, scenario_ids: list[str]
    ) -> WorkflowStateResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")
        if not scenario_ids:
            raise ValueError("At least one scenario must be selected")

        id_set = set(scenario_ids)
        updated = []
        for s in (wf.scenarios or []):
            updated.append({**s, "selected": s.get("scenario_id") in id_set})
        wf.scenarios = updated
        wf.state = WorkflowState.AWAITING_CONFIRMATION.value
        wf.current_message = f"{len(scenario_ids)} scenario(s) confirmed"
        await self._db.commit()
        await self._db.refresh(wf)
        return _workflow_to_response(wf)

    async def generate_testcases(self, workflow_id: str) -> WorkflowStateResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")

        asyncio.create_task(_run_testcase_generation(workflow_id))
        return _workflow_to_response(wf)

    async def get_review(self, workflow_id: str) -> ReviewResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")

        if wf.review_data:
            return ReviewResponse(**wf.review_data)

        return ReviewResponse(
            workflow_id=workflow_id,
            project_id=wf.project_id,
            module_id=wf.module_id,
            page_id=wf.page_id,
            elements_saved=wf.elements_saved,
            testcases_created=wf.testcases_created,
            teststeps_created=wf.teststeps_created,
        )
