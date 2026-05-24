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

from app.database.models import (
    ExecutionModel,
    ExecutionNodeModel,
    IntelligenceJobModel,
    PageElementModel,
    TestStepModel,
    WorkflowNodeModel,
)
from app.database.session import get_db
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


def _candidate_locator(element: PageElementModel, old_value: str) -> tuple[str, str, float, str] | None:
    alternatives = element.alternative_locators or []
    ranked = sorted(
        [item for item in alternatives if isinstance(item, dict)],
        key=lambda item: float(item.get("score") or item.get("confidence") or 0),
        reverse=True,
    )
    for item in ranked:
        locator = str(item.get("locator") or item.get("selector") or item.get("value") or "").strip()
        if not locator or locator == old_value:
            continue
        strategy = str(item.get("strategy") or "css").strip().lower()
        confidence = float(item.get("score") or item.get("confidence") or 0.75)
        reason = str(item.get("reason") or "Alternative locator captured during page discovery.")
        return strategy, locator, min(max(confidence, 0.0), 1.0), reason
    return None


async def _step_for_workflow_node(
    db: AsyncSession,
    workflow_node: WorkflowNodeModel,
) -> TestStepModel | None:
    step_id = (workflow_node.config or {}).get("test_step_id")
    if step_id:
        return await db.get(TestStepModel, step_id)

    case_id = workflow_node.test_case_id
    if not case_id:
        return None
    match = re.match(r"^tc\d+_s(\d+)_", workflow_node.node_key or "")
    if match:
        step_index = int(match.group(1))
        result = await db.execute(
            select(TestStepModel)
            .where(TestStepModel.test_case_id == case_id, TestStepModel.is_enabled.is_(True))
            .order_by(TestStepModel.step_order.asc(), TestStepModel.created_at.asc())
        )
        steps = list(result.scalars().all())
        if 1 <= step_index <= len(steps):
            return steps[step_index - 1]

    result = await db.execute(
        select(TestStepModel)
        .where(TestStepModel.test_case_id == case_id, TestStepModel.name == workflow_node.label)
        .order_by(TestStepModel.step_order.asc())
    )
    return result.scalar_one_or_none()


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

    config = workflow_node.config or {}
    old_selector = str(config.get("selector") or "")
    step = await _step_for_workflow_node(db, workflow_node)
    if step is None:
        return None

    element = await db.get(PageElementModel, step.page_element_id) if step.page_element_id else None
    if element is not None:
        old_value = old_selector or _selector_from_element(element)
        candidate = _candidate_locator(element, old_value)
        if candidate is None:
            return FixSuggestionResponse(
                id=f"{execution_id}:{node_key}:page_element",
                execution_id=execution_id,
                node_key=node_key,
                node_label=execution_node.node_label,
                title="Refresh this page element locator",
                rationale=(
                    "The failed node is backed by a Page Repository element, but no verified "
                    "alternative locator is stored yet. Re-run page discovery for this page, "
                    "then implement the newly verified locator."
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
            title="Update Page Repository locator",
            rationale=f"{reason} This changes the shared page element used by the failed test step.",
            target_type="page_element",
            target_id=element.id,
            field=field,
            old_value=old_value,
            new_value=locator,
            confidence=confidence,
            can_implement=True,
        )

    old_value = old_selector or step.target or str((step.bindings or {}).get("web", {}).get("selector") or "")
    if old_value:
        return FixSuggestionResponse(
            id=f"{execution_id}:{node_key}:test_step",
            execution_id=execution_id,
            node_key=node_key,
            node_label=execution_node.node_label,
            title="Move selector into editable test step config",
            rationale=(
                "The failed node uses an inline selector without a linked page element. "
                "The implement action will persist that selector on the test step bindings "
                "so it can be edited and improved from Test Configuration."
            ),
            target_type="test_step",
            target_id=step.id,
            field="bindings.web.selector",
            old_value=str((step.bindings or {}).get("web", {}).get("selector") or step.target or ""),
            new_value=old_value,
            confidence=0.6,
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
    """Return implementable fixes inferred from failed nodes and persisted config."""
    execution = await db.get(ExecutionModel, execution_id)
    if execution is None:
        raise HTTPException(status_code=404, detail="Execution not found")
    result = await db.execute(
        select(ExecutionNodeModel)
        .where(ExecutionNodeModel.execution_id == execution_id, ExecutionNodeModel.status == "failed")
        .order_by(ExecutionNodeModel.started_at.asc())
    )
    suggestions: list[FixSuggestionResponse] = []
    for node in result.scalars().all():
        suggestion = await _build_fix_suggestion(db, execution_id, node.node_key)
        if suggestion is not None:
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
        if suggestion.field == "xpath":
            element.xpath = suggestion.new_value.replace("xpath=", "", 1)
            element.locator_strategy = "xpath"
        else:
            element.css_selector = suggestion.new_value
            element.locator_strategy = "css"
        metadata = dict(element.discovery_metadata or {})
        metadata["last_ai_fix"] = {
            "execution_id": execution_id,
            "node_key": node_key,
            "old_value": suggestion.old_value,
            "new_value": suggestion.new_value,
        }
        element.discovery_metadata = metadata
    else:
        step = await db.get(TestStepModel, suggestion.target_id)
        if step is None:
            raise HTTPException(status_code=404, detail="Test step not found")
        bindings = dict(step.bindings or {})
        web = dict(bindings.get("web") or {})
        web["selector"] = suggestion.new_value
        bindings["web"] = web
        step.bindings = bindings
        step.target = suggestion.new_value
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
