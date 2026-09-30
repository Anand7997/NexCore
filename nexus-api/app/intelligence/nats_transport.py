"""NATS transport layer — connects the Python AI worker to the .NET AI gateway.

Subjects
--------
ai.jobs         — .NET control plane publishes job payloads here; Python subscribes
ai.results      — Python publishes completed results here; .NET subscribes
ai.progress     — Python publishes incremental progress events for streaming

The .NET control plane stores these subjects in the ``NEXUS_AI`` JetStream
stream. Jobs are consumed through the durable ``ai-workers`` consumer, so jobs
published while no worker is running are delivered once one starts. Without
JetStream the transport falls back to a plain core-NATS subscription.

The transport is optional: when NATS is unavailable the worker can still be
called directly via the REST fallback in the AI gateway.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)

ResultHandler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]

# NATS subjects
SUBJECT_JOBS = "ai.jobs"
SUBJECT_RESULTS = "ai.results"
SUBJECT_PROGRESS = "ai.progress"
AI_STREAM = "NEXUS_AI"
AI_WORKERS_DURABLE = "ai-workers"


class NATSAITransport:
    """Bridges the Python AI worker with the .NET AI gateway over NATS."""

    def __init__(self, nats_url: str = "nats://localhost:4222") -> None:
        self._nats_url = nats_url
        self._nc: Any = None
        self._sub: Any = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def connect(self) -> None:
        try:
            import nats
            self._nc = await nats.connect(
                self._nats_url,
                allow_reconnect=False,
                connect_timeout=2,
                error_cb=self._on_error,
                disconnected_cb=self._on_disconnected,
                reconnected_cb=self._on_reconnected,
            )
            logger.info("NATS transport connected: %s", self._nats_url)
        except Exception as exc:
            raise RuntimeError(f"NATS connect failed ({self._nats_url}): {exc}") from exc

    async def disconnect(self) -> None:
        if self._sub is not None:
            try:
                await self._sub.unsubscribe()
            except Exception:
                pass
        if self._nc is not None:
            try:
                await self._nc.drain()
            except Exception:
                pass
        logger.info("NATS transport disconnected")

    # ── Subscription ─────────────────────────────────────────────────────────

    async def subscribe_jobs(self, handler: ResultHandler) -> None:
        """Subscribe to AI job requests published by the .NET control plane."""
        if self._nc is None:
            raise RuntimeError("Not connected — call connect() first")

        durable = False

        async def _on_message(msg: Any) -> None:
            try:
                data = json.loads(msg.data.decode())
            except json.JSONDecodeError:
                logger.error("Received non-JSON NATS message on %s", SUBJECT_JOBS)
                data = None
            if data is None:
                if durable:
                    await msg.ack()
                return
            try:
                # Acknowledge only after the handler returns. The handler owns the
                # full long-running job, so a worker crash causes JetStream to
                # redeliver it instead of losing it after receipt.
                await handler(data)
                if durable:
                    await msg.ack()
            except Exception as exc:
                logger.exception("Error handling NATS job: %s", exc)

        try:
            js = self._nc.jetstream()
            await js.stream_info(AI_STREAM)
            durable = True
            self._sub = await js.subscribe(
                SUBJECT_JOBS,
                durable=AI_WORKERS_DURABLE,
                queue=AI_WORKERS_DURABLE,
                stream=AI_STREAM,
                cb=_on_message,
                manual_ack=True,
            )
            logger.info("Subscribed to JetStream %s (durable %s)", SUBJECT_JOBS, AI_WORKERS_DURABLE)
        except Exception as exc:
            durable = False
            logger.info("JetStream stream %s unavailable (%s); using core NATS subscription", AI_STREAM, exc)
            self._sub = await self._nc.subscribe(SUBJECT_JOBS, cb=_on_message)
            logger.info("Subscribed to NATS subject: %s", SUBJECT_JOBS)

    # ── Publishing ────────────────────────────────────────────────────────────

    async def publish_result(self, result: dict[str, Any]) -> None:
        """Publish a completed AI job result to the .NET AI gateway."""
        if self._nc is None:
            logger.warning("NATS not connected — skipping result publish for job %s", result.get("jobId"))
            return
        await self._nc.publish(SUBJECT_RESULTS, json.dumps(result).encode())

    async def publish_progress(
        self, job_id: str, step: str, progress: float, detail: str = ""
    ) -> None:
        """Publish incremental progress for real-time streaming to the frontend."""
        if self._nc is None:
            return
        payload = {
            "jobId": job_id,
            "step": step,
            "progress": round(max(0.0, min(1.0, progress)), 2),
            "detail": detail,
        }
        await self._nc.publish(SUBJECT_PROGRESS, json.dumps(payload).encode())

    # ── NATS callbacks ────────────────────────────────────────────────────────

    async def _on_error(self, exc: Exception) -> None:
        logger.error("NATS error: %s", exc)

    async def _on_disconnected(self) -> None:
        logger.warning("NATS disconnected")

    async def _on_reconnected(self) -> None:
        logger.info("NATS reconnected")


# ── Singleton ────────────────────────────────────────────────────────────────

_nats_transport: NATSAITransport | None = None


def get_nats_transport() -> NATSAITransport:
    global _nats_transport
    if _nats_transport is None:
        from app.config import settings
        _nats_transport = NATSAITransport(nats_url=settings.nats_url)
    return _nats_transport
