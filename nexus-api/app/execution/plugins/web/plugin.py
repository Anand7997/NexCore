"""
WebExecutionPlugin — Playwright-backed web automation.

Implements Playwright-backed node types under `web.*`:

    web.navigate         go to URL
    web.click            click an element (CSS selector)
    web.double_click     double-click an element
    web.right_click      right-click an element
    web.hover            move the mouse over an element
    web.check            check/uncheck checkbox or radio controls
    web.fill             fill input
    web.select           select dropdown option
    web.press_key        press keyboard shortcut/key
    web.drag_and_drop    drag one element onto another
    web.wait             wait for element / state / timeout
    web.assert_text      assert text content
    web.extract_text     extract text into shared context variable
    web.screenshot       full-page or element screenshot
    web.upload           file upload
    web.execute_js       run JS in page context

Cross-node state:
    One Playwright browser + isolated context + page per execution_id, kept
    in `_sessions[execution_id]` and torn down on `on_execution_end`.

Artifacts:
    - SCREENSHOT  on each web.screenshot call AND on every node failure
    - TRACE       (trace.zip) at session end
    - DOM_SNAPSHOT on assertion failure (so AI can replay the broken state)
    - NETWORK_LOG at session end
"""
from __future__ import annotations

import asyncio
import logging
import re
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

from app.config import settings
from app.events.types import BrowserAction
from app.execution.artifacts import ArtifactKind
from app.execution.interpolation import VariableInterpolator
from app.execution.plugin import (
    ExecutionEnvelope,
    ExecutionPlugin,
    PluginNodeSpec,
    PluginResult,
    PluginValidationError,
)
from app.execution.plugins.web.session import WebSession, WebSessionConfig

logger = logging.getLogger(__name__)


def _truncate(value: Any, n: int = 200) -> str:
    s = str(value)
    return s if len(s) <= n else s[: n - 1] + "…"


_BLOCKED_PAGE_TITLE_MARKERS = (
    "too many requests",
    "access denied",
    "forbidden",
    "captcha",
    "not a robot",
    "cloudflare",
)
_ROLE_SELECTOR = re.compile(r'^role=([^\[]+)(?:\[name="((?:\\.|[^"])*)"\])?$')


def _blocked_page_reason(status_code: int | None, title: str) -> str | None:
    if status_code is not None and status_code >= 400:
        return f"HTTP {status_code}"
    normalized_title = title.lower()
    if any(marker in normalized_title for marker in _BLOCKED_PAGE_TITLE_MARKERS):
        return f"blocked page title {title!r}"
    return None


def _selector_for_playwright(strategy: str, locator: str) -> str:
    value = str(locator or "").strip()
    if not value:
        return ""
    normalized_strategy = (strategy or "").lower()
    if value.startswith("xpath="):
        return value
    if normalized_strategy == "xpath" or value.startswith(("/", "(")):
        return f"xpath={value}"
    return value


def _normalise_keyboard_key(value: str) -> str:
    aliases = {
        "CTRL": "Control",
        "CONTROL": "Control",
        "CMD": "Meta",
        "COMMAND": "Meta",
        "META": "Meta",
        "ALT": "Alt",
        "OPTION": "Alt",
        "SHIFT": "Shift",
        "TAB": "Tab",
        "ENTER": "Enter",
        "RETURN": "Enter",
        "ESC": "Escape",
        "ESCAPE": "Escape",
        "SPACE": "Space",
    }
    parts = [part.strip() for part in str(value or "").split("+") if part.strip()]
    normalized = []
    for part in parts:
        upper = part.upper()
        normalized.append(aliases.get(upper, upper if len(part) == 1 else part))
    return "+".join(normalized)


def _locator_candidates_from_config(cfg: dict[str, Any]) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    def add(strategy: str, locator: Any, source: str) -> None:
        raw_locator = str(locator or "").strip()
        if not raw_locator:
            return
        normalized_strategy = (strategy or "").strip().lower()
        if not normalized_strategy:
            if raw_locator.startswith("role="):
                normalized_strategy = "role"
            elif raw_locator.startswith(("xpath=", "/", "(")):
                normalized_strategy = "xpath"
            else:
                normalized_strategy = "css"
        selector = _selector_for_playwright(normalized_strategy, raw_locator)
        key = (normalized_strategy, selector)
        if key in seen:
            return
        seen.add(key)
        candidates.append({
            "strategy": normalized_strategy,
            "locator": raw_locator,
            "selector": selector,
            "source": source,
        })

    add("", cfg.get("selector"), "primary")
    add("css", cfg.get("css_selector"), "config")
    add("xpath", cfg.get("xpath"), "config")
    for key in ("locators", "alternative_locators", "locator_candidates"):
        for item in cfg.get(key) or []:
            if isinstance(item, dict):
                add(
                    str(item.get("strategy") or ""),
                    item.get("locator") or item.get("selector"),
                    str(item.get("source") or key),
                )
            else:
                add("", item, key)
    return candidates


def _locator_summary(candidate: dict[str, str]) -> str:
    return f"{candidate.get('strategy') or 'css'}={candidate.get('locator') or ''}"


