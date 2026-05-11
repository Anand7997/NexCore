"""AI Worker — routes jobs to LangGraph workflows and persists results to memory.

Supported job types (routed to LangGraph RCA graph):
  root_cause_analysis, flaky_detection, locator_healing,
  anomaly_analysis, execution_summary
"""
from __future__ import annotations

import logging
from typing import Any

from app.worker_runtime.contracts import WorkerJob, WorkerResult

logger = logging.getLogger(__name__)

# Job types handled by the LangGraph RCA workflow
_RCA_JOB_TYPES = frozenset({
    "root_cause_analysis",
    "flaky_detection",
    "locator_healing",
    "anomaly_analysis",
    "execution_summary",
})


class AiWorker:
    """Routes AI jobs to appropriate LangGraph workflows."""

    async def handle(self, job: WorkerJob) -> WorkerResult:
        if job.policy.get("allow_workflow_mutation"):
            return WorkerResult(
                job_id=job.id,
                status="failed",
                confidence=0.0,
                summary="Rejected: Python workers cannot mutate workflow state.",
                findings=[],
                recommendations=[],
            )

        if job.type in _RCA_JOB_TYPES:
            return await self._run_rca(job)
        return await self._fallback(job)

    # ── LangGraph RCA ─────────────────────────────────────────────────────────

    async def _run_rca(self, job: WorkerJob) -> WorkerResult:
        from app.intelligence.langgraph_rca import run_rca
        try:
            state = await run_rca(
                job_id=job.id,
                job_type=job.type,
                tenant_id=job.tenant_id,
                evidence=job.evidence,
            )
        except Exception as exc:
            logger.exception("LangGraph RCA failed for job %s: %s", job.id, exc)
            return WorkerResult(
                job_id=job.id,
                status="failed",
                confidence=0.0,
                summary=f"RCA workflow error: {exc!s}",
                findings=[{"type": "workflow_error", "detail": str(exc)}],
                recommendations=[],
            )

        # Persist analysis to failure memory for future similarity retrieval
        if state.get("findings") and (state.get("confidence") or 0) > 0.4:
            await self._persist_failure_memory(job, state)

        return WorkerResult(
            job_id=job.id,
            status="completed",
            confidence=state.get("confidence", 0.5),
            summary=state.get("summary", "Analysis complete"),
            findings=state.get("findings", []),
            recommendations=state.get("recommendations", []),
            artifacts=state.get("artifacts", []),
        )

    # ── Persistence ───────────────────────────────────────────────────────────

    async def _persist_failure_memory(self, job: WorkerJob, state: dict[str, Any]) -> None:
        try:
            from app.intelligence.memory import FailureMemoryRecord, get_memory_store
            record = FailureMemoryRecord(
                execution_id=state.get("execution_id") or job.evidence.get("executionId", ""),
                tenant_id=job.tenant_id,
                workflow_id=job.evidence.get("workflowId", ""),
                node_type=job.type,
                error_summary=(state.get("root_cause") or "")[:500],
                root_cause_type=state.get("failure_class", "unknown"),
                confidence=state.get("confidence", 0.5),
                recommendations=state.get("recommendations", []),
            )
            await get_memory_store().store_failure(record)
            # Also persist the full investigation for cross-job retrieval
            investigation = {
                "job_id": job.id,
                "job_type": job.type,
                "tenant_id": job.tenant_id,
                "execution_id": record.execution_id,
                "summary": state.get("summary", ""),
                "root_cause": state.get("root_cause", ""),
                "confidence": state.get("confidence", 0.5),
                "findings": state.get("findings", []),
                "recommendations": state.get("recommendations", []),
            }
            await get_memory_store().store_investigation(investigation)
        except Exception as exc:
            logger.warning("Failed to persist failure memory for job %s: %s", job.id, exc)

    # ── Fallback ──────────────────────────────────────────────────────────────

    async def _fallback(self, job: WorkerJob) -> WorkerResult:
        return WorkerResult(
            job_id=job.id,
            status="completed",
            confidence=0.3,
            summary=f"Job type '{job.type}' has no dedicated workflow yet.",
            findings=[{"type": "unhandled_job_type", "job_type": job.type}],
            recommendations=[{
                "type": "implement",
                "action": f"Add a dedicated LangGraph handler for job type: {job.type}",
            }],
        )
