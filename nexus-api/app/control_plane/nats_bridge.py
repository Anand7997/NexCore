"""NATS wiring between the .NET control plane, Python workers and the WebSocket gateway.

Subjects
--------
nexus.runtime.agents.<agent_id>.commands  .NET → worker: new command, poll now
nexus.runtime.events.<type>               .NET → FastAPI: runtime lifecycle events
nexus.events.execution                    worker → FastAPI: engine events for WebSocket clients

All of it is optional. Without NATS, workers poll the control plane and
execution events only reach WebSocket clients from the embedded worker.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

SUBJECT_RUNTIME_EVENTS = "nexus.runtime.events.>"
SUBJECT_EXECUTION_EVENTS = "nexus.events.execution"

# Control-plane event type → WebSocket event name the dashboards already understand.
_WS_EVENT_NAMES = {
    "agent.registered": "RuntimeAgentRegistered",
    "agent.online": "RuntimeAgentHeartbeat",
    "agent.offline": "RuntimeAgentOffline",
    "execution.queued": "ExecutionQueued",
    "execution.dispatched": "ExecutionDispatched",
    "execution.requeued": "ExecutionRequeued",
    "execution.agent_lost": "ExecutionAgentLost",
    "lease.released": "RuntimeLeaseReleased",
}


def agent_commands_subject(agent_id: str) -> str:
    return f"nexus.runtime.agents.{agent_id}.commands"


async def connect_nats(url: str, *, name: str) -> Any | None:
    """Connect when a NATS server is reachable; return None otherwise."""
    try:
        parsed = urlparse(url)
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(parsed.hostname or "localhost", parsed.port or 4222),
            timeout=1.0,
        )
        writer.close()
        await writer.wait_closed()

        import nats

        nc = await nats.connect(url, name=name, connect_timeout=2, max_reconnect_attempts=-1, reconnect_time_wait=5)
        logger.info("NATS connected (%s): %s", name, url)
        return nc
    except Exception as exc:
        logger.info("NATS unavailable for %s (%s): %s", name, url, exc)
        return None


def runtime_event_to_ws(data: dict[str, Any]) -> dict[str, Any]:
    event_type = str(data.get("type", "unknown"))
    name = _WS_EVENT_NAMES.get(event_type, "ControlPlaneEvent")
    payload = data.get("data") if isinstance(data.get("data"), dict) else {}
    return {
        **payload,
        "event": name,
        "type": name,
        "control_plane_type": event_type,
        "timestamp": data.get("occurred_at") or datetime.utcnow().isoformat(),
        "tenant_id": data.get("tenant_id"),
        "agent_id": data.get("agent_id"),
        "execution_id": data.get("execution_id"),
    }


async def start_gateway_bridge(
    nc: Any,
    broadcast: Callable[[dict[str, Any]], Awaitable[None]],
    *,
    origin: str,
    on_agent_lost: Callable[[str], Awaitable[None]] | None = None,
) -> None:
    """Rebroadcast control-plane runtime events and remote worker execution events to WebSocket clients."""

    async def _on_runtime_event(msg: Any) -> None:
        try:
            data = json.loads(msg.data.decode())
            await broadcast(runtime_event_to_ws(data))
            if data.get("type") == "execution.agent_lost" and data.get("execution_id") and on_agent_lost:
                await on_agent_lost(data["execution_id"])
        except Exception:
            logger.exception("Failed to relay control-plane event")

    async def _on_execution_event(msg: Any) -> None:
        try:
            data = json.loads(msg.data.decode())
            if data.get("origin") == origin or not isinstance(data.get("message"), dict):
                return
            await broadcast(data["message"])
        except Exception:
            logger.exception("Failed to relay worker execution event")

    await nc.subscribe(SUBJECT_RUNTIME_EVENTS, cb=_on_runtime_event)
    await nc.subscribe(SUBJECT_EXECUTION_EVENTS, cb=_on_execution_event)
    logger.info("NATS gateway bridge active (%s, %s)", SUBJECT_RUNTIME_EVENTS, SUBJECT_EXECUTION_EVENTS)


def relay_bus_events(nc: Any, bus: Any, *, origin: str) -> None:
    """Publish every local event-bus event so FastAPI can forward it to WebSocket clients."""

    async def _publish(event: Any) -> None:
        try:
            message = {"event": event.__class__.__name__, **event.to_dict()}
            await nc.publish(SUBJECT_EXECUTION_EVENTS, json.dumps({"origin": origin, "message": message}, default=str).encode())
        except Exception as exc:
            logger.debug("Execution event relay failed: %s", exc)

    bus.on_any(_publish)


async def subscribe_agent_wakeups(nc: Any, agent_id: str, wake: Callable[[], None]) -> None:
    async def _on_wakeup(_msg: Any) -> None:
        wake()

    await nc.subscribe(agent_commands_subject(agent_id), cb=_on_wakeup)
    logger.info("Listening for command wake-ups on %s", agent_commands_subject(agent_id))
