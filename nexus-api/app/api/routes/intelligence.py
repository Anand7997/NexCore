"""Execution intelligence routes.

Endpoints
---------
GET  /intelligence/executions/{id}          — heuristic analysis (instant)
POST /intelligence/executions/{id}/analyze  — trigger AI job (async, streams via WS)
GET  /intelligence/executions/{id}/jobs     — list AI jobs for an execution
GET  /intelligence/jobs/{job_id}            — job status + result
DELETE /intelligence/jobs/{job_id}          — cancel a queued job
"""
from __future__ import annotations

import asyncio
import re
import json
import os
import uuid
import importlib.util
import logging
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models import (
    ExecutionModel,
    ExecutionNodeModel,
    IntelligenceJobModel,
    PageElementModel,
    TestStepModel,
    WorkflowNodeModel,
)
from app.database.session import get_db
from app.api.routes.page_repository import _sync_test_steps_for_element
from app.config import DEFAULT_CLAUDE_MODEL, DEFAULT_OPENAI_MODEL, settings
from app.intelligence.analyzer import ExecutionIntelligenceAnalyzer
from app.ai_workflow.providers.claude_provider import ClaudeProvider
from app.ai_workflow.providers.openai_provider import OpenAIProvider

router = APIRouter(prefix="/intelligence", tags=["intelligence"])
logger = logging.getLogger(__name__)


def _openai_model() -> str:
    configured = str(settings.default_ai_model or "").strip()
    return configured if configured.lower().startswith("gpt") else DEFAULT_OPENAI_MODEL


def _claude_model() -> str:
    configured = str(settings.default_ai_model or "").strip()
    if "claude" in configured.lower():
        return configured
    return str(settings.default_claude_model or DEFAULT_CLAUDE_MODEL).strip() or DEFAULT_CLAUDE_MODEL


# ── Request / response schemas ─────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    job_type: Literal[
        "root_cause_analysis",
        "flaky_detection",
        "locator_healing",
        "anomaly_analysis",
    ] = "root_cause_analysis"
    tenant_id: str = "default"


class JobStatusResponse(BaseModel):
    id: str
    execution_id: str
    job_type: str
    status: str
    progress: float
    current_step: str | None
    error: str | None
    result: dict[str, Any] | None
    created_at: str
    started_at: str | None
    completed_at: str | None


class FixSuggestionResponse(BaseModel):
    id: str
    execution_id: str
    node_key: str
    node_label: str
    scope: Literal["execution_quick_heal"] = "execution_quick_heal"
    category: Literal["minor_locator", "minor_element", "desktop_launch_config"] = "minor_locator"
    title: str
    rationale: str
    target_type: Literal["page_element", "test_step", "workflow_node"]
    target_id: str
    field: str
    old_value: str
    new_value: str
    confidence: float
    can_implement: bool
    blocked_reason: str | None = None


class ImplementFixResponse(BaseModel):
    applied: bool
    suggestion: FixSuggestionResponse
    changed: dict[str, Any]


class AssistantQueryRequest(BaseModel):
    question: str
    preferred_provider: Literal["openai", "claude"] | None = None
    preferred_model: str | None = None


class AssistantSource(BaseModel):
    type: str
    label: str
    excerpt: str


class AssistantQueryResponse(BaseModel):
    answer: str
    intent: str
    confidence: float
    sources: list[AssistantSource]
    fixes: list[FixSuggestionResponse]
    recommended_fix_id: str | None = None
    panels: dict[str, Any]
    answer_source: Literal["llm", "fallback"] = "fallback"
    provider: str | None = None
    model: str | None = None
    llm_error: str | None = None
    provider_results: list[dict[str, Any]] = []


class AIProviderStatusResponse(BaseModel):
    provider: Literal["openai", "claude"]
    label: str
    model: str
    configured: bool
    package_available: bool
    status: Literal["ready", "ok", "not_configured", "package_missing", "failed", "quota_exhausted", "auth_failed", "timeout"]
    error: str | None = None


class AssistantLLMAnswer(BaseModel):
    answer: str
    confidence: float
    recommended_fix_id: str | None


_QUICK_HEAL_NODE_TYPES = {
    "web.click",
    "web.double_click",
    "web.right_click",
    "web.hover",
    "web.fill",
    "web.select",
    "web.check",
    "web.upload",
    "web.wait",
    "web.extract_text",
    "web.drag_and_drop",
}

_DESKTOP_LAUNCH_BAD_WINDOW_TITLES = {
    "snap assist",
    "task switching",
    "program manager",
}

_MINOR_LOCATOR_FAILURE_MARKERS = (
    "locator",
    "selector",
    "waiting for",
    "strict mode violation",
    "element is not",
    "element not",
    "not visible",
    "not attached",
    "not enabled",
    "not editable",
    "not found",
    "no element",
)

