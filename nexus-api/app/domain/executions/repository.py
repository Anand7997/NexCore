"""Async repository for execution persistence."""
from __future__ import annotations
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, func
from app.database.models import ExecutionModel, ExecutionNodeModel, ExecutionTimelineModel, IntelligenceJobModel
from app.domain.executions.schemas import ExecutionTriggerSchema
import uuid


class ExecutionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, schema: ExecutionTriggerSchema) -> ExecutionModel:
        execution = ExecutionModel(
            id=str(uuid.uuid4()),
            workflow_id=schema.workflow_id,
            project_id=schema.project_id,
            module_id=schema.module_id,
            testing_type_id=schema.testing_type_id,
            status="queued",
            trigger=schema.trigger,
            triggered_by=schema.triggered_by,
            environment=schema.environment,
            platform=schema.platform,
            variables=schema.variables,
        )
        self.db.add(execution)
        await self.db.commit()
        await self.db.refresh(execution)
        return execution

    async def get(self, execution_id: str) -> ExecutionModel | None:
        result = await self.db.execute(
            select(ExecutionModel).where(ExecutionModel.id == execution_id)
        )
        return result.scalar_one_or_none()

    async def list_all(
        self,
        workflow_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[ExecutionModel]:
        q = select(ExecutionModel).order_by(ExecutionModel.created_at.desc()).limit(limit)
        if workflow_id:
            q = q.where(ExecutionModel.workflow_id == workflow_id)
        if status:
            q = q.where(ExecutionModel.status == status)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def get_nodes(self, execution_id: str) -> list[ExecutionNodeModel]:
        result = await self.db.execute(
            select(ExecutionNodeModel)
            .where(ExecutionNodeModel.execution_id == execution_id)
            .order_by(ExecutionNodeModel.started_at)
        )
        return list(result.scalars().all())

    async def get_timeline(self, execution_id: str) -> list[ExecutionTimelineModel]:
        result = await self.db.execute(
            select(ExecutionTimelineModel)
            .where(ExecutionTimelineModel.execution_id == execution_id)
            .order_by(ExecutionTimelineModel.timestamp)
        )
        return list(result.scalars().all())

    async def node_counts(self, execution_id: str) -> tuple[int, int]:
        """Returns (total_nodes, completed_nodes)."""
        total_result = await self.db.execute(
            select(func.count()).where(ExecutionNodeModel.execution_id == execution_id)
        )
        total = total_result.scalar() or 0

        completed_result = await self.db.execute(
            select(func.count()).where(
                ExecutionNodeModel.execution_id == execution_id,
                ExecutionNodeModel.status.in_(["completed", "skipped"]),
            )
        )
        completed = completed_result.scalar() or 0
        return total, completed

    async def cancel(self, execution_id: str) -> ExecutionModel | None:
        execution = await self.get(execution_id)
        if execution is None:
            return None
        if execution.status not in {"completed", "success", "failed", "cancelled"}:
            execution.status = "cancelled"
            execution.completed_at = datetime.utcnow()
            await self.db.commit()
            await self.db.refresh(execution)
        return execution

    async def delete(self, execution_id: str) -> bool:
        execution = await self.get(execution_id)
        if execution is None:
            return False
        await self.db.execute(
            delete(IntelligenceJobModel).where(IntelligenceJobModel.execution_id == execution_id)
        )
        await self.db.delete(execution)
        await self.db.commit()
        return True
