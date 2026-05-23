from __future__ import annotations

import json
import logging
import re
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.ai_workflow.providers.base import AbstractAIProvider
from app.ai_workflow.providers.http_client import build_async_http_client

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)
_UNQUOTED_KEY_RE = re.compile(r"(?<=[{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:")
_TRAILING_COMMA_RE = re.compile(r",\s*([}\]])")


class OpenAIIncompleteResponseError(ValueError):
    def __init__(self, status: str | None, details: object) -> None:
        self.status = status
        self.details = details
        self.reason = _get_attr_or_item(details, "reason")
        super().__init__(
            f"OpenAI response incomplete with status={status}: {details}"
        )


def _extract_json_text(raw: str) -> str:
    text = raw.strip()
    match = _FENCE_RE.search(text)
    if match:
        text = match.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]
    return text


def _load_model_json(raw: str) -> dict:
    cleaned = _extract_json_text(raw)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        repaired = _UNQUOTED_KEY_RE.sub(r'"\1":', cleaned)
        repaired = _TRAILING_COMMA_RE.sub(r"\1", repaired)
        data = json.loads(repaired)

    if not isinstance(data, dict):
        raise ValueError("AI response must be a JSON object")
    return data


def _get_attr_or_item(value: object, name: str) -> Any:
    if isinstance(value, dict):
        return value.get(name)
    return getattr(value, name, None)


def _compact_response_dump(response: object) -> str:
    if hasattr(response, "model_dump_json"):
        return response.model_dump_json(exclude_none=True)[:1000]
    return repr(response)[:1000]


def _extract_response_text(response: object) -> str:
    status = _get_attr_or_item(response, "status")
    error = _get_attr_or_item(response, "error")
    if error:
        raise ValueError(f"OpenAI response failed with status={status}: {error}")

    incomplete_details = _get_attr_or_item(response, "incomplete_details")
    if incomplete_details:
        raise OpenAIIncompleteResponseError(status, incomplete_details)

    output_text = _get_attr_or_item(response, "output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    chunks: list[str] = []
    for output_item in _get_attr_or_item(response, "output") or []:
        for content_part in _get_attr_or_item(output_item, "content") or []:
            refusal = _get_attr_or_item(content_part, "refusal")
            if refusal:
                raise ValueError(f"OpenAI response refused the request: {refusal}")

            text = _get_attr_or_item(content_part, "text")
            if isinstance(text, str) and text.strip():
                chunks.append(text)
                continue

            parsed = _get_attr_or_item(content_part, "parsed")
            if isinstance(parsed, BaseModel):
                chunks.append(parsed.model_dump_json())
            elif isinstance(parsed, dict):
                chunks.append(json.dumps(parsed))

    if chunks:
        return "\n".join(chunks)

    raise ValueError(
        "OpenAI response did not include output text; "
        f"status={status}; response={_compact_response_dump(response)}"
    )


def _to_openai_response_schema(schema: type[T]) -> dict:
    response_schema = schema.model_json_schema()

    def visit(node: object) -> None:
        if isinstance(node, dict):
            node.pop("default", None)
            if node.get("type") == "object" or "properties" in node:
                node["additionalProperties"] = False
                properties = node.get("properties")
                if isinstance(properties, dict):
                    node["required"] = list(properties.keys())
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for item in node:
                visit(item)

    visit(response_schema)
    return response_schema


def _model_generation_tier(model: str) -> str:
    model_lower = model.lower()
    if any(part in model_lower for part in ("nano", "haiku")):
        return "fast"
    if any(part in model_lower for part in ("mini", "sonnet")):
        return "balanced"
    if any(part in model_lower for part in ("gpt-5", "gpt-4.1", "opus")):
        return "best"
    return "balanced"


def _initial_max_output_tokens(schema: type[BaseModel], model: str = "") -> int:
    tier = _model_generation_tier(model)
    if schema.__name__ == "ScenarioList":
        if tier == "fast":
            return 10000
        if tier == "best":
            return 24000
        return 16000
    if schema.__name__ == "TestCaseList":
        if tier == "fast":
            return 12000
        if tier == "best":
            return 32000
        return 20000
    return 8192


def _reasoning_options(model: str) -> dict[str, str] | None:
    if model.startswith("gpt-5"):
        return {"effort": "minimal"}
    return None


class OpenAIProvider(AbstractAIProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
        self._client = None  # lazy-initialised on first use
        self._http_client = None

    def _get_client(self):
        if self._client is None:
            if not self._api_key.strip():
                raise ValueError("OPENAI_API_KEY is required for OpenAIProvider")
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
        response_schema = _to_openai_response_schema(schema)
        schema_json = json.dumps(response_schema, indent=2)
        system = (
            "You are a QA engineering assistant. "
            "Respond ONLY with one valid JSON object that conforms to the provided schema. "
            "All property names and string values must be enclosed in double quotes. "
            "Do not include markdown fences or any text outside the JSON object.\n\n"
            f"Schema:\n{schema_json}"
        )

        max_output_tokens = _initial_max_output_tokens(schema, self._model)
        last_incomplete: OpenAIIncompleteResponseError | None = None
        raw = ""
        for attempt in range(2):
            request: dict[str, Any] = {
                "model": self._model,
                "instructions": system,
                "input": prompt,
                "max_output_tokens": max_output_tokens,
                "text": {
                    "format": {
                        "type": "json_schema",
                        "name": schema.__name__,
                        "schema": response_schema,
                        "strict": True,
                    }
                },
                "timeout": 120,
            }
            reasoning = _reasoning_options(self._model)
            if reasoning is not None:
                request["reasoning"] = reasoning

            response = await client.responses.create(**request)
            try:
                raw = _extract_response_text(response)
                break
            except OpenAIIncompleteResponseError as exc:
                last_incomplete = exc
                if exc.reason != "max_output_tokens" or attempt == 1:
                    raise
                max_output_tokens *= 2
                logger.warning(
                    "OpenAI response hit max_output_tokens=%d for %s; retrying with %d",
                    request["max_output_tokens"],
                    schema.__name__,
                    max_output_tokens,
                )
        else:
            if last_incomplete is not None:
                raise last_incomplete

        try:
            data = _load_model_json(raw)
            return schema.model_validate(data)
        except (json.JSONDecodeError, ValidationError, ValueError) as exc:
            logger.error("OpenAI response failed schema validation: %s\nRaw: %s", exc, raw[:500])
            raise ValueError(f"AI response did not match expected schema: {exc}") from exc
