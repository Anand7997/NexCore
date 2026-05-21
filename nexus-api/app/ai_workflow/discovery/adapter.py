"""BrowserDiscoveryAdapter: tries MCP Playwright first, falls back to direct Playwright."""
from __future__ import annotations

import logging
import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.page_discovery.schemas import (
    DiscoveredElement,
    DiscoveryResponse,
    DiscoverySummary,
    LocatorCandidate,
)

logger = logging.getLogger(__name__)

_MCP_MIN_ELEMENTS = 5  # fall back to Playwright if MCP returns fewer than this


class BrowserDiscoveryAdapter:
    def __init__(self, mcp_url: str | None = None, playwright_fallback: bool = True) -> None:
        self._mcp_url = mcp_url
        self._playwright_fallback = playwright_fallback

    async def discover(
        self,
        url: str,
        page_name: str,
        platform: str,
        save_mode: str,
        page_id: str | None,
        db: AsyncSession,
    ) -> DiscoveryResponse:
        if self._mcp_url:
            try:
                from app.ai_workflow.discovery.mcp_adapter import MCPPlaywrightAdapter
                mcp = MCPPlaywrightAdapter(self._mcp_url)
                if await mcp.is_available():
                    logger.info("BrowserDiscoveryAdapter: using MCP Playwright at %s", self._mcp_url)
                    raw = await mcp.discover(url)
                    parsed = MCPPlaywrightAdapter.parse_elements(raw)
                    if len(parsed) >= _MCP_MIN_ELEMENTS:
                        logger.info(
                            "BrowserDiscoveryAdapter: MCP returned %d elements — skipping Playwright",
                            len(parsed),
                        )
                        return await self._mcp_elements_to_discovery(
                            parsed, raw, url, page_name, platform, save_mode, page_id, db
                        )
                    logger.warning(
                        "BrowserDiscoveryAdapter: MCP returned only %d elements (need %d) — falling back",
                        len(parsed), _MCP_MIN_ELEMENTS,
                    )
            except Exception as exc:
                logger.warning("MCP Playwright failed (%s); falling back to direct Playwright", exc)

        if self._playwright_fallback:
            from app.ai_workflow.discovery.playwright_adapter import PlaywrightDiscoveryAdapter
            adapter = PlaywrightDiscoveryAdapter()
            return await adapter.discover(url, page_name, platform, save_mode, page_id, db)

        raise RuntimeError("No discovery adapter available (MCP unreachable and fallback disabled)")

    async def _mcp_elements_to_discovery(
        self,
        parsed,
        raw: dict,
        url: str,
        page_name: str,
        platform: str,
        save_mode: str,
        page_id: str | None,
        db: AsyncSession,
    ) -> DiscoveryResponse:
        from app.ai_workflow.discovery.mcp_adapter import MCPElement
        from app.database.models import PageElementModel

        t0 = time.monotonic()

        # Resolve page_id or create via Playwright adapter's helper
        resolved_page_id = page_id
        if not resolved_page_id:
            # We need a page_id to associate elements; fall through to Playwright
            from app.ai_workflow.discovery.playwright_adapter import PlaywrightDiscoveryAdapter
            adapter = PlaywrightDiscoveryAdapter()
            return await adapter.discover(url, page_name, platform, save_mode, page_id, db)

        low_confidence = 0
        saved = 0
        discovered_elements: list[DiscoveredElement] = []

        for mcp_el in parsed:
            alt_locators: list[LocatorCandidate] = []
            if mcp_el.xpath:
                alt_locators.append(LocatorCandidate(
                    strategy="xpath", locator=mcp_el.xpath,
                    verified=True, element_count=1,
                    score=0.40, reason="MCP-provided xpath",
                ))
            if mcp_el.css_selector and mcp_el.css_selector != mcp_el.xpath:
                alt_locators.append(LocatorCandidate(
                    strategy="css", locator=mcp_el.css_selector,
                    verified=True, element_count=1,
                    score=0.60, reason="MCP-provided css",
                ))

            el_model = PageElementModel(
                page_id=resolved_page_id,
                name=mcp_el.name,
                element_type=mcp_el.element_type,
                description=f"Discovered via MCP Playwright: {mcp_el.text[:80]}" if mcp_el.text else "",
                xpath=mcp_el.xpath,
                css_selector=mcp_el.css_selector,
                id_attr=mcp_el.id_attr,
                name_attr=mcp_el.name_attr,
                locator_strategy=mcp_el.locator_strategy,
                tags=mcp_el.tags,
                confidence_score=mcp_el.confidence,
                alternative_locators=[lc.model_dump() for lc in alt_locators],
                source_url=url,
                discovery_metadata={"source": "mcp_playwright", "raw_selector": mcp_el.selector},
            )
            db.add(el_model)
            saved += 1
            if mcp_el.confidence < 0.6:
                low_confidence += 1

            discovered_elements.append(DiscoveredElement(
                name=mcp_el.name,
                element_type=mcp_el.element_type,
                best_locator=mcp_el.selector,
                locator_strategy=mcp_el.locator_strategy,
                xpath=mcp_el.xpath,
                css_selector=mcp_el.css_selector,
                id_attr=mcp_el.id_attr,
                name_attr=mcp_el.name_attr,
                confidence_score=mcp_el.confidence,
                alternative_locators=alt_locators,
                tags=mcp_el.tags,
            ))

        await db.commit()

        duration_ms = int((time.monotonic() - t0) * 1000)
        summary = DiscoverySummary(
            url=url,
            elements_found=len(parsed),
            elements_saved=saved,
            low_confidence=low_confidence,
            duration_ms=duration_ms,
        )
        return DiscoveryResponse(
            page={"id": resolved_page_id, "name": page_name, "url": url},
            summary=summary,
            elements=discovered_elements,
        )
