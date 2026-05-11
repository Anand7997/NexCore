"""WebSocket endpoint — realtime execution event streaming."""
from __future__ import annotations
import asyncio
import json
import logging
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.realtime.gateway import get_gateway
from app.events.bus import get_event_bus
from app.events.types import WebSocketConnected, WebSocketDisconnected
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Global WebSocket endpoint.

    Client protocol:
    - Connect → receive {"type":"connected","client_id":"..."}
    - Send {"action":"subscribe","execution_id":"..."} → join execution room
    - Send {"action":"ping"} → receive {"type":"pong"}
    - Server pushes all orchestration events as JSON
    """
    gateway = get_gateway()
    bus = get_event_bus()
    client_id = str(uuid.uuid4())

    await gateway.connect(client_id, websocket)

    await bus.publish(WebSocketConnected(client_id=client_id))
    await gateway.send_to(client_id, {
        "type": "connected",
        "client_id": client_id,
    })

    # Start heartbeat task
    async def _heartbeat():
        while True:
            await asyncio.sleep(settings.ws_heartbeat_interval)
            await gateway.heartbeat(client_id)

    heartbeat_task = asyncio.create_task(_heartbeat())

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue

            action = msg.get("action")
            if action == "ping":
                await gateway.send_to(client_id, {"type": "pong"})
            elif action == "subscribe":
                exec_id = msg.get("execution_id")
                if exec_id:
                    await gateway.join_room(client_id, exec_id)
                    await gateway.send_to(client_id, {
                        "type": "subscribed",
                        "execution_id": exec_id,
                    })
            elif action == "unsubscribe":
                exec_id = msg.get("execution_id")
                if exec_id:
                    await gateway.leave_room(client_id, exec_id)
            elif action == "replay":
                # Send recent event history
                history = await bus.replay(from_index=-200)
                for event in history:
                    await gateway.send_to(client_id, event.to_dict())

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("WebSocket error for client %s: %s", client_id, exc)
    finally:
        heartbeat_task.cancel()
        await gateway.disconnect(client_id)
        await bus.publish(WebSocketDisconnected(client_id=client_id))