def _playwright_locator(page: Any, candidate: dict[str, str]) -> Any:
    strategy = (candidate.get("strategy") or "").lower()
    locator = candidate.get("locator") or ""
    if strategy == "role":
        match = _ROLE_SELECTOR.match(locator)
        if match:
            name = match.group(2)
            if name is not None:
                name = name.replace('\\"', '"').replace("\\\\", "\\")
            return page.get_by_role(match.group(1), name=name)
    return page.locator(candidate.get("selector") or _selector_for_playwright(strategy, locator))


class WebExecutionPlugin(ExecutionPlugin):
    name = "web"
    version = "1.0.0"
    description = "Playwright-backed browser automation"

    def __init__(self) -> None:
        super().__init__()
        self._sessions: dict[str, WebSession] = {}
        self._scratch_dirs: dict[str, Path] = {}
        self._announced_sessions: set[str] = set()
        self._lock = asyncio.Lock()

    # ── Discovery ─────────────────────────────────────────────────────

    def node_specs(self) -> list[PluginNodeSpec]:
        sel = {
            "selector": {"type": "string", "required": True, "supports_template": True},
            "locators": {"type": "array"},
        }
        timeout = {"timeout_ms": {"type": "number", "default": 10000}}

        return [
            PluginNodeSpec(
                type="web.navigate",
                plugin="web",
                label="Navigate",
                category="Web Automation",
                description="Navigate the browser to a URL.",
                icon="globe",
                color="#3b82f6",
                config_schema={
                    "url": {"type": "string", "required": True, "supports_template": True},
                    "wait_until": {"type": "string", "enum": ["load", "domcontentloaded", "networkidle"], "default": "load"},
                    **timeout,
                },
            ),
            PluginNodeSpec(
                type="web.click",
                plugin="web",
                label="Click",
                category="Web Automation",
                description="Click an element matching the selector.",
                icon="mouse-pointer",
                color="#6366f1",
                config_schema={**sel, **timeout, "force": {"type": "boolean", "default": False}},
            ),
            PluginNodeSpec(
                type="web.double_click",
                plugin="web",
                label="Double Click",
                category="Web Automation",
                description="Double-click an element matching the selector.",
                icon="mouse-pointer-click",
                color="#6366f1",
                config_schema={**sel, **timeout, "force": {"type": "boolean", "default": False}},
            ),
            PluginNodeSpec(
                type="web.right_click",
                plugin="web",
                label="Right Click",
                category="Web Automation",
                description="Right-click an element matching the selector.",
                icon="mouse-pointer-click",
                color="#6366f1",
                config_schema={**sel, **timeout, "force": {"type": "boolean", "default": False}},
            ),
            PluginNodeSpec(
                type="web.hover",
                plugin="web",
                label="Mouse Over",
                category="Web Automation",
                description="Move the mouse over an element matching the selector.",
                icon="mouse-pointer",
                color="#06b6d4",
                config_schema={**sel, **timeout},
            ),
            PluginNodeSpec(
                type="web.check",
                plugin="web",
                label="Check Control",
                category="Web Automation",
                description="Check or uncheck a checkbox/radio input.",
                icon="check-square",
                color="#16a34a",
                config_schema={**sel, "checked": {"type": "boolean", "default": True}, **timeout},
            ),
            PluginNodeSpec(
                type="web.fill",
                plugin="web",
                label="Fill Input",
                category="Web Automation",
                description="Type a value into an input field.",
                icon="text-cursor-input",
                color="#8b5cf6",
                config_schema={
                    **sel,
                    "value": {"type": "string", "required": True, "supports_template": True},
                    **timeout,
                },
            ),
            PluginNodeSpec(
                type="web.select",
                plugin="web",
                label="Select Dropdown",
                category="Web Automation",
                description="Select an option from a <select> element.",
                icon="list",
                color="#a855f7",
                config_schema={
                    **sel,
                    "value": {"type": "string", "required": True, "supports_template": True},
                    **timeout,
                },
            ),
            PluginNodeSpec(
                type="web.press_key",
                plugin="web",
                label="Press Key",
                category="Web Automation",
                description="Press a keyboard key or shortcut, optionally after focusing a selector.",
                icon="keyboard",
                color="#64748b",
                config_schema={
                    "selector": {"type": "string", "supports_template": True},
                    "locators": {"type": "array"},
                    "key": {"type": "string", "required": True, "supports_template": True},
                    **timeout,
                },
            ),
            PluginNodeSpec(
                type="web.drag_and_drop",
                plugin="web",
                label="Drag And Drop",
                category="Web Automation",
                description="Drag a source element onto a target element.",
                icon="move",
                color="#f97316",
                config_schema={
                    **sel,
                    "target_selector": {"type": "string", "required": True, "supports_template": True},
                    "target_locators": {"type": "array"},
                    **timeout,
                },
            ),
            PluginNodeSpec(
                type="web.wait",
                plugin="web",
                label="Wait For Element",
                category="Web Automation",
                description="Wait for an element to appear/be visible/be hidden.",
                icon="hourglass",
                color="#f59e0b",
                config_schema={
                    "selector": {"type": "string", "supports_template": True},
                    "state": {"type": "string", "enum": ["attached", "visible", "hidden", "detached"], "default": "visible"},
                    "delay_ms": {"type": "number"},
                    **timeout,
                },
            ),
            PluginNodeSpec(
                type="web.assert_text",
                plugin="web",
                label="Assert Text",
                category="Web Automation",
                description="Assert an element contains the expected text.",
                icon="check-circle",
                color="#16a34a",
                config_schema={
                    **sel,
                    "expected": {"type": "string", "required": True, "supports_template": True},
                    "match": {"type": "string", "enum": ["equals", "contains", "regex"], "default": "contains"},
                    **timeout,
                },
            ),
            PluginNodeSpec(
                type="web.extract_text",
                plugin="web",
                label="Extract Text",
                category="Web Automation",
                description="Read an element's text and store in shared context.",
                icon="copy",
                color="#7c3aed",
                config_schema={
                    **sel,
                    "variable": {"type": "string", "required": True},
                    **timeout,
                },
            ),
            PluginNodeSpec(
                type="web.screenshot",
                plugin="web",
                label="Screenshot",
                category="Web Automation",
                description="Capture a screenshot (full page or specific element).",
                icon="camera",
                color="#0ea5e9",
                config_schema={
                    "selector": {"type": "string", "supports_template": True},
                    "full_page": {"type": "boolean", "default": True},
                    "name": {"type": "string", "default": "screenshot.png"},
                },
            ),
            PluginNodeSpec(
                type="web.upload",
                plugin="web",
                label="File Upload",
                category="Web Automation",
                description="Upload a file via an <input type=file> element.",
                icon="upload",
                color="#0d9488",
                config_schema={
                    **sel,
                    "file_path": {"type": "string", "required": True, "supports_template": True},
                    **timeout,
                },
            ),
            PluginNodeSpec(
                type="web.execute_js",
                plugin="web",
                label="Execute JS",
                category="Web Automation",
                description="Run a JavaScript snippet in the page context.",
                icon="terminal",
                color="#eab308",
                config_schema={
                    "script": {"type": "string", "required": True},
                    "variable": {"type": "string"},
                },
            ),
        ]

    # ── Lifecycle ─────────────────────────────────────────────────────

    async def on_execution_start(self, execution_id: str) -> None:
        # Lazy: only create the session when the first web node fires, so an
        # API-only execution doesn't pay the browser-launch cost.
        return

    async def on_execution_end(self, execution_id: str) -> None:
        await self._teardown_session(execution_id, recorder=None, emit=None)

    async def _teardown_session(
        self, execution_id: str, recorder: Any, emit: Any,
    ) -> None:
        async with self._lock:
            session = self._sessions.pop(execution_id, None)
            scratch = self._scratch_dirs.pop(execution_id, None)
            self._announced_sessions.discard(execution_id)
        if session is None:
            return
        trace_path, video_path = await session.stop()

        # If we have a recorder still in scope (because this is being called
        # mid-execution from a node), publish trace + video as artifacts.
        if recorder is not None:
            if trace_path and trace_path.exists():
                await recorder.record_file(
                    ArtifactKind.TRACE, trace_path,
                    metadata={"format": "playwright-trace.zip"},
                )
            if video_path and video_path.exists():
                await recorder.record_file(
                    ArtifactKind.VIDEO, video_path,
                    metadata={"format": "webm"},
                )
            netlog = session.network_log
            if netlog:
                await recorder.record_json(
                    ArtifactKind.NETWORK_LOG, "network.json", netlog,
                )

        if scratch and scratch.exists():
            try:
                shutil.rmtree(scratch, ignore_errors=True)
            except Exception:
                pass

    async def _ensure_session(
        self, execution_id: str,
    ) -> WebSession:
        async with self._lock:
            session = self._sessions.get(execution_id)
            if session is not None:
                return session

            scratch = Path(tempfile.mkdtemp(prefix=f"nexus-web-{execution_id[:8]}-"))
            self._scratch_dirs[execution_id] = scratch

            session = WebSession(
                execution_id=execution_id,
                config=WebSessionConfig(
                    headless=settings.web_plugin_headless,
                    browser_name=settings.web_plugin_browser,
                    record_video=settings.web_plugin_record_video,
                    record_trace=settings.web_plugin_record_trace,
                    slow_mo_ms=settings.web_plugin_slow_mo_ms,
                ),
                scratch_dir=scratch,
            )
            await session.start()
            self._sessions[execution_id] = session
            return session

    # ── Validation ────────────────────────────────────────────────────

    async def validate(self, envelope: ExecutionEnvelope) -> None:
        cfg = envelope.config
        nt = envelope.node_type
        require = lambda *keys: [
            k for k in keys if cfg.get(k) in (None, "")
        ]

        if nt == "web.navigate" and require("url"):
            raise PluginValidationError("`url` is required")
        if (
            nt in {
                "web.click", "web.double_click", "web.right_click", "web.hover", "web.check",
                "web.fill", "web.select", "web.assert_text", "web.extract_text", "web.upload",
                "web.drag_and_drop",
            }
            and require("selector")
            and not (cfg.get("locators") or cfg.get("alternative_locators") or cfg.get("locator_candidates"))
        ):
            raise PluginValidationError("`selector` is required")
        if nt == "web.drag_and_drop" and require("target_selector") and not cfg.get("target_locators"):
            raise PluginValidationError("`target_selector` is required")
        if nt == "web.press_key" and require("key"):
            raise PluginValidationError("`key` is required")
        if nt == "web.fill" and require("value"):
            raise PluginValidationError("`value` is required")
        if nt == "web.select" and require("value"):
            raise PluginValidationError("`value` is required")
        if nt == "web.assert_text" and require("expected"):
            raise PluginValidationError("`expected` is required")
        if nt == "web.extract_text" and require("variable"):
            raise PluginValidationError("`variable` is required")
        if nt == "web.upload" and require("file_path"):
            raise PluginValidationError("`file_path` is required")
        if nt == "web.execute_js" and require("script"):
            raise PluginValidationError("`script` is required")

    # ── Execution dispatcher ──────────────────────────────────────────

    async def execute(self, envelope: ExecutionEnvelope) -> PluginResult:
        ctx_vars = await envelope.context.all()
        cfg = VariableInterpolator.interpolate(envelope.config, ctx_vars)

        try:
            session = await self._ensure_session(envelope.execution_id)
        except Exception as exc:
            return PluginResult(
                success=False, duration_ms=0,
                error=f"Failed to start browser: {exc}",
            )

        page = session.page
        nt = envelope.node_type
        start = time.perf_counter()
        if envelope.execution_id not in self._announced_sessions:
            self._announced_sessions.add(envelope.execution_id)
            await self._emit_action(
                envelope,
                "browser_opened",
                metadata={
                    "browser": session.config.browser_name,
                    "headless": session.config.headless,
                    "live_screenshots": settings.web_plugin_live_screenshots,
                    "slow_mo_ms": settings.web_plugin_slow_mo_ms,
                    "viewport": {
                        "width": session.config.viewport_width,
                        "height": session.config.viewport_height,
                    },
                },
            )

        # Wrap each step in a uniform try/except so failures always capture a
        # screenshot (the AI evidence pipeline depends on this).
        try:
            handler = self._handlers().get(nt)
            if handler is None:
                return PluginResult(
                    success=False, duration_ms=0,
                    error=f"Unsupported web node type: {nt}",
                )
            output: dict[str, Any] = await handler(self, envelope, page, cfg)
            duration_ms = int((time.perf_counter() - start) * 1000)
            output.setdefault("duration_ms", duration_ms)
            live_artifact = await self._capture_live_screenshot(
                envelope, page, cfg, nt, output
            )
            if live_artifact is not None:
                output["live_screenshot_artifact_id"] = live_artifact.id
            return PluginResult(success=True, duration_ms=duration_ms, output=output)
        except asyncio.CancelledError:
            duration_ms = int((time.perf_counter() - start) * 1000)
            await self._capture_failure_evidence(envelope, page, "Cancelled")
            return PluginResult(success=False, duration_ms=duration_ms, error="Cancelled")
        except Exception as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            await envelope.log("error", f"[{nt}] {exc}", source="web")
            await self._capture_failure_evidence(envelope, page, str(exc))
            return PluginResult(
                success=False, duration_ms=duration_ms, error=str(exc),
            )

    # ── Per-node handlers (registered as a dict) ──────────────────────

    @staticmethod
    def _handlers():
        # Keyed by node-type → coroutine (self, envelope, page, cfg) -> output dict
        return {
            "web.navigate":      WebExecutionPlugin._do_navigate,
            "web.click":         WebExecutionPlugin._do_click,
            "web.double_click":  WebExecutionPlugin._do_double_click,
            "web.right_click":   WebExecutionPlugin._do_right_click,
            "web.hover":         WebExecutionPlugin._do_hover,
            "web.check":         WebExecutionPlugin._do_check,
            "web.fill":          WebExecutionPlugin._do_fill,
            "web.select":        WebExecutionPlugin._do_select,
            "web.press_key":     WebExecutionPlugin._do_press_key,
            "web.drag_and_drop": WebExecutionPlugin._do_drag_and_drop,
            "web.wait":          WebExecutionPlugin._do_wait,
            "web.assert_text":   WebExecutionPlugin._do_assert_text,
            "web.extract_text":  WebExecutionPlugin._do_extract_text,
            "web.screenshot":    WebExecutionPlugin._do_screenshot,
            "web.upload":        WebExecutionPlugin._do_upload,
            "web.execute_js":    WebExecutionPlugin._do_execute_js,
        }

    async def _emit_action(
        self, envelope: ExecutionEnvelope, action: str, *,
        selector: str | None = None, url: str | None = None,
        duration_ms: int = 0, metadata: dict[str, Any] | None = None,
    ) -> None:
        await envelope.emit(BrowserAction(
            execution_id=envelope.execution_id,
            node_id=envelope.node_key,
            action=action,
            selector=selector,
            url=url,
            duration_ms=duration_ms,
            metadata=metadata or {},
        ))

    async def _flash_locator_for_live_view(self, locator: Any, action: str) -> None:
        if settings.web_plugin_slow_mo_ms <= 0 and not settings.web_plugin_live_screenshots:
            return
        try:
            handle = await locator.element_handle(timeout=500)
            if handle is None:
                return
            await handle.evaluate(
                """
                (element, actionName) => {
                  const old = document.getElementById('nexus-live-action-highlight');
                  if (old) old.remove();

                  const rect = element.getBoundingClientRect();
                  const frame = document.createElement('div');
                  frame.id = 'nexus-live-action-highlight';
                  Object.assign(frame.style, {
                    position: 'fixed',
                    left: `${Math.max(0, rect.left - 5)}px`,
                    top: `${Math.max(0, rect.top - 5)}px`,
                    width: `${Math.max(12, rect.width + 10)}px`,
                    height: `${Math.max(12, rect.height + 10)}px`,
                    border: '3px solid #38bdf8',
                    background: 'rgba(56, 189, 248, 0.12)',
                    boxShadow: '0 0 0 4px rgba(56, 189, 248, 0.16), 0 12px 32px rgba(15, 23, 42, 0.22)',
                    borderRadius: '8px',
                    zIndex: '2147483647',
                    pointerEvents: 'none',
                    opacity: '1',
                    transition: 'opacity 180ms ease',
                  });

                  const label = document.createElement('div');
                  label.textContent = String(actionName || 'action').replace(/_/g, ' ');
                  Object.assign(label.style, {
                    position: 'absolute',
                    left: '0',
                    top: '-26px',
                    maxWidth: '260px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    borderRadius: '999px',
                    padding: '3px 8px',
                    background: '#0f172a',
                    color: '#e0f2fe',
                    font: '600 11px/1.2 system-ui, -apple-system, Segoe UI, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  });
                  frame.appendChild(label);
                  document.documentElement.appendChild(frame);
                  window.setTimeout(() => {
                    frame.style.opacity = '0';
                    window.setTimeout(() => frame.remove(), 220);
                  }, 1500);
                }
                """,
                action,
            )
        except Exception:
            pass

    async def _capture_live_screenshot(
        self,
        envelope: ExecutionEnvelope,
        page: Any,
        cfg: dict[str, Any],
        node_type: str,
        output: dict[str, Any],
    ) -> Any | None:
        if not settings.web_plugin_live_screenshots or node_type == "web.screenshot":
            return None
        action = node_type.removeprefix("web.")
        selector = output.get("selector") or cfg.get("selector")
        try:
            data = await page.screenshot(full_page=False, type="png")
            return await envelope.artifacts.record_bytes(
                ArtifactKind.SCREENSHOT,
                f"live-{action}.png",
                data,
                content_type="image/png",
                metadata={
                    "capture_reason": "live_action",
                    "live_preview": True,
                    "action": action,
                    "node_type": node_type,
                    "node_label": envelope.node_label,
                    "selector": selector,
                    "url": getattr(page, "url", None),
                    "title": await page.title(),
                },
            )
        except Exception:
            logger.exception("live screenshot capture failed")
            return None

    async def _with_locator_healing(self, envelope, page, cfg, action: str, operation):
        candidates = _locator_candidates_from_config(cfg)
        if not candidates:
            raise RuntimeError(f"{action} failed: no selector or locator candidates were provided")

        timeout = float(cfg.get("timeout_ms", 10000))
        fallback_timeout = float(cfg.get("healing_timeout_ms", min(timeout, 4000)))
        attempts: list[dict[str, Any]] = []
        last_error = ""

        for index, candidate in enumerate(candidates):
            summary = _locator_summary(candidate)
            candidate_timeout = timeout if index == 0 else fallback_timeout
            try:
                locator = _playwright_locator(page, candidate)
                await self._flash_locator_for_live_view(locator, action)
                result = await operation(locator, candidate_timeout)
                attempts.append({
                    "strategy": candidate.get("strategy"),
                    "locator": candidate.get("locator"),
                    "source": candidate.get("source"),
                    "success": True,
                })
                if index > 0:
                    await envelope.log(
                        "info",
                        f"{action} healed with fallback locator {index + 1}/{len(candidates)}: {summary}",
                        source="web",
                    )
                return candidate.get("selector") or candidate.get("locator"), result, attempts
            except Exception as exc:
                last_error = str(exc)
                attempts.append({
                    "strategy": candidate.get("strategy"),
                    "locator": candidate.get("locator"),
                    "source": candidate.get("source"),
                    "success": False,
                    "error": _truncate(last_error, 180),
                })
                if index + 1 < len(candidates):
                    await envelope.log(
                        "warning",
                        f"{action} locator failed, trying fallback: {summary} ({_truncate(last_error, 120)})",
                        source="web",
                    )

        tried = "; ".join(_locator_summary(candidate) for candidate in candidates)
        raise RuntimeError(
            f"{action} failed after {len(candidates)} locator candidate(s). "
            f"Tried: {tried}. Last error: {_truncate(last_error, 300)}"
        )

    async def _do_navigate(self, envelope, page, cfg) -> dict[str, Any]:
        url = cfg["url"]
        wait_until = cfg.get("wait_until", "load")
        timeout = float(cfg.get("timeout_ms", 30000))
        await envelope.log("info", f"navigate → {url}", source="web")
        t0 = time.perf_counter()
        response = await page.goto(url, wait_until=wait_until, timeout=timeout)
        dur = int((time.perf_counter() - t0) * 1000)
        status_code = getattr(response, "status", None)
        title = await page.title()
        if reason := _blocked_page_reason(status_code, title):
            raise RuntimeError(
                f"Navigation failed for {url}: {reason}. "
                f"Final URL: {page.url}; title: {title!r}"
            )
        await self._emit_action(envelope, "navigate", url=url, duration_ms=dur)
        return {
            "url": page.url,
            "status_code": status_code,
            "title": title,
            "duration_ms": dur,
        }

    async def _do_click(self, envelope, page, cfg) -> dict[str, Any]:
        force = bool(cfg.get("force", False))
        primary = cfg.get("selector") or "locator candidates"
        await envelope.log("info", f"click -> {primary}", source="web")
        t0 = time.perf_counter()

        async def click(locator, timeout):
            await locator.click(timeout=timeout, force=force)

        sel, _, attempts = await self._with_locator_healing(envelope, page, cfg, "click", click)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "click", selector=sel, duration_ms=dur,
                                metadata={"locator_attempts": attempts})
        return {"selector": sel, "duration_ms": dur, "locator_attempts": attempts}

    async def _do_double_click(self, envelope, page, cfg) -> dict[str, Any]:
        force = bool(cfg.get("force", False))
        primary = cfg.get("selector") or "locator candidates"
        await envelope.log("info", f"double_click -> {primary}", source="web")
        t0 = time.perf_counter()

        async def double_click(locator, timeout):
            await locator.dblclick(timeout=timeout, force=force)

        sel, _, attempts = await self._with_locator_healing(envelope, page, cfg, "double_click", double_click)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "double_click", selector=sel, duration_ms=dur,
                                metadata={"locator_attempts": attempts})
        return {"selector": sel, "duration_ms": dur, "locator_attempts": attempts}

    async def _do_right_click(self, envelope, page, cfg) -> dict[str, Any]:
        force = bool(cfg.get("force", False))
        primary = cfg.get("selector") or "locator candidates"
        await envelope.log("info", f"right_click -> {primary}", source="web")
        t0 = time.perf_counter()

        async def right_click(locator, timeout):
            await locator.click(button="right", timeout=timeout, force=force)

        sel, _, attempts = await self._with_locator_healing(envelope, page, cfg, "right_click", right_click)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "right_click", selector=sel, duration_ms=dur,
                                metadata={"locator_attempts": attempts})
        return {"selector": sel, "duration_ms": dur, "locator_attempts": attempts}

    async def _do_hover(self, envelope, page, cfg) -> dict[str, Any]:
        primary = cfg.get("selector") or "locator candidates"
        await envelope.log("info", f"hover -> {primary}", source="web")
        t0 = time.perf_counter()

        async def hover(locator, timeout):
            await locator.hover(timeout=timeout)

        sel, _, attempts = await self._with_locator_healing(envelope, page, cfg, "hover", hover)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "hover", selector=sel, duration_ms=dur,
                                metadata={"locator_attempts": attempts})
        return {"selector": sel, "duration_ms": dur, "locator_attempts": attempts}

    async def _do_check(self, envelope, page, cfg) -> dict[str, Any]:
        checked = bool(cfg.get("checked", True))
        primary = cfg.get("selector") or "locator candidates"
        await envelope.log("info", f"{'check' if checked else 'uncheck'} -> {primary}", source="web")
        t0 = time.perf_counter()

        async def check(locator, timeout):
            try:
                if checked:
                    await locator.check(timeout=timeout)
                else:
                    await locator.uncheck(timeout=timeout)
            except Exception:
                # Some scraped checkbox labels point at a wrapper/label instead of
                # the input itself. Clicking keeps those steps runnable while the
                # locator-healing loop still tries better candidates first.
                await locator.click(timeout=timeout)

        sel, _, attempts = await self._with_locator_healing(envelope, page, cfg, "check", check)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "check", selector=sel, duration_ms=dur,
                                metadata={"checked": checked, "locator_attempts": attempts})
        return {"selector": sel, "checked": checked, "duration_ms": dur, "locator_attempts": attempts}

    async def _do_fill(self, envelope, page, cfg) -> dict[str, Any]:
        value = cfg["value"]
        primary = cfg.get("selector") or "locator candidates"
        await envelope.log("info", f"fill -> {primary} = {_truncate(value, 60)}", source="web")
        t0 = time.perf_counter()

        async def fill(locator, timeout):
            delay = max(0, int(settings.web_plugin_type_delay_ms))
            if delay <= 0 or not hasattr(locator, "press_sequentially"):
                await locator.fill(value, timeout=timeout)
                return
            await locator.fill("", timeout=timeout)
            await locator.press_sequentially(str(value), delay=delay, timeout=timeout)

        sel, _, attempts = await self._with_locator_healing(envelope, page, cfg, "fill", fill)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(
            envelope, "fill", selector=sel, duration_ms=dur,
            metadata={"chars": len(str(value)), "locator_attempts": attempts},
        )
        return {"selector": sel, "duration_ms": dur, "locator_attempts": attempts}

    async def _do_select(self, envelope, page, cfg) -> dict[str, Any]:
        value = cfg["value"]
        primary = cfg.get("selector") or "locator candidates"
        await envelope.log("info", f"select -> {primary} = {value}", source="web")
        t0 = time.perf_counter()

        async def select(locator, timeout):
            try:
                return await locator.select_option(value=value, timeout=timeout)
            except Exception:
                return await locator.select_option(label=value, timeout=timeout)

        sel, chosen, attempts = await self._with_locator_healing(envelope, page, cfg, "select", select)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "select", selector=sel, duration_ms=dur,
                                metadata={"locator_attempts": attempts})
        return {"selector": sel, "selected": chosen, "duration_ms": dur, "locator_attempts": attempts}

    async def _do_press_key(self, envelope, page, cfg) -> dict[str, Any]:
        key = _normalise_keyboard_key(str(cfg["key"]))
        selector = cfg.get("selector")
        attempts = []
        t0 = time.perf_counter()
        if selector or cfg.get("locators") or cfg.get("alternative_locators") or cfg.get("locator_candidates"):
            await envelope.log("info", f"press_key -> focus {selector or 'locator candidates'} then {key}", source="web")

            async def focus(locator, timeout):
                await locator.focus(timeout=timeout)

            selector, _, attempts = await self._with_locator_healing(envelope, page, cfg, "focus", focus)
        else:
            await envelope.log("info", f"press_key -> {key}", source="web")
        await page.keyboard.press(key)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "press_key", selector=selector, duration_ms=dur,
                                metadata={"key": key, "locator_attempts": attempts})
        return {"selector": selector, "key": key, "duration_ms": dur, "locator_attempts": attempts}

    async def _do_drag_and_drop(self, envelope, page, cfg) -> dict[str, Any]:
        target_cfg = {
            "selector": cfg.get("target_selector"),
            "locators": cfg.get("target_locators"),
            "alternative_locators": cfg.get("target_alternative_locators"),
            "locator_candidates": cfg.get("target_locator_candidates"),
            "timeout_ms": cfg.get("timeout_ms", 10000),
        }
        if cfg.get("healing_timeout_ms") is not None:
            target_cfg["healing_timeout_ms"] = cfg.get("healing_timeout_ms")
        primary = cfg.get("selector") or "locator candidates"
        target = target_cfg.get("selector") or "target locator candidates"
        await envelope.log("info", f"drag_and_drop -> {primary} to {target}", source="web")
        t0 = time.perf_counter()

        async def resolve(locator, timeout):
            await locator.wait_for(state="visible", timeout=timeout)
            return locator

        source_sel, source_locator, source_attempts = await self._with_locator_healing(
            envelope, page, cfg, "drag source", resolve
        )
        target_sel, target_locator, target_attempts = await self._with_locator_healing(
            envelope, page, target_cfg, "drop target", resolve
        )
        await source_locator.drag_to(target_locator, timeout=float(cfg.get("timeout_ms", 10000)))
        dur = int((time.perf_counter() - t0) * 1000)
        attempts = {"source": source_attempts, "target": target_attempts}
        await self._emit_action(envelope, "drag_and_drop", selector=source_sel, duration_ms=dur,
                                metadata={"target_selector": target_sel, "locator_attempts": attempts})
        return {
            "selector": source_sel,
            "target_selector": target_sel,
            "duration_ms": dur,
            "locator_attempts": attempts,
        }

    async def _do_wait(self, envelope, page, cfg) -> dict[str, Any]:
        sel = cfg.get("selector")
        delay_ms = cfg.get("delay_ms")
        state = cfg.get("state", "visible")
        t0 = time.perf_counter()
        attempts = []
        if sel or cfg.get("locators") or cfg.get("alternative_locators") or cfg.get("locator_candidates"):
            await envelope.log("info", f"wait -> {sel or 'locator candidates'} ({state})", source="web")

            async def wait_for(locator, timeout):
                await locator.wait_for(state=state, timeout=timeout)

            sel, _, attempts = await self._with_locator_healing(envelope, page, cfg, "wait", wait_for)
        else:
            ms = float(delay_ms or 1000)
            await envelope.log("info", f"wait -> {ms}ms", source="web")
            await page.wait_for_timeout(ms)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "wait", selector=sel, duration_ms=dur,
                                metadata={"state": state, "locator_attempts": attempts})
        return {"selector": sel, "state": state, "duration_ms": dur, "locator_attempts": attempts}

    async def _do_assert_text(self, envelope, page, cfg) -> dict[str, Any]:
        import re
        expected = str(cfg["expected"])
        match = cfg.get("match", "contains")

        async def read_text(locator, timeout):
            await locator.wait_for(state="visible", timeout=timeout)
            return (await locator.text_content(timeout=timeout)) or ""

        sel, actual, attempts = await self._with_locator_healing(envelope, page, cfg, "assert_text", read_text)
        if match == "equals":
            ok = actual.strip() == expected
        elif match == "regex":
            ok = bool(re.search(expected, actual))
        else:
            ok = expected in actual

        if not ok:
            # Capture DOM snapshot so the AI failure pipeline can later replay.
            try:
                dom = await page.content()
                await envelope.artifacts.record_text(
                    ArtifactKind.DOM_SNAPSHOT, "dom.html", dom,
                    content_type="text/html",
                )
            except Exception:
                pass
            raise AssertionError(
                f"text assertion failed at {sel!r}: expected {match} {expected!r}, "
                f"got {_truncate(actual, 200)!r}"
            )
        await self._emit_action(envelope, "assert_text", selector=sel,
                                metadata={"locator_attempts": attempts})
        return {"selector": sel, "actual": _truncate(actual, 500), "match": match, "locator_attempts": attempts}

    async def _do_extract_text(self, envelope, page, cfg) -> dict[str, Any]:
        variable = cfg["variable"]
        async def read_text(locator, timeout):
            await locator.wait_for(state="visible", timeout=timeout)
            return ((await locator.text_content(timeout=timeout)) or "").strip()

        sel, text, attempts = await self._with_locator_healing(envelope, page, cfg, "extract_text", read_text)
        await envelope.log("info", f"extracted {variable} = {_truncate(text, 60)!r}",
                           source="web")
        await self._emit_action(envelope, "extract_text", selector=sel,
                                metadata={"variable": variable, "locator_attempts": attempts})
        return {variable: text, "selector": sel, "locator_attempts": attempts}

    async def _do_screenshot(self, envelope, page, cfg) -> dict[str, Any]:
        full_page = bool(cfg.get("full_page", True))
        sel = cfg.get("selector")
        name = cfg.get("name") or "screenshot.png"
        attempts = []
        if sel or cfg.get("locators") or cfg.get("alternative_locators") or cfg.get("locator_candidates"):
            async def screenshot(locator, timeout):
                await locator.wait_for(state="visible", timeout=timeout)
                return await locator.screenshot(type="png", timeout=timeout)

            sel, data, attempts = await self._with_locator_healing(envelope, page, cfg, "screenshot", screenshot)
        else:
            data = await page.screenshot(full_page=full_page, type="png")
        artifact = await envelope.artifacts.record_bytes(
            ArtifactKind.SCREENSHOT, name, data,
            content_type="image/png",
            metadata={"selector": sel, "full_page": full_page, "locator_attempts": attempts,
                      "url": page.url, "title": await page.title()},
        )
        await self._emit_action(envelope, "screenshot",
                                metadata={"artifact_id": artifact.id})
        return {
            "screenshot_artifact_id": artifact.id,
            "selector": sel,
            "url": page.url,
            "size_bytes": artifact.size_bytes,
            "locator_attempts": attempts,
        }

    async def _do_upload(self, envelope, page, cfg) -> dict[str, Any]:
        file_path = cfg["file_path"]

        async def upload(locator, timeout):
            await locator.set_input_files(file_path, timeout=timeout)

        sel, _, attempts = await self._with_locator_healing(envelope, page, cfg, "upload", upload)
        await self._emit_action(envelope, "upload", selector=sel,
                                metadata={"file_path": file_path, "locator_attempts": attempts})
        return {"selector": sel, "file_path": file_path, "locator_attempts": attempts}

    async def _do_execute_js(self, envelope, page, cfg) -> dict[str, Any]:
        script = cfg["script"]
        result = await page.evaluate(script)
        out = {"result": result}
        if (var := cfg.get("variable")):
            out[var] = result
        await self._emit_action(envelope, "execute_js")
        return out

    # ── Failure evidence ──────────────────────────────────────────────

    async def _capture_failure_evidence(
        self, envelope: ExecutionEnvelope, page: Any, error: str,
    ) -> None:
        """On any web-node failure, capture a screenshot + DOM snapshot."""
        try:
            data = await page.screenshot(full_page=True, type="png")
            await envelope.artifacts.record_bytes(
                ArtifactKind.SCREENSHOT, "failure.png", data,
                content_type="image/png",
                metadata={
                    "capture_reason": "failure",
                    "error": error,
                    "url": getattr(page, "url", None),
                    "node_type": envelope.node_type,
                    "node_label": envelope.node_label,
                },
            )
        except Exception:
            pass
        try:
            dom = await page.content()
            await envelope.artifacts.record_text(
                ArtifactKind.DOM_SNAPSHOT, "failure-dom.html", dom,
                content_type="text/html",
                metadata={"error": error},
            )
        except Exception:
            pass
