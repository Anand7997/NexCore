"""AIWorkflowService — orchestrates the complete AI Workflow pipeline."""
from __future__ import annotations

import asyncio
import importlib.util
import json
import logging
import re as _re
from contextvars import ContextVar
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
from app.ai_workflow.discovery.desktop_adapter import DesktopDiscoveryAdapter
from app.ai_workflow.models import AIWorkflowModel
from app.ai_workflow.prompts.scenario_prompt import build_scenario_prompt
from app.ai_workflow.providers.base import AbstractAIProvider
from app.ai_workflow.providers.claude_provider import ClaudeProvider
from app.ai_workflow.providers.null_provider import NullProvider
from app.ai_workflow.providers.openai_provider import OpenAIProvider
from app.ai_workflow.schemas import (
    GeneratedTestCase,
    LocatorEnhancementList,
    ReviewResponse,
    ScenarioList,
    ScenarioPreview,
    StepElementBindingDecision,
    StepElementBindingDecisionList,
    WorkflowCreateRequest,
    WorkflowStateResponse,
)
from app.ai_workflow.state import STATE_PROGRESS, WorkflowState
from app.config import DEFAULT_CLAUDE_MODEL, DEFAULT_OPENAI_MODEL, settings
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
_NULL_PROVIDER_ALIASES = {"", "null", "test", "ci"}
_NULL_MODEL_ALIASES = {"", "null", "test", "ci"}
_AI_LOCATOR_ENHANCEMENT_LIMIT = 120
_AI_LOCATOR_ALTERNATIVE_LIMIT = 10
_MIN_HEALING_LOCATOR_PATHS = 3
_DESKTOP_REPOSITORY_PREFETCH_MIN = 12
_DESKTOP_REPOSITORY_PREFETCH_MAX = 80
_TARGETED_CANDIDATE_MAX_PER_STEP = 4
_TARGETED_CANDIDATE_FALLBACK_PER_STEP = 2
_TARGETED_CANDIDATE_GLOBAL_MAX = 80
_TARGETED_CANDIDATE_FALLBACK_MAX = 24
_AI_PROVIDER_CALL_TIMEOUT_SECONDS = 90
_STEP_INTENT_STOPWORDS = {
    "a", "an", "and", "are", "as", "be", "by", "click", "enter", "fill",
    "for", "from", "in", "into", "is", "it", "of", "on", "open", "select",
    "should", "submit", "the", "to", "type", "user", "verify", "with",
}

_CANCELLED_WORKFLOWS: set[str] = set()
_WORKFLOW_RUN_TOKENS: dict[str, int] = {}
_WORKFLOW_RUN_TOKEN: ContextVar[int | None] = ContextVar("ai_workflow_run_token", default=None)
_ROLLBACK_MESSAGE_PREFIX = "Rolled back to pipeline stage:"
_ROLLBACK_STAGE_LABELS: dict[str, str] = {
    "project": "Creating Project",
    "module": "Creating Module",
    "model": "Selecting LLM",
    "testcases": "Generating Test Cases",
    "teststeps": "Generating Test Steps",
    "page": "Creating Page",
    "mcp": "Triggering MCP",
    "appLaunch": "Launching Desktop App",
    "scrape": "Step Candidate Panel",
    "pageConfig": "Configuring Page",
    "stepConfig": "Configuring Test Steps",
}
_ROLLBACK_STAGE_STATES: dict[str, WorkflowState] = {
    "project": WorkflowState.CREATED,
    "module": WorkflowState.PROJECT_READY,
    "model": WorkflowState.MODULE_READY,
    "testcases": WorkflowState.AWAITING_CONFIRMATION,
    "teststeps": WorkflowState.TESTCASES_READY,
    "page": WorkflowState.PAGE_CREATED,
    "mcp": WorkflowState.PAGE_CREATED,
    "appLaunch": WorkflowState.DISCOVERY_RUNNING,
    "scrape": WorkflowState.DISCOVERY_DONE,
    "pageConfig": WorkflowState.LOCATORS_RANKED,
    "stepConfig": WorkflowState.PAGE_SAVED,
}
_ROLLBACK_STAGE_ORDER: dict[str, int] = {
    "project": 0,
    "module": 1,
    "model": 2,
    "testcases": 3,
    "teststeps": 4,
    "page": 5,
    "mcp": 6,
    "appLaunch": 7,
    "scrape": 8,
    "pageConfig": 9,
    "stepConfig": 10,
}


def _start_workflow_run(workflow_id: str) -> int:
    _CANCELLED_WORKFLOWS.discard(workflow_id)
    run_token = _WORKFLOW_RUN_TOKENS.get(workflow_id, 0) + 1
    _WORKFLOW_RUN_TOKENS[workflow_id] = run_token
    return run_token


def _cancel_workflow_run(workflow_id: str) -> None:
    _CANCELLED_WORKFLOWS.add(workflow_id)
    _WORKFLOW_RUN_TOKENS[workflow_id] = _WORKFLOW_RUN_TOKENS.get(workflow_id, 0) + 1


def _workflow_run_is_current(workflow_id: str) -> bool:
    run_token = _WORKFLOW_RUN_TOKEN.get()
    return run_token is None or _WORKFLOW_RUN_TOKENS.get(workflow_id) == run_token


async def _run_with_workflow_token(run_token: int, coro: Any) -> None:
    context_token = _WORKFLOW_RUN_TOKEN.set(run_token)
    try:
        await coro
    finally:
        _WORKFLOW_RUN_TOKEN.reset(context_token)


def _rollback_stage_key(target_stage: str) -> str:
    stage = (target_stage or "").strip()
    if stage not in _ROLLBACK_STAGE_STATES:
        raise ValueError(f"Unknown workflow rollback stage '{target_stage}'")
    return stage


def _rollback_message(stage: str) -> str:
    label = _ROLLBACK_STAGE_LABELS[stage]
    return (
        f"{_ROLLBACK_MESSAGE_PREFIX} {stage} ({label}). "
        "Current in-progress step was terminated."
    )


def _append_workflow_activity(
    wf: AIWorkflowModel,
    state: WorkflowState,
    message: str,
    detail: str | None = None,
) -> None:
    activity_log: list[dict[str, Any]] = list(wf.activity_log or [])
    activity_log.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "state": state.value,
        "message": message,
        "detail": detail,
    })
    wf.activity_log = activity_log[-80:]


def _apply_rollback_fields(wf: AIWorkflowModel, target_stage: str) -> WorkflowState:
    stage = _rollback_stage_key(target_stage)
    target_state = _ROLLBACK_STAGE_STATES[stage]
    stage_rank = _ROLLBACK_STAGE_ORDER[stage]

    wf.state = target_state.value
    wf.progress_percent = STATE_PROGRESS.get(target_state, wf.progress_percent)
    wf.current_message = _rollback_message(stage)
    wf.errors = []
    wf.review_data = {}

    if stage_rank <= _ROLLBACK_STAGE_ORDER["model"]:
        wf.scenarios = []

    if stage_rank <= _ROLLBACK_STAGE_ORDER["testcases"]:
        wf.testcases_created = 0
        wf.teststeps_created = 0
        wf.unmapped_steps = 0

    if stage_rank <= _ROLLBACK_STAGE_ORDER["page"]:
        wf.page_id = None
        wf.elements_saved = 0
        wf.scraped_candidates = []
        wf.selected_elements = []
        wf.low_confidence_locators = 0
        wf.unmapped_steps = 0
    elif stage_rank <= _ROLLBACK_STAGE_ORDER["appLaunch"]:
        wf.elements_saved = 0
        wf.scraped_candidates = []
        wf.selected_elements = []
        wf.low_confidence_locators = 0
        wf.unmapped_steps = 0
    elif stage_rank == _ROLLBACK_STAGE_ORDER["scrape"]:
        wf.elements_saved = 0
        wf.selected_elements = []
        wf.low_confidence_locators = 0
        wf.unmapped_steps = 0
    elif stage_rank == _ROLLBACK_STAGE_ORDER["pageConfig"]:
        wf.elements_saved = 0
        wf.low_confidence_locators = 0
        wf.unmapped_steps = 0

    return target_state


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


def _default_ai_selection() -> tuple[str, str]:
    provider = (settings.default_ai_provider or "openai").strip().lower()
    default_model = (
        str(settings.default_claude_model or DEFAULT_CLAUDE_MODEL).strip() or DEFAULT_CLAUDE_MODEL
        if provider in ("claude", "anthropic")
        else DEFAULT_OPENAI_MODEL
    )
    model = (settings.default_ai_model or default_model).strip()
    if provider in ("claude", "anthropic") and "claude" not in model.lower():
        model = default_model
    elif provider == "openai" and not model.lower().startswith("gpt"):
        model = DEFAULT_OPENAI_MODEL
    return provider, model


def _normalize_ai_selection(ai_provider: str | None, ai_model: str | None) -> tuple[str, str]:
    default_provider, default_model = _default_ai_selection()
    provider = (ai_provider or default_provider).strip().lower()
    model = (ai_model or default_model).strip()
    if provider in _NULL_PROVIDER_ALIASES or model.lower() in _NULL_MODEL_ALIASES:
        return default_provider, default_model
    if provider in ("claude", "anthropic") and "claude" not in model.lower():
        model = str(settings.default_claude_model or DEFAULT_CLAUDE_MODEL).strip() or DEFAULT_CLAUDE_MODEL
    elif provider == "openai" and not model.lower().startswith("gpt"):
        model = DEFAULT_OPENAI_MODEL
    return provider, model


