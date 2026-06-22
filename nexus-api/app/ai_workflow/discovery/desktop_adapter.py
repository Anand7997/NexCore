"""Desktop discovery adapter for AI Workflow.

Launches or attaches to a desktop application, captures the UI Automation tree,
and converts Desktop Object Spy candidates into the same discovery shape used by
the web MCP/Playwright discovery pipeline.
"""
from __future__ import annotations

import asyncio
import logging
import ntpath
import re
import shlex
import time
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.execution.plugins.desktop.drivers import get_driver
from app.execution.plugins.desktop.spy import SpyObject, parse_desktop_ui_tree
from app.page_discovery.schemas import (
    DiscoveredElement,
    DiscoveryResponse,
    DiscoverySummary,
    LocatorCandidate,
)

logger = logging.getLogger(__name__)

_DESKTOP_LOW_CONFIDENCE_THRESHOLD = 0.6
_LOW_SIGNAL_CONTROL_TYPES = {
    "window",
    "pane",
    "group",
    "separator",
    "statusbar",
    "status bar",
    "titlebar",
    "title bar",
    "scrollbar",
    "scroll bar",
}
_INTENT_STOPWORDS = {
    "a", "an", "and", "are", "as", "be", "by", "click", "enter", "fill",
    "for", "in", "into", "is", "it", "of", "on", "open", "select", "should",
    "the", "to", "type", "verify", "with",
}


def _coerce_args(value: list[str] | str | None) -> list[str] | None:
    if value in (None, ""):
        return None
    if isinstance(value, list):
        return [str(item) for item in value]
    return shlex.split(str(value))


def _strategy_score(strategy: str, fallback: float = 0.5) -> float:
    return {
        "accessibility id": 1.0,
        "automation id": 1.0,
        "accessibility_id": 1.0,
        "name": 0.86,
        "xpath": 0.74,
        "uia": 0.68,
        "class name": 0.56,
        "class_name": 0.56,
        "ocr": 0.42,
        "visual": 0.38,
    }.get(strategy.lower(), fallback)


def _intent_tokens(*values: Any) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        for token in re.findall(r"[a-z0-9]+", str(value or "").lower()):
            if len(token) > 1 and token not in _INTENT_STOPWORDS:
                tokens.add(token)
    return tokens


def _intent_action_bonus(action: str, control_type: str) -> float:
    action = str(action or "").lower()
    control = str(control_type or "").lower()
    if action in {"fill", "clear"}:
        return 0.32 if control in {"edit", "textbox", "text box", "document"} else -0.18
    if action in {"click", "submit"}:
        if control in {"button", "menuitem", "menu item", "tabitem", "tab item", "treeitem", "tree item", "hyperlink", "link"}:
            return 0.26
        if control in {"edit", "textbox", "document"}:
            return -0.10
    if action == "select":
        return 0.24 if control in {"combobox", "combo box", "listbox", "list box", "menuitem", "menu item"} else 0.04
    if action.startswith("assert"):
        return 0.12 if control in {"text", "document", "pane", "button", "edit"} else 0.02
    return 0.0


def _object_intent_score(obj: SpyObject, intent: dict[str, Any]) -> float:
    object_tokens = _intent_tokens(
        obj.name,
        obj.name_text,
        obj.automation_id,
        obj.object_key,
        obj.class_name,
        obj.control_type,
    )
    intent_tokens = _intent_tokens(
        intent.get("description"),
        intent.get("target_hint"),
        intent.get("input_value"),
        intent.get("expected_result"),
        intent.get("data_intent"),
    )
    overlap = len(object_tokens & intent_tokens) / max(len(intent_tokens), 1)
    score = overlap + _intent_action_bonus(str(intent.get("action_type") or ""), obj.control_type)
    data_intent = str(intent.get("data_intent") or "").lower()
    object_text = " ".join(object_tokens)
    if data_intent and data_intent in object_text:
        score += 0.18
    if obj.automation_id:
        score += 0.08
    if obj.uia_path:
        score += 0.04
    return max(0.0, min(score, 1.0))


def _matched_step_intents(
    obj: SpyObject,
    step_intents: list[dict[str, Any]] | None,
    *,
    limit: int = 4,
) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for intent in step_intents or []:
        if not isinstance(intent, dict):
            continue
        score = _object_intent_score(obj, intent)
        if score < 0.28:
            continue
        matches.append({
            "test_case_title": str(intent.get("test_case_title") or ""),
            "step_number": int(intent.get("step_number") or 0),
            "action_type": str(intent.get("action_type") or ""),
            "description": str(intent.get("description") or ""),
            "target_hint": str(intent.get("target_hint") or ""),
            "score": round(score, 4),
        })
    matches.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
    return matches[:limit]


