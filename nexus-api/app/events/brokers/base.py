"""Abstract broker interface — swappable for Redis, RabbitMQ, etc."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Callable, Awaitable
from app.events.types import BaseEvent


Handler = Callable[[BaseEvent], Awaitable[None]]


class BrokerAdapter(ABC):
    """
    Contract that all broker implementations must satisfy.
    Concrete implementations: InMemoryBroker, RedisStreamsBroker, RabbitMQBroker.
    """

    @abstractmethod
    async def publish(self, event: BaseEvent) -> None: ...

    @abstractmethod
    def subscribe(self, event_type: str, handler: Handler) -> None: ...

    @abstractmethod
    def subscribe_all(self, handler: Handler) -> None: ...

    @abstractmethod
    async def replay(self, from_index: int = 0) -> list[BaseEvent]: ...

    @abstractmethod
    async def start(self) -> None: ...

    @abstractmethod
    async def stop(self) -> None: ...
