"""Wraps the existing page_discovery service for use by the AI workflow."""
from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models import PageElementModel, PageRepositoryModel
from app.page_discovery.schemas import DiscoveryRequest, DiscoveryResponse
from app.page_discovery.service import discover_elements

logger = logging.getLogger(__name__)


class PlaywrightDiscoveryAdapter:
    """Calls the existing Playwright-based element discovery service."""

    async def discover(
        self,
        url: str,
        page_name: str,
        platform: str,
        save_mode: str,
        page_id: str | None,
        db: AsyncSession,
        *,
        step_intents: list[dict] | None = None,
    ) -> DiscoveryResponse:
        request = DiscoveryRequest(
            url=url,
            page_name=page_name,
            platform=platform,
            save_mode=save_mode,
            min_confidence=0.3,
            include_hidden=False,
            page_id=page_id,
            step_intents=step_intents or [],
        )
        logger.info("PlaywrightDiscoveryAdapter: starting discovery for %s", url)
        result = await discover_elements(request)
        if not result.summary.has_error and save_mode == "auto" and result.elements:
            saved_count = await self._save_verified_elements(db, request, result)
            result.summary.elements_saved = saved_count
            result.summary.low_confidence = sum(
                1 for element in result.elements if element.confidence_score < request.min_confidence
            )
        logger.info(
            "PlaywrightDiscoveryAdapter: found %d elements (%d saved)",
            result.summary.elements_found,
            result.summary.elements_saved,
        )
        return result

    async def _save_verified_elements(
        self,
        db: AsyncSession,
        request: DiscoveryRequest,
        result: DiscoveryResponse,
    ) -> int:
        page = await self._load_or_create_page(db, request)
        existing_by_locator: dict[str, PageElementModel] = {}
        existing_by_name: dict[str, PageElementModel] = {}
        for element in page.elements or []:
            for locator in (element.css_selector, element.xpath, element.id_attr, element.name_attr):
                if locator:
                    existing_by_locator[locator.strip()] = element
            existing_by_name[element.name.strip().lower()] = element

        now = datetime.utcnow()
        saved_count = 0
        for discovered in result.elements:
            usable_locators = [
                locator for locator in discovered.alternative_locators
                if locator.locator and locator.element_count != 0
            ]
            best = next(
                (
                    locator for locator in usable_locators
                    if locator.verified and locator.element_count == 1
                ),
                usable_locators[0] if usable_locators else None,
            )
            if not best and not (discovered.xpath or discovered.css_selector):
                continue

            candidate_key = (
                best.locator if best else discovered.best_locator
            ) or discovered.css_selector or discovered.xpath or ""
            candidate_key = (
                candidate_key
            ).strip()
            existing = existing_by_locator.get(candidate_key) if candidate_key else None
            if existing is None:
                existing = existing_by_name.get(discovered.name.strip().lower())

            alt_locators = [
                {
                    "strategy": locator.strategy,
                    "locator": locator.locator,
                    "verified": locator.verified,
                    "element_count": locator.element_count,
                    "score": locator.score,
                    "reason": locator.reason,
                }
                for locator in discovered.alternative_locators
            ]
            locator_strategy = best.strategy if best else discovered.locator_strategy
            xpath = discovered.xpath
            css_selector = discovered.css_selector
            if best and best.strategy == "xpath":
                xpath = best.locator
            elif best and best.strategy != "xpath":
                css_selector = best.locator

            if existing:
                existing.description = discovered.description or existing.description
                existing.xpath = xpath or existing.xpath
                existing.css_selector = css_selector or existing.css_selector
                existing.id_attr = discovered.id_attr or existing.id_attr
                existing.name_attr = discovered.name_attr or existing.name_attr
                existing.locator_strategy = locator_strategy or existing.locator_strategy
                existing.confidence_score = discovered.confidence_score
                existing.alternative_locators = alt_locators
                existing.source_url = request.url
                existing.last_verified_at = now
                existing.tags = sorted(set((existing.tags or []) + discovered.tags))
                existing.updated_at = now
            else:
                db.add(PageElementModel(
                    page_id=page.id,
                    name=discovered.name,
                    element_type=discovered.element_type,
                    description=discovered.description,
                    xpath=xpath,
                    css_selector=css_selector,
                    id_attr=discovered.id_attr,
                    name_attr=discovered.name_attr,
                    locator_strategy=locator_strategy,
                    tags=discovered.tags,
                    confidence_score=discovered.confidence_score,
                    alternative_locators=alt_locators,
                    source_url=request.url,
                    last_verified_at=now,
                    discovery_metadata={"url": request.url, "mode": request.save_mode},
                ))
            saved_count += 1

        await db.commit()
        result.page = {
            "id": page.id,
            "name": page.name,
            "url_pattern": page.url_pattern,
            "platform": page.platform,
        }
        return saved_count

    async def _load_or_create_page(
        self,
        db: AsyncSession,
        request: DiscoveryRequest,
    ) -> PageRepositoryModel:
        page: PageRepositoryModel | None = None
        if request.page_id:
            result = await db.execute(
                select(PageRepositoryModel)
                .where(PageRepositoryModel.id == request.page_id)
                .options(selectinload(PageRepositoryModel.elements))
            )
            page = result.scalar_one_or_none()

        if page is None:
            result = await db.execute(
                select(PageRepositoryModel)
                .where(PageRepositoryModel.url_pattern == request.url)
                .where(PageRepositoryModel.platform == request.platform)
                .options(selectinload(PageRepositoryModel.elements))
                .limit(1)
            )
            page = result.scalars().first()

        if page is not None:
            return page

        page = PageRepositoryModel(
            name=request.page_name,
            url_pattern=request.url,
            description=f"Auto-discovered from {request.url}",
            platform=request.platform,
            tags=["auto-discovered"],
        )
        db.add(page)
        await db.flush()
        return page