_MAJOR_FAILURE_MARKERS = (
    "navigation failed",
    "http ",
    "too many requests",
    "access denied",
    "forbidden",
    "captcha",
    "cloudflare",
    "text assertion failed",
    "expected contains",
    "api response",
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _job_to_response(job: IntelligenceJobModel) -> JobStatusResponse:
    return JobStatusResponse(
        id=job.id,
        execution_id=job.execution_id,
        job_type=job.job_type,
        status=job.status,
        progress=round(job.progress, 3),
        current_step=job.current_step,
        error=job.error,
        result=job.result,
        created_at=job.created_at.isoformat(),
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
    )


def _selector_from_element(element: PageElementModel) -> str:
    if element.locator_strategy == "css" and element.css_selector:
        return element.css_selector
    if element.locator_strategy == "id" and element.id_attr:
        return f"#{element.id_attr}"
    if element.locator_strategy == "name" and element.name_attr:
        return f"[name='{element.name_attr}']"
    if element.xpath:
        return f"xpath={element.xpath}" if element.xpath.startswith(("/", "(")) else element.xpath
    return element.css_selector or element.id_attr or element.name_attr or ""


def _strip_locator_prefix(value: str) -> str:
    locator = str(value or "").strip()
    for prefix in ("xpath=", "css="):
        if locator.lower().startswith(prefix):
            return locator[len(prefix):].strip()
    return locator


def _same_locator(left: str, right: str) -> bool:
    return _strip_locator_prefix(left) == _strip_locator_prefix(right)


def _locator_strategy(locator: str, strategy: str = "") -> str:
    value = str(locator or "").strip()
    normalized = str(strategy or "").strip().lower()
    if normalized:
        return normalized
    if value.startswith(("xpath=", "/", "(")):
        return "xpath"
    return "css"


def _runtime_healed_locator(node: ExecutionNodeModel, old_value: str) -> tuple[str, str, float, str] | None:
    attempts = (node.output or {}).get("locator_attempts")
    if not isinstance(attempts, list):
        return None
    saw_failure = False
    for attempt in attempts:
        if not isinstance(attempt, dict):
            continue
        if not attempt.get("success"):
            saw_failure = True
            continue
        locator = str(attempt.get("locator") or attempt.get("selector") or "").strip()
        if not locator or _same_locator(locator, old_value):
            continue
        if not saw_failure:
            continue
        strategy = _locator_strategy(locator, str(attempt.get("strategy") or ""))
        return (
            strategy,
            _strip_locator_prefix(locator) if strategy == "xpath" else locator,
            0.94,
            "Playwright execution healed this step with a fallback locator after the primary locator failed.",
        )
    return None


def _candidate_from_locators(
    locators: Any,
    old_value: str,
    default_reason: str,
) -> tuple[str, str, float, str] | None:
    if not isinstance(locators, list):
        return None
    ranked: list[tuple[float, int, dict[str, Any]]] = []
    for index, item in enumerate(locators):
        if not isinstance(item, dict):
            continue
        try:
            score = float(item.get("score") or item.get("confidence") or 0.72)
        except (TypeError, ValueError):
            score = 0.72
        ranked.append((score, -index, item))
    ranked.sort(reverse=True)
    for score, _index, item in ranked:
        locator = str(item.get("locator") or item.get("selector") or item.get("value") or "").strip()
        if not locator or _same_locator(locator, old_value):
            continue
        strategy = _locator_strategy(locator, str(item.get("strategy") or ""))
        reason = str(item.get("reason") or item.get("source") or default_reason)
        return strategy, _strip_locator_prefix(locator) if strategy == "xpath" else locator, min(max(score, 0.0), 1.0), reason
    return None


def _candidate_locator(element: PageElementModel, old_value: str) -> tuple[str, str, float, str] | None:
    alternatives = element.alternative_locators or []
    def score(item: dict[str, Any]) -> float:
        try:
            return float(item.get("score") or item.get("confidence") or 0)
        except (TypeError, ValueError):
            return 0.0

    ranked = sorted(
        [item for item in alternatives if isinstance(item, dict)],
        key=score,
        reverse=True,
    )
    for item in ranked:
        locator = str(item.get("locator") or item.get("selector") or item.get("value") or "").strip()
        if not locator or _same_locator(locator, old_value):
            continue
        strategy = _locator_strategy(locator, str(item.get("strategy") or ""))
        confidence = score(item) or 0.75
        reason = str(item.get("reason") or "Alternative locator captured during page discovery.")
        return strategy, _strip_locator_prefix(locator) if strategy == "xpath" else locator, min(max(confidence, 0.0), 1.0), reason
    return None


_BLOCKED_NAVIGATION_TITLE_MARKERS = (
    "too many requests",
    "access denied",
    "forbidden",
    "captcha",
    "not a robot",
    "cloudflare",
)


def _blocked_navigation_reason(output: dict[str, Any] | None, error: str | None = None) -> str | None:
    output = output or {}
    try:
        status_code = int(output.get("status_code") or 0)
    except (TypeError, ValueError):
        status_code = 0
    title = str(output.get("title") or "")
    lower_text = f"{title} {error or ''}".lower()

    if status_code >= 400:
        return f"Navigation returned HTTP {status_code} ({title or 'no title'})."
    if "navigation failed" in lower_text and "http" in lower_text:
        return error or "Navigation failed before the target page loaded."
    if any(marker in lower_text for marker in _BLOCKED_NAVIGATION_TITLE_MARKERS):
        return f"Navigation reached a blocked page ({title or 'blocked response'})."
    return None


async def _execution_navigation_block_reason(db: AsyncSession, execution_id: str) -> str | None:
    result = await db.execute(
        select(ExecutionNodeModel)
        .where(ExecutionNodeModel.execution_id == execution_id, ExecutionNodeModel.node_type == "web.navigate")
        .order_by(ExecutionNodeModel.started_at.asc())
    )
    for node in result.scalars().all():
        reason = _blocked_navigation_reason(node.output, node.error)
        if reason:
            return reason
    return None


def _has_runtime_heal(node: ExecutionNodeModel) -> bool:
    attempts = (node.output or {}).get("locator_attempts")
    if not isinstance(attempts, list):
        return False
    saw_failure = False
    for attempt in attempts:
        if not isinstance(attempt, dict):
            continue
        if attempt.get("success") and saw_failure:
            return True
        if not attempt.get("success"):
            saw_failure = True
    return False


def _is_quick_heal_scope(
    execution_node: ExecutionNodeModel,
    workflow_node: WorkflowNodeModel | None,
) -> bool:
    node_type = str(execution_node.node_type or getattr(workflow_node, "type", "") or "")
    config = getattr(workflow_node, "config", None) or {}
    has_selector = any(
        config.get(key)
        for key in ("selector", "locators", "target_selector", "target_locators")
    )
    if node_type not in _QUICK_HEAL_NODE_TYPES or not has_selector:
        return False
    if _has_runtime_heal(execution_node):
        return True

    text = f"{execution_node.error or ''} {execution_node.output or {}}".lower()
    if not text.strip():
        return False
    if any(marker in text for marker in _MAJOR_FAILURE_MARKERS):
        return False
    if any(marker in text for marker in _MINOR_LOCATOR_FAILURE_MARKERS):
        return True
    return "timeout" in text and "web." in node_type


def _display_json(value: dict[str, Any]) -> str:
    return json.dumps(value, indent=2, sort_keys=True)


def _infer_process_name_from_app(app: str) -> str:
    name = os.path.basename(str(app or "").strip().strip('"'))
    return name if name.lower().endswith(".exe") else ""


def _infer_window_title_from_app(app: str, current: str = "") -> str:
    app_name = os.path.basename(str(app or "").strip().strip('"')).lower()
    current_clean = str(current or "").strip()
    if current_clean and current_clean.lower() not in _DESKTOP_LAUNCH_BAD_WINDOW_TITLES:
        return current_clean
    if app_name == "code.exe":
        return "Visual Studio Code"
    if app_name:
        return os.path.splitext(os.path.basename(app_name))[0].replace("_", " ").replace("-", " ").title()
    return current_clean


def _append_launch_arg(config: dict[str, Any], arg: str) -> None:
    raw_args = config.get("args") or config.get("appArguments")
    if isinstance(raw_args, list):
        args = [str(item) for item in raw_args if str(item).strip()]
    elif isinstance(raw_args, str) and raw_args.strip():
        args = [part for part in raw_args.split() if part]
    else:
        args = []
    if arg not in args:
        args.append(arg)
    config["args"] = args


def _desktop_launch_config_suggestion(
    execution_id: str,
    execution_node: ExecutionNodeModel,
    workflow_node: WorkflowNodeModel,
) -> FixSuggestionResponse | None:
    if execution_node.node_type != "desktop.launch" or workflow_node.type != "desktop.launch":
        return None
    config = dict(workflow_node.config or {})
    app = str(config.get("app") or "").strip()
    if not app:
        return None
    current_window = str(config.get("window_title") or "").strip()
    current_process = str(config.get("process_name") or "").strip()
    inferred_process = _infer_process_name_from_app(app)
    inferred_window = _infer_window_title_from_app(app, current_window)
    error_text = f"{execution_node.status} {execution_node.error or ''}".lower()
    next_config = dict(config)
    next_config["attach_if_running"] = True
    if inferred_window:
        next_config["window_title"] = inferred_window
    if inferred_process and (not current_process or current_process.isdigit()):
        next_config["process_name"] = inferred_process
    try:
        current_timeout_ms = int(float(config.get("timeout_ms") or 0))
    except (TypeError, ValueError):
        current_timeout_ms = 0
    needs_timeout_buffer = (
        ("cancel" in error_text or "timed out" in error_text or "timeout" in error_text)
        and current_timeout_ms < 90000
    )
    if needs_timeout_buffer:
        next_config["timeout_ms"] = 90000
    no_windows_for_process = "no windows for that process" in error_text
    is_vs_code = os.path.basename(app.strip().strip('"')).lower() == "code.exe"
    if no_windows_for_process and is_vs_code:
        if current_process and current_window:
            next_config.pop("process_name", None)
        _append_launch_arg(next_config, "--new-window")

    changed = next_config != config
    if not changed:
        return None
    reason_bits = [
        "The failure happened at the prerequisite desktop.launch node, before any recorded interaction ran.",
        "For desktop applications that may already be open, AI Inspect can make launch attach-first instead of starting duplicate processes on every retry.",
    ]
    title = "Make desktop launch attach to the running app first"
    confidence = 0.9
    if current_window.lower() in _DESKTOP_LAUNCH_BAD_WINDOW_TITLES:
        reason_bits.append(f"The recorded window title {current_window!r} looks like a Windows shell overlay, not the app window.")
    if current_process.isdigit() and inferred_process:
        reason_bits.append(f"The recorded process value {current_process!r} is a volatile PID; {inferred_process!r} is stable across runs.")
    if needs_timeout_buffer:
        title = "Extend desktop launch timeout and keep attach-first scope"
        confidence = 0.72 if config.get("attach_if_running") else 0.84
        reason_bits.append(
            "The launch scope is already stable, but the node is still returning Cancelled with no artifact evidence. "
            "This raises the desktop driver timeout to 90 seconds; implementation also expands the workflow node hard timeout so the plugin is not cancelled first."
        )
    if no_windows_for_process and is_vs_code:
        title = "Attach VS Code by window title and force a visible new window"
        confidence = 0.86
        reason_bits.append(
            "The runner found a Code.exe process but pywinauto could not find a top-level window for that process. "
            "VS Code can delegate startup to an existing process, so the process-only fallback is unstable. "
            "This patch keeps the Visual Studio Code window-title scope, removes the process-only fallback, and launches VS Code with --new-window if attach still needs to start it."
        )
    return FixSuggestionResponse(
        id=f"{execution_id}:{workflow_node.node_key}:desktop_launch_config",
        execution_id=execution_id,
        node_key=workflow_node.node_key,
        node_label=execution_node.node_label,
        category="desktop_launch_config",
        title=title,
        rationale=" ".join(reason_bits),
        target_type="workflow_node",
        target_id=workflow_node.id,
        field="config",
        old_value=_display_json(config),
        new_value=_display_json(next_config),
        confidence=confidence,
        can_implement=True,
    )


def _assistant_intent(question: str) -> str:
    text = str(question or "").lower()
    if re.search(r"^(hi+|hii+|hello|hey|yo|good\s+(morning|afternoon|evening))\b", text.strip()):
        return "general"
    if re.search(r"\b(fix|fixes|patch|repair|solve|solution|implement|recommend|recommended|change|apply|heal)\b", text):
        return "fix"
    if re.search(r"\b(error|err|eror|wrror|issue|problem|fail|failed|failure|wrong|actual|happen|happened|root|cause|bug)\b", text):
        return "root_cause"
    if re.search(r"\b(next|rerun|validate|verify|test again)\b", text):
        return "next_steps"
    return "general"


def _assistant_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    try:
        return json.dumps(value, default=str, sort_keys=True)
    except TypeError:
        return str(value)


def _source(label: str, type_: str, value: Any, limit: int = 420) -> AssistantSource:
    text = _assistant_text(value)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = f"{text[:limit].rstrip()}..."
    return AssistantSource(type=type_, label=label, excerpt=text or "No data")


def _assistant_fix_answer(question: str, fixes: list[FixSuggestionResponse], execution: ExecutionModel) -> tuple[str, float]:
    if not fixes:
        return (
            "I do not have an implementable fix from the retrieved DB context yet. "
            "I checked the execution and workflow metadata, but there is no safe patch candidate. "
            "Run Deep Inspect or capture more desktop evidence, then ask again.",
            0.58,
        )
    best = fixes[0]
    lines = [
        "I found fix candidates from the DB-backed inspection context.",
        f"Most recommended: OpenAI 5.5 -> {best.title} ({round(best.confidence * 100)}%).",
        f"Why: {best.rationale}",
        f"Target: {best.target_type.replace('_', ' ')} / {best.field}.",
        f"Current: {best.old_value or 'not set'}",
        f"Proposed: {best.new_value or best.blocked_reason or 'pending evidence'}",
    ]
    if len(fixes) > 1:
        lines.append(f"Claude alternative: {fixes[1].title} ({round(fixes[1].confidence * 100)}%).")
    lines.append(
        "Tell me which candidate to implement, or use the patch button. I will keep the mutation audited."
        if best.can_implement else f"Blocked: {best.blocked_reason or 'not enough evidence to patch automatically.'}"
    )
    return "\n".join(lines), max(best.confidence, 0.72)


def _assistant_root_answer(
    execution: ExecutionModel,
    nodes: list[ExecutionNodeModel],
    fixes: list[FixSuggestionResponse],
    latest_job: IntelligenceJobModel | None,
) -> tuple[str, float]:
    failed = [node for node in nodes if node.status in {"failed", "cancelled"}]
    first = failed[0] if failed else (nodes[0] if nodes else None)
    if fixes and fixes[0].category == "desktop_launch_config":
        return (
            "The failure happened before the recorded desktop interactions ran. "
            "The prerequisite desktop.launch node was cancelled or retried, which caused downstream nodes to skip. "
            "The DB context shows a patchable launch-config issue: use attach_if_running, replace shell-overlay window titles like Snap Assist with the real app window, and prefer a stable process name over a volatile PID.",
            0.9,
        )
    job_result = latest_job.result if latest_job and isinstance(latest_job.result, dict) else {}
    root_cause = job_result.get("root_cause") or job_result.get("summary") if isinstance(job_result, dict) else ""
    if root_cause:
        return str(root_cause), 0.82
    if first:
        detail = first.error or first.output or "No detailed node output was stored."
        return (
            f"The failing node is {first.node_key} ({first.node_type}) with status {first.status}. "
            f"Stored evidence says: {detail}. I would treat this as an execution/config failure until node output proves it is a UI assertion or locator issue.",
            0.7,
        )
    return (
        "I can see the execution record, but there are no failed node details stored yet. "
        "Run or refresh the execution so AI Inspect can retrieve node-level evidence.",
        0.48,
    )


def _assistant_next_answer(fixes: list[FixSuggestionResponse]) -> tuple[str, float]:
    if fixes and fixes[0].can_implement:
        return (
            "Next I would apply the most recommended patch with audit, rerun the same testcase, and confirm the previous failing node completes before checking downstream steps. "
            "If it still fails, inspect the next failed node rather than changing several things at once.",
            0.84,
        )
    return (
        "Next I would run Deep Inspect, review the latest failed node output, confirm whether the failure is config, locator, assertion, or infrastructure, then apply only one safe patch and rerun.",
        0.68,
    )


def _assistant_general_answer(execution: ExecutionModel, fixes: list[FixSuggestionResponse]) -> tuple[str, float]:
    best = fixes[0] if fixes else None
    return (
        "I am online as your test-engineering copilot. I can answer general testing questions, inspect this execution through DB-backed context, explain failures, compare OpenAI 5.5 and Claude-style fix candidates, and hand off implementable patches to the audited fix pipeline. "
        + (f"Current best candidate: {best.title}." if best else "No safe patch is selected yet."),
        0.74,
    )


def _clamp_confidence(value: float) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.7


def _provider_error_status(error: str) -> str:
    text = str(error or "").lower()
    if any(token in text for token in ("quota", "insufficient_quota", "credit", "exhaust", "rate_limit", "429")):
        return "quota_exhausted"
    if any(token in text for token in ("api key", "authentication", "unauthorized", "invalid x-api-key", "401")):
        return "auth_failed"
    if any(token in text for token in ("timeout", "timed out")):
        return "timeout"
    return "failed"


def _provider_status_rows() -> list[AIProviderStatusResponse]:
    has_openai = importlib.util.find_spec("openai") is not None
    has_anthropic = importlib.util.find_spec("anthropic") is not None
    openai_model = _openai_model()
    claude_model = _claude_model()
    return [
        AIProviderStatusResponse(
            provider="openai",
            label="OpenAI",
            model=openai_model,
            configured=bool(settings.openai_api_key),
            package_available=has_openai,
            status="ready" if settings.openai_api_key and has_openai else ("package_missing" if settings.openai_api_key else "not_configured"),
            error=None if settings.openai_api_key and has_openai else ("openai package is not installed" if settings.openai_api_key else "OPENAI_API_KEY is not configured"),
        ),
        AIProviderStatusResponse(
            provider="claude",
            label="Claude",
            model=claude_model,
            configured=bool(settings.anthropic_api_key),
            package_available=has_anthropic,
            status="ready" if settings.anthropic_api_key and has_anthropic else ("package_missing" if settings.anthropic_api_key else "not_configured"),
            error=None if settings.anthropic_api_key and has_anthropic else ("anthropic package is not installed" if settings.anthropic_api_key else "ANTHROPIC_API_KEY is not configured"),
        ),
    ]


def _assistant_provider_candidates(
    preferred_provider: str | None = None,
    preferred_model: str | None = None,
) -> list[tuple[Any, str, str, str]]:
    rows = _provider_status_rows()
    candidates: list[tuple[Any, str, str, str]] = []
    provider_filter = (preferred_provider or "").strip().lower()
    model_override = (preferred_model or "").strip()
    for row in rows:
        if row.status != "ready":
            continue
        if provider_filter and row.provider != provider_filter:
            continue
        if row.provider == "openai":
            model = model_override if model_override and model_override.lower().startswith("gpt") else row.model
            candidates.append((OpenAIProvider(api_key=settings.openai_api_key, model=model), "openai", "OpenAI", model))
        elif row.provider == "claude":
            model = model_override if model_override and "claude" in model_override.lower() else row.model
            candidates.append((ClaudeProvider(api_key=settings.anthropic_api_key, model=model), "claude", "Claude", model))
    return candidates


async def _probe_provider(row: AIProviderStatusResponse) -> AIProviderStatusResponse:
    if row.status != "ready":
        return row
    try:
        provider = (
            OpenAIProvider(api_key=settings.openai_api_key, model=row.model)
            if row.provider == "openai"
            else ClaudeProvider(api_key=settings.anthropic_api_key, model=row.model)
        )
        await asyncio.wait_for(
            provider.generate(
                'Health check. Return exactly this JSON shape with your own wording: {"answer":"provider available","confidence":1,"recommended_fix_id":null}',
                AssistantLLMAnswer,
            ),
            timeout=25,
        )
        row.status = "ok"
        row.error = None
    except asyncio.TimeoutError:
        row.status = "timeout"
        row.error = "Provider health check timed out after 25 seconds."
    except Exception as exc:  # pragma: no cover - provider/network/quota failures vary.
        message = str(exc) or repr(exc)
        row.status = _provider_error_status(message)  # type: ignore[assignment]
        row.error = message
    return row


def _build_assistant_provider() -> tuple[Any, str, str] | None:
    provider = (settings.default_ai_provider or "openai").strip().lower()
    model = (settings.default_ai_model or DEFAULT_OPENAI_MODEL).strip()
    has_openai = importlib.util.find_spec("openai") is not None
    has_anthropic = importlib.util.find_spec("anthropic") is not None

    if provider == "openai" and settings.openai_api_key and has_openai:
        selected_model = model if model.lower().startswith("gpt") else DEFAULT_OPENAI_MODEL
        return OpenAIProvider(api_key=settings.openai_api_key, model=selected_model), "openai", selected_model
    if provider in {"claude", "anthropic"} and settings.anthropic_api_key and has_anthropic:
        selected_model = model if "claude" in model.lower() else _claude_model()
        return ClaudeProvider(api_key=settings.anthropic_api_key, model=selected_model), "anthropic", selected_model

    if settings.openai_api_key and has_openai:
        fallback_model = model if model.lower().startswith("gpt") else DEFAULT_OPENAI_MODEL
        return OpenAIProvider(api_key=settings.openai_api_key, model=fallback_model), "openai", fallback_model
    if settings.anthropic_api_key and has_anthropic:
        fallback_model = model if "claude" in model.lower() else _claude_model()
        return ClaudeProvider(api_key=settings.anthropic_api_key, model=fallback_model), "anthropic", fallback_model
    return None


def _assistant_prompt(
    *,
    question: str,
    intent: str,
    execution: ExecutionModel,
    sources: list[AssistantSource],
    fixes: list[FixSuggestionResponse],
    panels: dict[str, Any],
    fallback_answer: str,
) -> str:
    source_payload = [source.model_dump() for source in sources]
    fix_payload = [fix.model_dump() for fix in fixes[:4]]
    return "\n\n".join([
        "You are CLOP Agent inside the NexCore AI Inspect dashboard.",
        (
            "Act like a senior test automation engineer with full DB context. "
            "Answer naturally and specifically. Use the retrieved context only; if evidence is missing, say what is missing. "
            "Do not repeat a canned help message."
        ),
        (
            "For general questions or greetings, answer like a helpful expert and keep it human. "
            "For root-cause questions, identify the failing node, why it failed, and what evidence supports that. "
            "For fix questions, compare an OpenAI 5.5 recommendation and a Claude alternative, then identify the most recommended fix. "
            "Mention that implementable fixes must use the audited patch action, not direct silent mutation."
        ),
        f"User question:\n{question}",
        f"Detected intent:\n{intent}",
        f"Execution:\n{json.dumps({'id': execution.id, 'status': execution.status, 'platform': execution.platform, 'environment': execution.environment, 'error': execution.error}, default=str, indent=2)}",
        f"Retrieved sources:\n{json.dumps(source_payload, default=str, indent=2)}",
        f"Fix candidates:\n{json.dumps(fix_payload, default=str, indent=2)}",
        f"Panel context:\n{json.dumps(panels, default=str, indent=2)[:12000]}",
        f"Deterministic fallback summary to improve or correct:\n{fallback_answer}",
        (
            "Return JSON only. The answer field may contain short paragraphs or bullets, but no markdown table. "
            "Set recommended_fix_id to the selected fix id, or null if no fix should be selected."
        ),
    ])


async def _assistant_llm_answer(
    *,
    question: str,
    intent: str,
    execution: ExecutionModel,
    sources: list[AssistantSource],
    fixes: list[FixSuggestionResponse],
    panels: dict[str, Any],
    fallback_answer: str,
    preferred_provider: str | None = None,
    preferred_model: str | None = None,
) -> tuple[AssistantLLMAnswer | None, str | None, str | None, str | None, list[dict[str, Any]]]:
    candidates = _assistant_provider_candidates(preferred_provider, preferred_model)
    if not candidates:
        provider_hint = f" for {preferred_provider}" if preferred_provider else ""
        return None, None, None, f"No configured OpenAI or Anthropic provider/package was available{provider_hint}.", [
            row.model_dump() for row in _provider_status_rows()
        ]

    prompt = _assistant_prompt(
        question=question,
        intent=intent,
        execution=execution,
        sources=sources,
        fixes=fixes,
        panels=panels,
        fallback_answer=fallback_answer,
    )

    async def run_candidate(candidate: tuple[Any, str, str, str]) -> tuple[AssistantLLMAnswer | None, dict[str, Any]]:
        provider, provider_name, label, model = candidate
        try:
            result = await asyncio.wait_for(provider.generate(prompt, AssistantLLMAnswer), timeout=45)
            return result, {
                "provider": provider_name,
                "label": label,
                "model": model,
                "status": "ok",
                "confidence": _clamp_confidence(result.confidence),
                "error": None,
            }
        except asyncio.TimeoutError:
            message = "LLM generation timed out after 45 seconds."
            logger.warning("AI Inspect assistant LLM generation failed with %s/%s: %s", provider_name, model, message)
            return None, {
                "provider": provider_name,
                "label": label,
                "model": model,
                "status": "timeout",
                "confidence": 0.0,
                "error": message,
            }
        except Exception as exc:  # pragma: no cover - provider/network failures vary by machine.
            message = str(exc)
            logger.warning("AI Inspect assistant LLM generation failed with %s/%s: %s", provider_name, model, message)
            return None, {
                "provider": provider_name,
                "label": label,
                "model": model,
                "status": _provider_error_status(message),
                "confidence": 0.0,
                "error": message,
            }

    raw_results = await asyncio.gather(*(run_candidate(candidate) for candidate in candidates))
    allowed_ids = {fix.id for fix in fixes}
    provider_results = [item for _answer, item in raw_results]
    successful = [
        (answer, item)
        for answer, item in raw_results
        if answer is not None and item.get("status") == "ok"
    ]
    if not successful:
        joined_errors = "; ".join(f"{item.get('label')}: {item.get('error')}" for item in provider_results)
        return None, None, None, joined_errors or "All configured AI providers failed.", provider_results

    answer, selected = max(
        successful,
        key=lambda pair: (
            _clamp_confidence(pair[0].confidence if pair[0] else 0.0),
            1 if pair[1].get("provider") == "openai" else 0,
        ),
    )
    assert answer is not None
    recommended_fix_id = answer.recommended_fix_id if answer.recommended_fix_id in allowed_ids else None
    if recommended_fix_id is None and fixes and intent == "fix":
        recommended_fix_id = fixes[0].id
    return (
        AssistantLLMAnswer(
            answer=answer.answer.strip(),
            confidence=_clamp_confidence(answer.confidence),
            recommended_fix_id=recommended_fix_id,
        ),
        str(selected.get("provider")),
        str(selected.get("model")),
        None,
        provider_results,
    )


async def _load_test_step(db: AsyncSession, step_id: str) -> TestStepModel | None:
    return await db.scalar(
        select(TestStepModel)
        .where(TestStepModel.id == step_id)
        .options(
            selectinload(TestStepModel.page),
            selectinload(TestStepModel.page_element),
        )
    )


async def _step_for_workflow_node(
    db: AsyncSession,
    workflow_node: WorkflowNodeModel,
) -> TestStepModel | None:
    step_id = (workflow_node.config or {}).get("test_step_id")
    if step_id:
        return await _load_test_step(db, step_id)

    case_id = workflow_node.test_case_id
    if not case_id:
        return None
    match = re.match(r"^tc\d+_s(\d+)_", workflow_node.node_key or "")
    if match:
        step_index = int(match.group(1))
        result = await db.execute(
            select(TestStepModel)
            .where(TestStepModel.test_case_id == case_id, TestStepModel.is_enabled.is_(True))
            .options(
                selectinload(TestStepModel.page),
                selectinload(TestStepModel.page_element),
            )
            .order_by(TestStepModel.step_order.asc(), TestStepModel.created_at.asc())
        )
        steps = list(result.scalars().all())
        if 1 <= step_index <= len(steps):
            return steps[step_index - 1]

    result = await db.execute(
        select(TestStepModel)
        .where(TestStepModel.test_case_id == case_id, TestStepModel.name == workflow_node.label)
        .options(
            selectinload(TestStepModel.page),
            selectinload(TestStepModel.page_element),
        )
        .order_by(TestStepModel.step_order.asc())
    )
    return result.scalar_one_or_none()


def _apply_locator_to_test_step(
    step: TestStepModel,
    *,
    locator: str,
    strategy: str,
    execution_id: str,
    node_key: str,
) -> None:
    clean_locator = _strip_locator_prefix(locator) if strategy == "xpath" else locator
    test_data = dict(step.test_data or {})
    bindings = dict(step.bindings or {})
    web = dict(bindings.get("web") or {})

    test_data.update({
        "path_location": clean_locator,
        "locator": clean_locator,
        "xpath": clean_locator if strategy == "xpath" else test_data.get("xpath", ""),
        "css_selector": clean_locator if strategy == "css" else test_data.get("css_selector", ""),
        "last_ai_fix": {
            "scope": "execution_quick_heal",
            "execution_id": execution_id,
            "node_key": node_key,
            "locator": clean_locator,
            "strategy": strategy,
        },
    })
    web.update({
        "selector": clean_locator,
        "xpath": clean_locator if strategy == "xpath" else web.get("xpath", ""),
        "css_selector": clean_locator if strategy == "css" else web.get("css_selector", ""),
        "last_ai_fix": {
            "scope": "execution_quick_heal",
            "execution_id": execution_id,
            "node_key": node_key,
            "locator": clean_locator,
            "strategy": strategy,
        },
    })
    bindings["web"] = web

    step.target = clean_locator
    step.test_data = test_data
    step.bindings = bindings


def _remember_previous_locator(element: PageElementModel, old_value: str, field: str) -> None:
    old_locator = _strip_locator_prefix(old_value)
    if not old_locator:
        return
    strategy = "xpath" if field == "xpath" else "css"
    alternatives = [dict(item) for item in (element.alternative_locators or []) if isinstance(item, dict)]
    if not any(_same_locator(str(item.get("locator") or item.get("selector") or ""), old_locator) for item in alternatives):
        alternatives.append({
            "strategy": strategy,
            "locator": old_locator,
            "score": 0.55,
            "reason": "Previous locator retained after execution quick heal.",
        })
    element.alternative_locators = alternatives


async def _refresh_workflow_nodes_for_steps(db: AsyncSession, step_ids: set[str]) -> int:
    if not step_ids:
        return 0
    from app.api.routes.executions import _node_type_and_config

    steps = (
        await db.scalars(
            select(TestStepModel)
            .where(TestStepModel.id.in_(step_ids))
            .options(
                selectinload(TestStepModel.page),
                selectinload(TestStepModel.page_element),
            )
        )
    ).all()
    by_id = {step.id: step for step in steps}
    case_ids = {step.test_case_id for step in steps if step.test_case_id}
    if not case_ids:
        return 0
    nodes = (
        await db.scalars(
            select(WorkflowNodeModel).where(WorkflowNodeModel.test_case_id.in_(case_ids))
        )
    ).all()
    refreshed = 0
    for node in nodes:
        step_id = (node.config or {}).get("test_step_id")
        step = by_id.get(step_id)
        if step is None:
            continue
        node_type, config = _node_type_and_config(step)
        config = {
            **config,
            "test_step_id": step.id,
            "page_id": step.page_id,
            "page_element_id": step.page_element_id,
        }
        if node.type != node_type or node.config != config or node.label != step.name:
            node.type = node_type
            node.label = step.name or node.label
            node.description = step.description or step.expected_result or ""
            node.config = config
            refreshed += 1
    return refreshed


async def _build_fix_suggestion(
    db: AsyncSession,
    execution_id: str,
    node_key: str,
) -> FixSuggestionResponse | None:
    execution = await db.get(ExecutionModel, execution_id)
    if execution is None:
        raise HTTPException(status_code=404, detail="Execution not found")

    result = await db.execute(
        select(ExecutionNodeModel).where(
            ExecutionNodeModel.execution_id == execution_id,
            ExecutionNodeModel.node_key == node_key,
        )
    )
    execution_node = result.scalar_one_or_none()
    if execution_node is None:
        raise HTTPException(status_code=404, detail="Execution node not found")

    result = await db.execute(
        select(WorkflowNodeModel).where(
            WorkflowNodeModel.workflow_id == execution.workflow_id,
            WorkflowNodeModel.node_key == node_key,
        )
    )
    workflow_node = result.scalar_one_or_none()
    if workflow_node is None:
        return None

    desktop_config_suggestion = _desktop_launch_config_suggestion(execution_id, execution_node, workflow_node)
    if desktop_config_suggestion is not None:
        return desktop_config_suggestion

    if not _is_quick_heal_scope(execution_node, workflow_node):
        return None

    if await _execution_navigation_block_reason(db, execution_id):
        return None

    config = workflow_node.config or {}
    old_selector = str(config.get("selector") or "")
    step = await _step_for_workflow_node(db, workflow_node)
    if step is None:
        return None

    element = await db.get(PageElementModel, step.page_element_id) if step.page_element_id else None
    if element is not None:
        old_value = _selector_from_element(element) or old_selector
        candidate = _runtime_healed_locator(execution_node, old_value) or _candidate_locator(element, old_value)
        if candidate is None:
            return FixSuggestionResponse(
                id=f"{execution_id}:{node_key}:page_element",
                execution_id=execution_id,
                node_key=node_key,
                node_label=execution_node.node_label,
                title="Run page discovery before quick heal",
                rationale=(
                    "This looks like a minor locator or element issue, but no verified "
                    "alternative locator is stored for the linked Page Repository element yet."
                ),
                target_type="page_element",
                target_id=element.id,
                field=element.locator_strategy or "locator",
                old_value=old_value,
                new_value="",
                confidence=0.45,
                can_implement=False,
                blocked_reason="No alternative locator is available in the Page Repository.",
            )
        strategy, locator, confidence, reason = candidate
        field = "xpath" if strategy == "xpath" else "css_selector"
        return FixSuggestionResponse(
            id=f"{execution_id}:{node_key}:page_element",
            execution_id=execution_id,
            node_key=node_key,
            node_label=execution_node.node_label,
            title="Promote verified Page Repository locator",
            rationale=f"{reason} This updates the shared page element, then syncs every linked test step.",
            target_type="page_element",
            target_id=element.id,
            field=field,
            old_value=old_value,
            new_value=locator,
            confidence=confidence,
            can_implement=True,
        )

    old_value = old_selector or str((step.bindings or {}).get("web", {}).get("selector") or step.target or "")
    candidate = _runtime_healed_locator(execution_node, old_value) or _candidate_from_locators(
        config.get("locators"),
        old_value,
        "Alternative locator captured in the execution node config.",
    )
    if old_value and candidate is not None:
        strategy, locator, confidence, reason = candidate
        field = "test_data.xpath" if strategy == "xpath" else "test_data.css_selector"
        return FixSuggestionResponse(
            id=f"{execution_id}:{node_key}:test_step",
            execution_id=execution_id,
            node_key=node_key,
            node_label=execution_node.node_label,
            title="Update inline test step locator",
            rationale=f"{reason} This step is not linked to a Page Repository element, so only this test step is updated.",
            target_type="test_step",
            target_id=step.id,
            field=field,
            old_value=old_value,
            new_value=locator,
            confidence=confidence,
            can_implement=True,
        )
    return None


# ── Routes ─────────────────────────────────────────────────────────────────────

async def _collect_fix_suggestions(db: AsyncSession, execution_id: str) -> list[FixSuggestionResponse]:
    execution = await db.get(ExecutionModel, execution_id)
    if execution is None:
        raise HTTPException(status_code=404, detail="Execution not found")
    result = await db.execute(
        select(ExecutionNodeModel)
        .where(ExecutionNodeModel.execution_id == execution_id)
        .order_by(ExecutionNodeModel.started_at.asc())
    )
    suggestions: list[FixSuggestionResponse] = []
    seen: set[str] = set()
    for node in result.scalars().all():
        if node.status not in {"failed", "cancelled"} and not _has_runtime_heal(node):
            continue
        suggestion = await _build_fix_suggestion(db, execution_id, node.node_key)
        if suggestion is not None and suggestion.id not in seen:
            seen.add(suggestion.id)
            suggestions.append(suggestion)
    return sorted(suggestions, key=lambda item: (item.can_implement, item.confidence), reverse=True)


@router.get("/providers/status", response_model=list[AIProviderStatusResponse])
async def get_ai_provider_status(probe: bool = False) -> list[AIProviderStatusResponse]:
    """Return OpenAI/Claude availability, optionally doing a live low-cost probe."""
    rows = _provider_status_rows()
    if not probe:
        return rows
    return list(await asyncio.gather(*(_probe_provider(row) for row in rows)))


@router.get("/executions/{execution_id}")
async def get_heuristic_analysis(
    execution_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the deterministic heuristic analysis for an execution (no AI)."""
    analyzer = ExecutionIntelligenceAnalyzer(db)
    analysis = await analyzer.analyze(execution_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Execution not found")
    return analysis


@router.get("/executions/{execution_id}/fix-suggestions", response_model=list[FixSuggestionResponse])
async def get_fix_suggestions(
    execution_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[FixSuggestionResponse]:
    """Return minor locator/element quick-heal fixes for the execution panel."""
    return await _collect_fix_suggestions(db, execution_id)


@router.post("/executions/{execution_id}/assistant-query", response_model=AssistantQueryResponse)
async def query_ai_inspect_assistant(
    execution_id: str,
    body: AssistantQueryRequest,
    db: AsyncSession = Depends(get_db),
) -> AssistantQueryResponse:
    """Answer AI Inspect console questions using execution/workflow DB context."""
    execution = await db.get(ExecutionModel, execution_id)
    if execution is None:
        raise HTTPException(status_code=404, detail="Execution not found")

    nodes = (
        await db.scalars(
            select(ExecutionNodeModel)
            .where(ExecutionNodeModel.execution_id == execution_id)
            .order_by(ExecutionNodeModel.started_at.asc())
        )
    ).all()
    workflow_nodes = (
        await db.scalars(
            select(WorkflowNodeModel)
            .where(WorkflowNodeModel.workflow_id == execution.workflow_id)
            .order_by(WorkflowNodeModel.node_key.asc())
        )
    ).all()
    latest_job = await db.scalar(
        select(IntelligenceJobModel)
        .where(IntelligenceJobModel.execution_id == execution_id)
        .order_by(IntelligenceJobModel.created_at.desc())
    )
    fixes = await _collect_fix_suggestions(db, execution_id)

    intent = _assistant_intent(body.question)
    if intent == "fix":
        answer, confidence = _assistant_fix_answer(body.question, fixes, execution)
    elif intent == "root_cause":
        answer, confidence = _assistant_root_answer(execution, list(nodes), fixes, latest_job)
    elif intent == "next_steps":
        answer, confidence = _assistant_next_answer(fixes)
    else:
        answer, confidence = _assistant_general_answer(execution, fixes)

    failed_nodes = [node for node in nodes if node.status in {"failed", "cancelled"}]
    source_rows: list[AssistantSource] = [
        _source(
            "Execution",
            "execution",
            {
                "status": execution.status,
                "platform": execution.platform,
                "environment": execution.environment,
                "error": execution.error,
                "workflow_id": execution.workflow_id,
            },
        )
    ]
    source_rows.extend(
        _source(
            f"Execution node {node.node_key}",
            "execution_node",
            {
                "label": node.node_label,
                "type": node.node_type,
                "status": node.status,
                "attempts": node.attempt_count,
                "error": node.error,
                "output": node.output,
            },
            limit=500,
        )
        for node in failed_nodes[:3]
    )
    source_rows.extend(
        _source(
            f"Workflow node {node.node_key}",
            "workflow_node",
            {
                "label": node.label,
                "type": node.type,
                "config": node.config,
            },
            limit=500,
        )
        for node in workflow_nodes[:5]
    )
    if latest_job is not None:
        source_rows.append(
            _source(
                "Latest AI job",
                "intelligence_job",
                {
                    "status": latest_job.status,
                    "current_step": latest_job.current_step,
                    "error": latest_job.error,
                    "result": latest_job.result,
                },
            )
        )
    if fixes:
        source_rows.append(_source("Recommended fix", "fix_suggestion", fixes[0].model_dump(), limit=540))

    panels = {
        "rag_scope": [
            "executions",
            "execution_nodes",
            "workflow_nodes",
            "intelligence_jobs",
            "fix_suggestions",
        ],
        "execution": {
            "id": execution.id,
            "status": execution.status,
            "platform": execution.platform,
            "environment": execution.environment,
            "error": execution.error,
        },
        "failed_nodes": [
            {
                "node_key": node.node_key,
                "label": node.node_label,
                "type": node.node_type,
                "status": node.status,
                "attempts": node.attempt_count,
                "error": node.error,
            }
            for node in failed_nodes[:6]
        ],
        "workflow_context": [
            {
                "node_key": node.node_key,
                "label": node.label,
                "type": node.type,
                "config": node.config,
            }
            for node in workflow_nodes[:8]
        ],
        "fix_count": len(fixes),
        "recommended_fix_id": fixes[0].id if fixes else None,
        "latest_job": {
            "id": latest_job.id,
            "status": latest_job.status,
            "progress": latest_job.progress,
            "current_step": latest_job.current_step,
            "error": latest_job.error,
        } if latest_job else None,
    }

    answer_source: Literal["llm", "fallback"] = "fallback"
    provider_name: str | None = None
    model_name: str | None = None
    llm_error: str | None = None
    provider_results: list[dict[str, Any]] = []
    recommended_fix_id = fixes[0].id if fixes else None
    llm_answer, provider_name, model_name, llm_error, provider_results = await _assistant_llm_answer(
        question=body.question,
        intent=intent,
        execution=execution,
        sources=source_rows,
        fixes=fixes,
        panels=panels,
        fallback_answer=answer,
        preferred_provider=body.preferred_provider,
        preferred_model=body.preferred_model,
    )
    if llm_answer is not None:
        answer = llm_answer.answer or answer
        confidence = llm_answer.confidence
        recommended_fix_id = llm_answer.recommended_fix_id or recommended_fix_id
        answer_source = "llm"

    panels["assistant_generation"] = {
        "answer_source": answer_source,
        "provider": provider_name,
        "model": model_name,
        "llm_error": llm_error,
        "provider_results": provider_results,
    }

    return AssistantQueryResponse(
        answer=answer,
        intent=intent,
        confidence=confidence,
        sources=source_rows,
        fixes=fixes,
        recommended_fix_id=recommended_fix_id,
        panels=panels,
        answer_source=answer_source,
        provider=provider_name,
        model=model_name,
        llm_error=llm_error,
        provider_results=provider_results,
    )


@router.post(
    "/executions/{execution_id}/fix-suggestions/{node_key}/implement",
    response_model=ImplementFixResponse,
)
async def implement_fix_suggestion(
    execution_id: str,
    node_key: str,
    db: AsyncSession = Depends(get_db),
) -> ImplementFixResponse:
    """Apply a reviewed fix suggestion to Page Repository or Test Configuration."""
    suggestion = await _build_fix_suggestion(db, execution_id, node_key)
    if suggestion is None:
        raise HTTPException(status_code=404, detail="No fix suggestion found for this node")
    if not suggestion.can_implement:
        raise HTTPException(status_code=409, detail=suggestion.blocked_reason or "Suggestion is not implementable")

    changed: dict[str, Any] = {
        "target_type": suggestion.target_type,
        "target_id": suggestion.target_id,
        "field": suggestion.field,
        "old_value": suggestion.old_value,
        "new_value": suggestion.new_value,
    }
    if suggestion.target_type == "workflow_node":
        node = await db.get(WorkflowNodeModel, suggestion.target_id)
        if node is None:
            raise HTTPException(status_code=404, detail="Workflow node not found")
        try:
            next_config = json.loads(suggestion.new_value)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail="Generated config patch is invalid JSON") from exc
        if not isinstance(next_config, dict):
            raise HTTPException(status_code=500, detail="Generated config patch must be a JSON object")
        node.config = next_config
        try:
            timeout_ms = int(float(next_config.get("timeout_ms") or 0))
        except (TypeError, ValueError):
            timeout_ms = 0
        if timeout_ms >= 90000:
            next_timeout_seconds = max(int(node.timeout_seconds or 0), int((timeout_ms + 999) // 1000) + 30)
            if next_timeout_seconds != node.timeout_seconds:
                changed["old_timeout_seconds"] = node.timeout_seconds
                changed["new_timeout_seconds"] = next_timeout_seconds
                node.timeout_seconds = next_timeout_seconds
        changed["refreshed_workflow_nodes"] = 1
    elif suggestion.target_type == "page_element":
        element = await db.get(PageElementModel, suggestion.target_id)
        if element is None:
            raise HTTPException(status_code=404, detail="Page element not found")
        _remember_previous_locator(element, suggestion.old_value, suggestion.field)
        if suggestion.field == "xpath":
            element.xpath = _strip_locator_prefix(suggestion.new_value)
            element.locator_strategy = "xpath"
        else:
            element.css_selector = suggestion.new_value
            element.locator_strategy = "css"
        metadata = dict(element.discovery_metadata or {})
        metadata["last_ai_fix"] = {
            "scope": "execution_quick_heal",
            "execution_id": execution_id,
            "node_key": node_key,
            "old_value": suggestion.old_value,
            "new_value": suggestion.new_value,
        }
        element.discovery_metadata = metadata
        synced_count = await _sync_test_steps_for_element(element, db)
        step_ids = set(
            (await db.scalars(
                select(TestStepModel.id).where(TestStepModel.page_element_id == element.id)
            )).all()
        )
        refreshed_count = await _refresh_workflow_nodes_for_steps(db, step_ids)
        changed["synced_test_steps"] = synced_count
        changed["refreshed_workflow_nodes"] = refreshed_count
    else:
        step = await _load_test_step(db, suggestion.target_id)
        if step is None:
            raise HTTPException(status_code=404, detail="Test step not found")
        strategy = "xpath" if suggestion.field.endswith("xpath") else "css"
        _apply_locator_to_test_step(
            step,
            locator=suggestion.new_value,
            strategy=strategy,
            execution_id=execution_id,
            node_key=node_key,
        )
        refreshed_count = await _refresh_workflow_nodes_for_steps(db, {step.id})
        changed["synced_test_steps"] = 1
        changed["refreshed_workflow_nodes"] = refreshed_count
    await db.commit()
    return ImplementFixResponse(applied=True, suggestion=suggestion, changed=changed)


@router.post("/executions/{execution_id}/analyze", status_code=202)
async def trigger_ai_analysis(
    execution_id: str,
    body: AnalyzeRequest = Body(default=AnalyzeRequest()),
    db: AsyncSession = Depends(get_db),
) -> JobStatusResponse:
    """Submit an AI analysis job for the given execution.

    Returns immediately with status ``queued``; progress is streamed to
    WebSocket clients subscribed to the execution room as ``AIJobProgress``
    and ``AIJobCompleted`` events.
    """
    from app.database.models import ExecutionModel
    from app.events.bus import get_event_bus
    from app.events.types import AIJobQueued
    from app.intelligence.evidence_builder import build_evidence_bundle
    from app.intelligence.job_dispatcher import enqueue_ai_job

    # Validate execution exists
    r = await db.execute(
        select(ExecutionModel).where(ExecutionModel.id == execution_id)
    )
    if r.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail=f"Execution {execution_id!r} not found")

    # Build evidence snapshot at submission time so results are reproducible
    try:
        evidence = await build_evidence_bundle(execution_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    # Persist job record
    job_id = str(uuid.uuid4())
    job = IntelligenceJobModel(
        id=job_id,
        tenant_id=body.tenant_id,
        execution_id=execution_id,
        job_type=body.job_type,
        status="queued",
        evidence=evidence,
        progress=0.0,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Notify WebSocket subscribers that a job was queued
    await get_event_bus().publish(AIJobQueued(
        job_id=job_id,
        execution_id=execution_id,
        job_type=body.job_type,
        tenant_id=body.tenant_id,
    ))

    # Launch background task — streams AIJobProgress + AIJobCompleted events
    enqueue_ai_job(
        job_id=job_id,
        job_type=body.job_type,
        tenant_id=body.tenant_id,
        execution_id=execution_id,
        evidence=evidence,
    )

    return _job_to_response(job)


@router.get("/executions/{execution_id}/jobs")
async def list_jobs_for_execution(
    execution_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[JobStatusResponse]:
    """List all AI jobs submitted for a given execution, newest first."""
    r = await db.execute(
        select(IntelligenceJobModel)
        .where(IntelligenceJobModel.execution_id == execution_id)
        .order_by(IntelligenceJobModel.created_at.desc())
    )
    jobs = r.scalars().all()
    return [_job_to_response(j) for j in jobs]


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
) -> JobStatusResponse:
    """Poll a single job for status, progress, and result."""
    job = await db.get(IntelligenceJobModel, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
    return _job_to_response(job)


@router.delete("/jobs/{job_id}", status_code=200)
async def cancel_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Cancel a queued job before it starts.  Running jobs cannot be cancelled."""
    job = await db.get(IntelligenceJobModel, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
    if job.status != "queued":
        raise HTTPException(
            status_code=409,
            detail=f"Job is {job.status!r} — only queued jobs can be cancelled",
        )
    job.status = "cancelled"
    await db.commit()
    return {"cancelled": job_id}
