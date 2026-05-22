from __future__ import annotations

import json
import logging
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.ai_workflow.providers.base import AbstractAIProvider
from app.ai_workflow.providers.http_client import build_async_http_client

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class OpenAIProvider(AbstractAIProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
        self._client = None  # lazy-initialised on first use
        self._http_client = None

    def _get_client(self):
        if self._client is None:
            try:
                import openai  # type: ignore[import]
            except ImportError as exc:
                raise RuntimeError("openai package is required for OpenAIProvider") from exc
            self._http_client = build_async_http_client()
            self._client = openai.AsyncOpenAI(
                api_key=self._api_key,
                http_client=self._http_client,
                timeout=120,
                max_retries=1,
            )
        return self._client

    async def generate(self, prompt: str, schema: type[T]) -> T:
        client = self._get_client()
        schema_json = json.dumps(schema.model_json_schema(), indent=2)
        system = (
            "You are a QA engineering assistant. "
            "Respond ONLY with valid JSON that conforms to the provided schema. "
            "Do not include markdown fences or any text outside the JSON object.\n\n"
            f"Schema:\n{schema_json}"
        )

        response = await client.responses.create(
            model=self._model,
            instructions=system,
            input=prompt,
            max_output_tokens=8192,
            text={"format": {"type": "json_object"}},
            timeout=120,
        )

        raw = getattr(response, "output_text", None) or "{}"
        try:
            data = json.loads(raw)
            return schema.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.error("OpenAI response failed schema validation: %s\nRaw: %s", exc, raw[:500])
            raise ValueError(f"AI response did not match expected schema: {exc}") from exc
