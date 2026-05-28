"""Reusable desktop workflow component library — CRUD routes."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db

router = APIRouter(prefix="/reusable-components", tags=["reusable-components"])

# ---------------------------------------------------------------------------
# In-memory store (replaces a DB table until a migration is added)
# ---------------------------------------------------------------------------
# Keyed by component id (UUID string).  A real migration would introduce a
# ReusableComponentModel SQLAlchemy model; the CRUD logic stays identical.
_STORE: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class ReusableComponentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    component_type: str = "workflow"  # workflow | action_group | locator_set | data_template
    tags: list[str] = []
    definition: dict[str, Any] = {}
    is_active: bool = True


class ReusableComponentCreate(ReusableComponentBase):
    pass


class ReusableComponentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    component_type: Optional[str] = None
    tags: Optional[list[str]] = None
    definition: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class ReusableComponentResponse(ReusableComponentBase):
    id: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(UTC)


def _to_response(record: dict[str, Any]) -> ReusableComponentResponse:
    return ReusableComponentResponse(**record)


def _get_or_404(component_id: str) -> dict[str, Any]:
    record = _STORE.get(component_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reusable component '{component_id}' not found",
        )
    return record


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[ReusableComponentResponse],
    summary="List all reusable components",
)
async def list_components(
    component_type: Optional[str] = None,
    tag: Optional[str] = None,
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
) -> list[ReusableComponentResponse]:
    records = list(_STORE.values())
    if component_type:
        records = [r for r in records if r["component_type"] == component_type]
    if tag:
        records = [r for r in records if tag in r["tags"]]
    if active_only:
        records = [r for r in records if r["is_active"]]
    records.sort(key=lambda r: r["updated_at"], reverse=True)
    return [_to_response(r) for r in records]


@router.post(
    "",
    response_model=ReusableComponentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a reusable component",
)
async def create_component(
    payload: ReusableComponentCreate,
    db: AsyncSession = Depends(get_db),
) -> ReusableComponentResponse:
    now = _now()
    record: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        **payload.model_dump(),
        "created_at": now,
        "updated_at": now,
    }
    _STORE[record["id"]] = record
    return _to_response(record)


@router.get(
    "/{component_id}",
    response_model=ReusableComponentResponse,
    summary="Get a reusable component by ID",
)
async def get_component(
    component_id: str,
    db: AsyncSession = Depends(get_db),
) -> ReusableComponentResponse:
    return _to_response(_get_or_404(component_id))


@router.put(
    "/{component_id}",
    response_model=ReusableComponentResponse,
    summary="Update a reusable component",
)
async def update_component(
    component_id: str,
    payload: ReusableComponentUpdate,
    db: AsyncSession = Depends(get_db),
) -> ReusableComponentResponse:
    record = _get_or_404(component_id)
    update_data = payload.model_dump(exclude_unset=True)
    record.update(update_data)
    record["updated_at"] = _now()
    return _to_response(record)


@router.delete(
    "/{component_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
    summary="Delete a reusable component",
)
async def delete_component(
    component_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    _get_or_404(component_id)
    del _STORE[component_id]
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{component_id}/duplicate",
    response_model=ReusableComponentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Duplicate a reusable component",
)
async def duplicate_component(
    component_id: str,
    db: AsyncSession = Depends(get_db),
) -> ReusableComponentResponse:
    source = _get_or_404(component_id)
    now = _now()
    record: dict[str, Any] = {
        **source,
        "id": str(uuid.uuid4()),
        "name": f"{source['name']} (copy)",
        "created_at": now,
        "updated_at": now,
    }
    _STORE[record["id"]] = record
    return _to_response(record)
