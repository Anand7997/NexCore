"""Runs control-plane commands on the local orchestration engine."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select

from app.database.models import ExecutionModel
from app.database.session import AsyncSessionLocal
from app.orchestration import engine as orchestration_engine
from app.orchestration.state_machine import ExecutionStatus

logger = logging.getLogger(__name__)


class ExecutionCommandHandler:
    """Handles ``run_execution`` and ``cancel_execution`` commands for one worker process."""

    async def handle(self, command: dict[str, Any]) -> None:
        command_type = command.get("type")
        payload = command.get("payload") or {}
        execution_id = command.get("execution_id") or payload.get("execution_id")
        if not execution_id:
            raise ValueError(f"Command {command.get('id')} has no execution_id")

        tenant_id = payload.get("tenant_id") or command.get("tenant_id")
        if command_type == "run_execution":
            await self._run(execution_id, tenant_id=tenant_id)
        elif command_type == "cancel_execution":
            if not orchestration_engine.cancel_execution(execution_id):
                logger.info("Cancel for %s ignored: not running in this worker", execution_id)
        else:
            raise ValueError(f"Unsupported command type: {command_type}")

    def active_count(self) -> int:
        return orchestration_engine.active_execution_count()

    async def _run(self, execution_id: str, *, tenant_id: str | None = None) -> None:
        if orchestration_engine.get_active_engine(execution_id) is not None:
            return
        async with AsyncSessionLocal() as db:
            status = await db.scalar(select(ExecutionModel.status).where(ExecutionModel.id == execution_id))
        if status is None:
            raise LookupError(f"Execution {execution_id} not found")
        if str(getattr(status, "value", status)) != ExecutionStatus.QUEUED.value:
            # Already started or finished elsewhere: never run an execution twice.
            logger.info("Skipping run for %s: execution status is %s", execution_id, status)
            return
        if tenant_id:
            await orchestration_engine.launch_execution(execution_id, tenant_id=tenant_id)
        else:
            await orchestration_engine.launch_execution(execution_id)
