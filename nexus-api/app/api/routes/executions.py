"""Execution trigger, monitoring, and control routes."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.domain.executions.repository import ExecutionRepository
from app.domain.executions.schemas import (
    ExecutionTriggerSchema, ExecutionResponse,
    ExecutionListItem, ExecutionNodeResponse, TimelineEntryResponse,
)
from app.domain.workflows.repository import WorkflowRepository
from app.distributed.scheduler import DistributedScheduler
from app.enterprise.audit import record_audit
from app.enterprise.auth import AuthContext, get_auth_context
from app.orchestration.engine import launch_execution, cancel_execution

router = APIRouter(prefix="/executions", tags=["executions"])


def _node_to_response(n) -> ExecutionNodeResponse:
    return ExecutionNodeResponse(
        id=n.id,
        node_key=n.node_key,
        node_label=n.node_label,
        node_type=n.node_type,
        status=n.status,
        attempt_count=n.attempt_count or 0,
        started_at=n.started_at,
        completed_at=n.completed_at,
        duration_ms=n.duration_ms,
        output=n.output or {},
        error=n.error,
    )


@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def trigger_execution(
    schema: ExecutionTriggerSchema,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(get_auth_context),
):
    wf_repo = WorkflowRepository(db)
    workflow = await wf_repo.get(schema.workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    repo = ExecutionRepository(db)
    execution = await repo.create(schema)
    scheduler = DistributedScheduler(db)
    await scheduler.enqueue_execution(
        execution.id,
        platform=schema.platform,
        priority=int(schema.variables.get("_priority", 100)),
        required_capabilities=schema.variables.get("_required_capabilities", []),
    )
    await record_audit(
        db,
        ctx,
        action="execution.trigger",
        resource_type="execution",
        resource_id=execution.id,
        metadata={"workflow_id": schema.workflow_id, "platform": schema.platform},
    )

    # Launch orchestration engine as background task
    background_tasks.add_task(launch_execution, execution.id)

    return {"execution_id": execution.id, "status": "queued"}


@router.get("/", response_model=list[ExecutionListItem])
async def list_executions(
    workflow_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    repo = ExecutionRepository(db)
    executions = await repo.list_all(workflow_id=workflow_id, status=status, limit=limit)
    items = []
    for e in executions:
        total, completed = await repo.node_counts(e.id)
        items.append(ExecutionListItem(
            id=e.id,
            workflow_id=e.workflow_id,
            status=e.status,
            trigger=e.trigger,
            environment=e.environment,
            platform=e.platform,
            error=e.error,
            started_at=e.started_at,
            completed_at=e.completed_at,
            created_at=e.created_at,
            node_count=total,
            completed_nodes=completed,
        ))
    return items


@router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(execution_id: str, db: AsyncSession = Depends(get_db)):
    repo = ExecutionRepository(db)
    execution = await repo.get(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    nodes = await repo.get_nodes(execution_id)
    timeline = await repo.get_timeline(execution_id)

    return ExecutionResponse(
        id=execution.id,
        workflow_id=execution.workflow_id,
        status=execution.status,
        trigger=execution.trigger,
        environment=execution.environment,
        platform=execution.platform,
        variables=execution.variables or {},
        error=execution.error,
        started_at=execution.started_at,
        completed_at=execution.completed_at,
        created_at=execution.created_at,
        nodes=[_node_to_response(n) for n in nodes],
        timeline=[
            TimelineEntryResponse(
                id=t.id,
                node_key=t.node_key,
                phase=t.phase,
                metadata_=t.metadata_ or {},
                timestamp=t.timestamp,
            )
            for t in timeline
        ],
    )


@router.post("/{execution_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
async def cancel_execution_route(
    execution_id: str,
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(get_auth_context),
):
    cancelled = cancel_execution(execution_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Execution not active or not found")
    await record_audit(
        db,
        ctx,
        action="execution.cancel",
        resource_type="execution",
        resource_id=execution_id,
    )
    return {"execution_id": execution_id, "status": "cancelling"}


@router.get("/{execution_id}/nodes", response_model=list[ExecutionNodeResponse])
async def get_execution_nodes(execution_id: str, db: AsyncSession = Depends(get_db)):
    repo = ExecutionRepository(db)
    nodes = await repo.get_nodes(execution_id)
    return [_node_to_response(n) for n in nodes]


@router.get("/{execution_id}/timeline", response_model=list[TimelineEntryResponse])
async def get_execution_timeline(execution_id: str, db: AsyncSession = Depends(get_db)):
    repo = ExecutionRepository(db)
    timeline = await repo.get_timeline(execution_id)
    return [
        TimelineEntryResponse(
            id=t.id,
            node_key=t.node_key,
            phase=t.phase,
            metadata_=t.metadata_ or {},
            timestamp=t.timestamp,
        )
        for t in timeline
    ]
