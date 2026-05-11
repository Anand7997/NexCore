"""
APIExecutionPlugin — REST execution backed by httpx.

Implements 9 node types under the `api.*` namespace:

    api.request           generic request (legacy fallback)
    api.get               GET request
    api.post              POST request
    api.put               PUT request
    api.delete            DELETE request
    api.assert_status     assert response status
    api.assert_json_path  assert JSONPath value
    api.extract           extract response field into shared context
    api.assert_headers    header validation
    api.assert_response_time  response-time validation

Cross-node state:
    The plugin maintains one httpx.AsyncClient per execution_id, shared across
    nodes so cookies and connection pools persist (handy for login → API flow).

Artifacts produced:
    - HTTP_REQUEST  (request.json) — method, url, headers, body
    - HTTP_RESPONSE (response.json) — status, headers, body, duration
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

from app.config import settings
from app.events.types import ApiCall
from app.execution.artifacts import ArtifactKind
from app.execution.interpolation import VariableInterpolator
from app.execution.jsonpath import query as jsonpath_query
from app.execution.plugin import (
    ExecutionEnvelope,
    ExecutionPlugin,
    PluginNodeSpec,
    PluginResult,
    PluginValidationError,
)

logger = logging.getLogger(__name__)


# ── Helpers ─────────────────────────────────────────────────────────────────

def _decode_body(resp: httpx.Response) -> tuple[Any, bool]:
    """Returns (body, is_json). Falls back to text on JSON parse error."""
    ctype = resp.headers.get("content-type", "")
    if "application/json" in ctype:
        try:
            return resp.json(), True
        except Exception:
            pass
    try:
        return resp.text, False
    except Exception:
        return f"<{len(resp.content)} bytes>", False


def _summarize_headers(headers: httpx.Headers) -> dict[str, str]:
    return {k.lower(): v for k, v in headers.items()}


# ── Plugin ──────────────────────────────────────────────────────────────────

class APIExecutionPlugin(ExecutionPlugin):
    name = "api"
    version = "1.0.0"
    description = "HTTP REST execution backed by httpx.AsyncClient"

    SESSION_KEY = "_api_client"

    def __init__(self) -> None:
        super().__init__()
        # client per execution_id
        self._clients: dict[str, httpx.AsyncClient] = {}
        self._lock = asyncio.Lock()

    # ---- Discovery ---------------------------------------------------------

    def node_specs(self) -> list[PluginNodeSpec]:
        common_request = {
            "url":     {"type": "string", "required": True, "supports_template": True},
            "headers": {"type": "object", "supports_template": True},
            "params":  {"type": "object", "supports_template": True},
            "timeout_seconds": {"type": "number", "default": 30},
        }
        body_field = {"body": {"type": "object", "supports_template": True}}

        return [
            PluginNodeSpec(
                type="api.get",
                plugin="api",
                label="GET Request",
                category="API Automation",
                description="Issue an HTTP GET request and capture the response.",
                icon="cloud-download",
                color="#06b6d4",
                config_schema=common_request,
            ),
            PluginNodeSpec(
                type="api.post",
                plugin="api",
                label="POST Request",
                category="API Automation",
                description="Issue an HTTP POST request with a JSON body.",
                icon="cloud-upload",
                color="#0891b2",
                config_schema={**common_request, **body_field},
            ),
            PluginNodeSpec(
                type="api.put",
                plugin="api",
                label="PUT Request",
                category="API Automation",
                description="Issue an HTTP PUT request with a JSON body.",
                icon="upload",
                color="#0284c7",
                config_schema={**common_request, **body_field},
            ),
            PluginNodeSpec(
                type="api.delete",
                plugin="api",
                label="DELETE Request",
                category="API Automation",
                description="Issue an HTTP DELETE request.",
                icon="trash",
                color="#dc2626",
                config_schema=common_request,
            ),
            PluginNodeSpec(
                type="api.assert_status",
                plugin="api",
                label="Assert Status",
                category="API Automation",
                description="Make a request and assert the response status code.",
                icon="check-circle",
                color="#16a34a",
                config_schema={**common_request, "method": {"type": "string", "default": "GET"},
                               "expected_status": {"type": "number", "required": True}},
            ),
            PluginNodeSpec(
                type="api.assert_json_path",
                plugin="api",
                label="Assert JSON Path",
                category="API Automation",
                description="Assert a value at a JSONPath expression in the response.",
                icon="search-check",
                color="#2563eb",
                config_schema={
                    **common_request,
                    "method": {"type": "string", "default": "GET"},
                    "path": {"type": "string", "required": True, "example": "$.data.id"},
                    "expected": {"type": "any", "supports_template": True},
                    "operator": {"type": "string", "enum": ["eq", "ne", "exists", "contains"], "default": "eq"},
                },
            ),
            PluginNodeSpec(
                type="api.extract",
                plugin="api",
                label="Extract Response Field",
                category="API Automation",
                description="Extract a JSONPath value from the response into the shared context.",
                icon="braces",
                color="#7c3aed",
                config_schema={
                    **common_request,
                    "method": {"type": "string", "default": "GET"},
                    "path": {"type": "string", "required": True, "example": "$.token"},
                    "variable": {"type": "string", "required": True, "example": "auth_token"},
                },
            ),
            PluginNodeSpec(
                type="api.assert_headers",
                plugin="api",
                label="Header Validation",
                category="API Automation",
                description="Assert one or more response headers match expected values.",
                icon="badge-check",
                color="#0d9488",
                config_schema={
                    **common_request,
                    "method": {"type": "string", "default": "GET"},
                    "expected_headers": {"type": "object", "required": True,
                                         "example": {"content-type": "application/json"}},
                },
            ),
            PluginNodeSpec(
                type="api.assert_response_time",
                plugin="api",
                label="Response Time Validation",
                category="API Automation",
                description="Make a request and assert response time stays under a threshold.",
                icon="timer",
                color="#f59e0b",
                config_schema={
                    **common_request,
                    "method": {"type": "string", "default": "GET"},
                    "max_ms": {"type": "number", "required": True, "default": 1000},
                },
            ),
        ]

    # ---- Lifecycle ---------------------------------------------------------

    async def on_execution_start(self, execution_id: str) -> None:
        async with self._lock:
            if execution_id in self._clients:
                return
            self._clients[execution_id] = httpx.AsyncClient(
                timeout=httpx.Timeout(settings.api_plugin_default_timeout),
                follow_redirects=True,
                headers={"User-Agent": "NEXUS-QA-Executor/1.0"},
            )

    async def on_execution_end(self, execution_id: str) -> None:
        async with self._lock:
            client = self._clients.pop(execution_id, None)
        if client:
            await client.aclose()

    async def _client_for(self, execution_id: str) -> httpx.AsyncClient:
        async with self._lock:
            client = self._clients.get(execution_id)
            if client is None:
                client = httpx.AsyncClient(
                    timeout=httpx.Timeout(settings.api_plugin_default_timeout),
                    follow_redirects=True,
                    headers={"User-Agent": "NEXUS-QA-Executor/1.0"},
                )
                self._clients[execution_id] = client
            return client

    # ---- Execution dispatcher ---------------------------------------------

    async def validate(self, envelope: ExecutionEnvelope) -> None:
        cfg = envelope.config
        if envelope.node_type in {
            "api.get", "api.post", "api.put", "api.delete",
            "api.assert_status", "api.assert_json_path", "api.extract",
            "api.assert_headers", "api.assert_response_time", "api.request",
        }:
            if not cfg.get("url"):
                raise PluginValidationError("`url` is required for API nodes")
        if envelope.node_type == "api.assert_status" and "expected_status" not in cfg:
            raise PluginValidationError("`expected_status` is required")
        if envelope.node_type == "api.assert_json_path" and "path" not in cfg:
            raise PluginValidationError("`path` is required")
        if envelope.node_type == "api.extract":
            if "path" not in cfg or "variable" not in cfg:
                raise PluginValidationError("`path` and `variable` are required")
        if envelope.node_type == "api.assert_headers" and "expected_headers" not in cfg:
            raise PluginValidationError("`expected_headers` is required")
        if envelope.node_type == "api.assert_response_time" and "max_ms" not in cfg:
            raise PluginValidationError("`max_ms` is required")

    async def execute(self, envelope: ExecutionEnvelope) -> PluginResult:
        # Resolve all templates against the shared context up front.
        ctx_vars = await envelope.context.all()
        cfg = VariableInterpolator.interpolate(envelope.config, ctx_vars)

        # Map node-type → method default
        method_for: dict[str, str] = {
            "api.get": "GET", "api.post": "POST",
            "api.put": "PUT", "api.delete": "DELETE",
        }
        method = method_for.get(envelope.node_type, str(cfg.get("method", "GET")).upper())
        url = cfg["url"]
        headers = cfg.get("headers", {}) or {}
        params = cfg.get("params", {}) or {}
        body = cfg.get("body")
        timeout = float(cfg.get("timeout_seconds", settings.api_plugin_default_timeout))

        client = await self._client_for(envelope.execution_id)

        # Capture request artifact before sending — useful even if the call fails.
        await envelope.artifacts.record_json(
            ArtifactKind.HTTP_REQUEST, "request.json",
            {"method": method, "url": url, "headers": headers,
             "params": params, "body": body, "timeout": timeout},
            metadata={"node_key": envelope.node_key},
        )

        await envelope.log("info", f"→ {method} {url}", source="api")

        start = time.perf_counter()
        try:
            request_kwargs: dict[str, Any] = {
                "method": method,
                "url": url,
                "headers": headers,
                "params": params,
                "timeout": timeout,
            }
            if body is not None and method.upper() not in {"GET", "DELETE"}:
                request_kwargs["json"] = body

            # Run the request in a way that respects cancellation.
            request_task = asyncio.create_task(client.request(**request_kwargs))
            cancel_task = asyncio.create_task(envelope.cancel_event.wait())
            done, pending = await asyncio.wait(
                {request_task, cancel_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            if cancel_task in done and not request_task.done():
                request_task.cancel()
                return PluginResult(success=False, duration_ms=0, error="Cancelled")
            response: httpx.Response = request_task.result()

        except httpx.TimeoutException as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            await envelope.emit(ApiCall(
                execution_id=envelope.execution_id,
                node_id=envelope.node_key,
                method=method, url=url,
                duration_ms=duration_ms,
                error=f"Timeout: {exc}",
            ))
            return PluginResult(
                success=False, duration_ms=duration_ms,
                error=f"Request timed out after {timeout}s",
            )
        except Exception as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            await envelope.emit(ApiCall(
                execution_id=envelope.execution_id,
                node_id=envelope.node_key,
                method=method, url=url,
                duration_ms=duration_ms,
                error=str(exc),
            ))
            return PluginResult(
                success=False, duration_ms=duration_ms,
                error=f"Request failed: {exc}",
            )

        duration_ms = int((time.perf_counter() - start) * 1000)
        body_value, is_json = _decode_body(response)
        resp_headers = _summarize_headers(response.headers)

        # Record the response artifact + emit the live event.
        await envelope.artifacts.record_json(
            ArtifactKind.HTTP_RESPONSE, "response.json",
            {
                "status_code": response.status_code,
                "headers": resp_headers,
                "duration_ms": duration_ms,
                "is_json": is_json,
                "body": body_value if is_json else (body_value[:4000] if isinstance(body_value, str) else None),
            },
            metadata={"node_key": envelope.node_key, "url": url},
        )

        await envelope.emit(ApiCall(
            execution_id=envelope.execution_id,
            node_id=envelope.node_key,
            method=method, url=url,
            status_code=response.status_code,
            duration_ms=duration_ms,
            request_size=len(response.request.content or b""),
            response_size=len(response.content or b""),
        ))
        await envelope.log(
            "success" if response.is_success else "warn",
            f"← {response.status_code} {url} ({duration_ms}ms)",
            source="api",
        )

        # ── Per-node-type assertion / extraction logic ─────────────────────
        output: dict[str, Any] = {
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "url": url,
            "method": method,
            "is_json": is_json,
        }
        if is_json:
            output["response"] = body_value

        return await self._post_process(envelope, cfg, response, body_value, is_json,
                                        resp_headers, duration_ms, output)

    async def _post_process(
        self,
        envelope: ExecutionEnvelope,
        cfg: dict[str, Any],
        response: httpx.Response,
        body: Any,
        is_json: bool,
        headers: dict[str, str],
        duration_ms: int,
        output: dict[str, Any],
    ) -> PluginResult:
        nt = envelope.node_type

        # Plain request — succeed on 2xx, fail otherwise.
        if nt in {"api.get", "api.post", "api.put", "api.delete", "api.request"}:
            success = 200 <= response.status_code < 400
            return PluginResult(
                success=success, duration_ms=duration_ms, output=output,
                error=None if success else f"HTTP {response.status_code}",
            )

        if nt == "api.assert_status":
            expected = int(cfg["expected_status"])
            actual = response.status_code
            success = actual == expected
            output["expected_status"] = expected
            output["actual_status"] = actual
            return PluginResult(
                success=success, duration_ms=duration_ms, output=output,
                error=None if success else f"Expected status {expected}, got {actual}",
            )

        if nt == "api.assert_json_path":
            if not is_json:
                return PluginResult(
                    success=False, duration_ms=duration_ms, output=output,
                    error="Response is not JSON",
                )
            path = cfg["path"]
            actual = jsonpath_query(body, path)
            operator = cfg.get("operator", "eq")
            expected = cfg.get("expected")
            output["path"] = path
            output["resolved_value"] = actual

            if operator == "exists":
                success = actual is not None
                err = None if success else f"Path {path} not found"
            elif operator == "eq":
                success = actual == expected
                err = None if success else f"Expected {expected!r} at {path}, got {actual!r}"
            elif operator == "ne":
                success = actual != expected
                err = None if success else f"Expected {path} != {expected!r}, got {actual!r}"
            elif operator == "contains":
                if isinstance(actual, (list, str, dict)):
                    success = expected in actual
                else:
                    success = False
                err = None if success else f"{actual!r} does not contain {expected!r}"
            else:
                success = False
                err = f"Unknown operator: {operator}"
            return PluginResult(
                success=success, duration_ms=duration_ms, output=output, error=err,
            )

        if nt == "api.extract":
            if not is_json:
                return PluginResult(
                    success=False, duration_ms=duration_ms, output=output,
                    error="Response is not JSON",
                )
            path = cfg["path"]
            variable = cfg["variable"]
            value = jsonpath_query(body, path)
            if value is None:
                return PluginResult(
                    success=False, duration_ms=duration_ms, output=output,
                    error=f"Path {path} not found",
                )
            output[variable] = value
            await envelope.log(
                "info", f"Extracted {variable}={value!r} from {path}", source="api",
            )
            return PluginResult(success=True, duration_ms=duration_ms, output=output)

        if nt == "api.assert_headers":
            expected_headers = {k.lower(): v for k, v in cfg["expected_headers"].items()}
            mismatches: list[str] = []
            for name, expected in expected_headers.items():
                actual = headers.get(name)
                # Allow value substring match for content-type-style headers.
                if actual is None:
                    mismatches.append(f"missing header {name!r}")
                elif expected not in actual and actual != expected:
                    mismatches.append(
                        f"{name}: expected {expected!r}, got {actual!r}"
                    )
            output["expected_headers"] = expected_headers
            output["actual_headers"] = headers
            success = not mismatches
            return PluginResult(
                success=success, duration_ms=duration_ms, output=output,
                error=None if success else "; ".join(mismatches),
            )

        if nt == "api.assert_response_time":
            max_ms = int(cfg["max_ms"])
            output["max_ms"] = max_ms
            output["actual_ms"] = duration_ms
            success = duration_ms <= max_ms
            return PluginResult(
                success=success, duration_ms=duration_ms, output=output,
                error=None if success else f"Response took {duration_ms}ms (max {max_ms}ms)",
            )

        # Unknown node type — should never hit because supports() gates entry.
        return PluginResult(
            success=False, duration_ms=duration_ms, output=output,
            error=f"Unsupported API node type: {nt}",
        )
