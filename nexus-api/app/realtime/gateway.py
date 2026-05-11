"""
WebSocket gateway — manages connections and broadcasts events.
Supports global channel + per-execution rooms.
"""
from __future__ import annotations
import asyncio
import json
import logging
from datetime import datetime
from typing import Any

from fastapi import WebSocket
from app.events.types import BaseEvent

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages all active WebSocket connections.
    Connections can join execution-specific rooms for targeted broadcasting.
    """

    def __init__(self) -> None:
        # client_id → WebSocket
        self._clients: dict[str, WebSocket] = {}
        # execution_id → set of client_ids
        self._rooms: dict[str, set[str]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, client_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients[client_id] = websocket
        logger.info("WS connected: %s (total: %d)", client_id, len(self._clients))

    async def disconnect(self, client_id: str) -> None:
        async with self._lock:
            self._clients.pop(client_id, None)
            for room in self._rooms.values():
                room.discard(client_id)
        logger.info("WS disconnected: %s (total: %d)", client_id, len(self._clients))

    async def join_room(self, client_id: str, execution_id: str) -> None:
        async with self._lock:
            if execution_id not in self._rooms:
                self._rooms[execution_id] = set()
            self._rooms[execution_id].add(client_id)

    async def leave_room(self, client_id: str, execution_id: str) -> None:
        async with self._lock:
            if execution_id in self._rooms:
                self._rooms[execution_id].discard(client_id)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Broadcast to all connected clients."""
        data = json.dumps(message)
        async with self._lock:
            clients = list(self._clients.items())

        dead = []
        for client_id, ws in clients:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(client_id)

        for client_id in dead:
            await self.disconnect(client_id)

    async def broadcast_to_room(self, execution_id: str, message: dict[str, Any]) -> None:
        """Broadcast to clients watching a specific execution."""
        data = json.dumps(message)
        async with self._lock:
            room_ids = set(self._rooms.get(execution_id, set()))
            clients = {k: v for k, v in self._clients.items() if k in room_ids}

        dead = []
        for client_id, ws in clients.items():
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(client_id)

        for client_id in dead:
            await self.disconnect(client_id)

    async def send_to(self, client_id: str, message: dict[str, Any]) -> bool:
        ws = self._clients.get(client_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
                return True
            except Exception:
                await self.disconnect(client_id)
        return False

    @property
    def connection_count(self) -> int:
        return len(self._clients)

    async def broadcast_event(self, event: BaseEvent) -> None:
        """Convert a domain event to a WS message and broadcast globally."""
        msg = {
            "event": event.__class__.__name__,
            **event.to_dict(),
        }
        execution_id = getattr(event, "execution_id", None)
        if execution_id:
            # Always broadcast to global + execution room
            await self.broadcast(msg)
        else:
            await self.broadcast(msg)

    async def heartbeat(self, client_id: str) -> None:
        await self.send_to(client_id, {
            "type": "heartbeat",
            "timestamp": datetime.utcnow().isoformat(),
        })


# Module-level singleton
_manager: ConnectionManager | None = None


def get_gateway() -> ConnectionManager:
    global _manager
    if _manager is None:
        _manager = ConnectionManager()
    return _manager
