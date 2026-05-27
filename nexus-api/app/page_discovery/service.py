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
    function getXPath(el) {
        const id = el.getAttribute('id');
        if (id) return '//*[@id=' + xpathLiteral(id) + ']';
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
