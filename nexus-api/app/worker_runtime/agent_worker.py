"""External runtime agent scaffold.

The production agent should poll or receive dispatch commands from NestJS,
execute isolated runtime work, and heartbeat through the control plane.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AgentConfig:
    agent_id: str
    control_plane_url: str
    capabilities: tuple[str, ...]
    heartbeat_seconds: float = 10.0


class RuntimeAgentWorker:
    def __init__(self, config: AgentConfig) -> None:
        self.config = config
        self._stopped = asyncio.Event()

    async def run(self) -> None:
        while not self._stopped.is_set():
            await self.heartbeat()
            await self.poll_once()
            try:
                await asyncio.wait_for(self._stopped.wait(), timeout=self.config.heartbeat_seconds)
            except asyncio.TimeoutError:
                pass

    def stop(self) -> None:
        self._stopped.set()

    async def heartbeat(self) -> dict[str, Any]:
        return {
            "agent_id": self.config.agent_id,
            "capabilities": list(self.config.capabilities),
            "status": "ready",
        }

    async def poll_once(self) -> None:
        # Intentionally no direct DB access. Commands must come from NestJS.
        return None
