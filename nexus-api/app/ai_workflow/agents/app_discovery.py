from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_workflow.discovery.adapter import BrowserDiscoveryAdapter
from app.page_discovery.schemas import DiscoveryResponse

logger = logging.getLogger(__name__)


class AppDiscoveryAgent:
    def __init__(self, adapter: BrowserDiscoveryAdapter) -> None:
        self._adapter = adapter

    async def run(
        self,
        url: str,
        page_name: str,
        platform: str,
        save_mode: str,
        page_id: str | None,
        db: AsyncSession,
    ) -> DiscoveryResponse:
        logger.info("AppDiscoveryAgent: discovering %s", url)
        result = await self._adapter.discover(url, page_name, platform, save_mode, page_id, db)
        logger.info(
            "AppDiscoveryAgent: %d elements found, %d saved",
            result.summary.elements_found,
            result.summary.elements_saved,
        )
        return result
