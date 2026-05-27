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

import re
import uuid
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
from app.intelligence.analyzer import ExecutionIntelligenceAnalyzer

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


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
    category: Literal["minor_locator", "minor_element"] = "minor_locator"
    title: str
    rationale: str
    target_type: Literal["page_element", "test_step"]
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
        if node.status != "failed" and not _has_runtime_heal(node):
            continue
        suggestion = await _build_fix_suggestion(db, execution_id, node.node_key)
        if suggestion is not None and suggestion.id not in seen:
            seen.add(suggestion.id)
            suggestions.append(suggestion)
    return suggestions


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
    if suggestion.target_type == "page_element":
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