def _locator_payload(locator: dict[str, Any]) -> LocatorCandidate | None:
    value = str(locator.get("locator") or locator.get("value") or locator.get("selector") or "")
    if not value:
        return None
    strategy = str(locator.get("strategy") or "name")
    score = float(locator.get("score") or locator.get("confidence") or _strategy_score(strategy))
    return LocatorCandidate(
        strategy=strategy,
        locator=value,
        verified=bool(locator.get("verified", False)),
        element_count=int(locator.get("element_count") or locator.get("count") or 0),
        score=score,
        reason=str(locator.get("reason") or "Desktop MCP/UIA locator candidate"),
    )


def _first_locator(
    locators: list[LocatorCandidate],
    strategies: set[str],
) -> LocatorCandidate | None:
    normalized = {item.lower() for item in strategies}
    for locator in locators:
        if locator.strategy.lower() in normalized and locator.locator:
            return locator
    return None


def _locator_exists(locators: list[LocatorCandidate], strategy: str, value: str) -> bool:
    value = str(value or "")
    if not value:
        return True
    return any(
        locator.strategy.lower() == strategy.lower() and locator.locator == value
        for locator in locators
    )


def _add_locator(
    locators: list[LocatorCandidate],
    strategy: str,
    value: str,
    *,
    verified: bool,
    element_count: int,
    score: float,
    reason: str,
) -> None:
    value = str(value or "").strip()
    if not value or _locator_exists(locators, strategy, value):
        return
    locators.append(LocatorCandidate(
        strategy=strategy,
        locator=value,
        verified=verified,
        element_count=element_count,
        score=score,
        reason=reason,
    ))


def _window_title_from_launch(result_metadata: dict[str, Any], fallback: str) -> str:
    return str(
        result_metadata.get("window_title")
        or result_metadata.get("title")
        or fallback
        or ""
    )


def _process_name_from_app(app: str) -> str:
    text = str(app or "").strip()
    if not text:
        return ""
    if text.startswith('"'):
        end = text.find('"', 1)
        path = text[1:end] if end > 1 else text.strip('"')
    else:
        match = re.match(r"(.+?\.exe)\b", text, flags=re.IGNORECASE)
        path = match.group(1) if match else text.split()[0]
    return ntpath.basename(path.strip().strip('"'))


def _objects_signature(objects: list[SpyObject]) -> tuple[Any, ...]:
    return tuple(
        (
            obj.object_key,
            obj.control_type,
            obj.automation_id,
            obj.name_text or obj.name,
            obj.class_name,
            obj.uia_path,
        )
        for obj in objects[:80]
    )


def _objects_quality(objects: list[SpyObject]) -> float:
    quality = float(len(objects))
    for obj in objects:
        if obj.automation_id:
            quality += 5.0
        if obj.uia_path:
            quality += 2.0
        if obj.name_text or obj.name:
            quality += 1.0
        if obj.class_name:
            quality += 0.5
        if obj.control_type and obj.control_type.lower() not in {"window", "pane"}:
            quality += 0.25
    return quality


def _is_capture_ready_object(obj: SpyObject) -> bool:
    control_type = str(obj.control_type or "").strip().lower()
    if control_type in _LOW_SIGNAL_CONTROL_TYPES:
        return False
    return bool(
        obj.automation_id
        or obj.name_text
        or obj.primary_locator
        or obj.uia_path
    )


def _capture_ready_object_count(objects: list[SpyObject]) -> int:
    return sum(1 for obj in objects if _is_capture_ready_object(obj))


def _context_for_object(objects: list[SpyObject], index: int, window_title: str) -> dict[str, Any]:
    obj = objects[index]
    parent_chain = [
        token.strip()
        for token in str(obj.uia_path or "").strip("/").split("/")
        if token.strip()
    ]
    if not parent_chain and window_title:
        parent_chain = [window_title]

    nearby = []
    for other in objects[max(0, index - 3): index + 4]:
        if other is obj:
            continue
        label = other.name_text or other.name or other.automation_id
        if label:
            nearby.append(label)

    children = [
        other.name_text or other.name or other.automation_id
        for other in objects
        if obj.uia_path
        and other.uia_path
        and other.uia_path.startswith(obj.uia_path.rstrip("/") + "/")
    ][:8]

    return {
        "parent_chain": parent_chain,
        "nearby_siblings": nearby[:8],
        "children": children,
        "bounding_box": obj.bounding_box,
        "window_title": window_title,
    }


