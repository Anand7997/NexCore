from __future__ import annotations

import json

import httpx
import pytest

from app.control_plane.client import ControlPlaneClient, ControlPlaneUnavailable


@pytest.mark.asyncio
async def test_schedule_posts_to_control_plane_with_tenant() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"execution_id": "exec-1", "status": "dispatched"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        client = ControlPlaneClient("http://cp:3001", http_client=http)
        item = await client.schedule_execution(
            "exec-1", platform="web", priority=10, required_capabilities=["chrome"], tenant_id="acme"
        )

    assert item["status"] == "dispatched"
    assert requests[0].url.path == "/api/runtime/executions/exec-1/schedule"
    assert requests[0].headers["x-tenant-id"] == "acme"
    assert json.loads(requests[0].content) == {"platform": "web", "priority": 10, "required_capabilities": ["chrome"]}


@pytest.mark.asyncio
async def test_lifecycle_reports_tolerate_unknown_executions() -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(404, json={}))) as http:
        client = ControlPlaneClient("http://cp", http_client=http)
        assert await client.mark_running("missing") is None
        assert await client.finish_execution("missing", "completed") is None


@pytest.mark.asyncio
async def test_unreachable_control_plane_raises_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        client = ControlPlaneClient("http://cp", http_client=http)
        with pytest.raises(ControlPlaneUnavailable):
            await client.schedule_execution("exec-1", platform="web")


@pytest.mark.asyncio
async def test_rejected_request_raises_unavailable() -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(409, json={"error": "x"}))) as http:
        client = ControlPlaneClient("http://cp", http_client=http)
        with pytest.raises(ControlPlaneUnavailable):
            await client.schedule_execution("exec-1", platform="web")
