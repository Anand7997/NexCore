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
from app.page_discovery.schemas import DiscoveryRequest, DiscoveryResponse
from app.page_discovery.service import discover_elements

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
    confidence_score: Optional[float] = None
    alternative_locators: Optional[list[dict[str, Any]]] = None
    source_url: str = ""
    last_verified_at: Optional[datetime] = None
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
        confidence_score=e.confidence_score if e.confidence_score is not None else None,
        alternative_locators=e.alternative_locators if e.alternative_locators is not None else None,
        source_url=e.source_url or "",
        last_verified_at=e.last_verified_at,
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


# ── Element Discovery Agent ──────────────────────────────────────────────────

@router.post("/discover", response_model=DiscoveryResponse)
async def discover_page_elements(
    body: DiscoveryRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Launch Playwright headless, inspect the page, discover UI elements,
    generate and score locator candidates, then auto-save into the repository.

    Idempotent: re-running on the same URL updates rather than duplicates.
    """
    # 1. Run the Playwright-backed discovery
    result = await discover_elements(body)
    if result.summary.has_error:
        return result

    # 2. Save results to the repository if save_mode == "auto"
    if body.save_mode == "auto" and result.elements:
        # Find or create the page
        existing_page = None
        if body.page_id:
            existing_page = await _load(body.page_id, db)
        if existing_page is None:
            page_query = (
                select(PageRepositoryModel)
                .where(PageRepositoryModel.name == body.page_name)
                .where(PageRepositoryModel.platform == body.platform)
                .options(selectinload(PageRepositoryModel.elements))
                .limit(1)
            )
            existing_page = (await db.execute(page_query)).scalars().first()
        if existing_page is None:
            page_query = (
                select(PageRepositoryModel)
                .where(PageRepositoryModel.url_pattern == body.url)
                .where(PageRepositoryModel.platform == body.platform)
                .options(selectinload(PageRepositoryModel.elements))
                .limit(1)
            )
            existing_page = (await db.execute(page_query)).scalars().first()

        if existing_page:
            page = existing_page
            # Update URL pattern if empty
            if not page.url_pattern:
                page.url_pattern = body.url
            page.updated_at = datetime.utcnow()
        else:
            page = PageRepositoryModel(
                name=body.page_name,
                url_pattern=body.url,
                description=f"Auto-discovered from {body.url}",
                platform=body.platform,
                tags=["auto-discovered"],
            )
            db.add(page)
            await db.flush()

        # Build lookups so rescans update elements instead of duplicating them.
        existing_by_locator: dict[str, PageElementModel] = {}
        existing_by_name: dict[str, PageElementModel] = {}
        for el in (page.elements or []):
            for locator in (el.css_selector, el.xpath, el.id_attr, el.name_attr):
                if locator:
                    existing_by_locator[locator.strip()] = el
            existing_by_name[el.name.strip().lower()] = el

        now = datetime.utcnow()
        saved_count = 0

        for disc_el in result.elements:
            is_low_conf = disc_el.confidence_score < body.min_confidence

            candidate_key = (disc_el.best_locator or disc_el.css_selector or disc_el.xpath or "").strip()
            existing = existing_by_locator.get(candidate_key) if candidate_key else None
            if existing is None:
                existing = existing_by_name.get(disc_el.name.strip().lower())

            if existing:
                # Update changed locators but preserve manual edits for low confidence
                if is_low_conf:
                    continue  # Keep existing manual elements for low confidence
                existing.xpath = disc_el.xpath or existing.xpath
                existing.css_selector = disc_el.css_selector or existing.css_selector
                existing.id_attr = disc_el.id_attr or existing.id_attr
                existing.name_attr = disc_el.name_attr or existing.name_attr
                existing.locator_strategy = disc_el.locator_strategy or existing.locator_strategy
                existing.confidence_score = disc_el.confidence_score
                existing.alternative_locators = [
                    {
                        "strategy": a.strategy,
                        "locator": a.locator,
                        "verified": a.verified,
                        "element_count": a.element_count,
                        "score": a.score,
                        "reason": a.reason,
                    }
                    for a in disc_el.alternative_locators
                ]
                existing.source_url = body.url
                existing.last_verified_at = now
                existing.tags = sorted(set((existing.tags or []) + disc_el.tags))
                existing.updated_at = now
                saved_count += 1
            else:
                # Create new element
                alt_locators = [
                    {
                        "strategy": a.strategy,
                        "locator": a.locator,
                        "verified": a.verified,
                        "element_count": a.element_count,
                        "score": a.score,
                        "reason": a.reason,
                    }
                    for a in disc_el.alternative_locators
                ]
                elem = PageElementModel(
                    page_id=page.id,
                    name=disc_el.name,
                    element_type=disc_el.element_type,
                    description=disc_el.description,
                    xpath=disc_el.xpath,
                    css_selector=disc_el.css_selector,
                    id_attr=disc_el.id_attr,
                    name_attr=disc_el.name_attr,
                    locator_strategy=disc_el.locator_strategy,
                    tags=disc_el.tags,
                    confidence_score=disc_el.confidence_score,
                    alternative_locators=alt_locators,
                    source_url=body.url,
                    last_verified_at=now,
                    discovery_metadata={"url": body.url, "mode": body.save_mode},
                )
                db.add(elem)
                saved_count += 1

        await db.commit()

        # Update summary with actual saved count
        result.summary.elements_saved = saved_count
        result.summary.low_confidence = sum(
            1 for e in result.elements if e.confidence_score < body.min_confidence
        )

        # Update page info in response
        result.page = {
            "id": page.id,
            "name": page.name,
            "url_pattern": page.url_pattern,
            "platform": page.platform,
        }

    return result
