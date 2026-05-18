"""Testing Type catalog routes (web, api, mobile, desktop, database, performance)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import TestingTypeModel
from app.database.session import get_db

router = APIRouter(prefix="/testing-types", tags=["testing-types"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class TestingTypeCreate(BaseModel):
    name: str
    key: str
    description: str = ""
    category: str = "functional"
    icon: str = ""
    is_active: bool = True


class TestingTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    icon: str | None = None
    is_active: bool | None = None


class TestingTypeResponse(BaseModel):
    id: str
    name: str
    key: str
    description: str
    category: str
    icon: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Default seed data ─────────────────────────────────────────────────────────

_DEFAULTS: list[dict[str, Any]] = [
    {"name": "Web Testing",         "key": "web",         "category": "ui",          "icon": "globe",      "description": "Browser-based UI automation with Playwright"},
    {"name": "API Testing",         "key": "api",         "category": "api",         "icon": "code2",      "description": "REST/GraphQL/gRPC endpoint validation"},
    {"name": "Mobile Testing",      "key": "mobile",      "category": "ui",          "icon": "smartphone", "description": "Android and iOS app automation via Appium"},
    {"name": "Desktop Testing",     "key": "desktop",     "category": "ui",          "icon": "monitor",    "description": "Windows/macOS desktop automation via WinAppDriver"},
    {"name": "Database Testing",    "key": "database",    "category": "data",        "icon": "database",   "description": "SQL/NoSQL query validation and data integrity"},
    {"name": "Performance Testing", "key": "performance", "category": "performance", "icon": "zap",        "description": "Load, stress, and throughput testing"},
    {"name": "Visual Testing",      "key": "visual",      "category": "ui",          "icon": "eye",        "description": "Screenshot-based visual regression testing"},
    {"name": "Security Testing",    "key": "security",    "category": "security",    "icon": "shield",     "description": "OWASP-based security and vulnerability scanning"},
]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[TestingTypeResponse])
async def list_testing_types(
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TestingTypeModel).order_by(TestingTypeModel.name)
    if is_active is not None:
        stmt = stmt.where(TestingTypeModel.is_active == is_active)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/", response_model=TestingTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_testing_type(
    payload: TestingTypeCreate,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(TestingTypeModel).where(TestingTypeModel.key == payload.key)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Testing type key '{payload.key}' already exists")

    tt = TestingTypeModel(
        name=payload.name,
        key=payload.key,
        description=payload.description,
        category=payload.category,
        icon=payload.icon,
        is_active=payload.is_active,
    )
    db.add(tt)
    await db.commit()
    await db.refresh(tt)
    return tt


@router.get("/{type_id}", response_model=TestingTypeResponse)
async def get_testing_type(type_id: str, db: AsyncSession = Depends(get_db)):
    tt = await db.get(TestingTypeModel, type_id)
    if not tt:
        raise HTTPException(status_code=404, detail="Testing type not found")
    return tt


@router.put("/{type_id}", response_model=TestingTypeResponse)
async def update_testing_type(
    type_id: str,
    payload: TestingTypeUpdate,
    db: AsyncSession = Depends(get_db),
):
    tt = await db.get(TestingTypeModel, type_id)
    if not tt:
        raise HTTPException(status_code=404, detail="Testing type not found")
    if payload.name is not None:
        tt.name = payload.name
    if payload.description is not None:
        tt.description = payload.description
    if payload.category is not None:
        tt.category = payload.category
    if payload.icon is not None:
        tt.icon = payload.icon
    if payload.is_active is not None:
        tt.is_active = payload.is_active
    await db.commit()
    await db.refresh(tt)
    return tt


@router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_testing_type(type_id: str, db: AsyncSession = Depends(get_db)):
    tt = await db.get(TestingTypeModel, type_id)
    if not tt:
        raise HTTPException(status_code=404, detail="Testing type not found")
    await db.delete(tt)
    await db.commit()


@router.post("/seed", response_model=list[TestingTypeResponse], status_code=status.HTTP_201_CREATED)
async def seed_testing_types(db: AsyncSession = Depends(get_db)):
    """Insert default testing types — skips any whose key already exists."""
    created = []
    for row in _DEFAULTS:
        existing = await db.execute(
            select(TestingTypeModel).where(TestingTypeModel.key == row["key"])
        )
        if existing.scalar_one_or_none():
            continue
        tt = TestingTypeModel(**row)
        db.add(tt)
        created.append(tt)
    await db.commit()
    for tt in created:
        await db.refresh(tt)
    return created
