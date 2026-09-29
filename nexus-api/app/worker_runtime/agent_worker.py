"""External runtime agent lifecycle.

The worker does not access the control-plane database directly. It registers
itself over HTTP, renews its lease with heartbeats, and leaves command polling
as the execution-specific extension point.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

import httpx


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AgentConfig:
    agent_id: str
    control_plane_url: str
    capabilities: tuple[str, ...]
    heartbeat_seconds: float = 10.0
    name: str | None = None
    agent_type: str = "generic"
    version: str = "1.0.0"
    endpoint: str | None = None
    labels: dict[str, Any] | None = None
    max_concurrency: int = 1
    request_timeout_seconds: float = 10.0


class RuntimeAgentWorker:
    def __init__(
        self,
        config: AgentConfig,
        *,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.config = config
        self._stopped = asyncio.Event()
        self._registered_agent_id: str | None = None
        self._http_client = http_client

    async def run(self) -> None:
        while not self._stopped.is_set():
            try:
                if self._registered_agent_id is None:
                    await self.register()
                await self.heartbeat()
                await self.poll_once()
            except asyncio.CancelledError:
                raise
            except httpx.HTTPError as exc:
                logger.warning("Runtime agent control-plane request failed: %s", exc)
            except Exception:
                logger.exception("Runtime agent cycle failed")

            try:
                await asyncio.wait_for(self._stopped.wait(), timeout=self.config.heartbeat_seconds)
            except asyncio.TimeoutError:
                pass

    def stop(self) -> None:
        self._stopped.set()

    @property
    def registered_agent_id(self) -> str | None:
        """Return the control-plane ID assigned during registration."""
        return self._registered_agent_id

    @property
    def _api_base_url(self) -> str:
        base_url = self.config.control_plane_url.rstrip("/")
        return base_url if base_url.endswith("/api") else f"{base_url}/api"

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if self._http_client is not None:
            response = await self._http_client.request(method, f"{self._api_base_url}{path}", **kwargs)
            response.raise_for_status()
            return response.json()

        async with httpx.AsyncClient(timeout=self.config.request_timeout_seconds) as client:
            response = await client.request(method, f"{self._api_base_url}{path}", **kwargs)
            response.raise_for_status()
            return response.json()

    async def register(self) -> dict[str, Any]:
        """Register this worker and retain the server-issued agent ID."""
        data = await self._request(
            "POST",
            "/runtime/agents",
            json={
                "name": self.config.name or self.config.agent_id,
                "agent_type": self.config.agent_type,
                "endpoint": self.config.endpoint,
                "version": self.config.version,
                "capabilities": list(self.config.capabilities),
                "labels": self.config.labels or {},
                "max_concurrency": max(1, self.config.max_concurrency),
            },
        )
        self._registered_agent_id = data.get("id") or data.get("agentId")
        if not self._registered_agent_id:
            raise RuntimeError("Runtime agent registration response did not include an agent ID")
        logger.info("Runtime agent registered: %s", self._registered_agent_id)
        return data

    async def heartbeat(self) -> dict[str, Any]:
        if self._registered_agent_id is None:
            await self.register()

        try:
            return await self._request(
                "POST",
                f"/runtime/agents/{self._registered_agent_id}/heartbeat",
                json={
                    "status": "ready",
                    "active_leases": 0,
                    "capabilities": list(self.config.capabilities),
                    "labels": self.config.labels or {},
                },
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                # The control plane may have restarted and lost an in-memory
                # registry. Re-register on the next run-cycle.
                self._registered_agent_id = None
            raise

    async def poll_once(self) -> None:
        # Intentionally no direct DB access. Commands must come from the
        # control plane and are implemented by the execution-specific worker.
        return None
