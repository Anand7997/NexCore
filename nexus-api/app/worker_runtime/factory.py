"""Builds runtime-agent workers that execute engine work dispatched by the control plane."""
from __future__ import annotations

import socket

from app.config import settings
from app.worker_runtime.agent_worker import AgentConfig, RuntimeAgentWorker
from app.worker_runtime.execution_handler import ExecutionCommandHandler


def enabled_capabilities() -> tuple[str, ...]:
    """Platforms this process can execute, from the enabled execution plugins."""
    flags = (
        ("web", settings.enable_web_plugin),
        ("api", settings.enable_api_plugin),
        ("mobile", settings.enable_mobile_plugin),
        ("desktop", settings.enable_desktop_plugin),
    )
    return tuple(name for name, enabled in flags if enabled)


def build_embedded_worker() -> RuntimeAgentWorker:
    """The worker FastAPI runs in-process so a two-service dev setup still executes."""
    agent_id = settings.runtime_agent_id or f"{socket.gethostname()}-fastapi"
    return RuntimeAgentWorker(
        AgentConfig(
            agent_id=agent_id,
            name=f"{socket.gethostname()} (FastAPI embedded)",
            control_plane_url=settings.control_plane_url,
            capabilities=enabled_capabilities(),
            agent_type="python-embedded",
            version=settings.app_version,
            labels={"host": socket.gethostname(), "mode": "embedded"},
            max_concurrency=settings.runtime_agent_max_concurrency,
            heartbeat_seconds=settings.runtime_agent_heartbeat_seconds,
            poll_seconds=settings.runtime_agent_poll_seconds,
            request_timeout_seconds=settings.control_plane_timeout_seconds,
        ),
        handler=ExecutionCommandHandler(),
    )
