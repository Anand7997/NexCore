"""Runtime agent lifecycle against the .NET control plane.

The worker never touches the control-plane tables. Over HTTP it:

* registers with a stable id (restarts reuse the same agent row),
* heartbeats, which also renews the leases it holds,
* claims commands (``run_execution`` / ``cancel_execution``) and acks each one.

Commands are claimed by polling; when NATS is available the control plane also
publishes a wake-up on ``nexus.runtime.agents.<id>.commands`` so work starts
without waiting for the next poll (see :meth:`RuntimeAgentWorker.wake`).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections import deque
from dataclasses import dataclass
from typing import Any, Protocol

import httpx


logger = logging.getLogger(__name__)


class CommandHandler(Protocol):
    async def handle(self, command: dict[str, Any]) -> None:
        """Execute one control-plane command. Raise to report failure."""

    def active_count(self) -> int:
        """Number of executions currently running in this worker."""


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
    poll_seconds: float = 2.0
    tenant_id: str | None = None


def stable_agent_id(agent_id: str) -> str:
    """Map a human agent id (e.g. hostname) to the 36-char id the control plane stores."""
    try:
        return str(uuid.UUID(agent_id))
    except ValueError:
        return str(uuid.uuid5(uuid.NAMESPACE_URL, f"nexus-runtime-agent:{agent_id}"))


class RuntimeAgentWorker:
    def __init__(
        self,
        config: AgentConfig,
        *,
        http_client: httpx.AsyncClient | None = None,
        handler: CommandHandler | None = None,
    ) -> None:
        self.config = config
        self._stopped = asyncio.Event()
        self._wakeup = asyncio.Event()
        self._registered_agent_id: str | None = None
        self._http_client = http_client
        self._handler = handler
        self._recent_commands: deque[str] = deque(maxlen=256)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def run(self) -> None:
        loops = [asyncio.create_task(self._heartbeat_loop(), name="runtime-agent-heartbeat")]
        if self._handler is not None:
            loops.append(asyncio.create_task(self._command_loop(), name="runtime-agent-commands"))
        try:
            await self._stopped.wait()
        finally:
            for task in loops:
                task.cancel()
            await asyncio.gather(*loops, return_exceptions=True)
            await self.deregister()

    def stop(self) -> None:
        self._stopped.set()

    def wake(self) -> None:
        """Poll for commands now instead of waiting for the next poll interval."""
        self._wakeup.set()

    @property
    def registered_agent_id(self) -> str | None:
        """Return the control-plane ID assigned during registration."""
        return self._registered_agent_id

    async def _heartbeat_loop(self) -> None:
        while not self._stopped.is_set():
            try:
                if self._registered_agent_id is None:
                    await self.register()
                await self.heartbeat()
            except asyncio.CancelledError:
                raise
            except httpx.HTTPError as exc:
                logger.warning("Runtime agent control-plane request failed: %s", exc)
            except Exception:
                logger.exception("Runtime agent heartbeat failed")
            await self._sleep(self.config.heartbeat_seconds, wake_on_command=False)

    async def _command_loop(self) -> None:
        while not self._stopped.is_set():
            try:
                await self.poll_once()
            except asyncio.CancelledError:
                raise
            except httpx.HTTPError as exc:
                logger.warning("Runtime agent command poll failed: %s", exc)
            except Exception:
                logger.exception("Runtime agent command poll failed")
            await self._sleep(self.config.poll_seconds, wake_on_command=True)

    async def _sleep(self, seconds: float, *, wake_on_command: bool) -> None:
        waiters = [asyncio.ensure_future(self._stopped.wait())]
        if wake_on_command:
            waiters.append(asyncio.ensure_future(self._wakeup.wait()))
        try:
            await asyncio.wait(waiters, timeout=seconds, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for waiter in waiters:
                waiter.cancel()
            if wake_on_command:
                self._wakeup.clear()

    # ── Control-plane calls ───────────────────────────────────────────────────

    @property
    def _api_base_url(self) -> str:
        base_url = self.config.control_plane_url.rstrip("/")
        return base_url if base_url.endswith("/api") else f"{base_url}/api"

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        if self.config.tenant_id:
            kwargs.setdefault("headers", {})["x-tenant-id"] = self.config.tenant_id
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
                "id": stable_agent_id(self.config.agent_id),
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
        logger.info("Runtime agent registered with control plane: %s", self._registered_agent_id)
        return data

    async def heartbeat(self) -> dict[str, Any]:
        if self._registered_agent_id is None:
            await self.register()

        try:
            return await self._request(
                "POST",
                f"/runtime/agents/{self._registered_agent_id}/heartbeat",
                json={
                    "status": "draining" if self._stopped.is_set() else "ready",
                    "active_leases": self._handler.active_count() if self._handler else 0,
                    "capabilities": list(self.config.capabilities),
                    "labels": self.config.labels or {},
                },
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                # The agent row was removed from the control plane. Re-register
                # on the next cycle.
                self._registered_agent_id = None
            raise

    async def deregister(self) -> None:
        if self._registered_agent_id is None:
            return
        try:
            await self._request("DELETE", f"/runtime/agents/{self._registered_agent_id}")
            logger.info("Runtime agent deregistered: %s", self._registered_agent_id)
        except Exception as exc:  # shutdown path: the reaper will expire us anyway
            logger.warning("Runtime agent deregistration failed: %s", exc)

    async def poll_once(self) -> list[dict[str, Any]]:
        """Claim pending commands and run each through the handler, acking the outcome."""
        if self._registered_agent_id is None or self._handler is None:
            return []
        try:
            commands = await self._request("GET", f"/runtime/agents/{self._registered_agent_id}/commands")
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                self._registered_agent_id = None
            raise
        for command in commands or []:
            await self._process(command)
        return commands or []

    async def _process(self, command: dict[str, Any]) -> None:
        command_id = command["id"]
        status, error = "completed", None
        if command_id in self._recent_commands:
            # Redelivery after a lost ack; the handler already ran it.
            logger.info("Re-acking redelivered command %s", command_id)
        else:
            self._recent_commands.append(command_id)
            try:
                await self._handler.handle(command)  # type: ignore[union-attr]
            except Exception as exc:
                logger.exception("Runtime command %s (%s) failed", command_id, command.get("type"))
                status, error = "failed", str(exc) or exc.__class__.__name__
        await self._request(
            "POST",
            f"/runtime/agents/{self._registered_agent_id}/commands/{command_id}/ack",
            json={"status": status, "error": error},
        )
