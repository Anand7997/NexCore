"""HTTP client for the .NET control plane.

The control plane (``settings.control_plane_url``, port 3001) owns runtime
agents, the execution queue, leases and agent commands. FastAPI never keeps a
registry of its own; it asks the control plane to queue executions and reports
lifecycle transitions back to it.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class ControlPlaneUnavailable(RuntimeError):
    """The control plane could not be reached or rejected the request."""


class ControlPlaneClient:
    def __init__(
        self,
        base_url: str | None = None,
        *,
        http_client: httpx.AsyncClient | None = None,
        timeout_seconds: float | None = None,
    ) -> None:
        root = (base_url or settings.control_plane_url).rstrip("/")
        self._api_base_url = root if root.endswith("/api") else f"{root}/api"
        self._http_client = http_client
        self._timeout = timeout_seconds or settings.control_plane_timeout_seconds

    async def _request(
        self,
        method: str,
        path: str,
        *,
        tenant_id: str | None = None,
        json: Any = None,
        allow_not_found: bool = False,
    ) -> Any:
        headers = {"x-tenant-id": tenant_id} if tenant_id else {}
        url = f"{self._api_base_url}{path}"
        try:
            if self._http_client is not None:
                response = await self._http_client.request(method, url, json=json, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    response = await client.request(method, url, json=json, headers=headers)
        except httpx.HTTPError as exc:
            raise ControlPlaneUnavailable(f"Control plane request failed ({method} {url}): {exc}") from exc

        if allow_not_found and response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise ControlPlaneUnavailable(
                f"Control plane rejected {method} {path}: {response.status_code} {response.text[:300]}"
            )
        return response.json() if response.content else None

    async def schedule_execution(
        self,
        execution_id: str,
        *,
        platform: str,
        priority: int = 100,
        required_capabilities: list[str] | None = None,
        tenant_id: str | None = None,
    ) -> dict[str, Any]:
        return await self._request(
            "POST",
            f"/runtime/executions/{execution_id}/schedule",
            tenant_id=tenant_id,
            json={
                "platform": platform,
                "priority": priority,
                "required_capabilities": list(required_capabilities or []),
            },
        )

    async def mark_running(self, execution_id: str, *, tenant_id: str | None = None) -> dict[str, Any] | None:
        return await self._request(
            "POST",
            f"/runtime/executions/{execution_id}/running",
            tenant_id=tenant_id,
            allow_not_found=True,
        )

    async def finish_execution(self, execution_id: str, status: str, *, tenant_id: str | None = None) -> dict[str, Any] | None:
        return await self._request(
            "POST",
            f"/runtime/executions/{execution_id}/finish",
            tenant_id=tenant_id,
            json={"status": status},
            allow_not_found=True,
        )

    async def cancel_execution(self, execution_id: str, *, tenant_id: str | None = None) -> dict[str, Any] | None:
        return await self._request(
            "POST",
            f"/runtime/executions/{execution_id}/cancel",
            tenant_id=tenant_id,
            allow_not_found=True,
        )


_client: ControlPlaneClient | None = None


def get_control_plane() -> ControlPlaneClient:
    global _client
    if _client is None:
        _client = ControlPlaneClient()
    return _client
