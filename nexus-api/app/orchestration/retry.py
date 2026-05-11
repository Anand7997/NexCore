"""
Retry orchestration with exponential backoff and jitter.
Supports per-node retry policies with configurable max attempts and delays.
"""
from __future__ import annotations
import asyncio
import random
from dataclasses import dataclass, field


DEFAULT_POLICY = {
    "max_attempts": 3,
    "backoff_base": 1.5,
    "max_delay": 30.0,
    "jitter": True,
}


@dataclass
class RetryPolicy:
    max_attempts: int = 3
    backoff_base: float = 1.5   # seconds for first retry
    max_delay: float = 30.0     # cap backoff at this
    jitter: bool = True

    @classmethod
    def from_dict(cls, data: dict) -> "RetryPolicy":
        return cls(
            max_attempts=data.get("max_attempts", 3),
            backoff_base=data.get("backoff_base", 1.5),
            max_delay=data.get("max_delay", 30.0),
            jitter=data.get("jitter", True),
        )

    def to_dict(self) -> dict:
        return {
            "max_attempts": self.max_attempts,
            "backoff_base": self.backoff_base,
            "max_delay": self.max_delay,
            "jitter": self.jitter,
        }

    def should_retry(self, attempt: int) -> bool:
        return attempt < self.max_attempts

    def delay_for(self, attempt: int) -> float:
        """
        Exponential backoff: base * 2^(attempt-1), capped at max_delay.
        Adds ±20% jitter when enabled.
        """
        delay = min(self.backoff_base * (2 ** (attempt - 1)), self.max_delay)
        if self.jitter:
            delay *= 1.0 + random.uniform(-0.2, 0.2)
        return max(0.0, delay)

    async def wait(self, attempt: int) -> float:
        """Wait the appropriate backoff period and return how long we waited (ms)."""
        delay = self.delay_for(attempt)
        await asyncio.sleep(delay)
        return delay * 1000  # return ms
