"""MCP Playwright adapter — calls an external MCP Playwright server if configured."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

# Confidence scores by selector type — higher means more stable locator
_STRATEGY_CONFIDENCE: dict[str, float] = {
    "testid": 0.95,
    "data-testid": 0.95,
    "aria-label": 0.85,
    "role": 0.80,
    "id": 0.80,
    "name": 0.75,
    "css": 0.60,
    "class": 0.50,
    "xpath": 0.40,
    "text": 0.45,
}


@dataclass
class MCPElement:
    selector: str
    element_type: str
    text: str
    aria_label: str
    id_attr: str
    name_attr: str
    xpath: str
    css_selector: str
    input_type: str
    placeholder: str
    label: str
    confidence: float
    tags: list[str] = field(default_factory=list)

    @property
    def name(self) -> str:
        """Human-readable name derived from attributes."""
        for candidate in (self.aria_label, self.id_attr, self.name_attr, self.text):
            cleaned = (candidate or "").strip()[:80]
            if cleaned:
                return cleaned
        # Fall back to type + truncated selector
        return f"{self.element_type}_{self.selector[:40]}".replace(" ", "_")

    @property
    def locator_strategy(self) -> str:
        sel = self.selector.lower()
        if "data-testid" in sel or "[testid]" in sel:
            return "testid"
        if self.aria_label:
            return "aria-label"
        if self.id_attr:
            return "id"
        if self.css_selector:
            return "css"
        return "xpath"


class MCPPlaywrightAdapter:
    def __init__(self, mcp_url: str) -> None:
        self._mcp_url = mcp_url.rstrip("/")

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self._mcp_url}/health")
                return resp.status_code == 200
        except Exception:
            return False

    async def discover(self, url: str) -> dict:
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {"url": url, "collect_accessibility": True}
            resp = await client.post(f"{self._mcp_url}/discover", json=payload)
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    def parse_elements(raw: dict) -> list[MCPElement]:
        """
        Parse MCP server response into MCPElement list.
        Handles flat 'elements' list, 'nodes' list, and nested 'page.elements' format.
        """
        elements: list[MCPElement] = []

        # Try flat elements list first (most common MCP Playwright format)
        raw_elements: list[dict] = raw.get("elements") or raw.get("nodes") or []
        if not raw_elements:
            # Try nested: {"page": {"elements": [...]}}
            page = raw.get("page") or {}
            raw_elements = page.get("elements") or []
        if not isinstance(raw_elements, list):
            raw_elements = []

        for item in raw_elements:
            selector = (
                item.get("selector")
                or item.get("locator")
                or item.get("css")
                or item.get("xpath")
                or ""
            )
            if not selector:
                continue

            el_type = (
                item.get("type")
                or item.get("element_type")
                or item.get("tag")
                or item.get("role")
                or "element"
            ).lower()

            aria_label = item.get("aria_label") or item.get("ariaLabel") or item.get("label") or ""
            id_attr = item.get("id") or item.get("id_attr") or ""
            name_attr = item.get("name") or item.get("name_attr") or ""
            input_type = item.get("input_type") or item.get("type_attr") or item.get("inputType") or ""
            placeholder = item.get("placeholder") or ""
            text = item.get("text") or item.get("innerText") or item.get("textContent") or ""
            text = str(text).strip()[:120]
            xpath = item.get("xpath") or item.get("full_xpath") or ""
            css_sel = item.get("css") or item.get("css_selector") or selector

            # Score the confidence based on what attributes are available
            confidence = _STRATEGY_CONFIDENCE["xpath"]  # default
            for key, score in _STRATEGY_CONFIDENCE.items():
                if (item.get("strategy") or "") == key or (key == "id" and id_attr) or (key == "aria-label" and aria_label):
                    confidence = max(confidence, score)
            # Boost if data-testid present
            if "testid" in selector.lower() or "data-testid" in selector.lower():
                confidence = _STRATEGY_CONFIDENCE["testid"]

            tags: list[str] = []
            if el_type in ("button", "submit", "reset"):
                tags.append("interactive")
            if el_type in ("input", "textarea", "select", "checkbox", "radio"):
                tags.append("form")
            if el_type in ("a", "link"):
                tags.append("navigation")

            elements.append(MCPElement(
                selector=selector,
                element_type=el_type,
                text=text,
                aria_label=aria_label,
                id_attr=id_attr,
                name_attr=name_attr,
                xpath=xpath,
                css_selector=css_sel,
                input_type=str(input_type),
                placeholder=str(placeholder),
                label=str(aria_label),
                confidence=confidence,
                tags=tags,
            ))

        return elements
