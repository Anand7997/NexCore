"""API Testing routes: collections and endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models import ApiCollectionModel, ApiEndpointModel
from app.database.session import get_db

router = APIRouter(prefix="/api-testing", tags=["api-testing"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ApiEndpointCreate(BaseModel):
    name: str
    method: str = "GET"
    path: str = ""
    description: str = ""
    headers: dict[str, Any] = Field(default_factory=dict)
    query_params: dict[str, Any] = Field(default_factory=dict)
    request_body: dict[str, Any] = Field(default_factory=dict)
    expected_status: int | None = None
    expected_response: dict[str, Any] = Field(default_factory=dict)
    auth_override: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class ApiEndpointUpdate(BaseModel):
    name: str | None = None
    method: str | None = None
    path: str | None = None
    description: str | None = None
    headers: dict[str, Any] | None = None
    query_params: dict[str, Any] | None = None
    request_body: dict[str, Any] | None = None
    expected_status: int | None = None
    expected_response: dict[str, Any] | None = None
    auth_override: dict[str, Any] | None = None
    tags: list[str] | None = None


class ApiEndpointResponse(BaseModel):
    id: str
    api_collection_id: str
    name: str
    method: str
    path: str
    description: str
    headers: dict[str, Any]
    query_params: dict[str, Any]
    request_body: dict[str, Any]
    expected_status: int | None
    expected_response: dict[str, Any]
    auth_override: dict[str, Any]
    tags: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApiCollectionCreate(BaseModel):
    name: str
    project_id: str | None = None
    module_id: str | None = None
    base_url: str = ""
    description: str = ""
    auth_type: str = "none"
    auth_config: dict[str, Any] = Field(default_factory=dict)
    default_headers: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class ApiCollectionUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    description: str | None = None
    auth_type: str | None = None
    auth_config: dict[str, Any] | None = None
    default_headers: dict[str, Any] | None = None
    tags: list[str] | None = None


class ApiCollectionResponse(BaseModel):
    id: str
    project_id: str | None
    module_id: str | None
    name: str
    base_url: str
    description: str
    auth_type: str
    auth_config: dict[str, Any]
    default_headers: dict[str, Any]
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    endpoints: list[ApiEndpointResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ApiCollectionListItem(BaseModel):
    id: str
    project_id: str | None
    module_id: str | None
    name: str
    base_url: str
    description: str
    auth_type: str
    tags: list[str]
    endpoint_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Collection routes ─────────────────────────────────────────────────────────

@router.get("/collections", response_model=list[ApiCollectionListItem])
async def list_collections(
    project_id: str | None = None,
    module_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ApiCollectionModel)
        .options(selectinload(ApiCollectionModel.endpoints))
        .order_by(ApiCollectionModel.name)
    )
    if project_id:
        stmt = stmt.where(ApiCollectionModel.project_id == project_id)
    if module_id:
        stmt = stmt.where(ApiCollectionModel.module_id == module_id)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    return [
        ApiCollectionListItem(
            id=c.id,
            project_id=c.project_id,
            module_id=c.module_id,
            name=c.name,
            base_url=c.base_url,
            description=c.description,
            auth_type=c.auth_type,
            tags=c.tags or [],
            endpoint_count=len(c.endpoints or []),
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in rows
    ]


@router.post("/collections", response_model=ApiCollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    payload: ApiCollectionCreate,
    db: AsyncSession = Depends(get_db),
):
    coll = ApiCollectionModel(
        name=payload.name,
        project_id=payload.project_id,
        module_id=payload.module_id,
        base_url=payload.base_url,
        description=payload.description,
        auth_type=payload.auth_type,
        auth_config=payload.auth_config,
        default_headers=payload.default_headers,
        tags=payload.tags,
    )
    db.add(coll)
    await db.commit()
    return await _get_collection(coll.id, db)


@router.get("/collections/{collection_id}", response_model=ApiCollectionResponse)
async def get_collection(collection_id: str, db: AsyncSession = Depends(get_db)):
    coll = await _get_collection(collection_id, db)
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    return coll


@router.put("/collections/{collection_id}", response_model=ApiCollectionResponse)
async def update_collection(
    collection_id: str,
    payload: ApiCollectionUpdate,
    db: AsyncSession = Depends(get_db),
):
    coll = await db.get(ApiCollectionModel, collection_id)
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(coll, field, value)
    await db.commit()
    return await _get_collection(collection_id, db)


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(collection_id: str, db: AsyncSession = Depends(get_db)):
    coll = await db.get(ApiCollectionModel, collection_id)
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    await db.delete(coll)
    await db.commit()


# ── Endpoint routes ───────────────────────────────────────────────────────────

@router.post(
    "/collections/{collection_id}/endpoints",
    response_model=ApiEndpointResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_endpoint(
    collection_id: str,
    payload: ApiEndpointCreate,
    db: AsyncSession = Depends(get_db),
):
    coll = await db.get(ApiCollectionModel, collection_id)
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    ep = ApiEndpointModel(
        api_collection_id=collection_id,
        name=payload.name,
        method=payload.method,
        path=payload.path,
        description=payload.description,
        headers=payload.headers,
        query_params=payload.query_params,
        request_body=payload.request_body,
        expected_status=payload.expected_status,
        expected_response=payload.expected_response,
        auth_override=payload.auth_override,
        tags=payload.tags,
    )
    db.add(ep)
    await db.commit()
    await db.refresh(ep)
    return ep


@router.get("/endpoints/{endpoint_id}", response_model=ApiEndpointResponse)
async def get_endpoint(endpoint_id: str, db: AsyncSession = Depends(get_db)):
    ep = await db.get(ApiEndpointModel, endpoint_id)
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return ep


@router.put("/endpoints/{endpoint_id}", response_model=ApiEndpointResponse)
async def update_endpoint(
    endpoint_id: str,
    payload: ApiEndpointUpdate,
    db: AsyncSession = Depends(get_db),
):
    ep = await db.get(ApiEndpointModel, endpoint_id)
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(ep, field, value)
    await db.commit()
    await db.refresh(ep)
    return ep


@router.delete("/endpoints/{endpoint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_endpoint(endpoint_id: str, db: AsyncSession = Depends(get_db)):
    ep = await db.get(ApiEndpointModel, endpoint_id)
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    await db.delete(ep)
    await db.commit()


# ── Helper ────────────────────────────────────────────────────────────────────

async def _get_collection(
    collection_id: str, db: AsyncSession
) -> ApiCollectionModel | None:
    result = await db.execute(
        select(ApiCollectionModel)
        .options(selectinload(ApiCollectionModel.endpoints))
        .where(ApiCollectionModel.id == collection_id)
    )
    return result.scalar_one_or_none()
