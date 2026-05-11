"""Distributed execution fabric control-plane service.

Phase 9 introduces schedulable runtime agents without forcing the current
single-process demo engine to become remote-only. Executions are queued,
matched to compatible agents when available, and tracked through leases.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    ExecutionModel,
    ExecutionQueueModel,
    RuntimeAgentModel,
    RuntimeLeaseModel,
)
from app.events.types import (
    ExecutionDispatched,
    ExecutionQueued,
    RuntimeAgentHeartbeat,
    RuntimeAgentRegistered,
    RuntimeLeaseReleased,
)


async def _publish(event: Any) -> None:
    try:
        from app.events.bus import get_event_bus
        await get_event_bus().publish(event)
    except RuntimeError:
        return


def _capability_requirements(platform: str, requested: list[str] | None = None) -> list[str]:
    requirements = list(requested or [])
    if platform and platform not in requirements:
        requirements.insert(0, platform)
    return requirements


class DistributedScheduler:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def register_agent(
        self,
        *,
        name: str,
        agent_type: str,
        endpoint: str | None,
        version: str,
        capabilities: list[str],
        labels: dict[str, Any],
        max_concurrency: int,
    ) -> RuntimeAgentModel:
        agent = RuntimeAgentModel(
            name=name,
            agent_type=agent_type,
            endpoint=endpoint,
            version=version,
            capabilities=capabilities,
            labels=labels,
            max_concurrency=max(1, int(max_concurrency or 1)),
            active_leases=0,
            status="idle",
            last_heartbeat_at=datetime.utcnow(),
        )
        self.db.add(agent)
        await self.db.commit()
        await self.db.refresh(agent)
        await _publish(RuntimeAgentRegistered(
            agent_id=agent.id,
            name=agent.name,
            agent_type=agent.agent_type,
            capabilities=agent.capabilities or [],
        ))
        await self.schedule_queued()
        return agent

    async def heartbeat(
        self,
        agent_id: str,
        *,
        status: str | None = None,
        active_leases: int | None = None,
        capabilities: list[str] | None = None,
        labels: dict[str, Any] | None = None,
    ) -> RuntimeAgentModel | None:
        agent = await self.db.get(RuntimeAgentModel, agent_id)
        if not agent:
            return None
        agent.last_heartbeat_at = datetime.utcnow()
        if status:
            agent.status = status
        if active_leases is not None:
            agent.active_leases = max(0, active_leases)
        if capabilities is not None:
            agent.capabilities = capabilities
        if labels is not None:
            agent.labels = labels
        await self.db.commit()
        await self.db.refresh(agent)
        await _publish(RuntimeAgentHeartbeat(
            agent_id=agent.id,
            status=agent.status,
            active_leases=agent.active_leases,
        ))
        return agent

    async def list_agents(self) -> list[RuntimeAgentModel]:
        result = await self.db.execute(
            select(RuntimeAgentModel).order_by(RuntimeAgentModel.registered_at.desc())
        )
        return list(result.scalars().all())

    async def enqueue_execution(
        self,
        execution_id: str,
        *,
        platform: str,
        priority: int = 100,
        required_capabilities: list[str] | None = None,
    ) -> ExecutionQueueModel:
        existing = await self.db.execute(
            select(ExecutionQueueModel).where(ExecutionQueueModel.execution_id == execution_id)
        )
        queue_item = existing.scalar_one_or_none()
        requirements = _capability_requirements(platform, required_capabilities)
        if queue_item is None:
            queue_item = ExecutionQueueModel(
                execution_id=execution_id,
                platform=platform,
                priority=priority,
                required_capabilities=requirements,
                status="queued",
                dispatch_reason="Waiting for compatible runtime agent.",
            )
            self.db.add(queue_item)
        else:
            queue_item.platform = platform
            queue_item.priority = priority
            queue_item.required_capabilities = requirements
            if queue_item.status in {"completed", "cancelled", "failed"}:
                queue_item.status = "queued"
                queue_item.completed_at = None
        await self.db.commit()
        await self.db.refresh(queue_item)
        await _publish(ExecutionQueued(
            execution_id=execution_id,
            queue_id=queue_item.id,
            platform=platform,
            priority=priority,
            required_capabilities=requirements,
        ))
        await self.schedule_one(queue_item.id)
        return queue_item

    async def schedule_queued(self) -> int:
        result = await self.db.execute(
            select(ExecutionQueueModel)
            .where(ExecutionQueueModel.status == "queued")
            .order_by(ExecutionQueueModel.priority.asc(), ExecutionQueueModel.queued_at.asc())
        )
        count = 0
        for item in result.scalars().all():
            lease = await self._assign(item)
            if lease:
                count += 1
        await self.db.commit()
        return count

    async def schedule_one(self, queue_id: str) -> RuntimeLeaseModel | None:
        item = await self.db.get(ExecutionQueueModel, queue_id)
        if item is None:
            return None
        lease = await self._assign(item)
        await self.db.commit()
        return lease

    async def _assign(self, item: ExecutionQueueModel) -> RuntimeLeaseModel | None:
        agent = await self._find_agent(item.platform, item.required_capabilities or [])
        if agent is None:
            item.dispatch_reason = "No compatible runtime agent is currently available."
            return None

        lease = RuntimeLeaseModel(
            execution_id=item.execution_id,
            agent_id=agent.id,
            platform=item.platform,
            status="active",
            heartbeat_at=datetime.utcnow(),
            lease_metadata={
                "queue_id": item.id,
                "required_capabilities": item.required_capabilities or [],
            },
        )
        self.db.add(lease)
        agent.active_leases = (agent.active_leases or 0) + 1
        agent.status = "busy" if agent.active_leases >= agent.max_concurrency else "idle"
        item.status = "dispatched"
        item.assigned_agent_id = agent.id
        item.dispatched_at = datetime.utcnow()
        item.dispatch_reason = "Assigned to compatible runtime agent."
        await self.db.flush()
        await _publish(ExecutionDispatched(
            execution_id=item.execution_id,
            queue_id=item.id,
            agent_id=agent.id,
            lease_id=lease.id,
            platform=item.platform,
        ))
        return lease

    async def _find_agent(self, platform: str, requirements: list[str]) -> RuntimeAgentModel | None:
        heartbeat_cutoff = datetime.utcnow() - timedelta(seconds=90)
        result = await self.db.execute(
            select(RuntimeAgentModel)
            .where(RuntimeAgentModel.status.in_(["idle", "ready"]))
            .where(RuntimeAgentModel.active_leases < RuntimeAgentModel.max_concurrency)
            .order_by(RuntimeAgentModel.active_leases.asc(), RuntimeAgentModel.last_heartbeat_at.desc())
        )
        for agent in result.scalars().all():
            if agent.last_heartbeat_at and agent.last_heartbeat_at < heartbeat_cutoff:
                agent.status = "offline"
                continue
            capabilities = set(agent.capabilities or [])
            if platform not in capabilities and "any" not in capabilities:
                continue
            if all(req in capabilities or req == platform for req in requirements):
                return agent
        return None

    async def mark_execution_running(self, execution_id: str) -> None:
        result = await self.db.execute(
            select(ExecutionQueueModel).where(ExecutionQueueModel.execution_id == execution_id)
        )
        item = result.scalar_one_or_none()
        if item and item.status in {"queued", "dispatched"}:
            item.status = "running"
            item.started_at = datetime.utcnow()
            await self.db.commit()

    async def finish_execution(self, execution_id: str, final_status: str) -> None:
        result = await self.db.execute(
            select(ExecutionQueueModel).where(ExecutionQueueModel.execution_id == execution_id)
        )
        item = result.scalar_one_or_none()
        if item:
            item.status = final_status
            item.completed_at = datetime.utcnow()

        leases = await self.db.execute(
            select(RuntimeLeaseModel).where(
                RuntimeLeaseModel.execution_id == execution_id,
                RuntimeLeaseModel.status == "active",
            )
        )
        for lease in leases.scalars().all():
            lease.status = "released"
            lease.released_at = datetime.utcnow()
            agent = await self.db.get(RuntimeAgentModel, lease.agent_id)
            if agent:
                agent.active_leases = max(0, (agent.active_leases or 0) - 1)
                if agent.status == "busy" and agent.active_leases < agent.max_concurrency:
                    agent.status = "idle"
            await _publish(RuntimeLeaseReleased(
                execution_id=execution_id,
                agent_id=lease.agent_id,
                lease_id=lease.id,
                final_status=final_status,
            ))
        await self.db.commit()
        await self.schedule_queued()

    async def list_queue(self, status: str | None = None) -> list[ExecutionQueueModel]:
        stmt = select(ExecutionQueueModel).order_by(
            ExecutionQueueModel.priority.asc(), ExecutionQueueModel.queued_at.desc()
        )
        if status:
            stmt = stmt.where(ExecutionQueueModel.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_leases(self, agent_id: str | None = None, status: str | None = None) -> list[RuntimeLeaseModel]:
        stmt = select(RuntimeLeaseModel).order_by(RuntimeLeaseModel.acquired_at.desc())
        if agent_id:
            stmt = stmt.where(RuntimeLeaseModel.agent_id == agent_id)
        if status:
            stmt = stmt.where(RuntimeLeaseModel.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