def _fallback_context_locators(
    obj: SpyObject,
    context: dict[str, Any],
) -> list[LocatorCandidate]:
    locators: list[LocatorCandidate] = []
    control_type = obj.control_type or "element"
    name_text = obj.name_text or obj.name
    parent = next(reversed(context.get("parent_chain") or []), "")

    if parent and obj.automation_id:
        _add_locator(
            locators,
            "uia",
            f"{parent} >> {control_type}[AutomationId='{obj.automation_id}']",
            verified=False,
            element_count=0,
            score=0.78,
            reason="Parent-scoped Automation ID fallback from desktop UIA context",
        )
    if parent and name_text:
        _add_locator(
            locators,
            "uia",
            f"{parent} >> {control_type}[Name='{name_text}']",
            verified=False,
            element_count=0,
            score=0.70,
            reason="Parent-scoped name fallback from desktop UIA context",
        )
    nearby = next((label for label in context.get("nearby_siblings") or [] if label), "")
    if nearby and name_text:
        _add_locator(
            locators,
            "relative",
            f"near('{nearby}') -> {control_type}[Name='{name_text}']",
            verified=False,
            element_count=0,
            score=0.62,
            reason="Nearby sibling/label fallback for AI-assisted desktop healing",
        )
    return locators


def _object_to_discovered_element(
    obj: SpyObject,
    objects: list[SpyObject],
    index: int,
    *,
    window_title: str,
    step_intents: list[dict[str, Any]] | None = None,
) -> DiscoveredElement:
    locators = [
        payload for payload in (
            _locator_payload(locator)
            for locator in obj.alternative_locators
        )
        if payload is not None
    ]
    _add_locator(
        locators,
        "accessibility id",
        obj.automation_id,
        verified=True,
        element_count=1,
        score=1.0,
        reason="Primary desktop Automation ID captured from UIA",
    )
    _add_locator(
        locators,
        "automation id",
        obj.automation_id,
        verified=True,
        element_count=1,
        score=1.0,
        reason="Automation ID alias for desktop runtime fallback",
    )
    _add_locator(
        locators,
        "name",
        obj.name_text or obj.name,
        verified=bool(obj.name_text or obj.name),
        element_count=1 if obj.name_text or obj.name else 0,
        score=0.86,
        reason="Desktop UIA name/text fallback",
    )
    _add_locator(
        locators,
        "xpath",
        obj.uia_path,
        verified=bool(obj.uia_path),
        element_count=1 if obj.uia_path else 0,
        score=0.74,
        reason="Desktop UIA hierarchy path fallback",
    )
    _add_locator(
        locators,
        "class name",
        obj.class_name,
        verified=False,
        element_count=0,
        score=0.56,
        reason="Desktop class name fallback",
    )

    context = _context_for_object(objects, index, window_title)
    matched_intents = _matched_step_intents(obj, step_intents)
    best_intent_score = float(matched_intents[0]["score"]) if matched_intents else 0.0
    locators.extend(_fallback_context_locators(obj, context))
    locators.sort(key=lambda locator: locator.score, reverse=True)

    primary = (
        _first_locator(locators, {"accessibility id", "automation id"})
        or _first_locator(locators, {"name"})
        or _first_locator(locators, {"xpath", "uia"})
        or _first_locator(locators, {"class name", "ocr", "relative"})
    )
    primary_strategy = primary.strategy if primary else obj.locator_strategy or "name"
    primary_locator = primary.locator if primary else obj.primary_locator

    tags = {"desktop", "desktop-mcp", "uia-context"}
    if obj.automation_id:
        tags.add("automation-id")
    if obj.ocr_text:
        tags.add("ocr")
    if context.get("nearby_siblings"):
        tags.add("nearby-context")
    if step_intents:
        tags.add("step-aware-scrape")
    if matched_intents:
        tags.add("step-intent-match")

    metadata = {
        **(obj.metadata or {}),
        "platform": "desktop",
        "source": "desktop_mcp_ai_workflow",
        "object_key": obj.object_key,
        "automation_id": obj.automation_id,
        "name_text": obj.name_text,
        "class_name": obj.class_name,
        "control_type": obj.control_type,
        "primary_locator": obj.primary_locator,
        "locator_context": context,
        "scrape_step_intents": step_intents or [],
        "matched_step_intents": matched_intents,
        "best_step_intent_score": best_intent_score,
    }

    return DiscoveredElement(
        name=obj.name or obj.object_key or "Desktop object",
        element_type=obj.control_type or "element",
        description=f"Desktop UIA object: {obj.name_text or obj.name or obj.object_key}",
        best_locator=primary_locator,
        locator_strategy=primary_strategy,
        xpath=obj.uia_path,
        css_selector=obj.class_name,
        id_attr=obj.automation_id,
        name_attr=obj.name_text or obj.name,
        input_type=obj.control_type if obj.control_type in {"edit", "textbox", "combobox"} else "",
        placeholder="",
        label=obj.name_text or obj.name,
        test_data_hints={
            "input_type": obj.control_type,
            "sample_value": "test data" if obj.control_type in {"edit", "textbox"} else "",
            "desktop_object_key": obj.object_key,
            "class_name": obj.class_name,
            "locator_context": context,
            "scrape_step_intents": step_intents or [],
            "matched_step_intents": matched_intents,
            "best_step_intent_score": best_intent_score,
            "discovery_metadata": metadata,
        },
        confidence_score=min(1.0, obj.confidence_score + (0.08 if matched_intents else 0.0)),
        alternative_locators=locators,
        tags=sorted(tags),
    )


