"""
Playwright-backed discovery service for extracting actionable UI elements.
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import re
import socket
import time
from typing import Any
from urllib.parse import urlparse

from app.config import settings
from app.page_discovery.locators import ElementDiscoveryAgent
from app.page_discovery.schemas import (
    DiscoveryRequest, DiscoveryResponse, DiscoverySummary,
)

try:
    from playwright.async_api import async_playwright
except ImportError:
    async_playwright = None

logger = logging.getLogger(__name__)

_NAVIGATION_TIMEOUT = 30000
_ROLE_SELECTOR = re.compile(r'^role=([^\[]+)(?:\[name="((?:\\.|[^"])*)"\])?$')
_DISCOVERY_INTENT_STOPWORDS = {
    "a", "an", "and", "are", "as", "be", "by", "click", "enter", "fill",
    "for", "from", "in", "into", "is", "it", "of", "on", "open", "select",
    "should", "submit", "the", "to", "type", "user", "verify", "with",
}


class DiscoveryUrlError(ValueError):
    """Raised when a requested discovery URL is not safe to browse server-side."""


def _is_private_host(hostname: str) -> bool:
    if hostname.lower() in {"localhost", "localhost.localdomain"}:
        return True
    try:
        ip = ipaddress.ip_address(hostname)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified or ip.is_reserved
    except ValueError:
        return False


async def _validate_discovery_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise DiscoveryUrlError("Only http and https URLs are supported")
    if not parsed.hostname:
        raise DiscoveryUrlError("URL must include a hostname")

    # Local/private pages are useful during development, but should not be browsed
    # by a production API because this endpoint has server-side browser access.
    if settings.debug or settings.discovery_allow_private_network:
        return

    if _is_private_host(parsed.hostname):
        raise DiscoveryUrlError("Private or local network URLs are not allowed")

    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, parsed.hostname, parsed.port or 443)
    except socket.gaierror:
        return
    for info in infos:
        ip = info[4][0]
        if _is_private_host(ip):
            raise DiscoveryUrlError("URL resolves to a private or local network address")


def _intent_tokens(*values: Any) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        for token in re.findall(r"[a-z0-9]+", str(value or "").lower()):
            if len(token) > 1 and token not in _DISCOVERY_INTENT_STOPWORDS:
                tokens.add(token)
    return tokens


def _raw_element_text(raw: dict[str, Any]) -> str:
    attrs = raw.get("attributes") if isinstance(raw.get("attributes"), dict) else {}
    roles = raw.get("roles") if isinstance(raw.get("roles"), list) else []
    class_list = attrs.get("class_list") if isinstance(attrs.get("class_list"), list) else []
    values = [
        raw.get("tag"),
        raw.get("role"),
        " ".join(str(role) for role in roles),
        attrs.get("id"),
        attrs.get("name"),
        attrs.get("type"),
        attrs.get("placeholder"),
        attrs.get("title"),
        attrs.get("alt"),
        attrs.get("aria-label"),
        attrs.get("data-testid"),
        attrs.get("data-test"),
        attrs.get("data-qa"),
        attrs.get("data-cy"),
        attrs.get("role"),
        attrs.get("text_content"),
        attrs.get("label_text"),
        " ".join(str(value) for value in class_list),
    ]
    return " ".join(str(value) for value in values if value)


def _raw_element_action_bonus(raw: dict[str, Any], intent: dict[str, Any]) -> float:
    action = str(intent.get("action_type") or "").lower()
    attrs = raw.get("attributes") if isinstance(raw.get("attributes"), dict) else {}
    tag = str(raw.get("tag") or "").lower()
    input_type = str(attrs.get("type") or "").lower()
    roles = {str(role).lower() for role in (raw.get("roles") or [])}
    role = str(attrs.get("role") or "").lower()
    if role:
        roles.add(role)

    is_text_entry = tag in {"input", "textarea"} and input_type not in {"button", "submit", "reset", "checkbox", "radio"}
    is_choice = tag in {"button", "a", "option"} or roles & {"button", "link", "tab", "menuitem", "checkbox", "radio"}
    is_select = tag == "select" or "combobox" in roles or "listbox" in roles

    if action in {"fill", "clear"}:
        return 0.34 if is_text_entry else -0.22
    if action == "select":
        return 0.28 if is_select else 0.04 if is_choice else -0.08
    if action in {"click", "submit", "upload"}:
        return 0.26 if is_choice else -0.10 if is_text_entry else 0.02
    if action.startswith("assert"):
        return 0.10
    return 0.0


def _raw_element_intent_score(raw: dict[str, Any], intent: dict[str, Any]) -> float:
    element_text = _raw_element_text(raw)
    element_tokens = _intent_tokens(element_text)
    intent_text = " ".join(
        str(intent.get(field) or "")
        for field in ("description", "target_hint", "input_value", "expected_result", "data_intent")
    )
    intent_tokens = _intent_tokens(intent_text)
    if not intent_tokens:
        return 0.0
    overlap = len(element_tokens & intent_tokens) / max(len(intent_tokens), 1)
    target_hint = str(intent.get("target_hint") or "").strip().lower()
    target_match = bool(target_hint and target_hint in element_text.lower())
    semantic_score = overlap + (0.18 if target_match else 0.0)
    action_bonus = _raw_element_action_bonus(raw, intent)
    score = semantic_score + (action_bonus if semantic_score > 0 else min(action_bonus, 0.02))
    attrs = raw.get("attributes") if isinstance(raw.get("attributes"), dict) else {}
    if attrs.get("data-testid") or attrs.get("data-test") or attrs.get("data-qa") or attrs.get("data-cy"):
        score += 0.06
    if attrs.get("id") or attrs.get("name"):
        score += 0.04
    return max(0.0, min(score, 1.0))


def _filter_raw_elements_for_step_intents(
    raw_elements: list[dict[str, Any]],
    step_intents: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    intents = [intent for intent in (step_intents or []) if isinstance(intent, dict)]
    if not raw_elements or not intents:
        return raw_elements

    scored: list[tuple[dict[str, Any], float]] = []
    for raw in raw_elements:
        best_score = max((_raw_element_intent_score(raw, intent) for intent in intents), default=0.0)
        if best_score >= 0.24:
            scored.append((raw, best_score))

    fallback_limit = min(len(raw_elements), max(len(intents) * 6, 20))
    if not scored:
        return raw_elements[:fallback_limit]

    scored.sort(key=lambda item: item[1], reverse=True)
    targeted_limit = min(len(scored), max(len(intents) * 6, 20), 120)
    return [raw for raw, _ in scored[:targeted_limit]]


def _get_extraction_script() -> str:
    """Return JS snippet to extract element data from the page."""
    return r"""
