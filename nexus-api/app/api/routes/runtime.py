"""Distributed runtime fabric endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.distributed.scheduler import DistributedScheduler
from app.distributed.schemas import (
    ExecutionQueueResponse,
    ExecutionScheduleRequest,
    RuntimeAgentHeartbeatRequest,
    RuntimeAgentRegisterRequest,
    RuntimeAgentResponse,
    RuntimeLeaseResponse,
)

router = APIRouter(prefix="/runtime", tags=["runtime"])


@router.post("/agents", response_model=RuntimeAgentResponse, status_code=status.HTTP_201_CREATED)
async def register_agent(
    payload: RuntimeAgentRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    scheduler = DistributedScheduler(db)
    return await scheduler.register_agent(
        name=payload.name,
        agent_type=payload.agent_type,
        endpoint=payload.endpoint,
        version=payload.version,
        capabilities=payload.capabilities,
        labels=payload.labels,
        max_concurrency=payload.max_concurrency,
    )


@router.post("/agents/{agent_id}/heartbeat", response_model=RuntimeAgentResponse)
async def heartbeat_agent(
    agent_id: str,
    payload: RuntimeAgentHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
):
    scheduler = DistributedScheduler(db)
    agent = await scheduler.heartbeat(
        agent_id,
        status=payload.status,
        active_leases=payload.active_leases,
        capabilities=payload.capabilities,
        labels=payload.labels,
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Runtime agent not found")
    return agent


@router.get("/agents", response_model=list[RuntimeAgentResponse])
async def list_agents(db: AsyncSession = Depends(get_db)):
    return await DistributedScheduler(db).list_agents()


@router.get("/queue", response_model=list[ExecutionQueueResponse])
async def list_queue(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await DistributedScheduler(db).list_queue(status=status)


@router.post("/queue/schedule")
async def schedule_queued(db: AsyncSession = Depends(get_db)):
    assigned = await DistributedScheduler(db).schedule_queued()
    return {"assigned": assigned}


@router.post("/executions/{execution_id}/schedule", response_model=ExecutionQueueResponse)
async def schedule_execution(
    execution_id: str,
    payload: ExecutionScheduleRequest,
    db: AsyncSession = Depends(get_db),
):
    queue_item = await DistributedScheduler(db).enqueue_execution(
        execution_id,
        platform=payload.platform,
        priority=payload.priority,
        required_capabilities=payload.required_capabilities,
    )
    return queue_item


@router.get("/leases", response_model=list[RuntimeLeaseResponse])
async def list_leases(
    agent_id: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await DistributedScheduler(db).list_leases(agent_id=agent_id, status=status)
