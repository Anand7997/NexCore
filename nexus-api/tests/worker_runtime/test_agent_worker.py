from __future__ import annotations

import json

import httpx
import pytest

from app.worker_runtime.agent_worker import AgentConfig, RuntimeAgentWorker


@pytest.mark.asyncio
async def test_registers_and_heartbeats_against_runtime_api() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/api/runtime/agents":
            return httpx.Response(201, json={"id": "server-agent-1"})
        if request.url.path == "/api/runtime/agents/server-agent-1/heartbeat":
            return httpx.Response(200, json={"id": "server-agent-1", "status": "ready"})
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        worker = RuntimeAgentWorker(
            AgentConfig(
                agent_id="local-agent",
                control_plane_url="http://control-plane/api/",
                capabilities=("web", "api"),
            ),
            http_client=client,
        )

        registration = await worker.register()
        heartbeat = await worker.heartbeat()

    assert registration["id"] == "server-agent-1"
    assert heartbeat["status"] == "ready"
    assert worker.registered_agent_id == "server-agent-1"
    assert [request.url.path for request in requests] == [
        "/api/runtime/agents",
        "/api/runtime/agents/server-agent-1/heartbeat",
    ]
    registration_payload = json.loads(requests[0].content)
    assert registration_payload["name"] == "local-agent"
    assert registration_payload["capabilities"] == ["web", "api"]


@pytest.mark.asyncio
async def test_re_registers_after_control_plane_loses_agent() -> None:
    registration_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal registration_count
        if request.url.path == "/api/runtime/agents":
            registration_count += 1
            return httpx.Response(201, json={"id": f"server-agent-{registration_count}"})
        if request.url.path.endswith("server-agent-1/heartbeat"):
            return httpx.Response(404, json={"detail": "Runtime agent not found"})
        return httpx.Response(200, json={"id": "server-agent-2", "status": "ready"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        worker = RuntimeAgentWorker(
            AgentConfig("local-agent", "http://control-plane", ("web",)),
            http_client=client,
        )
        await worker.register()
        with pytest.raises(httpx.HTTPStatusError):
            await worker.heartbeat()
        await worker.heartbeat()

    assert registration_count == 2
    assert worker.registered_agent_id == "server-agent-2"
