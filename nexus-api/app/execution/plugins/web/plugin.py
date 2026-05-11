"""
WebExecutionPlugin — Playwright-backed web automation.

Implements 10 node types under `web.*`:

    web.navigate         go to URL
    web.click            click an element (CSS selector)
    web.fill             fill input
    web.select           select dropdown option
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


class WebExecutionPlugin(ExecutionPlugin):
    name = "web"
    version = "1.0.0"
    description = "Playwright-backed browser automation"

    def __init__(self) -> None:
        super().__init__()
        self._sessions: dict[str, WebSession] = {}
        self._scratch_dirs: dict[str, Path] = {}
        self._lock = asyncio.Lock()

    # ── Discovery ─────────────────────────────────────────────────────

    def node_specs(self) -> list[PluginNodeSpec]:
        sel = {"selector": {"type": "string", "required": True, "supports_template": True}}
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
        if nt in {"web.click", "web.fill", "web.select", "web.assert_text",
                  "web.extract_text", "web.upload"} and require("selector"):
            raise PluginValidationError("`selector` is required")
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
            return PluginResult(success=True, duration_ms=duration_ms, output=output)
        except asyncio.CancelledError:
            return PluginResult(success=False, duration_ms=0, error="Cancelled")
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
            "web.fill":          WebExecutionPlugin._do_fill,
            "web.select":        WebExecutionPlugin._do_select,
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

    async def _do_navigate(self, envelope, page, cfg) -> dict[str, Any]:
        url = cfg["url"]
        wait_until = cfg.get("wait_until", "load")
        timeout = float(cfg.get("timeout_ms", 30000))
        await envelope.log("info", f"navigate → {url}", source="web")
        t0 = time.perf_counter()
        response = await page.goto(url, wait_until=wait_until, timeout=timeout)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "navigate", url=url, duration_ms=dur)
        return {
            "url": page.url,
            "status_code": getattr(response, "status", None),
            "title": await page.title(),
            "duration_ms": dur,
        }

    async def _do_click(self, envelope, page, cfg) -> dict[str, Any]:
        sel = cfg["selector"]
        timeout = float(cfg.get("timeout_ms", 10000))
        force = bool(cfg.get("force", False))
        await envelope.log("info", f"click → {sel}", source="web")
        t0 = time.perf_counter()
        await page.click(sel, timeout=timeout, force=force)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "click", selector=sel, duration_ms=dur)
        return {"selector": sel, "duration_ms": dur}

    async def _do_fill(self, envelope, page, cfg) -> dict[str, Any]:
        sel = cfg["selector"]
        value = cfg["value"]
        timeout = float(cfg.get("timeout_ms", 10000))
        await envelope.log("info", f"fill → {sel} = {_truncate(value, 60)}", source="web")
        t0 = time.perf_counter()
        await page.fill(sel, value, timeout=timeout)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(
            envelope, "fill", selector=sel, duration_ms=dur,
            metadata={"chars": len(str(value))},
        )
        return {"selector": sel, "duration_ms": dur}

    async def _do_select(self, envelope, page, cfg) -> dict[str, Any]:
        sel = cfg["selector"]
        value = cfg["value"]
        timeout = float(cfg.get("timeout_ms", 10000))
        await envelope.log("info", f"select → {sel} = {value}", source="web")
        t0 = time.perf_counter()
        chosen = await page.select_option(sel, value=value, timeout=timeout)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "select", selector=sel, duration_ms=dur)
        return {"selector": sel, "selected": chosen, "duration_ms": dur}

    async def _do_wait(self, envelope, page, cfg) -> dict[str, Any]:
        sel = cfg.get("selector")
        delay_ms = cfg.get("delay_ms")
        state = cfg.get("state", "visible")
        timeout = float(cfg.get("timeout_ms", 10000))
        t0 = time.perf_counter()
        if sel:
            await envelope.log("info", f"wait → {sel} ({state})", source="web")
            await page.wait_for_selector(sel, state=state, timeout=timeout)
        else:
            ms = float(delay_ms or 1000)
            await envelope.log("info", f"wait → {ms}ms", source="web")
            await page.wait_for_timeout(ms)
        dur = int((time.perf_counter() - t0) * 1000)
        await self._emit_action(envelope, "wait", selector=sel, duration_ms=dur,
                                metadata={"state": state})
        return {"selector": sel, "state": state, "duration_ms": dur}

    async def _do_assert_text(self, envelope, page, cfg) -> dict[str, Any]:
        import re
        sel = cfg["selector"]
        expected = str(cfg["expected"])
        match = cfg.get("match", "contains")
        timeout = float(cfg.get("timeout_ms", 10000))
        await page.wait_for_selector(sel, timeout=timeout)
        actual = (await page.text_content(sel)) or ""
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
        await self._emit_action(envelope, "assert_text", selector=sel)
        return {"selector": sel, "actual": _truncate(actual, 500), "match": match}

    async def _do_extract_text(self, envelope, page, cfg) -> dict[str, Any]:
        sel = cfg["selector"]
        variable = cfg["variable"]
        timeout = float(cfg.get("timeout_ms", 10000))
        await page.wait_for_selector(sel, timeout=timeout)
        text = ((await page.text_content(sel)) or "").strip()
        await envelope.log("info", f"extracted {variable} = {_truncate(text, 60)!r}",
                           source="web")
        await self._emit_action(envelope, "extract_text", selector=sel,
                                metadata={"variable": variable})
        return {variable: text, "selector": sel}

    async def _do_screenshot(self, envelope, page, cfg) -> dict[str, Any]:
        full_page = bool(cfg.get("full_page", True))
        sel = cfg.get("selector")
        name = cfg.get("name") or "screenshot.png"
        if sel:
            handle = await page.wait_for_selector(sel, timeout=10000)
            data = await handle.screenshot(type="png")
        else:
            data = await page.screenshot(full_page=full_page, type="png")
        artifact = await envelope.artifacts.record_bytes(
            ArtifactKind.SCREENSHOT, name, data,
            content_type="image/png",
            metadata={"selector": sel, "full_page": full_page,
                      "url": page.url, "title": await page.title()},
        )
        await self._emit_action(envelope, "screenshot",
                                metadata={"artifact_id": artifact.id})
        return {
            "screenshot_artifact_id": artifact.id,
            "url": page.url,
            "size_bytes": artifact.size_bytes,
        }

    async def _do_upload(self, envelope, page, cfg) -> dict[str, Any]:
        sel = cfg["selector"]
        file_path = cfg["file_path"]
        timeout = float(cfg.get("timeout_ms", 10000))
        await page.set_input_files(sel, file_path, timeout=timeout)
        await self._emit_action(envelope, "upload", selector=sel,
                                metadata={"file_path": file_path})
        return {"selector": sel, "file_path": file_path}

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
                metadata={"error": error, "url": getattr(page, "url", None)},
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
