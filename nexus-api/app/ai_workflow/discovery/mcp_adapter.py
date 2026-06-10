"""MCP Playwright adapter — calls an external MCP Playwright server if configured."""
from __future__ import annotations

import logging
import re
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


def _xpath_literal(value: str) -> str:
    if '"' not in value:
        return f'"{value}"'
    if "'" not in value:
        return f"'{value}'"
    parts = value.split('"')
    return "concat(" + ', '.join(f'"{part}"' if part else "'\"'" for part in parts) + ")"


def _short_text(value: str, limit: int = 80) -> str:
    return re.sub(r"\s+", " ", value).strip()[:limit]


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
    alternative_locators: list[dict] = field(default_factory=list)
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
        if sel.startswith("role="):
            return "role"
        if sel.startswith(("xpath=", "/", "(")):
            return "xpath"
        if "data-testid" in sel or "[testid]" in sel:
            return "testid"
        if sel.startswith(("#", ".", "[")) or ">" in sel:
            return "css"
        if self.id_attr:
            return "id"
        if self.css_selector:
            return "css"
        if self.aria_label:
            return "aria-label"
        return "xpath"

    def semantic_locator_candidates(self) -> list[dict]:
        candidates: list[dict] = []
        form_tag = "input"
        if self.element_type in {"textarea", "select"}:
            form_tag = self.element_type

        label = _short_text(self.label or self.aria_label)
        if label and self.element_type in {"input", "textarea", "select", "textbox", "searchbox"}:
            candidates.append({
                "strategy": "xpath",
                "locator": f"//label[contains(normalize-space(.), {_xpath_literal(label)})]/following::{form_tag}[1]",
                "verified": False,
                "element_count": 0,
                "score": 0.82,
                "reason": "AI semantic label-relative xpath from MCP element metadata",
            })
        placeholder = _short_text(self.placeholder)
        if placeholder and self.element_type in {"input", "textarea", "textbox", "searchbox"}:
            candidates.append({
                "strategy": "css",
                "locator": f'{form_tag}[placeholder="{placeholder.replace(chr(34), chr(92) + chr(34))}"]',
                "verified": False,
                "element_count": 0,
                "score": 0.78,
                "reason": "AI semantic placeholder css from MCP element metadata",
            })
            candidates.append({
                "strategy": "xpath",
                "locator": f"//{form_tag}[contains(@placeholder, {_xpath_literal(placeholder)})]",
                "verified": False,
                "element_count": 0,
                "score": 0.76,
                "reason": "AI semantic placeholder xpath from MCP element metadata",
            })
        text = _short_text(self.text)
        if text:
            tag = "a" if self.element_type in {"a", "link"} else self.element_type or "*"
            candidates.append({
                "strategy": "xpath",
                "locator": f"//{tag}[contains(text(), {_xpath_literal(text)})]",
                "verified": False,
                "element_count": 0,
                "score": 0.64,
                "reason": "AI semantic text xpath from MCP element metadata",
            })
        return candidates


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

    async def discover(self, url: str, *, step_intents: list[dict] | None = None) -> dict:
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {
                "url": url,
                "collect_accessibility": True,
                "step_intents": step_intents or [],
            }
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
            css_sel = item.get("css") or item.get("css_selector") or ""
            if not css_sel and not str(selector).startswith(("/", "xpath=")):
                css_sel = selector
            raw_alternatives = (
                item.get("alternative_locators")
                or item.get("locators")
                or item.get("locator_candidates")
                or []
            )
            alternative_locators: list[dict] = []
            if isinstance(raw_alternatives, list):
                for locator in raw_alternatives:
                    if isinstance(locator, dict):
                        loc = locator.get("locator") or locator.get("selector") or ""
                        if loc:
                            strategy = str(locator.get("strategy") or "").lower()
                            alternative_locators.append({
                                "strategy": strategy or ("xpath" if str(loc).startswith(("/", "xpath=")) else "css"),
                                "locator": str(loc),
                                "verified": bool(locator.get("verified", False)),
                                "element_count": int(locator.get("element_count") or locator.get("count") or 0),
                                "score": float(locator.get("score") or locator.get("confidence") or 0.5),
                                "reason": str(locator.get("reason") or "MCP-provided alternative locator"),
                            })

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
                alternative_locators=alternative_locators,
                tags=tags,
            ))

        return elements
