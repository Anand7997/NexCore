"""In-process AI job dispatcher.

Runs LangGraph RCA workflows as asyncio background tasks and streams granular
progress to WebSocket clients via the event bus — no NATS server required.

Architecture
------------
  POST /intelligence/executions/{id}/analyze
        │
        ├─ build_evidence_bundle()          ← snapshot of execution state
        ├─ insert IntelligenceJobModel      ← queued
        ├─ publish AIJobQueued event        ← frontend shows spinner
        └─ asyncio.create_task(dispatch_ai_job(...))
                │
                ├─ update job → running
                ├─ run_rca_streaming()
                │       └─ on_node_complete() → AIJobProgress event  ← frontend progress bar
                ├─ update job → completed + store result
                ├─ persist FailureMemoryRecord to Qdrant
                └─ publish AIJobCompleted event  ← frontend shows panel

The NATS-based path (ai_job_runner.py) remains available for production
multi-process deployments; this module handles single-process / dev mode.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

# Fractional progress emitted after each LangGraph node completes.
_NODE_PROGRESS: dict[str, float] = {
    "gather_evidence":          0.15,
    "classify_failure":         0.30,
    "retrieve_memory":          0.48,
    "analyze_root_cause":       0.68,
    "generate_recommendations": 0.85,
    "validate_results":         0.96,
}


async def dispatch_ai_job(
    job_id: str,
    job_type: str,
    tenant_id: str,
    execution_id: str,
    evidence: dict[str, Any],
) -> None:
    """Run one AI job end-to-end, streaming progress via the event bus.

    Designed to be launched with ``asyncio.create_task()``.  All exceptions
    are caught and persisted to the job record so the task never raises.
    """
    from app.database.models import IntelligenceJobModel
    from app.database.session import AsyncSessionLocal
    from app.events.bus import get_event_bus
    from app.events.types import AIJobCompleted, AIJobProgress

    bus = get_event_bus()

    # ── Mark running ─────────────────────────────────────────────────────────
    async with AsyncSessionLocal() as db:
        job = await db.get(IntelligenceJobModel, job_id)
        if job:
            job.status = "running"
            job.started_at = datetime.utcnow()
            await db.commit()

    # ── Progress callback (called once per LangGraph node) ───────────────────
    async def on_node(node_name: str, delta: dict[str, Any]) -> None:
        progress = _NODE_PROGRESS.get(node_name, 0.5)
        steps: list[str] = delta.get("analysis_steps") or []
        detail = steps[-1] if steps else node_name.replace("_", " ").title()

        await bus.publish(AIJobProgress(
            job_id=job_id,
            execution_id=execution_id,
            step=node_name,
            progress=progress,
            detail=detail,
        ))

        # Keep the DB row live so polling clients see incremental updates.
        async with AsyncSessionLocal() as db:
            job = await db.get(IntelligenceJobModel, job_id)
            if job:
                job.progress = progress
                job.current_step = node_name
                await db.commit()

    # ── Run LangGraph RCA ─────────────────────────────────────────────────────
    try:
        from app.intelligence.langgraph_rca import run_rca_streaming
        state = await run_rca_streaming(
            job_id=job_id,
            job_type=job_type,
            tenant_id=tenant_id,
            evidence=evidence,
            on_node_complete=on_node,
        )

        result: dict[str, Any] = {
            "confidence":      state.get("confidence", 0.5),
            "summary":         state.get("summary", ""),
            "findings":        state.get("findings", []),
            "recommendations": state.get("recommendations", []),
            "analysis_steps":  state.get("analysis_steps", []),
            "failure_class":   state.get("failure_class", "unknown_failure"),
            "root_cause":      state.get("root_cause", ""),
            "similar_failures":state.get("similar_failures", []),
            "provider_results":state.get("provider_results", []),
        }

        # ── Persist result ────────────────────────────────────────────────────
        async with AsyncSessionLocal() as db:
            job = await db.get(IntelligenceJobModel, job_id)
            if job:
                job.status = "completed"
                job.result = result
                job.progress = 1.0
                job.current_step = "completed"
                job.completed_at = datetime.utcnow()
                await db.commit()

        # ── Store in Qdrant failure memory ────────────────────────────────────
        if state.get("findings") and (state.get("confidence") or 0.0) > 0.4:
            try:
                from app.worker_runtime.ai_worker import AiWorker
                from app.worker_runtime.contracts import WorkerJob
                worker_job = WorkerJob(
                    id=job_id,
                    tenant_id=tenant_id,
                    type=job_type,  # type: ignore[arg-type]
                    evidence=evidence,
                )
                await AiWorker()._persist_failure_memory(worker_job, state)
            except Exception as exc:
                logger.warning("Qdrant memory persist failed for job %s: %s", job_id, exc)

        # ── Broadcast completion ──────────────────────────────────────────────
        await bus.publish(AIJobCompleted(
            job_id=job_id,
            execution_id=execution_id,
            job_type=job_type,
            confidence=result["confidence"],
            summary=result["summary"],
            findings=result["findings"],
            recommendations=result["recommendations"],
        ))
        logger.info(
            "AI job %s completed  type=%s confidence=%.2f findings=%d",
            job_id, job_type, result["confidence"], len(result["findings"]),
        )

    except Exception as exc:
        logger.exception("AI job %s failed: %s", job_id, exc)
        async with AsyncSessionLocal() as db:
            job = await db.get(IntelligenceJobModel, job_id)
            if job:
                job.status = "failed"
                job.error = str(exc)
                job.completed_at = datetime.utcnow()
                await db.commit()

        await bus.publish(AIJobProgress(
            job_id=job_id,
            execution_id=execution_id,
            step="failed",
            progress=1.0,
            detail=f"Analysis failed: {exc}",
        ))


def enqueue_ai_job(
    job_id: str,
    job_type: str,
    tenant_id: str,
    execution_id: str,
    evidence: dict[str, Any],
) -> asyncio.Task[None]:
    """Schedule ``dispatch_ai_job`` as a background asyncio task and return it."""
    return asyncio.create_task(
        dispatch_ai_job(job_id, job_type, tenant_id, execution_id, evidence),
        name=f"ai-job-{job_id}",
    )
