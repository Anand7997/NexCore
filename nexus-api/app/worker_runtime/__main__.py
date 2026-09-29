"""Run a standalone runtime agent from the command line."""
from __future__ import annotations

import asyncio
import os
import socket

from app.worker_runtime.agent_worker import AgentConfig, RuntimeAgentWorker


def _capabilities() -> tuple[str, ...]:
    raw = os.getenv("AGENT_CAPABILITIES", "web,api")
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def _build_config() -> AgentConfig:
    agent_id = os.getenv("AGENT_ID", socket.gethostname())
    return AgentConfig(
        agent_id=agent_id,
        name=os.getenv("AGENT_NAME", agent_id),
        control_plane_url=os.getenv("RUNTIME_AGENT_CONTROL_PLANE_URL", "http://localhost:8000"),
        capabilities=_capabilities(),
        agent_type=os.getenv("AGENT_TYPE", "generic"),
        version=os.getenv("AGENT_VERSION", "1.0.0"),
        endpoint=os.getenv("AGENT_ENDPOINT") or None,
        heartbeat_seconds=float(os.getenv("AGENT_HEARTBEAT_SECONDS", "10")),
    )


async def _run() -> None:
    worker = RuntimeAgentWorker(_build_config())
    await worker.run()


if __name__ == "__main__":
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        pass