def _is_desktop_platform(platform: str | None) -> bool:
    return (platform or "").strip().lower() in {"desktop", "windows"}


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
        platform=wf.platform or "web",
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
    if not _workflow_run_is_current(workflow_id):
        return
    if workflow_id in _CANCELLED_WORKFLOWS and state != WorkflowState.STOPPED:
        return
    if wf.state == WorkflowState.STOPPED.value and state != WorkflowState.STOPPED:
        return
    wf.state = state.value
    if state != WorkflowState.STOPPED:
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
            await db.rollback()
            try:
                await _append_error(db, workflow_id, str(exc))
                await _update_state(
                    db, workflow_id, WorkflowState.FAILED,
                    f"Workspace setup failed: {exc}",
                )
            except Exception:
                logger.exception(
                    "Could not record failure state for workflow %s after workspace phase "
                    "error; workflow may be stuck until manually reset",
                    workflow_id,
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


def _target_basename(app_target: str | None) -> str:
    target = str(app_target or "").strip()
    if not target:
        return ""
    without_query = target.split("?", 1)[0].split("#", 1)[0]
    normalized = without_query.replace("\\", "/").rstrip("/")
    return normalized.split("/")[-1] or target


def _context_has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def _application_learning_profile(
    *,
    platform: str = "web",
    app_target: str = "",
    page_name: str = "",
    project_name: str = "",
    brd_text: str = "",
    brd_summary: str = "",
) -> str:
    """Build a compact app profile before asking the model for scenarios/steps."""
    platform_norm = (platform or "web").strip().lower() or "web"
    target_name = _target_basename(app_target)
    context = " ".join(
        str(value or "")
        for value in (platform_norm, app_target, target_name, page_name, project_name, brd_text, brd_summary)
    ).lower()
    is_desktop = _is_desktop_platform(platform_norm)
    auth_explicit = _context_has_any(
        context,
        ("login", "log in", "sign in", "sign-in", "signin", "authentication", "credential", "password"),
    )

    profile = [
        "Profile source: deterministic pre-generation application learning.",
        f"Observed platform: {platform_norm}.",
        f"Observed target: {app_target or 'not provided'}.",
        f"Observed target name: {target_name or 'not provided'}.",
        f"Observed screen/page: {page_name or 'not provided'}.",
    ]

    if is_desktop:
        profile.extend([
            "Inferred application type: desktop application.",
            "Core capabilities: infer from executable/window title, BRD, project name, and page name before creating scenarios.",
            "Likely controls: native buttons, menus, text fields, lists, tabs, dialogs, tree/table rows, and status text.",
            "Generation guidance: create direct desktop workflows; avoid assuming a web login or dashboard pattern.",
            "Scraping guidance: later desktop scraping should prioritize controls named in the generated steps and collect multiple locator paths for healing.",
            "Out of scope unless explicitly stated: sign-in, email, password, account, and dashboard flows.",
        ])
    else:
        profile.extend([
            "Inferred application type: web application.",
            "Core capabilities: infer business-critical navigation, data entry, validation, state changes, and confirmations from the BRD and target URL.",
            "Likely controls: navigation links, buttons, inputs, dropdowns, tables/lists, dialogs, messages, and confirmation text.",
            "Generation guidance: create business-domain workflows from the BRD and target, not generic steps.",
            "Scraping guidance: later scraping should prioritize elements referenced by generated steps and collect resilient locator alternatives.",
        ])
        if not auth_explicit:
            profile.append(
                "Out of scope unless explicitly stated: sign-in, email, password, authentication, account, and dashboard flows."
            )
        else:
            profile.append(
                "Authentication appears explicit in the source context; include it only where it supports the stated business flow."
            )

    return "\n".join(profile)


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
            application_profile = _application_learning_profile(
                platform=wf.platform or "web",
                app_target=wf.webpage_url or "",
                page_name=page_name,
                project_name=wf.project_name,
                brd_text=wf.brd_text,
                brd_summary=brd_analysis.summary,
            )

            await _update_state(
                db,
                workflow_id,
                WorkflowState.SCENARIOS_GENERATING,
                "Application context learned - generating test scenarios...",
                detail=application_profile,
            )

            # Build the scenario prompt (same as ScenarioGenerationAgent does internally)
            scenario_prompt = build_scenario_prompt(
                brd_text=wf.brd_text,
                project_name=wf.project_name,
                page_name=page_name,
                elements_summary=elements_summary,
                brd_analysis_summary=brd_analysis.summary,
                scenario_count=generation_profile["scenario_count"],
                analysis_depth=generation_profile["analysis_depth"],
                platform=wf.platform or "web",
                app_target=wf.webpage_url or "",
                application_profile=application_profile,
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
            await db.rollback()
            try:
                error_detail = _format_provider_error(exc)
                await _append_error(db, workflow_id, error_detail)
                await _update_state(
                    db, workflow_id, WorkflowState.FAILED,
                    f"Scenario generation failed with {ai_provider}/{ai_model}: {error_detail}",
                )
            except Exception:
                logger.exception(
                    "Could not record failure state for workflow %s after scenario generation "
                    "error; workflow may be stuck until manually reset",
                    workflow_id,
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


def _locator_candidate_payload(locator: Any) -> dict[str, Any]:
    if hasattr(locator, "model_dump"):
        return locator.model_dump()
    if isinstance(locator, dict):
        return dict(locator)
    return {}


def _normalize_locator_strategy(strategy: Any) -> str:
    value = str(strategy or "").strip()
    aliases = {
        "accessibility_id": "accessibility id",
        "automation_id": "automation id",
        "class_name": "class name",
    }
    return aliases.get(value.lower(), value)


def _safe_locator_text(*values: Any, limit: int = 120) -> str:
    for value in values:
        text = " ".join(str(value or "").split())
        if text and len(text) <= limit:
            return text
    return ""


def _xpath_literal(value: Any) -> str:
    text = str(value or "")
    if "'" not in text:
        return f"'{text}'"
    if '"' not in text:
        return f'"{text}"'
    return "concat(" + ', "\'", '.join(f"'{part}'" for part in text.split("'")) + ")"


def _css_attr_literal(value: Any) -> str:
    text = str(value or "").replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'


def _css_id_selector(value: str) -> str:
    if _re.match(r"^[A-Za-z_][A-Za-z0-9_-]*$", value):
        return f"#{value}"
    return f"[id={_css_attr_literal(value)}]"


def _web_tag_for_candidate(candidate: dict[str, Any]) -> str:
    element_type = str(candidate.get("element_type") or "").strip().lower()
    input_type = str(candidate.get("input_type") or "").strip().lower()
    if element_type in {"button", "submit"} or input_type in {"button", "submit"}:
        return "button"
    if element_type in {"link", "anchor"}:
        return "a"
    if element_type in {"select", "combobox", "listbox", "option"}:
        return "select"
    if element_type in {"textarea"}:
        return "textarea"
    if element_type in {
        "input",
        "textbox",
        "text",
        "email",
        "password",
        "search",
        "number",
        "date",
        "checkbox",
        "radio",
    } or input_type:
        return "input"
    return "*"


def _web_role_for_candidate(candidate: dict[str, Any]) -> str:
    role = str(candidate.get("role") or "").strip().lower()
    if role:
        return role
    element_type = str(candidate.get("element_type") or "").strip().lower()
    input_type = str(candidate.get("input_type") or "").strip().lower()
    mapping = {
        "button": "button",
        "submit": "button",
        "link": "link",
        "anchor": "link",
        "select": "combobox",
        "combobox": "combobox",
        "checkbox": "checkbox",
        "radio": "radio",
        "tab": "tab",
        "switch": "switch",
    }
    if element_type in mapping:
        return mapping[element_type]
    if input_type in {"checkbox", "radio"}:
        return input_type
    if element_type in {"input", "textbox", "text", "email", "password", "search"} or input_type:
        return "textbox"
    return ""


def _candidate_is_desktop(candidate: dict[str, Any]) -> bool:
    metadata = candidate.get("discovery_metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}
    tags = {str(tag).strip().lower() for tag in candidate.get("tags") or []}
    platform = str(candidate.get("platform") or metadata.get("platform") or "").strip().lower()
    source = str(metadata.get("source") or "").strip().lower()
    return (
        platform in {"desktop", "windows"}
        or "desktop" in tags
        or source.startswith("desktop")
    )


def _candidate_locator_paths(candidate: dict[str, Any]) -> list[dict[str, Any]]:
    paths: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add(
        strategy: str,
        locator: Any,
        *,
        score: float | None = None,
        verified: bool = False,
        element_count: int = 0,
        reason: str = "",
        source: str = "ai_workflow",
    ) -> None:
        value = str(locator or "").strip()
        normalized_strategy = _normalize_locator_strategy(strategy)
        if not value or not normalized_strategy:
            return
        key = (normalized_strategy.lower(), value)
        if key in seen:
            return
        seen.add(key)
        payload = {
            "strategy": normalized_strategy,
            "locator": value,
            "verified": verified,
            "element_count": element_count,
            "score": float(score if score is not None else candidate.get("confidence_score") or 0.0),
            "reason": reason or "Captured locator path from AI Workflow discovery",
            "source": source,
        }
        paths.append(payload)

    for item in candidate.get("alternative_locators") or []:
        if not isinstance(item, dict):
            continue
        add(
            str(item.get("strategy") or ""),
            item.get("locator") or item.get("value") or item.get("selector"),
            score=float(item.get("score") or item.get("confidence") or candidate.get("confidence_score") or 0.0),
            verified=bool(item.get("verified", False)),
            element_count=int(item.get("element_count") or item.get("count") or 0),
            reason=str(item.get("reason") or "Captured locator path from discovery"),
            source=str(item.get("source") or "discovery"),
        )

    strategy = str(candidate.get("locator_strategy") or "")
    desktop_hint = _candidate_is_desktop(candidate) or _normalize_locator_strategy(strategy).lower() in {
        "accessibility id",
        "automation id",
        "uia",
    }
    add(
        strategy or "locator",
        candidate.get("best_locator"),
        verified=True,
        element_count=1,
        reason="Primary selected locator from AI Workflow discovery",
        source="primary",
    )
    add(
        "xpath",
        candidate.get("xpath"),
        verified=True,
        element_count=1,
        reason="UIA/XPath path saved on page object",
        source="page_repository",
    )
    add(
        "css",
        candidate.get("css_selector"),
        verified=True,
        element_count=1,
        reason="CSS/class path saved on page object",
        source="page_repository",
    )
    add(
        "accessibility id",
        (candidate.get("automation_id") or candidate.get("id_attr")) if desktop_hint else None,
        verified=desktop_hint,
        element_count=1 if desktop_hint else 0,
        score=1.0,
        reason="Automation ID saved on desktop page object",
        source="page_repository",
    )
    add(
        "automation id",
        (candidate.get("automation_id") or candidate.get("id_attr")) if desktop_hint else None,
        verified=desktop_hint,
        element_count=1 if desktop_hint else 0,
        score=1.0,
        reason="Automation ID alias saved on desktop page object",
        source="page_repository",
    )
    add(
        "name",
        candidate.get("name_text") or candidate.get("name_attr") or candidate.get("label") or candidate.get("name"),
        verified=bool(candidate.get("name_text") or candidate.get("name_attr")),
        element_count=1 if candidate.get("name_text") or candidate.get("name_attr") else 0,
        score=0.86,
        reason="Name/text fallback saved on desktop page object",
        source="page_repository",
    )
    add(
        "class name",
        candidate.get("class_name"),
        score=0.56,
        reason="Class-name fallback saved on desktop page object",
        source="page_repository",
    )

    primary_locator = _safe_locator_text(candidate.get("best_locator"), limit=240)
    id_value = _safe_locator_text(candidate.get("id_attr"), limit=100)
    if not id_value and primary_locator.startswith("#") and len(primary_locator) > 1:
        id_value = _safe_locator_text(primary_locator[1:], limit=100)
    name_value = _safe_locator_text(candidate.get("name_attr"), limit=100)
    placeholder = _safe_locator_text(candidate.get("placeholder"), limit=120)
    label = _safe_locator_text(
        candidate.get("label"),
        candidate.get("name_text"),
        candidate.get("name"),
        limit=120,
    )
    element_type = _safe_locator_text(candidate.get("element_type"), limit=60)
    web_tag = _web_tag_for_candidate(candidate)

    if desktop_hint:
        control_type = _safe_locator_text(
            candidate.get("class_name"),
            candidate.get("element_type"),
            "Control",
            limit=80,
        )
        automation_value = _safe_locator_text(candidate.get("automation_id"), candidate.get("id_attr"), limit=120)
        class_value = _safe_locator_text(candidate.get("class_name"), candidate.get("css_selector"), limit=120)
        if automation_value:
            add(
                "uia",
                f"{control_type}[AutomationId={_xpath_literal(automation_value)}]",
                verified=False,
                score=0.78,
                reason="UIA automation-id healing fallback",
                source="healing",
            )
        if class_value:
            add(
                "uia",
                f"{control_type}[ClassName={_xpath_literal(class_value)}]",
                verified=False,
                score=0.50,
                reason="UIA class-name healing fallback",
                source="healing",
            )
        if label:
            add(
                "uia",
                f"{control_type}[Name={_xpath_literal(label)}]",
                verified=False,
                score=0.72,
                reason="UIA name healing fallback",
                source="healing",
            )
            locator_context = candidate.get("locator_context") or {}
            if isinstance(locator_context, dict):
                nearby_values = locator_context.get("nearby_siblings") or []
                parent_values = locator_context.get("parent_chain") or []
                if isinstance(nearby_values, str) or not isinstance(nearby_values, (list, tuple, set)):
                    nearby_values = [nearby_values]
                if isinstance(parent_values, str) or not isinstance(parent_values, (list, tuple, set)):
                    parent_values = [parent_values]
                nearby = _safe_locator_text(*nearby_values, limit=80)
                parent = _safe_locator_text(*parent_values, limit=80)
                if nearby:
                    add(
                        "relative",
                        f"near({_xpath_literal(nearby)}) -> {control_type}[Name={_xpath_literal(label)}]",
                        verified=False,
                        score=0.58,
                        reason="Relative desktop healing fallback from nearby UI text",
                        source="healing",
                    )
                elif parent:
                    add(
                        "relative",
                        f"{parent} -> {control_type}[Name={_xpath_literal(label)}]",
                        verified=False,
                        score=0.52,
                        reason="Relative desktop healing fallback from parent chain",
                        source="healing",
                    )
        locator_context = candidate.get("locator_context") or {}
        parent = ""
        bounding_box = candidate.get("bounding_box") or {}
        if isinstance(locator_context, dict):
            parent_values = locator_context.get("parent_chain") or []
            if isinstance(parent_values, str) or not isinstance(parent_values, (list, tuple, set)):
                parent_values = [parent_values]
            parent = _safe_locator_text(*parent_values, limit=80)
            bounding_box = locator_context.get("bounding_box") or bounding_box
        xpath_value = _safe_locator_text(candidate.get("xpath"), limit=240)
        if parent and xpath_value:
            add(
                "relative",
                f"{parent} -> {xpath_value.rsplit('/', 1)[-1]}",
                verified=False,
                score=0.46,
                reason="Parent-scoped UIA path healing fallback",
                source="healing",
            )
        if len(paths) < _MIN_HEALING_LOCATOR_PATHS:
            if isinstance(bounding_box, dict) and {"x", "y"} <= set(bounding_box):
                add(
                    "visual",
                    f"x={bounding_box.get('x')},y={bounding_box.get('y')},w={bounding_box.get('width', '')},h={bounding_box.get('height', '')}",
                    verified=False,
                    score=0.34,
                    reason="Visual bounds fallback for desktop healing",
                    source="healing",
                )
    else:
        if id_value:
            add(
                "id",
                id_value,
                verified=False,
                score=0.84,
                reason="HTML id healing fallback",
                source="healing",
            )
            add(
                "css",
                _css_id_selector(id_value),
                verified=False,
                score=0.82,
                reason="ID-based CSS healing fallback",
                source="healing",
            )
            add(
                "xpath",
                f"//*[@id={_xpath_literal(id_value)}]",
                verified=False,
                score=0.80,
                reason="ID-based XPath healing fallback",
                source="healing",
            )
        if name_value:
            css_name = f"[name={_css_attr_literal(name_value)}]"
            if web_tag != "*":
                css_name = f"{web_tag}{css_name}"
            add(
                "css",
                css_name,
                verified=False,
                score=0.74,
                reason="Name-attribute CSS healing fallback",
                source="healing",
            )
            add(
                "xpath",
                f"//{web_tag}[@name={_xpath_literal(name_value)}]",
                verified=False,
                score=0.72,
                reason="Name-attribute XPath healing fallback",
                source="healing",
            )
        if placeholder:
            css_placeholder = f"[placeholder={_css_attr_literal(placeholder)}]"
            if web_tag in {"input", "textarea"}:
                css_placeholder = f"{web_tag}{css_placeholder}"
            add(
                "css",
                css_placeholder,
                verified=False,
                score=0.68,
                reason="Placeholder CSS healing fallback",
                source="healing",
            )
            add(
                "xpath",
                f"//*[@placeholder={_xpath_literal(placeholder)}]",
                verified=False,
                score=0.66,
                reason="Placeholder XPath healing fallback",
                source="healing",
            )
        if label:
            role = _web_role_for_candidate(candidate)
            if role:
                role_name = label.replace("\\", "\\\\").replace('"', '\\"')
                add(
                    "role",
                    f'role={role}[name="{role_name}"]',
                    verified=False,
                    score=0.70,
                    reason="Accessible role/name healing fallback",
                    source="healing",
                )
            if web_tag in {"input", "textarea", "select"}:
                add(
                    "xpath",
                    (
                        f"//label[contains(normalize-space(.), {_xpath_literal(label)})]"
                        "/following::*[self::input or self::textarea or self::select][1]"
                    ),
                    verified=False,
                    score=0.64,
                    reason="Label-relative form-field healing fallback",
                    source="healing",
                )
            add(
                "xpath",
                f"//*[@aria-label={_xpath_literal(label)} or normalize-space(.)={_xpath_literal(label)}]",
                verified=False,
                score=0.60,
                reason="Accessible text healing fallback",
                source="healing",
            )
            add(
                "text",
                label,
                verified=False,
                score=0.54,
                reason="Visible text healing fallback",
                source="healing",
            )

        if len(paths) < _MIN_HEALING_LOCATOR_PATHS and element_type:
            fallback_tag = web_tag if web_tag != "*" else element_type.lower().replace(" ", "-")
            add(
                "css",
                fallback_tag,
                verified=False,
                score=0.20,
                reason="Broad element-type fallback for sparse scrape metadata",
                source="healing",
            )
            add(
                "xpath",
                f"//{fallback_tag}",
                verified=False,
                score=0.18,
                reason="Broad element-type XPath fallback for sparse scrape metadata",
                source="healing",
            )

    paths.sort(
        key=lambda item: (
            0 if item.get("verified") and int(item.get("element_count") or 0) == 1 else 1,
            -float(item.get("score") or 0.0),
        )
    )
    return paths


def _candidate_from_discovered(element: DiscoveryElement, index: int) -> dict[str, Any]:
    strategy, locator, xpath, css_selector = _best_locator_payload(element)
    xpath = _best_xpath(element) or xpath
    test_data_hints = element.test_data_hints or {}
    discovery_metadata = test_data_hints.get("discovery_metadata")
    if not isinstance(discovery_metadata, dict):
        discovery_metadata = {}
    locator_context = test_data_hints.get("locator_context") or discovery_metadata.get("locator_context") or {}
    matched_step_intents = (
        test_data_hints.get("matched_step_intents")
        or discovery_metadata.get("matched_step_intents")
        or []
    )
    candidate = {
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
        "automation_id": discovery_metadata.get("automation_id") or element.id_attr or "",
        "name_text": discovery_metadata.get("name_text") or element.name_attr or "",
        "class_name": discovery_metadata.get("class_name") or "",
        "object_key": discovery_metadata.get("object_key") or test_data_hints.get("desktop_object_key") or "",
        "locator_context": locator_context,
        "discovery_metadata": discovery_metadata,
        "matched_step_intents": matched_step_intents,
        "best_step_intent_score": (
            test_data_hints.get("best_step_intent_score")
            or discovery_metadata.get("best_step_intent_score")
            or 0.0
        ),
        "input_type": element.input_type or "",
        "placeholder": element.placeholder or "",
        "label": element.label or "",
        "test_data_hints": test_data_hints,
        "locator_quality": _locator_quality(element),
        "confidence_score": element.confidence_score or 0.0,
        "alternative_locators": [
            payload for payload in (
                _locator_candidate_payload(locator)
                for locator in element.alternative_locators
            )
            if payload.get("locator")
        ],
        "tags": element.tags or [],
        "selected": False,
        "match_reason": None,
        "matched_steps": [],
    }
    candidate["locator_paths"] = _candidate_locator_paths(candidate)
    return candidate


def _compact_locator_alternatives(candidate: dict[str, Any]) -> list[dict[str, Any]]:
    alternatives: list[dict[str, Any]] = []
    for item in candidate.get("alternative_locators") or []:
        if not isinstance(item, dict) or not item.get("locator"):
            continue
        alternatives.append({
            "strategy": str(item.get("strategy") or ""),
            "locator": str(item.get("locator") or ""),
            "verified": bool(item.get("verified", False)),
            "element_count": int(item.get("element_count") or 0),
            "score": float(item.get("score") or 0.0),
            "reason": str(item.get("reason") or "")[:160],
        })
        if len(alternatives) >= _AI_LOCATOR_ALTERNATIVE_LIMIT:
            break
    return alternatives


def _locator_enhancement_prompt(candidates: list[dict[str, Any]]) -> str:
    payload = [
        {
            "candidate_id": candidate.get("candidate_id"),
            "name": candidate.get("name"),
            "element_type": candidate.get("element_type"),
            "description": candidate.get("description"),
            "label": candidate.get("label"),
            "placeholder": candidate.get("placeholder"),
            "id_attr": candidate.get("id_attr"),
            "name_attr": candidate.get("name_attr"),
            "automation_id": candidate.get("automation_id"),
            "class_name": candidate.get("class_name"),
            "object_key": candidate.get("object_key"),
            "locator_context": candidate.get("locator_context"),
            "best_locator": candidate.get("best_locator"),
            "xpath": candidate.get("xpath"),
            "css_selector": candidate.get("css_selector"),
            "alternative_locators": _compact_locator_alternatives(candidate),
        }
        for candidate in candidates[:_AI_LOCATOR_ENHANCEMENT_LIMIT]
    ]
    return (
        "You are improving automation locators during MCP/UI discovery.\n"
        "For each candidate, choose the most stable locator already present in "
        "alternative_locators, xpath, css_selector, or best_locator. Prefer verified "
        "unique locators. For web, prefer test ids, role/name locators, stable CSS, "
        "id/name attributes, and label-relative XPath before absolute XPath. For "
        "desktop, prefer accessibility id / Automation ID, then parent-scoped UIA "
        "paths, then stable name/text, then class name, OCR, or visual fallbacks. "
        "Use locator_context parent/nearby/child signals to preserve fallback chains. "
        "Return one item per candidate_id you can improve. recommended_locator should "
        "be copied exactly from the provided locator values unless it can be directly "
        "derived from the visible attributes.\n\n"
        f"Candidates JSON:\n{json.dumps(payload, ensure_ascii=True)}"
    )


def _same_locator(left: Any, right: Any) -> bool:
    return str(left or "").strip() == str(right or "").strip()


def _known_locator(candidate: dict[str, Any], strategy: str, locator: str) -> tuple[bool, bool]:
    normalized_strategy = strategy.lower()
    for item in candidate.get("alternative_locators") or []:
        if not isinstance(item, dict):
            continue
        if _same_locator(item.get("locator"), locator):
            item_strategy = str(item.get("strategy") or normalized_strategy).lower()
            verified = bool(item.get("verified")) and int(item.get("element_count") or 0) == 1
            return item_strategy == normalized_strategy or not normalized_strategy, verified
    for field in ("best_locator", "xpath", "css_selector"):
        if _same_locator(candidate.get(field), locator):
            return True, True
    return False, False


def _append_locator_if_missing(
    candidate: dict[str, Any],
    strategy: str,
    locator: str,
    *,
    verified: bool,
    reason: str,
) -> None:
    if not locator:
        return
    alternatives = candidate.setdefault("alternative_locators", [])
    for item in alternatives:
        if isinstance(item, dict) and _same_locator(item.get("locator"), locator):
            item.setdefault("strategy", strategy)
            item["reason"] = reason or item.get("reason") or "AI-ranked locator from scrape"
            return
    alternatives.append({
        "strategy": strategy or "css",
        "locator": locator,
        "verified": verified,
        "element_count": 1 if verified else 0,
        "score": 0.72 if verified else 0.38,
        "reason": reason or "AI-generated scrape-time locator candidate",
    })


def _promote_ai_locator(
    candidate: dict[str, Any],
    strategy: str,
    locator: str,
    locator_order: list[str],
    rationale: str,
    ai_model: str,
) -> dict[str, Any]:
    updated = {**candidate}
    updated["alternative_locators"] = [
        dict(item)
        for item in candidate.get("alternative_locators") or []
        if isinstance(item, dict) and item.get("locator")
    ]

    known, verified = _known_locator(updated, strategy, locator)
    if locator:
        _append_locator_if_missing(
            updated,
            strategy,
            locator,
            verified=verified,
            reason=f"AI scrape-time recommendation: {rationale}"[:220],
        )

    order = {name.lower(): index for index, name in enumerate(locator_order or [])}
    recommended = locator.strip()

    def sort_key(item: dict[str, Any]) -> tuple[int, int, int, float]:
        loc = str(item.get("locator") or "")
        item_strategy = str(item.get("strategy") or "").lower()
        is_recommended = 0 if recommended and loc == recommended else 1
        strategy_rank = order.get(item_strategy, 99)
        verified_rank = 0 if item.get("verified") and int(item.get("element_count") or 0) == 1 else 1
        absolute_rank = 1 if loc.startswith(("/html", "/body", "html/")) else 0
        return is_recommended, strategy_rank + absolute_rank, verified_rank, -float(item.get("score") or 0.0)

    updated["alternative_locators"].sort(key=sort_key)

    if known and verified and locator:
        tags = set(updated.get("tags") or [])
        is_desktop = any(str(tag).lower() == "desktop" for tag in tags)
        updated["locator_strategy"] = strategy or updated.get("locator_strategy") or "css"
        updated["best_locator"] = locator
        normalized_strategy = strategy.lower()
        if normalized_strategy == "xpath":
            updated["xpath"] = locator
        elif normalized_strategy in {"accessibility id", "automation id", "accessibility_id"}:
            updated["id_attr"] = locator
            updated["automation_id"] = locator
        elif normalized_strategy == "name" and is_desktop:
            updated["name_attr"] = locator
            updated["name_text"] = locator
        elif normalized_strategy in {"css", "testid", "id", "name"}:
            updated["css_selector"] = locator

    tags = set(updated.get("tags") or [])
    tags.add("ai-locator-ranked")
    updated["tags"] = sorted(tags)
    updated["ai_locator_model"] = ai_model
    updated["ai_locator_rationale"] = rationale
    updated["ai_locator_order"] = locator_order
    updated["locator_quality"] = _locator_quality(updated)
    updated["locator_paths"] = _candidate_locator_paths(updated)
    return updated


async def _enhance_scraped_candidates_with_ai(
    provider: AbstractAIProvider,
    ai_model: str,
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not candidates:
        return candidates
    try:
        result = await provider.generate(
            _locator_enhancement_prompt(candidates),
            LocatorEnhancementList,
        )
    except Exception as exc:
        logger.warning("AI locator enhancement skipped for %s: %s", ai_model, _format_provider_error(exc))
        return candidates

    enhancements = {item.candidate_id: item for item in result.items}
    if not enhancements:
        return candidates

    enhanced: list[dict[str, Any]] = []
    for candidate in candidates:
        item = enhancements.get(str(candidate.get("candidate_id") or ""))
        if item is None:
            enhanced.append(candidate)
            continue
        enhanced.append(_promote_ai_locator(
            candidate,
            item.recommended_strategy,
            item.recommended_locator,
            item.locator_order,
            item.rationale,
            ai_model,
        ))
    return enhanced


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
        "accessibility id": 0.16,
        "automation id": 0.16,
        "accessibility_id": 0.16,
        "role": 0.12,
        "aria-label": 0.10,
        "id": 0.10,
        "name": 0.07,
        "uia": 0.06,
        "css": 0.04,
        "xpath": 0.02,
        "class name": 0.01,
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
            candidate.get("automation_id", ""),
            candidate.get("name_text", ""),
            candidate.get("class_name", ""),
            candidate.get("object_key", ""),
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


_TEXT_ENTRY_ELEMENTS = {
    "input", "textarea", "textbox", "text box", "searchbox", "search box",
    "edit", "textedit", "text edit", "document",
}
_CHOICE_ELEMENTS = {
    "button", "splitbutton", "split button", "link", "hyperlink", "checkbox",
    "radio", "tab", "tabitem", "tab item", "toggle", "menuitem", "menu item",
    "treeitem", "tree item", "listitem", "list item", "dataitem", "data item",
}
_DROPDOWN_ELEMENTS = {
    "select", "option", "combobox", "combo box", "combo", "listbox", "list box",
    "dropdown", "drop down",
}
_LOW_VALUE_DESKTOP_ELEMENTS = {
    "window", "pane", "group", "separator", "statusbar", "status bar", "titlebar",
    "title bar", "scrollbar", "scroll bar",
}


def _action_element_bonus(action_type: str, element_type: str) -> float:
    action = action_type.lower()
    element = element_type.lower()
    if action in {"fill", "clear"}:
        if element in _TEXT_ENTRY_ELEMENTS:
            return 0.30
        if element in _CHOICE_ELEMENTS:
            return -0.45
        if element in _LOW_VALUE_DESKTOP_ELEMENTS:
            return -0.40
        if element:
            return -0.18
    if action == "upload":
        if element in {"input"}:
            return 0.22
        if element in {"button", "link"}:
            return 0.06
    if action in {"click", "submit"}:
        if element in _CHOICE_ELEMENTS:
            return 0.24
        if element in _LOW_VALUE_DESKTOP_ELEMENTS:
            return -0.16
    if action.startswith("assert") and element in {"label", "text", "element", "button", "link", "document"}:
        return 0.10
    if action == "select" and element in _DROPDOWN_ELEMENTS:
        return 0.20
    if action == "select" and element in _CHOICE_ELEMENTS:
        return 0.12
    return 0.0


def _is_selectable_choice_element(element_type: str) -> bool:
    return element_type.lower() in _CHOICE_ELEMENTS


def _is_dropdown_element(element_type: str) -> bool:
    return element_type.lower() in _DROPDOWN_ELEMENTS


def _has_action_phrase(text: str, phrases: tuple[str, ...]) -> bool:
    normalized = _re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    for phrase in phrases:
        normalized_phrase = _re.sub(r"[^a-z0-9]+", " ", phrase.lower()).strip()
        if " " in normalized_phrase:
            if normalized_phrase in normalized:
                return True
        elif _re.search(rf"\b{_re.escape(normalized_phrase)}\b", normalized):
            return True
    return False


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

    if _has_action_phrase(text, ("navigate", "open url", "go to", "launch page")):
        return "navigate"
    if _has_action_phrase(text, ("wait", "pause", "loading")):
        return "wait"
    if _has_action_phrase(text, ("scroll", "swipe")):
        return "scroll"
    if _has_action_phrase(text, ("upload", "attach file", "choose file")):
        return "upload"
    if _has_action_phrase(text, ("clear", "remove text", "empty field")):
        return "clear"
    if _has_action_phrase(text, ("enter", "input", "fill", "provide", "type in", "type into")):
        return "select" if _is_dropdown_element(element) else "fill"
    if _has_action_phrase(text, ("select", "choose", "dropdown", "pick option")):
        if _is_dropdown_element(element) or _has_action_phrase(text, ("dropdown", "pick option", "choose option", "select option")):
            return "select"
        if _is_selectable_choice_element(element):
            return "click"
        return "click"
    if _has_action_phrase(text, ("assert", "verify", "validate", "should see", "check that", "confirm")):
        return "assert_text" if (step.expected_result or " text " in f" {text} ") else "assert_visible"
    if _has_action_phrase(text, ("hover", "mouse over")):
        return "hover"
    if _has_action_phrase(text, ("submit",)):
        return "submit"
    if element in {"input", "textarea"} and step.input_value:
        return "fill"
    if _is_dropdown_element(element):
        return "select"
    if _is_selectable_choice_element(element):
        return "click"
    return (step.action_type or "click").lower()


def _step_target_hint(step: GeneratedTestStep) -> str:
    text = " ".join(
        part for part in (
            step.description,
            step.expected_result or "",
        ) if part
    )
    tokens = [
        token
        for token in _re.findall(r"[a-z0-9]+", text.lower())
        if len(token) > 1 and token not in _STEP_INTENT_STOPWORDS
    ]
    compact: list[str] = []
    for token in tokens:
        if token not in compact:
            compact.append(token)
        if len(compact) >= 8:
            break
    return " ".join(compact)


def _build_step_scrape_intents(test_cases: list[GeneratedTestCase]) -> list[dict[str, Any]]:
    intents: list[dict[str, Any]] = []
    for test_case in test_cases:
        for step in test_case.steps:
            action = _infer_workflow_action(step)
            if action in {"navigate", "wait", "scroll"}:
                continue
            intents.append({
                "test_case_title": test_case.title,
                "step_number": step.step_number,
                "action_type": action,
                "description": step.description,
                "target_hint": _step_target_hint(step),
                "input_value": step.input_value or "",
                "expected_result": step.expected_result or "",
                "assertion_type": step.assertion_type or "",
                "data_intent": _step_data_intent(step),
                "needs_element": True,
            })
    return intents


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
    matched_intents = (
        candidate.get("matched_step_intents")
        or (candidate.get("test_data_hints") or {}).get("matched_step_intents")
        or (candidate.get("discovery_metadata") or {}).get("matched_step_intents")
        or []
    )
    for intent in matched_intents:
        if not isinstance(intent, dict):
            continue
        same_step = int(intent.get("step_number") or 0) == int(step.step_number or 0)
        intent_text = " ".join(
            str(intent.get(field) or "")
            for field in ("description", "target_hint", "action_type")
        )
        if same_step or _token_overlap(step.description, intent_text) >= 0.25:
            score += min(float(intent.get("score") or 0.0), 1.0) * 0.24 + 0.10
            break
    return min(score, 1.0)


def _candidate_id(candidate: dict[str, Any]) -> str:
    return str(candidate.get("candidate_id") or "").strip()


def _actionable_case_steps(
    test_cases: list[GeneratedTestCase],
) -> list[tuple[GeneratedTestCase, GeneratedTestStep, str]]:
    steps: list[tuple[GeneratedTestCase, GeneratedTestStep, str]] = []
    for test_case in test_cases:
        for step in test_case.steps:
            inferred_action = _infer_workflow_action(step)
            if inferred_action in {"navigate", "wait", "scroll"}:
                continue
            steps.append((test_case, step, inferred_action))
    return steps


def _candidate_has_locator_signal(candidate: dict[str, Any]) -> bool:
    if any(candidate.get(field) for field in ("best_locator", "xpath", "css_selector", "id_attr", "automation_id", "name_attr", "name_text")):
        return True
    return any(
        isinstance(item, dict) and item.get("locator")
        for item in candidate.get("alternative_locators") or candidate.get("locator_paths") or []
    )


def _candidate_interaction_type(candidate: dict[str, Any]) -> str:
    element_type = str(candidate.get("element_type") or "").strip().lower()
    input_type = str(candidate.get("input_type") or "").strip().lower()
    return input_type or element_type


def _desktop_repository_score(candidate: dict[str, Any]) -> float:
    element = _candidate_interaction_type(candidate)
    score = min(float(candidate.get("locator_quality") or 0.0), 1.0) * 0.34
    score += min(float(candidate.get("confidence_score") or 0.0), 1.0) * 0.20
    if candidate.get("automation_id") or candidate.get("id_attr"):
        score += 0.26
    if candidate.get("xpath"):
        score += 0.12
    if candidate.get("name_text") or candidate.get("name_attr") or candidate.get("label") or candidate.get("name"):
        score += 0.12
    if candidate.get("class_name") or candidate.get("css_selector"):
        score += 0.04
    if element in _TEXT_ENTRY_ELEMENTS or element in _CHOICE_ELEMENTS or element in _DROPDOWN_ELEMENTS:
        score += 0.22
    elif element in {"text", "label", "document"}:
        score += 0.06
    elif element in _LOW_VALUE_DESKTOP_ELEMENTS:
        score -= 0.28
    if candidate.get("locator_context"):
        score += 0.04
    if not _candidate_has_locator_signal(candidate):
        score -= 0.50
    return max(0.0, min(score, 1.0))


def _candidate_is_repository_worthy(candidate: dict[str, Any]) -> bool:
    if not _candidate_has_locator_signal(candidate):
        return False
    if not _candidate_is_desktop(candidate):
        return True
    return _desktop_repository_score(candidate) >= 0.42


def _rank_candidates_for_step(
    step: GeneratedTestStep,
    candidates: list[dict[str, Any]],
    *,
    selected_ids: set[str] | None = None,
) -> list[tuple[dict[str, Any], float]]:
    selected_ids = selected_ids or set()
    ranked: list[tuple[dict[str, Any], float]] = []
    for candidate in candidates:
        if not _candidate_is_repository_worthy(candidate):
            continue
        score = _score_candidate(step, candidate)
        if _candidate_is_desktop(candidate):
            score += _desktop_repository_score(candidate) * 0.16
        if _candidate_id(candidate) in selected_ids:
            score -= 0.08
        ranked.append((candidate, max(0.0, min(score, 1.0))))
    ranked.sort(key=lambda item: item[1], reverse=True)
    return ranked


def _mark_candidate_selected(
    selected_by_id: dict[str, dict[str, Any]],
    candidate: dict[str, Any],
    *,
    test_case_title: str,
    step_number: int,
    action: str,
    score: float,
    reason: str | None = None,
) -> None:
    candidate_id = _candidate_id(candidate)
    if not candidate_id:
        return
    existing = selected_by_id.setdefault(candidate_id, {**candidate, "matched_steps": []})
    existing["selected"] = True
    existing["match_reason"] = reason or f"Matched {action} step intent with {score:.0%} confidence"
    matched = f"{test_case_title}: step {step_number}"
    if matched not in existing.setdefault("matched_steps", []):
        existing["matched_steps"].append(matched)


def _add_desktop_repository_prefetch(
    selected_by_id: dict[str, dict[str, Any]],
    candidates: list[dict[str, Any]],
    *,
    actionable_step_count: int,
) -> None:
    if actionable_step_count <= 0:
        return
    desktop_candidates = [
        candidate for candidate in candidates
        if _candidate_is_desktop(candidate) and _candidate_is_repository_worthy(candidate)
    ]
    if not desktop_candidates:
        return
    desired = min(
        len(desktop_candidates),
        _DESKTOP_REPOSITORY_PREFETCH_MAX,
        max(_DESKTOP_REPOSITORY_PREFETCH_MIN, actionable_step_count * 2, len(selected_by_id)),
    )
    ranked = sorted(desktop_candidates, key=_desktop_repository_score, reverse=True)
    for candidate in ranked:
        if len(selected_by_id) >= desired:
            break
        candidate_id = _candidate_id(candidate)
        if not candidate_id or candidate_id in selected_by_id:
            continue
        score = _desktop_repository_score(candidate)
        if score < 0.42:
            continue
        selected_by_id[candidate_id] = {
            **candidate,
            "selected": True,
            "match_reason": f"Desktop MCP prefetch kept stable UID/UIA object with {score:.0%} repository score",
            "matched_steps": ["Desktop MCP repository prefetch"],
            "tags": sorted(set((candidate.get("tags") or []) + ["desktop-prefetch"])),
        }


def _select_candidates_for_steps(
    test_cases: list[GeneratedTestCase],
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    selected_by_id: dict[str, dict[str, Any]] = {}
    actionable_steps = _actionable_case_steps(test_cases)
    for test_case, step, inferred_action in actionable_steps:
        selected_ids = set(selected_by_id)
        ranked = _rank_candidates_for_step(step, candidates, selected_ids=selected_ids)
        if not ranked:
            continue
        threshold = 0.26 if any(_candidate_is_desktop(candidate) for candidate in candidates) else 0.34
        best, best_score = ranked[0]
        unused = next(
            (
                (candidate, score)
                for candidate, score in ranked
                if _candidate_id(candidate) not in selected_ids and score >= threshold
            ),
            None,
        )
        chosen, chosen_score = unused or (best, best_score)
        if chosen_score >= threshold:
            _mark_candidate_selected(
                selected_by_id,
                chosen,
                test_case_title=test_case.title,
                step_number=step.step_number,
                action=inferred_action,
                score=chosen_score,
            )
            if unused and _candidate_id(best) in selected_by_id and best is not chosen:
                _mark_candidate_selected(
                    selected_by_id,
                    best,
                    test_case_title=test_case.title,
                    step_number=step.step_number,
                    action=inferred_action,
                    score=best_score,
                    reason=f"Also matched {inferred_action} step as strongest existing candidate",
                )

    _add_desktop_repository_prefetch(
        selected_by_id,
        candidates,
        actionable_step_count=len(actionable_steps),
    )
    return list(selected_by_id.values())


def _candidate_quality_for_targeting(candidate: dict[str, Any]) -> float:
    if _candidate_is_desktop(candidate):
        return _desktop_repository_score(candidate)
    return max(
        min(float(candidate.get("locator_quality") or 0.0), 1.0),
        min(float(candidate.get("confidence_score") or 0.0), 1.0),
    )


def _candidate_has_step_semantic_signal(step: GeneratedTestStep, candidate: dict[str, Any]) -> bool:
    step_text = " ".join(
        part for part in (
            step.description,
            step.action_type,
            step.input_value or "",
            step.expected_result or "",
        ) if part
    )
    candidate_text = _candidate_text(candidate)
    name = str(candidate.get("name") or candidate.get("name_text") or candidate.get("name_attr") or "")
    if name and name.lower() in step_text.lower():
        return True
    if _text_similarity(step.description, name) >= 0.34:
        return True
    if _token_overlap(step_text, candidate_text) >= 0.16:
        return True
    return _data_type_bonus(step, candidate) > 0


def _candidate_explicit_step_intent_score(
    candidate: dict[str, Any],
    test_case: GeneratedTestCase,
    step: GeneratedTestStep,
) -> float:
    matched_intents = (
        candidate.get("matched_step_intents")
        or (candidate.get("test_data_hints") or {}).get("matched_step_intents")
        or (candidate.get("discovery_metadata") or {}).get("matched_step_intents")
        or []
    )
    best = 0.0
    test_case_title = str(test_case.title or "").strip().lower()
    for intent in matched_intents:
        if not isinstance(intent, dict):
            continue
        try:
            intent_step = int(intent.get("step_number") or 0)
        except (TypeError, ValueError):
            intent_step = 0
        intent_case = str(intent.get("test_case_title") or "").strip().lower()
        if intent_step != int(step.step_number or 0):
            continue
        if intent_case and intent_case != test_case_title:
            continue
        try:
            score = float(intent.get("score") or 0.0)
        except (TypeError, ValueError):
            score = 0.0
        best = max(best, score or 0.5)
    return min(best, 1.0)


def _add_targeted_candidate(
    targeted_by_id: dict[str, dict[str, Any]],
    candidate: dict[str, Any],
    *,
    test_case: GeneratedTestCase,
    step: GeneratedTestStep,
    score: float,
    reason: str,
) -> bool:
    candidate_id = _candidate_id(candidate)
    if not candidate_id:
        return False
    existing = targeted_by_id.setdefault(candidate_id, {**candidate})
    existing_score = float(existing.get("targeting_score") or 0.0)
    existing["targeting_score"] = round(max(existing_score, score), 4)
    targeted_step = f"{test_case.title}: step {step.step_number}"
    if targeted_step not in existing.setdefault("targeted_steps", []):
        existing["targeted_steps"].append(targeted_step)
    if not existing.get("match_reason"):
        existing["match_reason"] = reason
    tags = set(existing.get("tags") or [])
    tags.add("step-targeted-scrape")
    if "intent" in reason.lower():
        tags.add("step-intent-match")
    existing["tags"] = sorted(tags)
    hints = dict(existing.get("test_data_hints") or {})
    hints["scrape_scope"] = "generated_step_intents"
    hints["targeted_steps"] = existing["targeted_steps"]
    existing["test_data_hints"] = hints
    return True


def _target_scraped_candidates_for_steps(
    test_cases: list[GeneratedTestCase],
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not candidates:
        return candidates
    actionable_steps = _actionable_case_steps(test_cases)
    if not actionable_steps:
        return []

    has_desktop_candidates = any(_candidate_is_desktop(candidate) for candidate in candidates)
    threshold = 0.24 if has_desktop_candidates else 0.30
    fallback_threshold = 0.18 if has_desktop_candidates else 0.24
    targeted_by_id: dict[str, dict[str, Any]] = {}

    for test_case, step, inferred_action in actionable_steps:
        step_added_ids: set[str] = set()
        explicit_matches: list[tuple[dict[str, Any], float]] = []
        for candidate in candidates:
            explicit_score = _candidate_explicit_step_intent_score(candidate, test_case, step)
            if explicit_score <= 0:
                continue
            score = max(explicit_score, _score_candidate(step, candidate))
            explicit_matches.append((candidate, min(score, 1.0)))
        explicit_matches.sort(key=lambda item: item[1], reverse=True)
        for candidate, score in explicit_matches[:_TARGETED_CANDIDATE_MAX_PER_STEP]:
            if _add_targeted_candidate(
                targeted_by_id,
                candidate,
                test_case=test_case,
                step=step,
                score=score,
                reason=f"Explicit generated step-intent match for {inferred_action} step",
            ):
                step_added_ids.add(_candidate_id(candidate))

        ranked = _rank_candidates_for_step(step, candidates)
        for candidate, score in ranked:
            if len(step_added_ids) >= _TARGETED_CANDIDATE_MAX_PER_STEP:
                break
            candidate_id = _candidate_id(candidate)
            if not candidate_id or candidate_id in step_added_ids or score < threshold:
                continue
            if not _candidate_has_step_semantic_signal(step, candidate):
                continue
            if _add_targeted_candidate(
                targeted_by_id,
                candidate,
                test_case=test_case,
                step=step,
                score=score,
                reason=f"Ranked against generated {inferred_action} step before MCP save",
            ):
                step_added_ids.add(candidate_id)

        if step_added_ids:
            continue
        for candidate, score in ranked[:_TARGETED_CANDIDATE_FALLBACK_PER_STEP]:
            if score < fallback_threshold:
                continue
            _add_targeted_candidate(
                targeted_by_id,
                candidate,
                test_case=test_case,
                step=step,
                score=score,
                reason=f"Fallback locator kept for generated {inferred_action} step",
            )

    if not targeted_by_id:
        fallback_limit = min(
            len(candidates),
            _TARGETED_CANDIDATE_FALLBACK_MAX,
            max(_TARGETED_CANDIDATE_FALLBACK_PER_STEP * len(actionable_steps), 1),
        )
        fallback_step = actionable_steps[0]
        ranked_fallbacks = sorted(
            candidates,
            key=_candidate_quality_for_targeting,
            reverse=True,
        )[:fallback_limit]
        for candidate in ranked_fallbacks:
            _add_targeted_candidate(
                targeted_by_id,
                candidate,
                test_case=fallback_step[0],
                step=fallback_step[1],
                score=_candidate_quality_for_targeting(candidate),
                reason="Bounded high-quality fallback because no generated step matched directly",
            )

    original_order = {
        _candidate_id(candidate): index
        for index, candidate in enumerate(candidates)
        if _candidate_id(candidate)
    }
    targeted = list(targeted_by_id.values())
    targeted.sort(
        key=lambda candidate: (
            -float(candidate.get("targeting_score") or 0.0),
            original_order.get(_candidate_id(candidate), len(candidates)),
        )
    )
    global_limit = min(
        _TARGETED_CANDIDATE_GLOBAL_MAX,
        max(_TARGETED_CANDIDATE_MAX_PER_STEP * len(actionable_steps), _TARGETED_CANDIDATE_FALLBACK_MAX),
    )
    return targeted[:global_limit]


def _compact_binding_step(test_case: GeneratedTestCase, step: GeneratedTestStep) -> dict[str, Any]:
    return {
        "test_case_title": test_case.title,
        "test_case_description": test_case.description,
        "step_number": step.step_number,
        "description": step.description,
        "current_action_type": step.action_type,
        "input_value": step.input_value or "",
        "expected_result": step.expected_result or "",
        "assertion_type": step.assertion_type or "",
    }


def _compact_binding_element(candidate: dict[str, Any]) -> dict[str, Any]:
    hints = candidate.get("test_data_hints") or {}
    return {
        "candidate_id": candidate.get("candidate_id"),
        "name": candidate.get("name"),
        "element_type": candidate.get("element_type"),
        "description": candidate.get("description"),
        "label": candidate.get("label"),
        "placeholder": candidate.get("placeholder"),
        "input_type": candidate.get("input_type") or hints.get("input_type") or "",
        "data_type": hints.get("data_type") or "",
        "sample_value": hints.get("sample_value") or "",
        "object_key": candidate.get("object_key"),
        "automation_id": candidate.get("automation_id") or candidate.get("id_attr"),
        "name_text": candidate.get("name_text") or candidate.get("name_attr"),
        "class_name": candidate.get("class_name"),
        "tags": candidate.get("tags") or [],
        "locator_strategy": candidate.get("locator_strategy"),
        "best_locator": candidate.get("best_locator"),
        "locator_context": candidate.get("locator_context") or {},
        "matched_step_intents": candidate.get("matched_step_intents") or hints.get("matched_step_intents") or [],
        "best_step_intent_score": candidate.get("best_step_intent_score") or hints.get("best_step_intent_score") or 0.0,
    }


def _step_binding_decision_prompt(
    *,
    test_cases: list[GeneratedTestCase],
    candidates: list[dict[str, Any]],
    platform: str,
    page_name: str,
) -> str:
    steps_payload = [
        _compact_binding_step(test_case, step)
        for test_case in test_cases
        for step in test_case.steps
    ]
    elements_payload = [
        _compact_binding_element(candidate)
        for candidate in candidates[:_AI_LOCATOR_ENHANCEMENT_LIMIT]
    ]
    return (
        "You are configuring executable QA test steps from generated test case "
        "descriptions, generated step descriptions, and discovered UI elements.\n"
        "For every step, choose the correct candidate_id, final action_type, and a "
        "suitable input_value or expected_result when needed.\n\n"
        f"Platform: {platform}\n"
        f"Page or screen: {page_name}\n\n"
        "Rules:\n"
        "- Use navigate/launch steps without a candidate_id.\n"
        "- Use fill only for text entry controls, edit boxes, textbox/searchbox fields, or equivalent desktop Edit controls.\n"
        "- Use select only for dropdown/listbox/combobox controls that require an option value.\n"
        "- Use click for buttons, links, tabs, toggles, radio buttons, checkboxes, menu items, and clickable choices.\n"
        "- Use assert_visible/assert_text/assert_enabled for verification steps and include expected_result for assert_text.\n"
        "- For fill/select, provide a realistic input_value if the step does not already have one. Prefer element sample_value when available.\n"
        "- Read test_case_description together with the step description before selecting a candidate.\n"
        "- Prefer exact labels/names/object keys, then nearby parent/child context, then control type compatibility.\n"
        "- If no discovered element matches, candidate_id must be null and needs_review must be true.\n"
        "- Return one decision per input step. candidate_id must be copied exactly from the provided elements.\n\n"
        f"Steps JSON:\n{json.dumps(steps_payload, ensure_ascii=True)}\n\n"
        f"Elements JSON:\n{json.dumps(elements_payload, ensure_ascii=True)}"
    )


async def _ai_step_binding_decisions(
    provider: AbstractAIProvider,
    ai_model: str,
    *,
    test_cases: list[GeneratedTestCase],
    candidates: list[dict[str, Any]],
    platform: str,
    page_name: str,
) -> list[StepElementBindingDecision]:
    if not candidates:
        return []
    try:
        result = await asyncio.wait_for(
            provider.generate(
                _step_binding_decision_prompt(
                    test_cases=test_cases,
                    candidates=candidates,
                    platform=platform,
                    page_name=page_name,
                ),
                StepElementBindingDecisionList,
            ),
            timeout=_AI_PROVIDER_CALL_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "AI step binding timed out for %s after %ss; falling back to heuristic matching",
            ai_model, _AI_PROVIDER_CALL_TIMEOUT_SECONDS,
        )
        return []
    except Exception as exc:
        logger.warning("AI step binding skipped for %s: %s", ai_model, _format_provider_error(exc))
        return []
    return list(result.items or [])


def _decision_key(test_case_title: str, step_number: int) -> tuple[str, int]:
    return str(test_case_title or "").strip().lower(), int(step_number or 0)


def _decisions_by_step(
    decisions: list[StepElementBindingDecision],
) -> dict[tuple[str, int], StepElementBindingDecision]:
    result: dict[tuple[str, int], StepElementBindingDecision] = {}
    for decision in decisions:
        if decision.step_number <= 0:
            continue
        result[_decision_key(decision.test_case_title, decision.step_number)] = decision
    return result


def _select_candidates_from_binding_decisions(
    test_cases: list[GeneratedTestCase],
    candidates: list[dict[str, Any]],
    decisions: list[StepElementBindingDecision],
) -> list[dict[str, Any]]:
    selected_by_id = {
        str(candidate.get("candidate_id")): dict(candidate)
        for candidate in _select_candidates_for_steps(test_cases, candidates)
        if candidate.get("candidate_id")
    }
    candidates_by_id = {
        str(candidate.get("candidate_id")): candidate
        for candidate in candidates
        if candidate.get("candidate_id")
    }
    for decision in decisions:
        candidate_id = str(decision.candidate_id or "")
        if not candidate_id or candidate_id not in candidates_by_id or decision.needs_review:
            continue
        candidate = selected_by_id.setdefault(candidate_id, {**candidates_by_id[candidate_id], "matched_steps": []})
        candidate["selected"] = True
        candidate["match_reason"] = decision.reason or f"AI selected for step {decision.step_number}"
        matched = f"{decision.test_case_title}: step {decision.step_number}"
        if matched not in candidate.setdefault("matched_steps", []):
            candidate["matched_steps"].append(matched)
    return list(selected_by_id.values())


def _fallback_input_value_for_step(
    step: GeneratedTestStep,
    element: dict[str, Any] | None,
    action_type: str,
) -> str:
    if step.input_value:
        return step.input_value
    hints = (element or {}).get("test_data_hints") or {}
    sample = str(hints.get("sample_value") or "").strip()
    if sample:
        return sample
    text = _candidate_text(element or {}).lower() + " " + step.description.lower()
    if action_type == "fill":
        if "email" in text:
            return "qa.user@example.com"
        if "password" in text:
            return "Nexus@12345"
        if "date" in text or "dob" in text or "birth" in text:
            return "2000-02-10"
        if "phone" in text or "mobile" in text:
            return "9876543210"
        if any(token in text for token in ("amount", "quantity", "age", "number")):
            return "10"
        return "test data"
    if action_type == "select":
        return "Default"
    return ""


def _coerce_ai_action(
    action_type: str,
    step: GeneratedTestStep,
    element: dict[str, Any] | None,
) -> str:
    allowed = {
        "navigate", "click", "fill", "select", "assert_visible", "assert_text",
        "assert_enabled", "hover", "wait", "scroll", "clear", "upload", "submit",
    }
    action = str(action_type or "").strip().lower()
    if action not in allowed:
        action = _infer_workflow_action(step, str((element or {}).get("element_type") or ""))
    element_type = str((element or {}).get("element_type") or "").lower()
    if action == "select" and _is_selectable_choice_element(element_type):
        return "click"
    if action == "fill" and element_type and element_type not in _TEXT_ENTRY_ELEMENTS:
        if _is_dropdown_element(element_type):
            return "select"
        if _is_selectable_choice_element(element_type):
            return "click"
    if action == "click" and element_type in _TEXT_ENTRY_ELEMENTS and (step.input_value or _step_data_intent(step)):
        return "fill"
    return action


def _best_saved_element_for_step(
    step: GeneratedTestStep,
    saved_elements: list[dict[str, Any]],
    test_case: GeneratedTestCase | None = None,
) -> tuple[dict[str, Any] | None, float]:
    best: dict[str, Any] | None = None
    best_score = 0.0
    for element in saved_elements:
        score = _score_candidate(step, element)
        if test_case and _saved_element_targets_step(element, test_case, step):
            score = max(score, 0.72)
        if score > best_score:
            best = element
            best_score = score
    return best, best_score


_ELEMENT_MATCH_MIN_SCORE = 0.34

_DEFAULT_REVIEW_REASON = "Step is not bound to a page element"


def _binding_review_metadata(step: GeneratedTestStep) -> dict[str, Any]:
    """Review flags to persist on a test step's test_data.

    TestStep has no needs_review column, so the binding verdict rides along in
    test_data. Without it the flag is lost at save time and an unbound step looks
    identical to a correctly bound one when the step is later executed.
    """
    needs_review = bool(getattr(step, "needs_review", False))
    reason = str(getattr(step, "review_reason", "") or "")
    return {
        "needs_review": needs_review,
        "review_reason": (reason or _DEFAULT_REVIEW_REASON) if needs_review else "",
    }

_MATCH_STOPWORDS = frozenset({
    "a", "an", "and", "as", "at", "by", "for", "from", "if", "in", "into", "is", "it", "not",
    "of", "on", "or", "the", "then", "that", "this", "to", "with", "when", "where", "which",
    # generic UI nouns that carry no identifying signal on their own
    "box", "button", "checkbox", "control", "controls", "element", "field", "form", "icon",
    "input", "item", "label", "link", "list", "menu", "option", "options", "page", "panel",
    "screen", "section", "select", "tab", "text", "value", "window",
    # generic step verbs
    "check", "choose", "click", "confirm", "enter", "fill", "open", "set", "type", "validate",
    "verify", "view", "wait",
})


def _match_tokens(text: str) -> set[str]:
    """Distinctive lowercase word tokens, punctuation-split, stopwords removed."""
    return {
        token
        for token in _re.split(r"[^a-z0-9]+", str(text or "").lower())
        if token and token not in _MATCH_STOPWORDS
    }


def _is_acceptable_element_match(
    step: GeneratedTestStep,
    element: dict[str, Any] | None,
    score: float,
    *,
    explicitly_targeted: bool = False,
) -> bool:
    """Whether a scored candidate is a real match for the step, or scoring noise.

    Similarity scoring alone cannot separate the two: on a page whose repository is
    dominated by unrelated links, an unrelated candidate can outscore a correct one.
    A genuine match additionally shares at least one distinctive word with the
    element's own name, so unrelated elements are rejected and the step is left
    unbound for review instead of silently pointing at the wrong node.
    """
    if not element:
        return False
    if score < _ELEMENT_MATCH_MIN_SCORE:
        return False
    if explicitly_targeted:
        return True
    name_tokens = _match_tokens(element.get("name") or element.get("name_attr") or "")
    if not name_tokens:
        return False
    step_tokens = _match_tokens(" ".join(part for part in (
        step.description,
        step.action_type,
        step.input_value or "",
        step.expected_result or "",
    ) if part))
    return bool(name_tokens & step_tokens)


def _saved_element_targets_step(
    element: dict[str, Any],
    test_case: GeneratedTestCase,
    step: GeneratedTestStep,
) -> bool:
    expected = _decision_key(test_case.title, step.step_number)
    metadata = element.get("discovery_metadata") if isinstance(element.get("discovery_metadata"), dict) else {}
    hints = element.get("test_data_hints") if isinstance(element.get("test_data_hints"), dict) else {}
    metadata_hints = metadata.get("test_data_hints") if isinstance(metadata.get("test_data_hints"), dict) else {}
    refs = [
        *(element.get("matched_steps") or []),
        *(metadata.get("matched_steps") or []),
        *(hints.get("targeted_steps") or []),
        *(metadata_hints.get("targeted_steps") or []),
        *(element.get("matched_step_intents") or []),
        *(metadata.get("matched_step_intents") or []),
        *(hints.get("matched_step_intents") or []),
        *(metadata_hints.get("matched_step_intents") or []),
    ]
    for ref in refs:
        if isinstance(ref, str):
            ref_text = ref.strip().lower()
            if test_case.title.strip().lower() in ref_text and f"step {int(step.step_number or 0)}" in ref_text:
                return True
        elif isinstance(ref, dict):
            try:
                ref_step = int(ref.get("step_number") or 0)
            except (TypeError, ValueError):
                ref_step = 0
            ref_case = str(ref.get("test_case_title") or "").strip().lower()
            if (ref_case, ref_step) == expected:
                return True
    return False

def _bind_cases_with_ai_decisions(
    test_cases: list[GeneratedTestCase],
    page_id: str,
    saved_elements: list[dict[str, Any]],
    decisions: list[StepElementBindingDecision],
) -> list[GeneratedTestCase]:
    decisions_lookup = _decisions_by_step(decisions)
    saved_by_candidate_id = {
        str(element.get("candidate_id")): element
        for element in saved_elements
        if element.get("candidate_id")
    }

    bound_cases: list[GeneratedTestCase] = []
    for test_case in test_cases:
        bound_steps = []
        for step in test_case.steps:
            decision = decisions_lookup.get(_decision_key(test_case.title, step.step_number))
            element = (
                saved_by_candidate_id.get(str(decision.candidate_id or ""))
                if decision and decision.candidate_id
                else None
            )

            if decision and element:
                action = _coerce_ai_action(decision.action_type, step, element)
                input_value = decision.input_value or _fallback_input_value_for_step(step, element, action)
                expected_result = decision.expected_result or step.expected_result
                has_saved_element = bool(element.get("element_id"))
                bound_steps.append(step.model_copy(update={
                    "page_id": page_id,
                    "page_element_id": element.get("element_id"),
                    "action_type": action,
                    "input_value": input_value or step.input_value,
                    "assertion_type": decision.assertion_type or step.assertion_type,
                    "expected_result": expected_result,
                    "needs_review": bool(decision.needs_review and not has_saved_element),
                    "review_reason": decision.reason if decision.needs_review and not has_saved_element else None,
                    "confidence": max(0.0, min(float(decision.confidence or 0.0), 1.0)),
                }))
                continue

            inferred_action = _infer_workflow_action(step)
            if inferred_action in {"navigate", "wait", "scroll"}:
                update = {
                    "page_id": page_id,
                    "action_type": inferred_action,
                    "needs_review": False,
                    "review_reason": None,
                }
                if decision:
                    update.update({
                        "input_value": decision.input_value or step.input_value,
                        "assertion_type": decision.assertion_type or step.assertion_type,
                        "expected_result": decision.expected_result or step.expected_result,
                        "confidence": max(0.0, min(float(decision.confidence or step.confidence or 0.0), 1.0)),
                    })
                bound_steps.append(step.model_copy(update=update))
                continue

            if decision and decision.needs_review:
                fallback, fallback_score = _best_saved_element_for_step(step, saved_elements, test_case)
                if _is_acceptable_element_match(
                    step, fallback, fallback_score,
                    explicitly_targeted=bool(fallback and _saved_element_targets_step(fallback, test_case, step)),
                ):
                    final_action = _coerce_ai_action(decision.action_type or inferred_action, step, fallback)
                    input_value = decision.input_value or _fallback_input_value_for_step(step, fallback, final_action)
                    bound_steps.append(step.model_copy(update={
                        "page_id": page_id,
                        "page_element_id": fallback.get("element_id"),
                        "action_type": final_action,
                        "input_value": input_value or step.input_value,
                        "assertion_type": decision.assertion_type or step.assertion_type,
                        "expected_result": decision.expected_result or step.expected_result,
                        "needs_review": False,
                        "review_reason": None,
                        "confidence": max(
                            fallback_score,
                            max(0.0, min(float(decision.confidence or 0.0), 1.0)),
                        ),
                    }))
                    continue
                bound_steps.append(step.model_copy(update={
                    "page_id": page_id,
                    "action_type": _coerce_ai_action(decision.action_type or inferred_action, step, None),
                    "input_value": decision.input_value or step.input_value,
                    "assertion_type": decision.assertion_type or step.assertion_type,
                    "expected_result": decision.expected_result or step.expected_result,
                    "needs_review": True,
                    "review_reason": decision.reason or "AI could not match this step to a saved page element",
                    "confidence": max(0.0, min(float(decision.confidence or 0.0), 1.0)),
                }))
                continue

            fallback, fallback_score = _best_saved_element_for_step(step, saved_elements, test_case)
            if _is_acceptable_element_match(
                step, fallback, fallback_score,
                explicitly_targeted=bool(fallback and _saved_element_targets_step(fallback, test_case, step)),
            ):
                final_action = _infer_workflow_action(step, str(fallback.get("element_type") or ""))
                input_value = _fallback_input_value_for_step(step, fallback, final_action)
                bound_steps.append(step.model_copy(update={
                    "page_id": page_id,
                    "page_element_id": fallback.get("element_id"),
                    "action_type": final_action,
                    "input_value": input_value or step.input_value,
                    "confidence": fallback_score,
                    "needs_review": False,
                    "review_reason": None,
                }))
            else:
                bound_steps.append(step.model_copy(update={
                    "page_id": page_id,
                    "action_type": inferred_action,
                    "needs_review": True,
                    "review_reason": "No saved page element matched this step",
                    "confidence": fallback_score,
                }))
        bound_cases.append(test_case.model_copy(update={"steps": bound_steps}))
    return bound_cases

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

        alt_locators = _candidate_locator_paths(candidate)
        candidate["locator_paths"] = alt_locators
        candidate["alternative_locators"] = alt_locators
        if candidate.get("xpath") and not any(
            locator.get("strategy") == "xpath" and locator.get("locator") == candidate["xpath"]
            for locator in alt_locators
        ):
            alt_locators.append({
                "strategy": "xpath",
                "locator": candidate["xpath"],
                "verified": True,
                "element_count": 1,
                "score": candidate.get("confidence_score", 0.0),
                "reason": "Selected from post-test-step scrape",
            })
        if candidate.get("css_selector") and not any(
            locator.get("strategy") == "css" and locator.get("locator") == candidate["css_selector"]
            for locator in alt_locators
        ):
            alt_locators.append({
                "strategy": "css",
                "locator": candidate["css_selector"],
                "verified": True,
                "element_count": 1,
                "score": candidate.get("confidence_score", 0.0),
                "reason": "Selected from post-test-step scrape",
            })

        tags = sorted(set((candidate.get("tags") or []) + ["ai-selected", "workflow-required"]))
        discovery_metadata = _candidate_discovery_metadata(
            workflow_id=workflow_id,
            candidate=candidate,
        )
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
            element.discovery_metadata = discovery_metadata
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
                discovery_metadata=discovery_metadata,
            )
            db.add(element)
            await db.flush()

        saved.append(_saved_candidate_from_page_element(candidate, element))

    await db.flush()
    return saved


def _saved_candidate_from_page_element(
    candidate: dict[str, Any],
    element: PageElementModel,
) -> dict[str, Any]:
    metadata = element.discovery_metadata or {}
    locator_paths = [
        dict(locator)
        for locator in (element.alternative_locators or [])
        if isinstance(locator, dict) and locator.get("locator")
    ]
    automation_id = str(metadata.get("automation_id") or element.id_attr or "")
    name_text = str(metadata.get("name_text") or element.name_attr or "")
    class_name = str(metadata.get("class_name") or element.css_selector or "")
    return {
        **candidate,
        "element_id": element.id,
        "name": element.name,
        "element_type": element.element_type,
        "description": element.description,
        "locator_strategy": element.locator_strategy,
        "best_locator": (
            str(metadata.get("primary_locator") or "")
            or automation_id
            or element.xpath
            or element.css_selector
            or name_text
        ),
        "xpath": element.xpath,
        "css_selector": element.css_selector,
        "id_attr": element.id_attr,
        "name_attr": element.name_attr,
        "automation_id": automation_id,
        "name_text": name_text,
        "class_name": class_name,
        "object_key": str(metadata.get("object_key") or candidate.get("object_key") or ""),
        "locator_context": metadata.get("locator_context") or candidate.get("locator_context") or {},
        "discovery_metadata": metadata,
        "confidence_score": element.confidence_score or candidate.get("confidence_score") or 0.0,
        "alternative_locators": locator_paths,
        "locator_paths": locator_paths,
        "tags": element.tags or candidate.get("tags") or [],
    }


def _page_element_to_saved_candidate(element: PageElementModel) -> dict[str, Any]:
    metadata = element.discovery_metadata if isinstance(element.discovery_metadata, dict) else {}
    locator_paths = [
        dict(locator)
        for locator in (element.alternative_locators or [])
        if isinstance(locator, dict) and locator.get("locator")
    ]
    test_data_hints = metadata.get("test_data_hints") if isinstance(metadata.get("test_data_hints"), dict) else {}
    automation_id = str(metadata.get("automation_id") or element.id_attr or "")
    name_text = str(metadata.get("name_text") or element.name_attr or "")
    class_name = str(metadata.get("class_name") or element.css_selector or "")
    confidence_score = element.confidence_score
    if confidence_score is None:
        try:
            confidence_score = float(metadata.get("locator_quality") or 0.0)
        except (TypeError, ValueError):
            confidence_score = 0.0
    return {
        "candidate_id": str(metadata.get("candidate_id") or element.id),
        "element_id": element.id,
        "name": element.name,
        "element_type": element.element_type,
        "description": element.description,
        "locator_strategy": element.locator_strategy,
        "best_locator": (
            str(metadata.get("primary_locator") or "")
            or automation_id
            or element.xpath
            or element.css_selector
            or name_text
        ),
        "xpath": element.xpath,
        "css_selector": element.css_selector,
        "id_attr": element.id_attr,
        "name_attr": element.name_attr,
        "automation_id": automation_id,
        "name_text": name_text,
        "class_name": class_name,
        "object_key": str(metadata.get("object_key") or ""),
        "locator_context": metadata.get("locator_context") or {},
        "discovery_metadata": metadata,
        "confidence_score": confidence_score or 0.0,
        "alternative_locators": locator_paths,
        "locator_paths": locator_paths,
        "tags": element.tags or [],
        "test_data_hints": test_data_hints,
        "input_type": metadata.get("input_type") or test_data_hints.get("input_type") or "",
        "placeholder": metadata.get("placeholder") or "",
        "label": metadata.get("label") or "",
        "locator_quality": metadata.get("locator_quality") or confidence_score or 0.0,
        "matched_steps": metadata.get("matched_steps") or [],
        "matched_step_intents": metadata.get("matched_step_intents") or [],
        "best_step_intent_score": metadata.get("best_step_intent_score") or 0.0,
        "match_reason": metadata.get("match_reason") or "",
        "selected": True,
    }


async def _fetch_saved_candidates_from_page_repository(
    db: AsyncSession,
    *,
    page_id: str,
    workflow_id: str,
    selected_candidates: list[dict[str, Any]],
    saved_candidates: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    result = await db.execute(select(PageElementModel).where(PageElementModel.page_id == page_id))
    elements = []
    for element in result.scalars().all():
        metadata = element.discovery_metadata if isinstance(element.discovery_metadata, dict) else {}
        if str(metadata.get("workflow_id") or "") == workflow_id:
            elements.append(element)
    selected_ids = [
        str(candidate.get("candidate_id"))
        for candidate in selected_candidates
        if candidate.get("candidate_id")
    ]
    selected_id_set = set(selected_ids)
    selected_order = {candidate_id: index for index, candidate_id in enumerate(selected_ids)}
    elements_by_id = {str(element.id): element for element in elements}
    elements_by_candidate_id = {
        str((element.discovery_metadata or {}).get("candidate_id")): element
        for element in elements
        if isinstance(element.discovery_metadata, dict) and (element.discovery_metadata or {}).get("candidate_id")
    }

    ordered_source = saved_candidates or []
    if ordered_source:
        saved: list[dict[str, Any]] = []
        for saved_candidate in ordered_source:
            element = elements_by_id.get(str(saved_candidate.get("element_id") or ""))
            if element is None:
                element = elements_by_candidate_id.get(str(saved_candidate.get("candidate_id") or ""))
            if element is None:
                continue
            item = _page_element_to_saved_candidate(element)
            for key in (
                "candidate_id",
                "matched_steps",
                "matched_step_intents",
                "best_step_intent_score",
                "match_reason",
                "selected",
                "test_data_hints",
            ):
                value = saved_candidate.get(key)
                if value not in (None, "", [], {}):
                    item[key] = value
            saved.append(item)
        if saved:
            return saved

    saved: list[dict[str, Any]] = []
    for element in elements:
        metadata = element.discovery_metadata if isinstance(element.discovery_metadata, dict) else {}
        candidate_id = str(metadata.get("candidate_id") or "")
        if selected_id_set and candidate_id not in selected_id_set:
            continue
        saved.append(_page_element_to_saved_candidate(element))

    saved.sort(key=lambda item: selected_order.get(str(item.get("candidate_id") or ""), len(selected_order)))
    return saved


def _candidate_discovery_metadata(
    *,
    workflow_id: str,
    candidate: dict[str, Any],
) -> dict[str, Any]:
    hints = candidate.get("test_data_hints") or {}
    nested = candidate.get("discovery_metadata") or hints.get("discovery_metadata") or {}
    metadata = dict(nested) if isinstance(nested, dict) else {}
    tags = {str(tag).lower() for tag in candidate.get("tags") or []}
    source = metadata.get("source") or (
        "desktop_mcp_ai_workflow" if "desktop" in tags else "post_teststep_scrape"
    )
    metadata.update({
        "workflow_id": workflow_id,
        "candidate_id": candidate.get("candidate_id") or "",
        "source": source,
        "selected": bool(candidate.get("selected", True)),
        "matched_steps": candidate.get("matched_steps", []),
        "match_reason": candidate.get("match_reason") or "",
        "input_type": candidate.get("input_type") or "",
        "placeholder": candidate.get("placeholder") or "",
        "label": candidate.get("label") or "",
        "test_data_hints": hints,
        "locator_paths": _candidate_locator_paths(candidate),
        "locator_quality": candidate.get("locator_quality") or candidate.get("confidence_score"),
        "ai_locator_model": candidate.get("ai_locator_model") or "",
        "ai_locator_rationale": candidate.get("ai_locator_rationale") or "",
        "ai_locator_order": candidate.get("ai_locator_order") or [],
        "scrape_step_intents": hints.get("scrape_step_intents") or metadata.get("scrape_step_intents") or [],
        "matched_step_intents": candidate.get("matched_step_intents") or hints.get("matched_step_intents") or [],
        "best_step_intent_score": candidate.get("best_step_intent_score") or hints.get("best_step_intent_score") or 0.0,
    })
    for key in (
        "object_key",
        "automation_id",
        "name_text",
        "class_name",
        "locator_context",
    ):
        value = candidate.get(key)
        if value not in (None, "", [], {}):
            metadata[key] = value
    if "desktop" in tags:
        metadata.setdefault("platform", "desktop")
        metadata.setdefault("primary_locator", candidate.get("best_locator") or candidate.get("id_attr") or "")
        metadata.setdefault("uia_path", candidate.get("xpath") or "")
        metadata.setdefault("control_type", candidate.get("element_type") or "")
    return metadata


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

            if _is_acceptable_element_match(step, best, best_score):
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
        if element_type == "radio":
            return "RADIO_BUTTON"
        if element_type == "checkbox":
            return "HANDLE_CHECKBOX"
        if element_type in {"button", "link", "tab", "toggle"}:
            return "CLICK"
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


def _step_configured_input_value(
    step: GeneratedTestStep,
    element: dict[str, Any] | None,
    *,
    page_url: str = "",
) -> str:
    action = _infer_workflow_action(step, str((element or {}).get("element_type") or ""))
    if action == "navigate":
        return page_url or step.input_value or ""
    if step.input_value:
        return step.input_value
    hints = (element or {}).get("test_data_hints") or {}
    if action in {"fill", "select"}:
        return str(hints.get("sample_value") or "")
    return ""


def _build_step_bindings(
    *,
    page_id: str | None,
    page_name: str,
    step: GeneratedTestStep,
    element: dict[str, Any] | None,
    page_url: str = "",
    platform: str = "web",
) -> dict[str, dict[str, Any]]:
    action = _workflow_action_to_test_config(step.action_type, element)
    input_value = _step_configured_input_value(step, element, page_url=page_url)
    if _is_desktop_platform(platform):
        desktop_action = "LAUNCH_APP" if action == "NAVIGATE_TO_URL" else action
        desktop_binding: dict[str, Any] = {
            "page": page_name,
            "application": page_name,
            "window": page_name,
            "screen": page_name,
            "page_id": page_id or step.page_id,
            "driver_type": "uia3",
            "action_type": desktop_action,
            "workflow_action_type": step.action_type,
            "source": "ai_workflow",
            "confidence": step.confidence,
            "requires_object_configuration": element is None and desktop_action not in {"LAUNCH_APP", "WAIT"},
        }
        if desktop_action == "LAUNCH_APP" and input_value:
            desktop_binding["app"] = input_value
            desktop_binding["application_path"] = input_value
        if element:
            locator = _resolved_locator(element)
            hints = element.get("test_data_hints") or {}
            metadata = element.get("discovery_metadata") or hints.get("discovery_metadata") or {}
            if not isinstance(metadata, dict):
                metadata = {}
            strategy = str(element.get("locator_strategy") or "accessibility id")
            automation_id = str(
                element.get("automation_id")
                or metadata.get("automation_id")
                or element.get("id_attr")
                or (locator if strategy.lower() in {"accessibility id", "automation id", "accessibility_id"} else "")
                or ""
            )
            name_text = str(element.get("name_text") or metadata.get("name_text") or element.get("name_attr") or "")
            class_name = str(element.get("class_name") or metadata.get("class_name") or "")
            selector = automation_id or locator or name_text or class_name
            locator_paths = [
                dict(item)
                for item in (
                    element.get("locator_paths")
                    or metadata.get("locator_paths")
                    or element.get("alternative_locators")
                    or []
                )
                if isinstance(item, dict) and item.get("locator")
            ]
            desktop_binding.update({
                "page_element_id": element.get("element_id"),
                "element_name": element.get("name"),
                "object_name": element.get("name"),
                "object_key": element.get("object_key") or metadata.get("object_key") or "",
                "control_type": element.get("element_type"),
                "input_type": element.get("input_type") or hints.get("input_type") or "",
                "data_type": hints.get("data_type") or "",
                "locator_strategy": strategy,
                "automation_id": automation_id,
                "selector": selector,
                "uia_path": element.get("xpath") or metadata.get("uia_path") or locator,
                "name_text": name_text,
                "class_name": class_name,
                "primary_locator": metadata.get("primary_locator") or locator,
                "locator_context": element.get("locator_context") or metadata.get("locator_context") or {},
                "locator_quality": element.get("locator_quality") or element.get("confidence_score"),
                "match_reason": element.get("match_reason"),
                "alternative_locators": locator_paths,
                "locator_paths": locator_paths,
            })
            desktop_binding["locators"] = locator_paths
        if input_value:
            desktop_binding.update({
                "value": input_value,
                "input_value": input_value,
                "sample_value": input_value,
            })
        return {"desktop": desktop_binding}

    web_binding: dict[str, Any] = {
        "page": page_name,
        "page_id": page_id or step.page_id,
        "action_type": action,
        "workflow_action_type": step.action_type,
        "source": "ai_workflow",
        "confidence": step.confidence,
    }
    if action == "NAVIGATE_TO_URL" and input_value:
        web_binding["url"] = input_value
    if element:
        locator = _resolved_locator(element)
        hints = element.get("test_data_hints") or {}
        metadata = element.get("discovery_metadata") or hints.get("discovery_metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}
        locator_paths = [
            dict(item)
            for item in (
                element.get("locator_paths")
                or metadata.get("locator_paths")
                or element.get("alternative_locators")
                or []
            )
            if isinstance(item, dict) and item.get("locator")
        ]
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
            "alternative_locators": locator_paths,
            "locator_paths": locator_paths,
        })
    if input_value:
        web_binding.update({
            "value": input_value,
            "input_value": input_value,
            "sample_value": input_value,
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
            workflow_provider = wf.ai_provider
            workflow_model = wf.ai_model
            workflow_platform = wf.platform or "web"
            workflow_url = wf.webpage_url or ""
            workflow_project_name = wf.project_name
            workflow_module_name = wf.module_name or wf.project_name
            workflow_scenarios = list(wf.scenarios or [])

            await _update_state(
                db, workflow_id, WorkflowState.TESTCASES_GENERATING,
                "Generating test cases and drafting test steps...",
                detail="Selected scenarios are being converted before page scraping starts.",
            )

            provider = _build_provider(workflow_provider, workflow_model)
            selected = [
                ScenarioPreview(**s)
                for s in workflow_scenarios
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
            page_name = wf.page_name or _extract_page_name(workflow_url, workflow_project_name)
            application_profile = _application_learning_profile(
                platform=workflow_platform,
                app_target=workflow_url,
                page_name=page_name,
                project_name=workflow_project_name,
                brd_text=wf.brd_text,
            )

            tc_agent = TestCaseGenerationAgent(provider)
            all_test_cases: list[GeneratedTestCase] = []
            concurrency = max(1, min(settings.ai_workflow_testcase_concurrency, len(selected)))
            semaphore = asyncio.Semaphore(concurrency)

            async def generate_for_scenario(
                index: int,
                scenario: ScenarioPreview,
            ) -> _GENERATED_CASE_BATCH:
                async with semaphore:
                    try:
                        tc_list = await tc_agent.run(
                            scenario,
                            page_name,
                            elements_summary,
                            platform=workflow_platform,
                            app_target=workflow_url,
                            application_profile=application_profile,
                        )
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
                raise ValueError(f"Test case generation failed: {_format_provider_error(exc)}") from exc

            generated_batches.sort(key=lambda item: item[0])
            total_generated = sum(len(test_cases) for _, _, test_cases in generated_batches)
            all_test_cases = [
                tc
                for _, _, test_cases in generated_batches
                for tc in test_cases
            ]
            total_steps = sum(len(tc.steps) for tc in all_test_cases)
            scrape_step_intents = _build_step_scrape_intents(all_test_cases)
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
                detail=(
                    f"Prepared {len(scrape_step_intents)} actionable step intent(s); "
                    "MCP scraping will use these targets before candidates are saved to Pages."
                ),
                testcases_created=total_generated,
                teststeps_created=total_steps,
            )

            page_cfg = PageConfigurationAgent()
            project = await page_cfg.ensure_project(db, workflow_project_name)
            project_id = str(project.id)
            module = await page_cfg.ensure_module(
                db, project_id, workflow_module_name
            )
            module_id = str(module.id)
            wf.project_id = project_id
            wf.module_id = module_id
            await db.commit()

            await _update_state(
                db,
                workflow_id,
                WorkflowState.PAGE_CREATED,
                f"Creating page '{page_name}' after test step draft...",
                detail=(
                    f"Page Repository entry is created only after {total_steps} drafted steps exist. "
                    f"{len(scrape_step_intents)} actionable step intent(s) will guide scraping."
                ),
                project_id=project_id,
                module_id=module_id,
            )
            page = await page_cfg.ensure_page(
                db, project_id, module_id, page_name, workflow_url, workflow_platform
            )
            page_id = str(page.id)
            await _update_state(
                db,
                workflow_id,
                WorkflowState.PAGE_CREATED,
                f"Page '{page_name}' created",
                detail=(
                    "Scraping starts now with generated test-step intent context; only step-targeted candidates "
                    "will stay in the workflow panel first."
                ),
                page_id=page_id,
            )

            is_desktop = _is_desktop_platform(workflow_platform)
            discovery_engine = (
                "Desktop MCP scanner"
                if is_desktop
                else "MCP Playwright server" if settings.mcp_playwright_url else "local Playwright"
            )
            if is_desktop:
                await _update_state(
                    db, workflow_id, WorkflowState.DISCOVERY_RUNNING,
                    "Triggering Desktop MCP scanner...",
                    detail=(
                        f"Desktop MCP is preparing the UIA capture session with "
                        f"{len(scrape_step_intents)} generated step intent(s). Nothing is saved "
                        "to the Page Repository until generated steps choose the needed objects."
                    ),
                )
                await _update_state(
                    db, workflow_id, WorkflowState.DISCOVERY_RUNNING,
                    "Launching desktop application for UID capture...",
                    detail=f"Application target: {workflow_url}. Screen/window: {page_name}.",
                )
                desktop_adapter = DesktopDiscoveryAdapter(
                    driver_type="uia3",
                    server_url=settings.winappdriver_url,
                    timeout_ms=90000,
                    close_after=False,
                    poll_interval_ms=750,
                    stability_polls=2,
                    settle_ms=4000,
                    max_objects=600,
                )
                discovery_result = await desktop_adapter.discover(
                    app=workflow_url,
                    page_name=page_name,
                    platform=workflow_platform,
                    save_mode="preview",
                    page_id=page_id,
                    db=db,
                    window_title=page_name,
                    step_intents=scrape_step_intents,
                )
            else:
                await _update_state(
                    db, workflow_id, WorkflowState.DISCOVERY_RUNNING,
                    f"{discovery_engine} is scraping step-targeted element candidates...",
                    detail=(
                        "The scrape is running in preview mode with generated test-step intents. Nothing is saved to the Page "
                        "Repository until the narrowed candidates are selected for those steps."
                    ),
                )
                adapter = BrowserDiscoveryAdapter(
                    mcp_url=settings.mcp_playwright_url or None,
                    playwright_fallback=settings.playwright_fallback,
                )
                discovery_agent = AppDiscoveryAgent(adapter)
                discovery_result = await discovery_agent.run(
                    url=workflow_url,
                    page_name=page_name,
                    platform=workflow_platform,
                    save_mode="preview",
                    page_id=page_id,
                    db=db,
                    step_intents=scrape_step_intents,
                )
            if discovery_result.summary.has_error:
                raise RuntimeError(discovery_result.summary.error or "Page scraping failed")

            scraped_candidates = [
                _candidate_from_discovered(element, index)
                for index, element in enumerate(discovery_result.elements)
            ]
            raw_candidate_count = len(scraped_candidates)
            scraped_candidates = _target_scraped_candidates_for_steps(
                all_test_cases,
                scraped_candidates,
            )
            targeted_candidate_count = len(scraped_candidates)
            skipped_untargeted_count = max(raw_candidate_count - targeted_candidate_count, 0)
            step_intent_matched = sum(
                1 for candidate in scraped_candidates
                if candidate.get("matched_step_intents")
            )
            if is_desktop:
                await _update_state(
                    db, workflow_id, WorkflowState.DISCOVERY_RUNNING,
                    f"Desktop MCP narrowed {raw_candidate_count} UID/UIA candidates to {targeted_candidate_count} step-needed object candidates...",
                    detail=(
                        "Automation IDs, UIA paths, names, classes, parent/child context, "
                        "nearby labels, and fallback locator bundles are filtered by generated test-step intent before AI binding. "
                        f"{step_intent_matched} candidate(s) had direct generated-step matches; "
                        f"{skipped_untargeted_count} unrelated object candidate(s) were kept out of the dashboard and Page Repository."
                    ),
                    scraped_candidates=scraped_candidates,
                )
            await _update_state(
                db, workflow_id, WorkflowState.DISCOVERY_RUNNING,
                f"AI is ranking scrape-time locator fallbacks with {workflow_provider}/{workflow_model}...",
                detail=(
                    "The model is choosing the strongest desktop selector while preserving "
                    "Automation ID, parent/child UIA context, nearby labels, name, class, "
                    "OCR, and visual fallbacks for runtime healing."
                    if is_desktop else
                    "The model is choosing the strongest selector and preserving CSS, "
                    "relative XPath, and absolute XPath alternatives for runtime healing."
                ),
                scraped_candidates=scraped_candidates,
            )
            scraped_candidates = await _enhance_scraped_candidates_with_ai(
                provider,
                workflow_model,
                scraped_candidates,
            )
            binding_decisions = await _ai_step_binding_decisions(
                provider,
                workflow_model,
                test_cases=all_test_cases,
                candidates=scraped_candidates,
                platform=workflow_platform,
                page_name=page_name,
            )
            await _update_state(
                db, workflow_id, WorkflowState.DISCOVERY_DONE,
                f"MCP filtered {raw_candidate_count} raw candidates to {targeted_candidate_count} step-needed candidates",
                detail=(
                    f"AI produced {len(binding_decisions)} step binding decision(s). "
                    f"The pre-save filter removed {skipped_untargeted_count} candidate(s) that did not match generated test steps. "
                    "Only targeted candidates continue toward Page Repository save."
                ),
                scraped_candidates=scraped_candidates,
            )

            selected_candidates = _select_candidates_from_binding_decisions(
                all_test_cases,
                scraped_candidates,
                binding_decisions,
            )
            selected_by_id = {candidate["candidate_id"]: candidate for candidate in selected_candidates}
            scraped_candidates = [
                {**candidate, **selected_by_id.get(candidate["candidate_id"], {})}
                for candidate in scraped_candidates
            ]
            await _update_state(
                db, workflow_id, WorkflowState.LOCATORS_RANKED,
                (
                    f"AI + Desktop MCP selected {len(selected_candidates)} UID/UIA elements from {len(scraped_candidates)} step-targeted candidates"
                    if is_desktop else
                    f"AI selected {len(selected_candidates)} necessary elements from {len(scraped_candidates)} step-targeted candidates"
                ),
                detail=(
                    "AI compared generated desktop test steps with Automation IDs, "
                    "control types, names, parent/child context, nearby labels, and locator candidates, "
                    "then a bounded MCP safety pass kept only step-targeted UID/UIA fallbacks for coverage and healing."
                    if is_desktop else
                    "AI compared generated testcase descriptions and test steps with scraped names, "
                    "roles, text, IDs, and locator candidates, then chose elements, actions, "
                    "input values, and locator paths."
                ),
                scraped_candidates=scraped_candidates,
                selected_elements=selected_candidates,
            )

            written_elements = await _save_selected_candidates(
                db,
                page_id=page_id,
                workflow_id=workflow_id,
                url=workflow_url,
                selected_candidates=selected_candidates,
            )
            saved_elements = await _fetch_saved_candidates_from_page_repository(
                db,
                page_id=page_id,
                workflow_id=workflow_id,
                selected_candidates=selected_candidates,
                saved_candidates=written_elements,
            )
            if selected_candidates and not saved_elements:
                saved_elements = written_elements
            low_conf = sum(
                1 for element in saved_elements
                if float(element.get("confidence_score") or 0.0) < 0.6
            )
            await _update_state(
                db, workflow_id, WorkflowState.PAGE_SAVED,
                f"Saved {len(saved_elements)} necessary elements to '{page_name}'",
                detail=(
                    f"Filtered {skipped_untargeted_count} desktop UIA candidate(s) before AI ranking and saved {len(saved_elements)} step-needed object(s). "
                    "Saved objects were fetched back from the Page Repository before binding."
                    if is_desktop else
                    f"Filtered {skipped_untargeted_count} scraped candidate(s) before AI ranking and saved {len(saved_elements)} step-needed element(s). "
                    "Saved elements were fetched back from the Page Repository before binding."
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
                (
                    "Configuring desktop test steps with matched screen, actions, objects, and UIA fallbacks..."
                    if is_desktop else
                    "Configuring test steps with matched page, actions, elements, and XPath..."
                ),
                detail=(
                    "Each generated desktop step is being mapped to the created screen and "
                    "the best matching saved object from the Desktop MCP scan, with locator paths "
                    "written into the step configuration."
                    if is_desktop else
                    "Each generated step is being mapped to the created page and the "
                    "best matching saved element from the scrape, with locator paths written "
                    "into the step configuration."
                ),
            )
            bound_cases = _bind_cases_with_ai_decisions(
                all_test_cases,
                page_id,
                saved_elements,
                binding_decisions,
            )
            saved_element_lookup = {
                str(element.get("element_id")): element
                for element in saved_elements
                if element.get("element_id")
            }
            persisted = 0
            persisted_cases: list[GeneratedTestCase] = []
            for tc in bound_cases:
                try:
                    await _persist_test_case(
                        db,
                        tc,
                        module_id,
                        project_id,
                        page_name=page_name,
                        page_url=workflow_url,
                        element_lookup=saved_element_lookup,
                        platform=workflow_platform,
                    )
                except Exception as exc:
                    await db.rollback()
                    logger.exception(
                        "Failed to persist test case '%s' for workflow %s; skipping it and continuing with the rest",
                        tc.title, workflow_id,
                    )
                    await _append_error(
                        db, workflow_id,
                        f"Test case '{tc.title}' could not be saved: {_format_provider_error(exc)}",
                    )
                    continue
                persisted += 1
                persisted_cases.append(tc)
                await _update_state(
                    db, workflow_id, WorkflowState.PAGE_SAVED,
                    (
                        f"Configured desktop test case {persisted}/{len(bound_cases)} with screen, object, action, and UIA fallbacks"
                        if is_desktop else
                        f"Configured test case {persisted}/{len(bound_cases)} with page, element, action, and XPath"
                    ),
                    detail=f"{len(tc.steps)} test step(s) stored under '{tc.title}'.",
                    testcases_created=persisted,
                    teststeps_created=sum(len(case.steps) for case in persisted_cases),
                    unmapped_steps=sum(
                        1 for case in persisted_cases
                        for step in case.steps if step.needs_review
                    ),
                )

            skipped_case_count = len(bound_cases) - len(persisted_cases)
            if skipped_case_count:
                await _update_state(
                    db, workflow_id, WorkflowState.PAGE_SAVED,
                    f"{skipped_case_count} test case(s) could not be saved and were skipped",
                    detail="See workflow errors for details on the skipped test case(s). "
                    f"Continuing with {persisted}/{len(bound_cases)} saved test case(s).",
                )

            bound_cases = persisted_cases
            total_steps = sum(len(tc.steps) for tc in bound_cases)
            unmapped = sum(1 for tc in bound_cases for step in tc.steps if step.needs_review)

            page_elements = [
                {
                    "id": element.get("element_id"),
                    "name": element.get("name"),
                    "confidence_score": element.get("confidence_score"),
                    "xpath": element.get("xpath"),
                    "alternative_locators": element.get("alternative_locators") or [{
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
                project_id=project_id,
                module_id=module_id,
                page_id=page_id,
                elements_saved=len(saved_elements),
                scenarios_generated=len(workflow_scenarios),
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
                "page_id": page_id,
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
            await db.rollback()
            try:
                await _append_error(db, workflow_id, str(exc))
                await _update_state(
                    db, workflow_id, WorkflowState.FAILED,
                    f"Test case generation failed: {exc}",
                )
            except Exception:
                logger.exception(
                    "Could not record failure state for workflow %s after test case generation "
                    "error; workflow may be stuck until manually reset",
                    workflow_id,
                )


async def _persist_test_case(
    db: AsyncSession,
    tc: GeneratedTestCase,
    module_id: str,
    project_id: str,
    *,
    page_name: str = "",
    page_url: str = "",
    element_lookup: dict[str, dict[str, Any]] | None = None,
    platform: str = "web",
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
        platforms=[platform] if platform else [],
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
        if _is_desktop_platform(platform) and configured_action == "NAVIGATE_TO_URL":
            configured_action = "LAUNCH_APP"
        bindings = _build_step_bindings(
            page_id=step.page_id,
            page_name=page_name,
            step=step,
            element=element,
            page_url=page_url,
            platform=platform,
        )
        platform_binding = bindings.get("desktop", {}) if _is_desktop_platform(platform) else bindings.get("web", {})
        locator = str(
            platform_binding.get("automation_id")
            or platform_binding.get("selector")
            or platform_binding.get("uia_path")
            or platform_binding.get("xpath")
            or ""
        )
        element_name = str(element.get("name") or "") if element else ""
        test_data_hints = (element or {}).get("test_data_hints") or {}
        configured_input_value = _step_configured_input_value(step, element, page_url=page_url)
        target = element_name or (page_name if step.action_type == "navigate" else "")
        test_data = {
            **(step.test_data or {}),
            "value": configured_input_value,
            "action_type": configured_action,
            "workflow_action_type": step.action_type,
            "platform": platform,
            "page": page_name,
            "screen": page_name,
            "window": page_name,
            "page_id": step.page_id,
            "page_element_id": step.page_element_id,
            "element_name": element_name,
            "input_type": platform_binding.get("input_type") or test_data_hints.get("input_type") or "",
            "data_type": test_data_hints.get("data_type") or "",
            "date_format": test_data_hints.get("date_format") or "",
            "sample_value": test_data_hints.get("sample_value") or "",
            "locator": locator,
            "xpath": str(platform_binding.get("xpath") or platform_binding.get("uia_path") or locator),
            "uia_path": str(platform_binding.get("uia_path") or ""),
            "automation_id": str(platform_binding.get("automation_id") or locator),
            "css_selector": str(platform_binding.get("css_selector") or ""),
            "alternative_locators": platform_binding.get("alternative_locators") or [],
            "locator_paths": platform_binding.get("locator_paths") or platform_binding.get("alternative_locators") or [],
            "locator_quality": platform_binding.get("locator_quality") or "",
            "binding_confidence": step.confidence,
            **_binding_review_metadata(step),
        }
        if _is_desktop_platform(platform):
            test_data["driver_type"] = str(platform_binding.get("driver_type") or "uia3")
            test_data["application_path"] = configured_input_value if step.action_type == "navigate" else page_url
            test_data["object_repository_required"] = bool(platform_binding.get("requires_object_configuration"))
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
        ai_provider, ai_model = _normalize_ai_selection(req.ai_provider, req.ai_model)
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
            ai_provider=ai_provider,
            ai_model=ai_model,
            scenarios=[],
            errors=[],
            scraped_candidates=[],
            selected_elements=[],
        )
        self._db.add(wf)
        await self._db.commit()
        await self._db.refresh(wf)

        run_token = _start_workflow_run(wf.id)
        asyncio.create_task(_run_with_workflow_token(run_token, _run_workspace_phase(wf.id)))
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

        provider, model = _normalize_ai_selection(ai_provider or wf.ai_provider, ai_model or wf.ai_model)
        run_token = _start_workflow_run(workflow_id)

        asyncio.create_task(_run_with_workflow_token(run_token, _run_scenario_generation(workflow_id, provider, model)))
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

        run_token = _start_workflow_run(workflow_id)
        asyncio.create_task(_run_with_workflow_token(run_token, _run_testcase_generation(workflow_id)))
        return _workflow_to_response(wf)

    async def stop_workflow(self, workflow_id: str) -> WorkflowStateResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")
        if wf.state in {WorkflowState.COMPLETED.value, WorkflowState.REVIEW_READY.value, WorkflowState.STOPPED.value}:
            return _workflow_to_response(wf)
        _cancel_workflow_run(workflow_id)
        await _update_state(
            self._db,
            workflow_id,
            WorkflowState.STOPPED,
            "Process stopped by user",
            "The AI workflow process was stopped from the UI.",
        )
        return await self.get_workflow(workflow_id)

    async def rollback_workflow(self, workflow_id: str, target_stage: str) -> WorkflowStateResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")

        target_state = _apply_rollback_fields(wf, target_stage)
        _cancel_workflow_run(workflow_id)
        _append_workflow_activity(
            wf,
            target_state,
            wf.current_message,
            "Rollback requested from the workflow timeline. Downstream generated data was cleared.",
        )
        await self._db.commit()
        await self._db.refresh(wf)
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
