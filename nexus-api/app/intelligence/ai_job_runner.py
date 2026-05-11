"""AI Job Runner — NATS consumer loop that processes AI worker jobs.

Start this as a standalone asyncio entry point or as a background task:

    python -m app.intelligence.ai_job_runner

or from the FastAPI startup context (for development, single-process mode).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


async def _dispatch(
    job_data: dict[str, Any],
    transport: Any,
    worker: Any,
) -> None:
    """Process a single AI job, publishing progress and final result via NATS."""
    from app.worker_runtime.contracts import WorkerJob

    job_id: str = job_data.get("id", "unknown")
    try:
        await transport.publish_progress(job_id, "received", 0.05, "Job received by Python worker")

        job = WorkerJob(
            id=job_id,
            tenant_id=job_data.get("tenantId", "default"),
            type=job_data.get("type", "root_cause_analysis"),
            evidence=job_data.get("evidence", {}),
            policy=job_data.get("policy", {}),
        )

        await transport.publish_progress(job_id, "classifying", 0.15, "Classifying failure pattern")
        result = await worker.handle(job)
        await transport.publish_progress(job_id, "completed", 1.0, "Analysis complete")

        result_payload: dict[str, Any] = {
            "jobId": result.job_id,
            "status": result.status,
            "confidence": result.confidence,
            "summary": result.summary,
            "findings": result.findings,
            "recommendations": result.recommendations,
            "artifacts": result.artifacts,
        }
        await transport.publish_result(result_payload)
        logger.info(
            "AI job %s completed  type=%s confidence=%.2f",
            job_id,
            job.type,
            result.confidence,
        )

    except Exception as exc:
        logger.exception("Fatal error processing job %s: %s", job_id, exc)
        await transport.publish_progress(job_id, "failed", 1.0, str(exc))
        await transport.publish_result({
            "jobId": job_id,
            "status": "failed",
            "confidence": 0.0,
            "summary": f"Worker error: {exc!s}",
            "findings": [{"type": "worker_error", "detail": str(exc)}],
            "recommendations": [],
            "artifacts": [],
        })


async def run_ai_job_loop() -> None:
    """
    Main entry point: connect to NATS, subscribe to ai.jobs, and process jobs.
    Runs until cancelled.
    """
    from app.intelligence.nats_transport import get_nats_transport
    from app.worker_runtime.ai_worker import AiWorker

    transport = get_nats_transport()
    worker = AiWorker()

    await transport.connect()

    async def handler(job_data: dict[str, Any]) -> None:
        asyncio.create_task(_dispatch(job_data, transport, worker))

    await transport.subscribe_jobs(handler)
    logger.info("AI job runner active — listening on NATS subject 'ai.jobs'")

    try:
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        logger.info("AI job runner shutting down")
    finally:
        await transport.disconnect()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    asyncio.run(run_ai_job_loop())
