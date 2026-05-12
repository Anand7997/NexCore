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

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import IntelligenceJobModel
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
