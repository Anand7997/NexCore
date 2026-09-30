from __future__ import annotations

import json

import httpx
import pytest

from app.worker_runtime.agent_worker import AgentConfig, RuntimeAgentWorker, stable_agent_id


class _RecordingHandler:
    def __init__(self, fail_types: set[str] | None = None) -> None:
        self.handled: list[dict] = []
        self.fail_types = fail_types or set()

    async def handle(self, command: dict) -> None:
        self.handled.append(command)
        if command["type"] in self.fail_types:
            raise RuntimeError("boom")

    def active_count(self) -> int:
        return len(self.handled)


def _control_plane(commands: list[dict], requests: list[httpx.Request]):
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        path = request.url.path
        if path == "/api/runtime/agents":
            return httpx.Response(201, json={"id": json.loads(request.content)["id"]})
        if path.endswith("/commands"):
            return httpx.Response(200, json=commands)
        if path.endswith("/ack"):
            return httpx.Response(200, json={"status": json.loads(request.content)["status"]})
        return httpx.Response(200, json={"status": "idle"})

    return handler


def _worker(client: httpx.AsyncClient, handler: _RecordingHandler | None = None, **config: object) -> RuntimeAgentWorker:
    return RuntimeAgentWorker(AgentConfig("host-a", "http://cp", ("web",), **config), http_client=client, handler=handler)


@pytest.mark.asyncio
async def test_registers_with_stable_uuid_derived_from_agent_id() -> None:
    requests: list[httpx.Request] = []
    async with httpx.AsyncClient(transport=httpx.MockTransport(_control_plane([], requests))) as client:
        first, second = _worker(client), _worker(client)
        await first.register()
        await second.register()

    assert first.registered_agent_id == second.registered_agent_id == stable_agent_id("host-a")
    assert len(first.registered_agent_id or "") == 36


@pytest.mark.asyncio
async def test_poll_runs_commands_and_acks_outcome() -> None:
    requests: list[httpx.Request] = []
    commands = [
        {"id": "cmd-1", "type": "run_execution", "execution_id": "exec-1", "payload": {}},
        {"id": "cmd-2", "type": "cancel_execution", "execution_id": "exec-2", "payload": {}},
    ]
    handler = _RecordingHandler(fail_types={"cancel_execution"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(_control_plane(commands, requests))) as client:
        worker = _worker(client, handler)
        await worker.register()
        await worker.poll_once()
        heartbeat_index = len(requests)
        await worker.heartbeat()

    assert [command["id"] for command in handler.handled] == ["cmd-1", "cmd-2"]
    acks = {r.url.path.split("/")[-2]: json.loads(r.content) for r in requests if r.url.path.endswith("/ack")}
    assert acks["cmd-1"] == {"status": "completed", "error": None}
    assert acks["cmd-2"] == {"status": "failed", "error": "boom"}
    assert json.loads(requests[heartbeat_index].content)["active_leases"] == 2


@pytest.mark.asyncio
async def test_redelivered_command_is_acked_without_running_twice() -> None:
    requests: list[httpx.Request] = []
    commands = [{"id": "cmd-1", "type": "run_execution", "execution_id": "exec-1", "payload": {}}]
    handler = _RecordingHandler()
    async with httpx.AsyncClient(transport=httpx.MockTransport(_control_plane(commands, requests))) as client:
        worker = _worker(client, handler)
        await worker.register()
        await worker.poll_once()
        await worker.poll_once()

    assert len(handler.handled) == 1
    assert sum(1 for r in requests if r.url.path.endswith("/ack")) == 2


@pytest.mark.asyncio
async def test_tenant_header_is_sent_when_configured() -> None:
    requests: list[httpx.Request] = []
    async with httpx.AsyncClient(transport=httpx.MockTransport(_control_plane([], requests))) as client:
        await _worker(client, tenant_id="acme").register()

    assert requests[0].headers["x-tenant-id"] == "acme"
