"""Run a standalone runtime agent: ``python -m app.worker_runtime``.

The agent registers with the .NET control plane, executes the executions it is
dispatched on the local orchestration engine, and relays engine events over
NATS so dashboards connected to FastAPI still see live progress.
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import uuid

from app.config import settings
from app.control_plane.nats_bridge import connect_nats, relay_bus_events, subscribe_agent_wakeups
from app.worker_runtime.agent_worker import AgentConfig, RuntimeAgentWorker, stable_agent_id
from app.worker_runtime.execution_handler import ExecutionCommandHandler
from app.worker_runtime.factory import enabled_capabilities

logger = logging.getLogger("app.worker_runtime")


def _capabilities() -> tuple[str, ...]:
    raw = os.getenv("AGENT_CAPABILITIES")
    if not raw:
        return enabled_capabilities()
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def _build_config() -> AgentConfig:
    agent_id = os.getenv("AGENT_ID", socket.gethostname())
    return AgentConfig(
        agent_id=agent_id,
        name=os.getenv("AGENT_NAME", agent_id),
        control_plane_url=os.getenv("RUNTIME_AGENT_CONTROL_PLANE_URL", settings.control_plane_url),
        capabilities=_capabilities(),
        agent_type=os.getenv("AGENT_TYPE", "python-worker"),
        version=os.getenv("AGENT_VERSION", settings.app_version),
        endpoint=os.getenv("AGENT_ENDPOINT") or None,
        labels={"host": socket.gethostname(), "mode": "standalone"},
        max_concurrency=int(os.getenv("AGENT_MAX_CONCURRENCY", "2")),
        heartbeat_seconds=float(os.getenv("AGENT_HEARTBEAT_SECONDS", "10")),
        poll_seconds=float(os.getenv("AGENT_POLL_SECONDS", "2")),
        tenant_id=os.getenv("AGENT_TENANT_ID") or None,
    )


async def _run() -> None:
    from app.database.session import init_db
    from app.events.brokers.memory import InMemoryBroker
    from app.events.bus import init_event_bus
    from app.execution.artifacts import init_artifact_store
    from app.main import _register_execution_plugins

    await init_db()
    init_artifact_store(settings.artifact_dir)
    _register_execution_plugins()
    bus = init_event_bus(InMemoryBroker())
    await bus.start()

    config = _build_config()
    worker = RuntimeAgentWorker(config, handler=ExecutionCommandHandler())

    nc = await connect_nats(settings.nats_url, name=f"nexus-worker-{config.agent_id}")
    if nc is not None:
        relay_bus_events(nc, bus, origin=f"worker-{uuid.uuid4()}")
        await subscribe_agent_wakeups(nc, stable_agent_id(config.agent_id), worker.wake)

    logger.info(
        "Runtime worker %s starting: control plane %s, capabilities %s",
        config.agent_id, config.control_plane_url, ",".join(config.capabilities),
    )
    try:
        await worker.run()
    finally:
        await bus.stop()
        if nc is not None:
            await nc.drain()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        pass
