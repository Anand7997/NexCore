"""WinAppDriver-backed desktop execution plugin."""
from __future__ import annotations

import asyncio
import os
import time
from typing import Any

from app.config import settings
from app.events.types import DesktopAction
from app.execution.artifacts import ArtifactKind
from app.execution.interpolation import VariableInterpolator
from app.execution.plugin import (
    ExecutionEnvelope,
    ExecutionPlugin,
    PluginNodeSpec,
    PluginResult,
    PluginValidationError,
)
from app.execution.plugins.webdriver_client import WebDriverClient, WebDriverError


class DesktopExecutionPlugin(ExecutionPlugin):
    name = "desktop"
    version = "1.0.0"
    description = "WinAppDriver-backed Windows desktop execution"

    def __init__(self) -> None:
        super().__init__()
        self._sessions: dict[str, WebDriverClient] = {}
        self._lock = asyncio.Lock()

    def node_specs(self) -> list[PluginNodeSpec]:
        selector = {
            "selector": {"type": "string", "required": True, "supports_template": True},
            "strategy": {
                "type": "string",
                "enum": ["accessibility id", "name", "xpath", "class name"],
                "default": "accessibility id",
            },
        }
        return [
            PluginNodeSpec(
                type="desktop.launch",
                plugin="desktop",
                label="Launch Desktop App",
                category="Desktop Automation",
                description="Start a WinAppDriver session.",
                icon="monitor",
                color="#64748b",
                config_schema={
                    "server_url": {"type": "string", "default": settings.winappdriver_url},
                    "app": {"type": "string", "required": True, "supports_template": True},
                    "capabilities": {"type": "object"},
                },
            ),
            PluginNodeSpec(
                type="desktop.click",
                plugin="desktop",
                label="Click Desktop Element",
                category="Desktop Automation",
                description="Click a Windows UIAutomation element.",
                icon="mouse-pointer",
                color="#475569",
                config_schema=selector,
            ),
            PluginNodeSpec(
                type="desktop.type_text",
                plugin="desktop",
                label="Type Desktop Text",
                category="Desktop Automation",
                description="Enter text into a Windows control.",
                icon="text-cursor-input",
                color="#334155",
                config_schema={**selector, "value": {"type": "string", "required": True, "supports_template": True}},
            ),
            PluginNodeSpec(
                type="desktop.assert_text",
                plugin="desktop",
                label="Assert Desktop Text",
                category="Desktop Automation",
                description="Verify text from a Windows control.",
                icon="check-circle",
                color="#16a34a",
                config_schema={
                    **selector,
                    "expected": {"type": "string", "required": True, "supports_template": True},
                    "match": {"type": "string", "enum": ["contains", "equals"], "default": "contains"},
                },
            ),
            PluginNodeSpec(
                type="desktop.extract_text",
                plugin="desktop",
                label="Extract Desktop Text",
                category="Desktop Automation",
                description="Read Windows control text into execution context.",
                icon="copy",
                color="#7c3aed",
                config_schema={**selector, "variable": {"type": "string", "required": True}},
            ),
            PluginNodeSpec(
                type="desktop.screenshot",
                plugin="desktop",
                label="Desktop Screenshot",
                category="Desktop Automation",
                description="Capture a desktop session screenshot.",
                icon="camera",
                color="#0ea5e9",
                config_schema={"name": {"type": "string", "default": "desktop.png"}},
            ),
        ]

    async def on_execution_end(self, execution_id: str) -> None:
        async with self._lock:
            session = self._sessions.pop(execution_id, None)
        if session:
            await session.close()

    async def validate(self, envelope: ExecutionEnvelope) -> None:
        cfg = envelope.config
        nt = envelope.node_type
        if nt == "desktop.launch" and cfg.get("app") in (None, ""):
            raise PluginValidationError("`app` is required")
        if nt in {"desktop.click", "desktop.type_text", "desktop.assert_text"} and cfg.get("selector") in (None, ""):
            raise PluginValidationError("`selector` is required")
        if nt == "desktop.type_text" and cfg.get("value") in (None, ""):
            raise PluginValidationError("`value` is required")
        if nt == "desktop.assert_text" and cfg.get("expected") in (None, ""):
            raise PluginValidationError("`expected` is required")
        if nt == "desktop.extract_text" and cfg.get("variable") in (None, ""):
            raise PluginValidationError("`variable` is required")

    async def execute(self, envelope: ExecutionEnvelope) -> PluginResult:
        ctx_vars = await envelope.context.all()
        cfg = VariableInterpolator.interpolate(envelope.config, ctx_vars)
        start = time.perf_counter()
        try:
            handler = self._handlers().get(envelope.node_type)
            if handler is None:
                return PluginResult(False, 0, error=f"Unsupported desktop node type: {envelope.node_type}")
            output = await handler(self, envelope, cfg)
            duration_ms = int((time.perf_counter() - start) * 1000)
            output.setdefault("duration_ms", duration_ms)
            await self._emit_action(envelope, envelope.node_type, duration_ms=duration_ms, metadata=output)
            return PluginResult(True, duration_ms, output=output)
        except asyncio.CancelledError:
            return PluginResult(False, 0, error="Cancelled")
        except Exception as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            await envelope.log("error", f"[{envelope.node_type}] {exc}", source="desktop")
            await self._capture_failure_evidence(envelope, str(exc))
            return PluginResult(False, duration_ms, error=str(exc))

    @staticmethod
    def _handlers() -> dict[str, Any]:
        return {
            "desktop.launch": DesktopExecutionPlugin._do_launch,
            "desktop.click": DesktopExecutionPlugin._do_click,
            "desktop.type_text": DesktopExecutionPlugin._do_type_text,
            "desktop.assert_text": DesktopExecutionPlugin._do_assert_text,
            "desktop.extract_text": DesktopExecutionPlugin._do_extract_text,
            "desktop.screenshot": DesktopExecutionPlugin._do_screenshot,
        }

    async def _session(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> WebDriverClient:
        async with self._lock:
            session = self._sessions.get(envelope.execution_id)
            if session:
                return session

            capabilities = dict(cfg.get("capabilities") or {})
            capabilities.setdefault("platformName", "Windows")
            capabilities.setdefault("deviceName", "WindowsPC")
            capabilities["app"] = cfg["app"]
            server_url = str(cfg.get("server_url") or os.getenv("WINAPPDRIVER_URL") or settings.winappdriver_url)
            session = WebDriverClient(server_url, timeout=float(cfg.get("timeout_seconds", 30)))
            await session.start_session(capabilities)
            self._sessions[envelope.execution_id] = session
            await envelope.log("success", "WinAppDriver session started", source="desktop")
            return session

    async def _require_session(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> WebDriverClient:
        async with self._lock:
            session = self._sessions.get(envelope.execution_id)
        if session:
            return session
        if cfg.get("app"):
            return await self._session(envelope, cfg)
        raise WebDriverError("No desktop session exists. Add a desktop.launch node or provide `app` on this node.")

    async def _find(self, session: WebDriverClient, cfg: dict[str, Any]):
        return await session.find_element(str(cfg.get("strategy", "accessibility id")), str(cfg["selector"]))

    async def _do_launch(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        session = await self._session(envelope, cfg)
        return {"session_id": session.session_id, "app": cfg["app"]}

    async def _do_click(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg)
        element = await self._find(session, cfg)
        await session.click(element)
        return {"selector": cfg["selector"], "strategy": cfg.get("strategy", "accessibility id")}

    async def _do_type_text(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg)
        element = await self._find(session, cfg)
        await session.send_keys(element, str(cfg["value"]))
        return {"selector": cfg["selector"], "chars": len(str(cfg["value"]))}

    async def _do_assert_text(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg)
        element = await self._find(session, cfg)
        actual = await session.element_text(element)
        expected = str(cfg["expected"])
        match = cfg.get("match", "contains")
        ok = actual == expected if match == "equals" else expected in actual
        if not ok:
            raise AssertionError(f"expected text {match} {expected!r}, got {actual!r}")
        return {"selector": cfg["selector"], "actual": actual, "match": match}

    async def _do_extract_text(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg)
        element = await self._find(session, cfg)
        text = (await session.element_text(element)).strip()
        variable = str(cfg["variable"])
        return {"selector": cfg["selector"], variable: text}

    async def _do_screenshot(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg)
        data = await session.screenshot_png()
        artifact = await envelope.artifacts.record_bytes(
            ArtifactKind.SCREENSHOT,
            str(cfg.get("name") or "desktop.png"),
            data,
            content_type="image/png",
            metadata={"source": "winappdriver"},
        )
        return {"screenshot_artifact_id": artifact.id, "size_bytes": artifact.size_bytes}

    async def _emit_action(
        self,
        envelope: ExecutionEnvelope,
        action: str,
        *,
        selector: str | None = None,
        duration_ms: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        await envelope.emit(DesktopAction(
            execution_id=envelope.execution_id,
            node_id=envelope.node_key,
            action=action.replace("desktop.", ""),
            selector=selector,
            duration_ms=duration_ms,
            metadata=metadata or {},
        ))

    async def _capture_failure_evidence(self, envelope: ExecutionEnvelope, error: str) -> None:
        async with self._lock:
            session = self._sessions.get(envelope.execution_id)
        if not session:
            return
        try:
            data = await session.screenshot_png()
            await envelope.artifacts.record_bytes(
                ArtifactKind.SCREENSHOT,
                "desktop-failure.png",
                data,
                content_type="image/png",
                metadata={"error": error},
            )
        except Exception:
            pass
        try:
            source = await session.source()
            await envelope.artifacts.record_text(
                ArtifactKind.TEXT,
                "desktop-source.xml",
                source,
                content_type="application/xml",
                metadata={"error": error},
            )
        except Exception:
            pass
