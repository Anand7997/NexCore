"""
NEXUS QA Orchestration API — FastAPI application entry point.

Startup sequence:
1. Initialize database (create tables)
2. Initialize event bus (in-memory broker)
3. Wire event bus → WebSocket gateway (broadcast all events)
4. Mount API routers
"""
from __future__ import annotations
import logging
from contextlib import asynccontextmanager

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
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

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
app.include_router(websocket.router)


@app.get("/api/health")
async def health():
    from app.realtime.gateway import get_gateway
    gw = get_gateway()
    return {
        "status": "ok",
        "ws_connections": gw.connection_count,
    }