(includeHidden) => {
    const results = [];
    const TAGS = new Set(['button','a','input','textarea','select','option','dialog','label','p']);
    const TEXT_HINT_TAGS = new Set(['label','p','span','h1','h2','h3','h4','h5','h6']);
    const ROLES = new Set(['button','link','textbox','combobox','checkbox','radio','tab','menuitem','dialog','switch','slider','listbox','menu','option','gridcell']);
    function xpathLiteral(value) {
        if (!value.includes('"')) return '"' + value + '"';
        if (!value.includes("'")) return "'" + value + "'";
        return 'concat("' + value.split('"').join('", ' + "'" + '"' + "'" + ', "') + '")';
    }
    function getAbsoluteXPath(el) {
        const parts = [];
        while (el && el.nodeType === Node.ELEMENT_NODE && el !== document.documentElement) {
            const tag = el.tagName.toLowerCase();
            let index = 1;
            let sib = el.previousElementSibling;
            while (sib) {
                if (sib.tagName.toLowerCase() === tag) index++;
                sib = sib.previousElementSibling;
            }
            parts.unshift(tag + '[' + index + ']');
            el = el.parentElement;
        }
        return '/' + ['html'].concat(parts).join('/');
    }
    function getXPath(el) {
        const id = el.getAttribute('id');
        if (id) return '//*[@id=' + xpathLiteral(id) + ']';
        return getAbsoluteXPath(el);
    }
    function getCssPath(el) {
        const id = el.getAttribute('id');
        if (id) return '#' + CSS.escape(id);
        const parts = [];
        while (el && el.nodeType === Node.ELEMENT_NODE && el !== document.documentElement) {
            const tag = el.tagName.toLowerCase();
            if (tag === 'body') { parts.unshift('body'); break; }
            let index = 1;
            let sib = el.previousElementSibling;
            while (sib) {
                if (sib.tagName.toLowerCase() === tag) index++;
                sib = sib.previousElementSibling;
            }
            parts.unshift(tag + ':nth-of-type(' + index + ')');
            el = el.parentElement;
        }
        return parts.join(' > ');
    }
    function getLabel(el) {
        if (el.labels && el.labels.length > 0) return el.labels[0].textContent.trim();
        const id = el.getAttribute('id');
        if (id) {
            const lbl = document.querySelector('label[for="' + CSS.escape(id) + '"]');
            if (lbl) return lbl.textContent.trim();
        }
        const alb = el.getAttribute('aria-labelledby');
        if (alb) { const ref = document.getElementById(alb); if (ref) return ref.textContent.trim(); }
        return '';
    }
    function getText(el) {
        if (['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) {
            const pl = el.closest('label');
            return pl ? pl.textContent.trim() : '';
        }
        let t = '';
        el.childNodes.forEach(function(n) { if (n.nodeType === 3) t += n.textContent; });
        if (!t.trim()) t = el.textContent || '';
        return t.trim().substring(0, 200);
    }
    function getRoles(el) {
        const roles = [];
        const exp = el.getAttribute('role');
        if (exp) roles.push(exp);
        const tag = el.tagName.toLowerCase();
        if (tag === 'button' && !exp) roles.push('button');
        if (tag === 'a' && el.hasAttribute('href') && !exp) roles.push('link');
        if (tag === 'input' && el.type === 'checkbox' && !exp) roles.push('checkbox');
        if (tag === 'input' && el.type === 'radio' && !exp) roles.push('radio');
        if (tag === 'select' && !exp) roles.push('combobox');
        if (tag === 'textarea' && !exp) roles.push('textbox');
        return [...new Set(roles)];
    }
    function getAttrs(el) {
        const a = {};
        ['id','name','type','placeholder','title','alt','aria-label','data-testid','data-test','data-qa','data-cy','href','src','role','disabled','hidden'].forEach(function(n) {
            const v = el.getAttribute(n);
            if (v !== null && v !== '') a[n] = v;
        });
        if (el.classList.length > 0) a.class_list = Array.from(el.classList);
        const tx = getText(el); if (tx) a.text_content = tx;
        const lb = getLabel(el); if (lb) a.label_text = lb;
        const s = window.getComputedStyle(el);
        a.visible = s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && el.getClientRects().length > 0;
        a.enabled = !el.disabled && el.getAttribute('aria-disabled') !== 'true';
        a.xpath = getXPath(el);
        a.absolute_xpath = getAbsoluteXPath(el);
        a.css_path = getCssPath(el);
        return a;
    }
    function isInt(el) {
        const tag = el.tagName.toLowerCase();
        if (TAGS.has(tag)) return true;
        const role = el.getAttribute('role');
        if (role && ROLES.has(role)) return true;
        if (el.hasAttribute('data-testid') || el.hasAttribute('data-test') || el.hasAttribute('data-qa') || el.hasAttribute('data-cy')) return true;
        if (el.getAttribute('aria-label')) return true;
        if (TEXT_HINT_TAGS.has(tag)) {
            const text = getText(el);
            return text.length >= 2 && text.length <= 120;
        }
        return false;
    }
    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
        const el = all[i];
        const tag = el.tagName.toLowerCase();
        if (['html','body','script','style','link','meta','head','noscript','template'].includes(tag)) continue;
        if (!isInt(el)) continue;
        const attrs = getAttrs(el);
        if (!attrs.visible && !includeHidden) continue;
        const roles = getRoles(el);
        results.push({ tag, attributes: attrs, roles, visible: attrs.visible, enabled: attrs.enabled });
    }
    const seen = new Set();
    return results.filter(function(r) {
        const k = r.attributes.xpath || r.attributes.css_path || r.tag + ':' + Object.keys(r.attributes).join(',');
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}
"""


async def _verify_locator(page: Any, strategy: str, locator: str) -> dict[str, Any]:
    try:
        if strategy == "role":
            match = _ROLE_SELECTOR.match(locator)
            if match:
                name = match.group(2)
                if name is not None:
                    name = name.replace('\\"', '"').replace("\\\\", "\\")
                loc = page.get_by_role(match.group(1), name=name)
            else:
                loc = page.locator(locator)
        elif strategy == "xpath":
            selector = locator if locator.startswith("xpath=") else f"xpath={locator}"
            loc = page.locator(selector)
        else:
            loc = page.locator(locator)
        count = await loc.count()
        visible = False
        enabled = False
        if count > 0:
            first = loc.first
            visible = await first.is_visible()
            enabled = await first.is_enabled()
        return {
            "element_count": count,
            "visible": visible,
            "enabled": enabled,
            "verified": count == 1 and visible,
        }
    except Exception as exc:
        logger.debug("Locator verification failed for %s=%s: %s", strategy, locator, exc)
        return {"element_count": 0, "visible": False, "enabled": False, "verified": False}


async def discover_elements(request: DiscoveryRequest) -> DiscoveryResponse:
    """Launch Playwright, extract elements, score, and return results."""
    start = time.monotonic()
    logger.info("Discovery starting for %s", request.url)

    try:
        await _validate_discovery_url(request.url)
    except DiscoveryUrlError as exc:
        return DiscoveryResponse(
            summary=DiscoverySummary(
                url=request.url, elements_found=0, elements_saved=0,
                low_confidence=0, duration_ms=0,
                has_error=True, error=str(exc),
            ),
            elements=[],
        )

    if async_playwright is None:
        return DiscoveryResponse(
            summary=DiscoverySummary(
                url=request.url, elements_found=0, elements_saved=0,
                low_confidence=0, duration_ms=0,
                has_error=True, error="playwright not installed",
            ),
            elements=[],
        )

    raw_elements: list[dict[str, Any]] = []
    discovered = []
    error_msg = ""

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            )
            page = await ctx.new_page()

            try:
                await page.goto(request.url, wait_until="networkidle", timeout=_NAVIGATION_TIMEOUT)
            except Exception:
                try:
                    await page.goto(request.url, wait_until="domcontentloaded", timeout=_NAVIGATION_TIMEOUT)
                except Exception as exc:
                    error_msg = f"Navigation failed: {exc}"
                    await browser.close()
                    return DiscoveryResponse(
                        summary=DiscoverySummary(
                            url=request.url, elements_found=0, elements_saved=0,
                            low_confidence=0,
                            duration_ms=int((time.monotonic() - start) * 1000),
                            has_error=True, error=error_msg,
                        ),
                        elements=[],
                    )

            await asyncio.sleep(1)

            try:
                script = _get_extraction_script()
                raw_elements = await page.evaluate(script, request.include_hidden)
                extracted_count = len(raw_elements)
                raw_elements = _filter_raw_elements_for_step_intents(raw_elements, request.step_intents)
                if request.step_intents and len(raw_elements) != extracted_count:
                    logger.info(
                        "Step-intent discovery filter reduced raw elements from %d to %d",
                        extracted_count,
                        len(raw_elements),
                    )
            except Exception as exc:
                error_msg = f"Extraction failed: {exc}"

            agent = ElementDiscoveryAgent(
                min_confidence=request.min_confidence,
                include_hidden=request.include_hidden,
            )
            discovered = await agent.process_elements_verified(
                raw_elements,
                lambda strategy, locator: _verify_locator(page, strategy, locator),
            )

            await browser.close()

    except Exception as exc:
        error_msg = f"Playwright error: {exc}"
        logger.exception("Discovery Playwright error")

    if error_msg and not raw_elements:
        return DiscoveryResponse(
            summary=DiscoverySummary(
                url=request.url, elements_found=0, elements_saved=0,
                low_confidence=0,
                duration_ms=int((time.monotonic() - start) * 1000),
                has_error=True, error=error_msg,
            ),
            elements=[],
        )

    logger.info("Extracted %d raw elements from %s", len(raw_elements), request.url)

    duration_ms = int((time.monotonic() - start) * 1000)
    low_conf = sum(1 for e in discovered if e.confidence_score < request.min_confidence)

    return DiscoveryResponse(
        page={},
        summary=DiscoverySummary(
            url=request.url,
            elements_found=len(raw_elements),
            elements_saved=0,
            low_confidence=low_conf,
            duration_ms=duration_ms,
        ),
        elements=discovered,
    )
