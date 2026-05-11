"""
In-memory async event broker using asyncio queues.
Supports per-type subscriptions, wildcard subscriptions, and replay.
"""
from __future__ import annotations
import asyncio
import logging
from collections import defaultdict
from app.events.brokers.base import BrokerAdapter, Handler
from app.events.types import BaseEvent

logger = logging.getLogger(__name__)

MAX_HISTORY = 2000


class InMemoryBroker(BrokerAdapter):
    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = defaultdict(list)
        self._wildcard_handlers: list[Handler] = []
        self._history: list[BaseEvent] = []
        self._queue: asyncio.Queue[BaseEvent] = asyncio.Queue()
        self._worker_task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        self._running = True
        self._worker_task = asyncio.create_task(self._worker(), name="event-broker-worker")
        logger.info("InMemoryBroker started")

    async def stop(self) -> None:
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        logger.info("InMemoryBroker stopped")

    async def publish(self, event: BaseEvent) -> None:
        await self._queue.put(event)

    def subscribe(self, event_type: str, handler: Handler) -> None:
        self._handlers[event_type].append(handler)

    def subscribe_all(self, handler: Handler) -> None:
        self._wildcard_handlers.append(handler)

    async def replay(self, from_index: int = 0) -> list[BaseEvent]:
        return self._history[from_index:]

    async def _worker(self) -> None:
        while self._running:
            try:
                event = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            # Persist to rolling history
            self._history.append(event)
            if len(self._history) > MAX_HISTORY:
                self._history = self._history[-MAX_HISTORY:]

            event_type = event.__class__.__name__

            # Dispatch to type-specific handlers
            handlers = self._handlers.get(event_type, []) + self._wildcard_handlers
            for handler in handlers:
                try:
                    await handler(event)
                except Exception:
                    logger.exception("Handler error for event %s", event_type)

            self._queue.task_done()
