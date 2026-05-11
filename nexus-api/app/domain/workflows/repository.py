"""Async repository for workflow persistence."""
from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from app.database.models import WorkflowModel, WorkflowNodeModel, WorkflowEdgeModel
from app.domain.workflows.schemas import WorkflowCreateSchema, WorkflowUpdateSchema
from app.orchestration.dag import DAGGraph, DAGNode, DAGEdge
import uuid


class WorkflowValidationError(ValueError):
    """Raised when a workflow graph violates the canonical DAG contract."""


class WorkflowRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, schema: WorkflowCreateSchema) -> WorkflowModel:
        self._validate_graph(schema.nodes, schema.edges)
        workflow = WorkflowModel(
            id=str(uuid.uuid4()),
            name=schema.name,
            description=schema.description,
            tags=schema.tags,
            platforms=schema.platforms,
            variables=schema.variables,
        )
        self.db.add(workflow)
        await self.db.flush()

        await self._upsert_nodes_edges(workflow.id, schema.nodes, schema.edges)
        await self.db.commit()
        await self.db.refresh(workflow)
        return workflow

    async def get(self, workflow_id: str) -> WorkflowModel | None:
        result = await self.db.execute(
            select(WorkflowModel)
            .options(selectinload(WorkflowModel.nodes), selectinload(WorkflowModel.edges))
            .where(WorkflowModel.id == workflow_id)
        )
        return result.scalar_one_or_none()

    async def list_all(self, status: str | None = None) -> list[WorkflowModel]:
        q = (
            select(WorkflowModel)
            .options(selectinload(WorkflowModel.nodes), selectinload(WorkflowModel.edges))
            .order_by(WorkflowModel.created_at.desc())
        )
        if status:
            q = q.where(WorkflowModel.status == status)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def update(self, workflow_id: str, schema: WorkflowUpdateSchema) -> WorkflowModel | None:
        workflow = await self.get(workflow_id)
        if not workflow:
            return None

        if schema.name is not None:
            workflow.name = schema.name
        if schema.description is not None:
            workflow.description = schema.description
        if schema.status is not None:
            workflow.status = schema.status
        if schema.tags is not None:
            workflow.tags = schema.tags
        if schema.variables is not None:
            workflow.variables = schema.variables

        if schema.nodes is not None or schema.edges is not None:
            next_nodes = schema.nodes or []
            next_edges = schema.edges or []
            self._validate_graph(next_nodes, next_edges)

            # Replace nodes + edges wholesale
            await self.db.execute(
                delete(WorkflowNodeModel).where(WorkflowNodeModel.workflow_id == workflow_id)
            )
            await self.db.execute(
                delete(WorkflowEdgeModel).where(WorkflowEdgeModel.workflow_id == workflow_id)
            )
            await self._upsert_nodes_edges(
                workflow_id,
                next_nodes,
                next_edges,
            )

        await self.db.commit()
        await self.db.refresh(workflow)
        return workflow

    async def delete(self, workflow_id: str) -> bool:
        workflow = await self.get(workflow_id)
        if not workflow:
            return False
        await self.db.delete(workflow)
        await self.db.commit()
        return True

    async def _upsert_nodes_edges(self, workflow_id, nodes, edges) -> None:
        for n in nodes:
            self.db.add(WorkflowNodeModel(
                id=str(uuid.uuid4()),
                workflow_id=workflow_id,
                node_key=n.node_key,
                type=n.type,
                label=n.label,
                description=n.description,
                config=n.config,
                position_x=n.position.x,
                position_y=n.position.y,
                timeout_seconds=n.timeout_seconds,
                retry_policy=n.retry_policy.model_dump(),
            ))
        for e in edges:
            self.db.add(WorkflowEdgeModel(
                id=str(uuid.uuid4()),
                workflow_id=workflow_id,
                source_key=e.source_key,
                target_key=e.target_key,
                condition=e.condition,
            ))
        await self.db.flush()

    def _validate_graph(self, nodes, edges) -> None:
        node_keys = [n.node_key for n in nodes]
        duplicate_keys = sorted({key for key in node_keys if node_keys.count(key) > 1})
        if duplicate_keys:
            raise WorkflowValidationError(
                f"Duplicate workflow node keys: {', '.join(duplicate_keys)}"
            )

        node_key_set = set(node_keys)
        missing_edges = [
            f"{edge.source_key}->{edge.target_key}"
            for edge in edges
            if edge.source_key not in node_key_set or edge.target_key not in node_key_set
        ]
        if missing_edges:
            raise WorkflowValidationError(
                f"Workflow edges reference unknown node keys: {', '.join(missing_edges)}"
            )

        try:
            DAGGraph(
                [
                    DAGNode(
                        key=node.node_key,
                        label=node.label,
                        node_type=node.type,
                        config=node.config or {},
                        retry_policy=node.retry_policy.model_dump(),
                        timeout_seconds=node.timeout_seconds,
                        position=(node.position.x, node.position.y),
                    )
                    for node in nodes
                ],
                [
                    DAGEdge(
                        source=edge.source_key,
                        target=edge.target_key,
                        condition=edge.condition,
                    )
                    for edge in edges
                ],
            )
        except ValueError as exc:
            raise WorkflowValidationError(str(exc)) from exc
