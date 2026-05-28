"""
NEXUS QA Orchestration API — FastAPI application entry point.

Startup sequence:
1. Initialize database (create tables)
2. Initialize event bus (in-memory broker)
3. Wire event bus → WebSocket gateway (broadcast all events)
4. Mount API routers
"""
from __future__ import annotations
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database.session import init_db
from app.events.brokers.memory import InMemoryBroker
from app.events.bus import init_event_bus
from app.events.types import BaseEvent
from app.execution.artifacts import init_artifact_store
from app.execution.registry import register_plugin, list_plugins
from app.realtime.gateway import get_gateway
from app.ai_workflow import router as ai_workflow_router
from app.api.routes import (
    workflows,
    executions,
    websocket,
    artifacts,
    plugins,
    intelligence,
    intents,
    adapters,
    runtime,
    enterprise,
    test_configuration,
    page_repository,
    master_sheets,
    desktop_spy,
    desktop_recorder,
    testing_types,
    api_testing,
    execution_results,
    desktop_recovery_rules,
    desktop_reporting,
    desktop_nl_compiler,
    desktop_agents,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
# NATS is optional — suppress reconnect-spam when the server isn't running
logging.getLogger('nats').setLevel(logging.CRITICAL)

async def _init_intelligence() -> None:
    """Initialise Phase-6 intelligence services on startup.

    All failures are non-fatal so the API boots even when Qdrant or the
    sentence-transformers model is unavailable (CI, lightweight dev machines).
    """
    # Qdrant vector store — create collections if missing
    try:
        from app.intelligence.vector_store import get_vector_store
        await get_vector_store().ensure_collections()
        logger.info("Qdrant: collections ready")
    except Exception as exc:
        logger.warning("Qdrant init skipped (unavailable): %s", exc)

    # Embedding model warmup is opt-in so health checks are not blocked by
    # local model loading.
    if settings.warmup_embeddings_on_startup:
        try:
            from app.intelligence.embeddings import get_embedding_service
            svc = get_embedding_service()
            await svc.embed("warmup")
            logger.info("Embedding model ready (%s)", getattr(svc, "_model_name", "unknown"))
        except Exception as exc:
            logger.warning("Embedding warmup skipped: %s", exc)
    else:
        logger.info("Embedding warmup skipped (WARMUP_EMBEDDINGS_ON_STARTUP=false)")


async def _start_nats_bridge(bus: Any) -> None:
    """Bridge NATS ``ai.progress`` and ``ai.results`` subjects to the event bus.

    Only starts when NATS is reachable.  Lets jobs triggered by NestJS stream
    their progress to FastAPI WebSocket clients as well.
    """
    import json
    from app.events.types import AIJobCompleted, AIJobProgress

    try:
        parsed = urlparse(settings.nats_url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 4222
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=1.0,
        )
        writer.close()
        await writer.wait_closed()

        import nats as nats_lib
        nc = await asyncio.wait_for(
            nats_lib.connect(
                settings.nats_url,
                allow_reconnect=False,
                connect_timeout=2,
            ),
            timeout=3.0,
        )

        async def _on_progress(msg: Any) -> None:
            try:
                data = json.loads(msg.data.decode())
                await bus.publish(AIJobProgress(
                    job_id=data.get("jobId", ""),
                    execution_id=data.get("executionId", ""),
                    step=data.get("step", ""),
                    progress=float(data.get("progress", 0.0)),
                    detail=data.get("detail", ""),
                ))
            except Exception:
                pass

        async def _on_result(msg: Any) -> None:
            try:
                data = json.loads(msg.data.decode())
                if data.get("status") == "completed":
                    await bus.publish(AIJobCompleted(
                        job_id=data.get("jobId", ""),
                        execution_id=data.get("executionId", ""),
                        job_type=data.get("jobType", ""),
                        confidence=float(data.get("confidence", 0.0)),
                        summary=data.get("summary", ""),
                        findings=data.get("findings", []),
                        recommendations=data.get("recommendations", []),
                    ))
            except Exception:
                pass

        await nc.subscribe("ai.progress", cb=_on_progress)
        await nc.subscribe("ai.results", cb=_on_result)
        logger.info("NATS AI bridge active (bridging ai.progress + ai.results → event bus)")
    except Exception as exc:
        logger.info("NATS bridge skipped: %s", exc)


def _register_execution_plugins() -> None:
    """
    Register all execution plugins. Failures here are non-fatal — a missing
    Playwright install must not stop the API from booting (the API plugin
    can still drive httpx).
    """
    if settings.enable_api_plugin:
        try:
            from app.execution.plugins.api import APIExecutionPlugin
            register_plugin(APIExecutionPlugin())
        except Exception:
            logger.exception("Failed to register APIExecutionPlugin")

    if settings.enable_web_plugin:
        try:
            from app.execution.plugins.web import WebExecutionPlugin
            register_plugin(WebExecutionPlugin())
        except Exception:
            logger.exception("Failed to register WebExecutionPlugin")

    if settings.enable_mobile_plugin:
        try:
            from app.execution.plugins.mobile import MobileExecutionPlugin
            register_plugin(MobileExecutionPlugin())
        except Exception:
            logger.exception("Failed to register MobileExecutionPlugin")

    if settings.enable_desktop_plugin:
        try:
            from app.execution.plugins.desktop import DesktopExecutionPlugin
            register_plugin(DesktopExecutionPlugin())
        except Exception:
            logger.exception("Failed to register DesktopExecutionPlugin")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    logger.info("Starting NEXUS QA Orchestration API...")
    await init_db()

    # Artifact store — filesystem-backed evidence pipeline.
    init_artifact_store(settings.artifact_dir)

    # Plugin registry — execution intelligence layer above orchestration.
    _register_execution_plugins()
    logger.info(
        "Execution plugins active: %s",
        ", ".join(p.name for p in list_plugins()) or "(none)",
    )

    broker = InMemoryBroker()
    bus = init_event_bus(broker)
    await bus.start()

    # Wire all events to WebSocket gateway
    gateway = get_gateway()

    async def _broadcast_to_ws(event: BaseEvent) -> None:
        await gateway.broadcast_event(event)

    bus.on_any(_broadcast_to_ws)

    # ── Phase 6: AI Intelligence ──────────────────────────────────────────────
    await _init_intelligence()
    await _start_nats_bridge(bus)

    logger.info("NEXUS QA API ready.")

    yield

    # ── Shutdown ──
    await bus.stop()
    logger.info("NEXUS QA API shut down.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(ai_workflow_router.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")
app.include_router(executions.router, prefix="/api")
app.include_router(artifacts.router, prefix="/api")
app.include_router(plugins.router, prefix="/api")
app.include_router(intelligence.router, prefix="/api")
app.include_router(intents.router, prefix="/api")
app.include_router(adapters.router, prefix="/api")
app.include_router(runtime.router, prefix="/api")
app.include_router(enterprise.router, prefix="/api")
app.include_router(test_configuration.router, prefix="/api")
app.include_router(page_repository.router, prefix="/api")
app.include_router(master_sheets.router, prefix="/api")
app.include_router(desktop_spy.router, prefix="/api")
app.include_router(desktop_recorder.router, prefix="/api")
app.include_router(testing_types.router, prefix="/api")
app.include_router(api_testing.router, prefix="/api")
app.include_router(execution_results.router, prefix="/api")
app.include_router(desktop_recovery_rules.router, prefix="/api")
app.include_router(desktop_reporting.router, prefix="/api")
app.include_router(desktop_nl_compiler.router, prefix="/api")
app.include_router(desktop_agents.router, prefix="/api")
app.include_router(websocket.router)


@app.get("/api/health")
async def health():
    from app.realtime.gateway import get_gateway
    gw = get_gateway()
    return {
        "status": "ok",
        "ws_connections": gw.connection_count,
    }
