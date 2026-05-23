from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncGenerator, AsyncIterator
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.ai_workflow.providers.base import AbstractAIProvider
from app.ai_workflow.providers.http_client import build_async_http_client

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def _strip_fences(text: str) -> str:
    match = _FENCE_RE.search(text)
    return match.group(1) if match else text.strip()


class ClaudeProvider(AbstractAIProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
        self._client = None  # lazy-initialised on first use
        self._http_client = None

    def _get_client(self):
        if self._client is None:
            if not self._api_key.strip():
                raise ValueError("ANTHROPIC_API_KEY is required for ClaudeProvider")
            try:
                import anthropic  # type: ignore[import]
            except ImportError as exc:
                raise RuntimeError("anthropic package is required for ClaudeProvider") from exc
            self._http_client = build_async_http_client()
            self._client = anthropic.AsyncAnthropic(
                api_key=self._api_key,
                http_client=self._http_client,
                timeout=120,
                max_retries=1,
            )
        return self._client

    def _build_system_block(self, schema: type[T]) -> list[dict]:
        """Return a system content block with cache_control so Claude caches the schema JSON."""
        schema_json = json.dumps(schema.model_json_schema(), indent=2)
        text = (
            "You are a QA engineering assistant. "
            "Respond ONLY with valid JSON conforming to the schema below. "
            "Do not include any explanation, markdown, or text outside the JSON.\n\n"
            f"Required JSON schema:\n{schema_json}"
        )
        return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]

    async def generate(self, prompt: str, schema: type[T]) -> T:
        client = self._get_client()
        message = await client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=self._build_system_block(schema),
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text if message.content else "{}"
        cleaned = _strip_fences(raw)
        try:
            data = json.loads(cleaned)
            return schema.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.error("Claude response failed schema validation: %s\nRaw: %s", exc, raw[:500])
            raise ValueError(f"AI response did not match expected schema: {exc}") from exc

    async def generate_stream(self, prompt: str, schema: type[T]) -> AsyncIterator[str]:
        """Yield raw text chunks from Claude's streaming API."""
        client = self._get_client()
        async with client.messages.stream(
            model=self._model,
            max_tokens=4096,
            system=self._build_system_block(schema),
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
