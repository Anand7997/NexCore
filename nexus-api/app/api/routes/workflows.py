"""Workflow CRUD routes."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.domain.workflows.repository import WorkflowRepository, WorkflowValidationError
from app.domain.workflows.schemas import (
    WorkflowCreateSchema, WorkflowUpdateSchema,
    WorkflowResponse, WorkflowListItem, WorkflowNodeResponse, WorkflowEdgeResponse,
)
from app.events.bus import get_event_bus
from app.events.types import WorkflowCreated, WorkflowUpdated, WorkflowDeleted

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _to_response(wf) -> WorkflowResponse:
    return WorkflowResponse(
        id=wf.id,
        name=wf.name,
        description=wf.description,
        status=wf.status,
        tags=wf.tags or [],
        platforms=wf.platforms or [],
        variables=wf.variables or {},
        created_at=wf.created_at,
        updated_at=wf.updated_at,
        nodes=[
            WorkflowNodeResponse(
                id=n.id,
                node_key=n.node_key,
                type=n.type,
                label=n.label,
                description=n.description or "",
                config=n.config or {},
                position_x=n.position_x,
                position_y=n.position_y,
                timeout_seconds=n.timeout_seconds,
                retry_policy=n.retry_policy or {},
            )
            for n in (wf.nodes or [])
        ],
        edges=[
            WorkflowEdgeResponse(
                id=e.id,
                source_key=e.source_key,
                target_key=e.target_key,
                condition=e.condition,
            )
            for e in (wf.edges or [])
        ],
    )


@router.get("/", response_model=list[WorkflowListItem])
async def list_workflows(status: str | None = None, db: AsyncSession = Depends(get_db)):
    repo = WorkflowRepository(db)
    workflows = await repo.list_all(status=status)
    items = []
    for wf in workflows:
        items.append(WorkflowListItem(
            id=wf.id,
            name=wf.name,
            description=wf.description or "",
            status=wf.status,
            tags=wf.tags or [],
            platforms=wf.platforms or [],
            created_at=wf.created_at,
            updated_at=wf.updated_at,
            node_count=len(wf.nodes or []),
        ))
    return items


@router.post("/", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(schema: WorkflowCreateSchema, db: AsyncSession = Depends(get_db)):
    repo = WorkflowRepository(db)
    try:
        workflow = await repo.create(schema)
    except WorkflowValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await get_event_bus().publish(WorkflowCreated(workflow_id=workflow.id))
    return _to_response(workflow)


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    repo = WorkflowRepository(db)
    workflow = await repo.get(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _to_response(workflow)


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: str,
    schema: WorkflowUpdateSchema,
    db: AsyncSession = Depends(get_db),
):
    repo = WorkflowRepository(db)
    try:
        workflow = await repo.update(workflow_id, schema)
    except WorkflowValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await get_event_bus().publish(WorkflowUpdated(workflow_id=workflow_id))
    return _to_response(workflow)


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    repo = WorkflowRepository(db)
    deleted = await repo.delete(workflow_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await get_event_bus().publish(WorkflowDeleted(workflow_id=workflow_id))
