"""Wraps the existing page_discovery service for use by the AI workflow."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

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
    ) -> DiscoveryResponse:
        request = DiscoveryRequest(
            url=url,
            page_name=page_name,
            platform=platform,
            save_mode=save_mode,
            min_confidence=0.3,
            include_hidden=False,
            page_id=page_id,
        )
        logger.info("PlaywrightDiscoveryAdapter: starting discovery for %s", url)
        result = await discover_elements(request, db)
        logger.info(
            "PlaywrightDiscoveryAdapter: found %d elements (%d saved)",
            result.summary.elements_found,
            result.summary.elements_saved,
        )
        return result
