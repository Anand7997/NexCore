"""
Artifact endpoints — the evidence-pipeline read API.

GET /api/executions/{id}/artifacts          list artifacts for an execution
GET /api/artifacts/{id}                     metadata for a single artifact
GET /api/artifacts/{id}/content             stream the artifact bytes
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.database.models import ArtifactModel
from app.execution.artifacts import get_artifact_store

router = APIRouter(tags=["artifacts"])


class ArtifactResponse(BaseModel):
    id: str
    execution_id: str
    node_key: str | None
    kind: str
    name: str
    content_type: str
    size_bytes: int
    metadata: dict
    created_at: datetime

    @classmethod
    def from_model(cls, m: ArtifactModel) -> "ArtifactResponse":
        return cls(
            id=m.id,
            execution_id=m.execution_id,
            node_key=m.node_key,
            kind=m.kind,
            name=m.name,
            content_type=m.content_type,
            size_bytes=m.size_bytes,
            metadata=m.artifact_metadata or {},
            created_at=m.created_at,
        )


@router.get("/executions/{execution_id}/artifacts", response_model=list[ArtifactResponse])
async def list_artifacts_for_execution(
    execution_id: str,
    node_key: str | None = None,
    kind: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[ArtifactResponse]:
    stmt = select(ArtifactModel).where(ArtifactModel.execution_id == execution_id)
    if node_key:
        stmt = stmt.where(ArtifactModel.node_key == node_key)
    if kind:
        stmt = stmt.where(ArtifactModel.kind == kind)
    stmt = stmt.order_by(ArtifactModel.created_at.asc())
    result = await db.execute(stmt)
    return [ArtifactResponse.from_model(a) for a in result.scalars().all()]


@router.get("/artifacts/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact(artifact_id: str, db: AsyncSession = Depends(get_db)):
    artifact = await db.get(ArtifactModel, artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return ArtifactResponse.from_model(artifact)


@router.get("/artifacts/{artifact_id}/content")
async def get_artifact_content(artifact_id: str, db: AsyncSession = Depends(get_db)):
    artifact = await db.get(ArtifactModel, artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    store = get_artifact_store()
    try:
        path = store.absolute(artifact.relative_path)
    except PermissionError:
        raise HTTPException(status_code=403, detail="Path violation")
    if not path.exists():
        raise HTTPException(status_code=410, detail="Artifact bytes missing")
    return FileResponse(
        path=path,
        media_type=artifact.content_type,
        filename=artifact.name,
    )
