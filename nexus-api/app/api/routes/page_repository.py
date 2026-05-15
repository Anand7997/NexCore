"""Page Object Repository — CRUD for application pages and their UI elements."""
from __future__ import annotations

from typing import Any, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.database.models import PageRepositoryModel, PageElementModel

router = APIRouter(prefix="/page-repository", tags=["page-repository"])


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class PageElementResponse(BaseModel):
    id: str
    page_id: str
    name: str
    element_type: str
    description: str
    xpath: str
    css_selector: str
    id_attr: str
    name_attr: str
    locator_strategy: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PageListItem(BaseModel):
    id: str
    name: str
    url_pattern: str
    description: str
    platform: str
    tags: list[str]
    element_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PageDetailResponse(PageListItem):
    elements: list[PageElementResponse]


class PageCreateSchema(BaseModel):
    name: str
    url_pattern: str = ""
    description: str = ""
    platform: str = "web"
    tags: list[str] = []


class PageUpdateSchema(BaseModel):
    name: Optional[str] = None
    url_pattern: Optional[str] = None
    description: Optional[str] = None
    platform: Optional[str] = None
    tags: Optional[list[str]] = None


class ElementCreateSchema(BaseModel):
    name: str
    element_type: str = "element"
    description: str = ""
    xpath: str = ""
    css_selector: str = ""
    id_attr: str = ""
    name_attr: str = ""
    locator_strategy: str = "xpath"
    tags: list[str] = []


class ElementUpdateSchema(BaseModel):
    name: Optional[str] = None
    element_type: Optional[str] = None
    description: Optional[str] = None
    xpath: Optional[str] = None
    css_selector: Optional[str] = None
    id_attr: Optional[str] = None
    name_attr: Optional[str] = None
    locator_strategy: Optional[str] = None
    tags: Optional[list[str]] = None


# ── Converters ────────────────────────────────────────────────────────────────

def _elem(e: PageElementModel) -> PageElementResponse:
    return PageElementResponse(
        id=e.id, page_id=e.page_id, name=e.name,
        element_type=e.element_type or "element",
        description=e.description or "",
        xpath=e.xpath or "", css_selector=e.css_selector or "",
        id_attr=e.id_attr or "", name_attr=e.name_attr or "",
        locator_strategy=e.locator_strategy or "xpath",
        tags=e.tags or [],
        created_at=e.created_at, updated_at=e.updated_at,
    )


def _page_list(p: PageRepositoryModel) -> PageListItem:
    return PageListItem(
        id=p.id, name=p.name, url_pattern=p.url_pattern or "",
        description=p.description or "", platform=p.platform,
        tags=p.tags or [], element_count=len(p.elements or []),
        created_at=p.created_at, updated_at=p.updated_at,
    )


def _page_detail(p: PageRepositoryModel) -> PageDetailResponse:
    return PageDetailResponse(
        id=p.id, name=p.name, url_pattern=p.url_pattern or "",
        description=p.description or "", platform=p.platform,
        tags=p.tags or [], element_count=len(p.elements or []),
        created_at=p.created_at, updated_at=p.updated_at,
        elements=sorted([_elem(e) for e in (p.elements or [])], key=lambda e: e.name),
    )


async def _load(page_id: str, db: AsyncSession) -> PageRepositoryModel:
    result = await db.execute(
        select(PageRepositoryModel).where(PageRepositoryModel.id == page_id)
        .options(selectinload(PageRepositoryModel.elements))
    )
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


# ── Page routes ───────────────────────────────────────────────────────────────

@router.get("/pages", response_model=list[PageListItem])
async def list_pages(platform: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    q = select(PageRepositoryModel).options(selectinload(PageRepositoryModel.elements))
    if platform:
        q = q.where(PageRepositoryModel.platform == platform)
    result = await db.execute(q.order_by(PageRepositoryModel.name))
    return [_page_list(p) for p in result.scalars().all()]


@router.post("/pages", response_model=PageDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_page(body: PageCreateSchema, db: AsyncSession = Depends(get_db)):
    page = PageRepositoryModel(
        name=body.name, url_pattern=body.url_pattern,
        description=body.description, platform=body.platform, tags=body.tags,
    )
    db.add(page)
    await db.commit()
    return _page_detail(await _load(page.id, db))


@router.get("/pages/{page_id}", response_model=PageDetailResponse)
async def get_page(page_id: str, db: AsyncSession = Depends(get_db)):
    return _page_detail(await _load(page_id, db))


@router.put("/pages/{page_id}", response_model=PageDetailResponse)
async def update_page(page_id: str, body: PageUpdateSchema, db: AsyncSession = Depends(get_db)):
    page = await _load(page_id, db)
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(page, field, val)
    await db.commit()
    return _page_detail(await _load(page_id, db))


@router.delete("/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_page(page_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PageRepositoryModel).where(PageRepositoryModel.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    await db.delete(page)
    await db.commit()


# ── Element routes ────────────────────────────────────────────────────────────

@router.post("/pages/{page_id}/elements", response_model=PageElementResponse, status_code=status.HTTP_201_CREATED)
async def create_element(page_id: str, body: ElementCreateSchema, db: AsyncSession = Depends(get_db)):
    await _load(page_id, db)
    elem = PageElementModel(
        page_id=page_id, name=body.name, element_type=body.element_type,
        description=body.description, xpath=body.xpath, css_selector=body.css_selector,
        id_attr=body.id_attr, name_attr=body.name_attr,
        locator_strategy=body.locator_strategy, tags=body.tags,
    )
    db.add(elem)
    await db.commit()
    await db.refresh(elem)
    return _elem(elem)


@router.put("/elements/{element_id}", response_model=PageElementResponse)
async def update_element(element_id: str, body: ElementUpdateSchema, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PageElementModel).where(PageElementModel.id == element_id))
    elem = result.scalar_one_or_none()
    if not elem:
        raise HTTPException(status_code=404, detail="Element not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(elem, field, val)
    await db.commit()
    await db.refresh(elem)
    return _elem(elem)


@router.delete("/elements/{element_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_element(element_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PageElementModel).where(PageElementModel.id == element_id))
    elem = result.scalar_one_or_none()
    if not elem:
        raise HTTPException(status_code=404, detail="Element not found")
    await db.delete(elem)
    await db.commit()


# ── All-in-one for autocomplete ───────────────────────────────────────────────

@router.get("/all", response_model=list[PageDetailResponse])
async def get_all(db: AsyncSession = Depends(get_db)):
    """Returns all pages with their elements — used for test-step autocomplete."""
    result = await db.execute(
        select(PageRepositoryModel)
        .options(selectinload(PageRepositoryModel.elements))
        .order_by(PageRepositoryModel.name)
    )
    return [_page_detail(p) for p in result.scalars().all()]
