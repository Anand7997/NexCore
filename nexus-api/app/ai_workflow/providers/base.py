from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class AbstractAIProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, schema: type[T]) -> T:
        """Generate a structured AI response validated against the given Pydantic schema."""
        ...

    async def generate_stream(self, prompt: str, schema: type[T]) -> AsyncGenerator[str, None]:
        """
        Yield raw text chunks of the AI response.
        Default: single yield of the full JSON response.
        Override in providers that support real streaming.
        """
        result = await self.generate(prompt, schema)
        yield result.model_dump_json()