class DesktopDiscoveryAdapter:
    """Desktop MCP-style discovery adapter for AI Workflow."""

    def __init__(
        self,
        *,
        driver_type: str = "uia3",
        server_url: str | None = None,
        timeout_ms: int = 30000,
        close_after: bool = True,
        max_objects: int = 600,
        min_objects: int = 1,
        poll_interval_ms: int = 750,
        stability_polls: int = 2,
        settle_ms: int = 1500,
    ) -> None:
        self._driver_type = driver_type or "auto"
        self._server_url = server_url or settings.winappdriver_url
        self._timeout_ms = max(timeout_ms, 1000)
        self._close_after = close_after
        self._max_objects = max(1, max_objects)
        self._min_objects = max(1, min_objects)
        self._poll_interval = max(0.05, poll_interval_ms / 1000)
        self._stability_polls = max(1, stability_polls)
        self._settle_seconds = max(0.0, settle_ms / 1000)

    async def _capture_ready_ui_tree(
        self,
        driver: Any,
        *,
        process_name: str,
        window_title: str,
    ) -> tuple[str, list[SpyObject], dict[str, Any]]:
        deadline = time.monotonic() + self._timeout_ms / 1000
        settle_until = time.monotonic() + min(self._settle_seconds, self._timeout_ms / 1000)
        best_tree = ""
        best_objects: list[SpyObject] = []
        best_quality = -1.0
        last_signature: tuple[Any, ...] | None = None
        stable_polls = 0
        attempts = 0
        last_error = ""
        tried_process_attach = False
        tried_window_wait = False

        while True:
            attempts += 1
            try:
                source = await driver.get_ui_tree()
            except Exception as exc:
                source = None
                last_error = str(exc)
            if source is not None and source.success:
                ui_tree = source.ui_tree or ""
                objects = parse_desktop_ui_tree(ui_tree, max_objects=self._max_objects)
                quality = _objects_quality(objects)
                if quality >= best_quality:
                    best_quality = quality
                    best_tree = ui_tree
                    best_objects = objects

                signature = _objects_signature(objects)
                if objects and signature == last_signature:
                    stable_polls += 1
                else:
                    stable_polls = 1 if objects else 0
                last_signature = signature

                ready_count = _capture_ready_object_count(objects)
                if (
                    ready_count >= self._min_objects
                    and stable_polls >= self._stability_polls
                    and time.monotonic() >= settle_until
                ):
                    return ui_tree, objects, {
                        "capture_attempts": attempts,
                        "stabilized": True,
                        "stable_polls": stable_polls,
                        "ready_object_count": ready_count,
                    }
            elif source is not None:
                last_error = source.error or "UI tree capture failed"

            now = time.monotonic()
            remaining = deadline - now
            if remaining <= 0:
                break

            best_ready_count = _capture_ready_object_count(best_objects)
            if best_ready_count < self._min_objects and process_name and not tried_process_attach:
                tried_process_attach = True
                wait_app = getattr(driver, "wait_app", None)
                if wait_app is not None:
                    try:
                        await wait_app(process_name=process_name, timeout=min(2.0, max(0.1, remaining)))
                    except Exception as exc:
                        last_error = str(exc)

            if best_ready_count < self._min_objects and window_title and not tried_window_wait:
                tried_window_wait = True
                wait_window = getattr(driver, "wait_window", None)
                if wait_window is not None:
                    try:
                        await wait_window(
                            window_title,
                            timeout=min(2.0, max(0.1, remaining)),
                            poll_interval=0.25,
                        )
                    except Exception as exc:
                        last_error = str(exc)

            await asyncio.sleep(min(self._poll_interval, max(0.05, remaining)))

        best_ready_count = _capture_ready_object_count(best_objects)
        if best_ready_count >= self._min_objects:
            return best_tree, best_objects, {
                "capture_attempts": attempts,
                "stabilized": False,
                "stable_polls": stable_polls,
                "timed_out_with_best_snapshot": True,
                "ready_object_count": best_ready_count,
            }

        message = (
            f"Desktop UI tree did not produce UID/UIA object candidates within "
            f"{self._timeout_ms}ms"
        )
        if last_error:
            message += f": {last_error}"
        raise RuntimeError(message)

    async def discover(
        self,
        app: str,
        page_name: str,
        platform: str,
        save_mode: str,
        page_id: str | None,
        db: AsyncSession,
        *,
        args: list[str] | str | None = None,
        window_title: str = "",
        process_name: str = "",
        step_intents: list[dict[str, Any]] | None = None,
    ) -> DiscoveryResponse:
        del db, save_mode
        if not (app or window_title or process_name):
            raise RuntimeError("Desktop discovery requires an app path, window title, or process name")

        t0 = time.monotonic()
        driver = get_driver(
            self._driver_type,
            server_url=self._server_url,
            timeout=self._timeout_ms / 1000,
        )
        launched = False
        attached = False
        resolved_window_title = window_title or page_name
        resolved_process_name = process_name or _process_name_from_app(app)
        try:
            if app:
                launch = await driver.launch(
                    app,
                    args=_coerce_args(args),
                    capabilities={
                        "launch_window_timeout_ms": self._timeout_ms,
                        "ready_timeout_ms": self._timeout_ms,
                        "window_title": resolved_window_title,
                        "process_name": resolved_process_name,
                    },
                )
                if not launch.success:
                    raise RuntimeError(launch.error or "Desktop app launch failed")
                launched = True
                resolved_window_title = _window_title_from_launch(launch.metadata, resolved_window_title)
            else:
                attach = await driver.attach(
                    window_title=window_title or None,
                    process_name=resolved_process_name or None,
                )
                if not attach.success:
                    raise RuntimeError(attach.error or "Desktop attach failed")
                attached = True
                resolved_window_title = _window_title_from_launch(attach.metadata, resolved_window_title)

            ui_tree, objects, capture_metadata = await self._capture_ready_ui_tree(
                driver,
                process_name=resolved_process_name,
                window_title=resolved_window_title,
            )
            elements = [
                _object_to_discovered_element(
                    obj,
                    objects,
                    index,
                    window_title=resolved_window_title,
                    step_intents=step_intents,
                )
                for index, obj in enumerate(objects)
            ]
            low_confidence = sum(
                1 for element in elements
                if float(element.confidence_score or 0.0) < _DESKTOP_LOW_CONFIDENCE_THRESHOLD
            )
            duration_ms = int((time.monotonic() - t0) * 1000)
            return DiscoveryResponse(
                page={
                    "id": page_id,
                    "name": page_name,
                    "url": app,
                    "platform": platform,
                    "window_title": resolved_window_title,
                    "process_name": resolved_process_name,
                    "desktop_capture": {
                        **capture_metadata,
                        "ui_tree_size": len(ui_tree),
                    },
                    "scrape_step_intents": step_intents or [],
                },
                summary=DiscoverySummary(
                    url=app or window_title or process_name,
                    elements_found=len(elements),
                    elements_saved=0,
                    low_confidence=low_confidence,
                    duration_ms=duration_ms,
                ),
                elements=elements,
            )
        finally:
            if self._close_after:
                try:
                    await driver.close()
                except Exception as exc:
                    logger.warning("DesktopDiscoveryAdapter close failed: %s", exc)
