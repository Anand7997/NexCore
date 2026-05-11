"""
Singleton event bus — the central nervous system of the orchestration engine.
Components publish events here; the broker dispatches to all subscribers.
"""
from __future__ import annotations
from app.events.brokers.base import BrokerAdapter, Handler
from app.events.types import BaseEvent


class EventBus:
    def __init__(self, broker: BrokerAdapter) -> None:
        self._broker = broker

    async def publish(self, event: BaseEvent) -> None:
        await self._broker.publish(event)

    def on(self, event_type: str, handler: Handler) -> None:
        """Subscribe to a specific event type by class name string."""
        self._broker.subscribe(event_type, handler)

    def on_any(self, handler: Handler) -> None:
        """Subscribe to every event."""
        self._broker.subscribe_all(handler)

    async def replay(self, from_index: int = 0) -> list[BaseEvent]:
        return await self._broker.replay(from_index)

    async def start(self) -> None:
        await self._broker.start()

    async def stop(self) -> None:
        await self._broker.stop()


# Module-level singleton — initialized in main.py startup
_bus: EventBus | None = None


def get_event_bus() -> EventBus:
    if _bus is None:
        raise RuntimeError("EventBus not initialized — call init_event_bus() first")
    return _bus


def init_event_bus(broker: BrokerAdapter) -> EventBus:
    global _bus
    _bus = EventBus(broker)
    return _bus
