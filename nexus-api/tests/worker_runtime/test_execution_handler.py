from __future__ import annotations

import pytest

from app.worker_runtime import execution_handler as module
from app.worker_runtime.execution_handler import ExecutionCommandHandler


class _Session:
    def __init__(self, status: str | None) -> None:
        self.status = status

    async def __aenter__(self) -> "_Session":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def scalar(self, _statement: object) -> str | None:
        return self.status


@pytest.fixture
def launched(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    calls: list[str] = []

    async def fake_launch(execution_id: str) -> None:
        calls.append(execution_id)

    monkeypatch.setattr(module.orchestration_engine, "launch_execution", fake_launch)
    return calls


@pytest.mark.asyncio
async def test_runs_queued_execution(monkeypatch: pytest.MonkeyPatch, launched: list[str]) -> None:
    monkeypatch.setattr(module, "AsyncSessionLocal", lambda: _Session("queued"))
    await ExecutionCommandHandler().handle({"id": "c1", "type": "run_execution", "execution_id": "exec-1"})
    assert launched == ["exec-1"]


@pytest.mark.asyncio
async def test_never_reruns_a_started_execution(monkeypatch: pytest.MonkeyPatch, launched: list[str]) -> None:
    monkeypatch.setattr(module, "AsyncSessionLocal", lambda: _Session("success"))
    await ExecutionCommandHandler().handle({"id": "c1", "type": "run_execution", "payload": {"execution_id": "exec-1"}})
    assert launched == []


@pytest.mark.asyncio
async def test_missing_execution_fails_the_command(monkeypatch: pytest.MonkeyPatch, launched: list[str]) -> None:
    monkeypatch.setattr(module, "AsyncSessionLocal", lambda: _Session(None))
    with pytest.raises(LookupError):
        await ExecutionCommandHandler().handle({"id": "c1", "type": "run_execution", "execution_id": "exec-1"})
    assert launched == []


@pytest.mark.asyncio
async def test_unknown_command_type_fails() -> None:
    with pytest.raises(ValueError):
        await ExecutionCommandHandler().handle({"id": "c1", "type": "reboot", "execution_id": "exec-1"})
