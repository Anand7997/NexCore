"""Appium-backed mobile execution plugin for Android and iOS nodes."""
from __future__ import annotations

import asyncio
import os
import time
from typing import Any

from app.config import settings
from app.events.types import MobileAction
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


class MobileExecutionPlugin(ExecutionPlugin):
    name = "mobile"
    version = "1.0.0"
    description = "Appium-backed Android and iOS execution"

    def __init__(self) -> None:
        super().__init__()
        self._sessions: dict[tuple[str, str], WebDriverClient] = {}
        self._lock = asyncio.Lock()

    def node_specs(self) -> list[PluginNodeSpec]:
        selector = {
            "selector": {"type": "string", "required": True, "supports_template": True},
            "strategy": {
                "type": "string",
                "enum": ["accessibility id", "id", "xpath", "class name", "-android uiautomator", "-ios predicate string"],
                "default": "accessibility id",
            },
        }
        platform = {"platform": {"type": "string", "enum": ["android", "ios"], "default": "android"}}
        return [
            PluginNodeSpec(
                type="mobile.launch",
                plugin="mobile",
                label="Launch Mobile App",
                category="Mobile Automation",
                description="Start an Appium session for Android or iOS.",
                icon="smartphone",
                color="#10b981",
                config_schema={
                    **platform,
                    "server_url": {"type": "string", "default": settings.appium_server_url},
                    "capabilities": {"type": "object", "required": True},
                },
            ),
            PluginNodeSpec(
                type="mobile.tap",
                plugin="mobile",
                label="Tap Element",
                category="Mobile Automation",
                description="Tap a mobile element using Appium.",
                icon="hand-pointer",
                color="#14b8a6",
                config_schema={**platform, **selector},
            ),
            PluginNodeSpec(
                type="mobile.type_text",
                plugin="mobile",
                label="Type Text",
                category="Mobile Automation",
                description="Enter text into a mobile field.",
                icon="text-cursor-input",
                color="#0d9488",
                config_schema={**platform, **selector, "value": {"type": "string", "required": True, "supports_template": True}},
            ),
            PluginNodeSpec(
                type="mobile.assert_text",
                plugin="mobile",
                label="Assert Mobile Text",
                category="Mobile Automation",
                description="Verify mobile element text.",
                icon="check-circle",
                color="#16a34a",
                config_schema={
                    **platform,
                    **selector,
                    "expected": {"type": "string", "required": True, "supports_template": True},
                    "match": {"type": "string", "enum": ["contains", "equals"], "default": "contains"},
                },
            ),
            PluginNodeSpec(
                type="mobile.select_option",
                plugin="mobile",
                label="Select Option",
                category="Mobile Automation",
                description="Open a dropdown/picker and choose an option by its visible text.",
                icon="list",
                color="#0891b2",
                config_schema={
                    **platform,
                    **selector,
                    "value": {"type": "string", "required": True, "supports_template": True},
                    "option_selector": {"type": "string", "supports_template": True},
                    "option_strategy": {
                        "type": "string",
                        "enum": ["accessibility id", "id", "xpath", "class name", "-android uiautomator", "-ios predicate string"],
                    },
                },
            ),
            PluginNodeSpec(
                type="mobile.assert_visible",
                plugin="mobile",
                label="Assert Mobile Visible",
                category="Mobile Automation",
                description="Verify a mobile element is present and displayed on screen.",
                icon="eye",
                color="#22c55e",
                config_schema={**platform, **selector},
            ),
            PluginNodeSpec(
                type="mobile.extract_text",
                plugin="mobile",
                label="Extract Mobile Text",
                category="Mobile Automation",
                description="Read mobile element text into execution context.",
                icon="copy",
                color="#7c3aed",
                config_schema={**platform, **selector, "variable": {"type": "string", "required": True}},
            ),
            PluginNodeSpec(
                type="mobile.screenshot",
                plugin="mobile",
                label="Mobile Screenshot",
                category="Mobile Automation",
                description="Capture the current device screenshot.",
                icon="camera",
                color="#0ea5e9",
                config_schema={**platform, "name": {"type": "string", "default": "mobile.png"}},
            ),
            PluginNodeSpec(
                type="mobile.deep_link",
                plugin="mobile",
                label="Open Deep Link",
                category="Mobile Automation",
                description="Open a mobile deep link through Appium script execution.",
                icon="link",
                color="#2563eb",
                config_schema={
                    **platform,
                    "url": {"type": "string", "required": True, "supports_template": True},
                    "package": {"type": "string", "supports_template": True},
                },
            ),
        ]

    async def on_execution_end(self, execution_id: str) -> None:
        async with self._lock:
            keys = [key for key in self._sessions if key[0] == execution_id]
            sessions = [self._sessions.pop(key) for key in keys]
        for session in sessions:
            await session.close()

    async def validate(self, envelope: ExecutionEnvelope) -> None:
        cfg = envelope.config
        nt = envelope.node_type
        if cfg.get("platform", "android") not in {"android", "ios"}:
            raise PluginValidationError("`platform` must be `android` or `ios`")
        if nt == "mobile.launch" and not isinstance(cfg.get("capabilities"), dict):
            raise PluginValidationError("`capabilities` object is required")
        if nt in {
            "mobile.tap",
            "mobile.type_text",
            "mobile.assert_text",
            "mobile.assert_visible",
            "mobile.select_option",
        } and not cfg.get("selector"):
            raise PluginValidationError("`selector` is required")
        if nt in {"mobile.type_text", "mobile.select_option"} and cfg.get("value") in (None, ""):
            raise PluginValidationError("`value` is required")
        if nt == "mobile.assert_text" and cfg.get("expected") in (None, ""):
            raise PluginValidationError("`expected` is required")
        if nt == "mobile.extract_text" and cfg.get("variable") in (None, ""):
            raise PluginValidationError("`variable` is required")
        if nt == "mobile.deep_link" and cfg.get("url") in (None, ""):
            raise PluginValidationError("`url` is required")

    async def execute(self, envelope: ExecutionEnvelope) -> PluginResult:
        ctx_vars = await envelope.context.all()
        cfg = VariableInterpolator.interpolate(envelope.config, ctx_vars)
        platform = str(cfg.get("platform", "android")).lower()
        start = time.perf_counter()

        try:
            handler = self._handlers().get(envelope.node_type)
            if handler is None:
                return PluginResult(False, 0, error=f"Unsupported mobile node type: {envelope.node_type}")
            output = await handler(self, envelope, cfg, platform)
            duration_ms = int((time.perf_counter() - start) * 1000)
            output.setdefault("duration_ms", duration_ms)
            await self._emit_action(envelope, platform, envelope.node_type, duration_ms=duration_ms, metadata=output)
            return PluginResult(True, duration_ms, output=output)
        except asyncio.CancelledError:
            return PluginResult(False, 0, error="Cancelled")
        except Exception as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            await envelope.log("error", f"[{envelope.node_type}] {exc}", source="mobile")
            await self._capture_failure_evidence(envelope, platform, str(exc))
            return PluginResult(False, duration_ms, error=str(exc))

    @staticmethod
    def _handlers() -> dict[str, Any]:
        return {
            "mobile.launch": MobileExecutionPlugin._do_launch,
            "mobile.tap": MobileExecutionPlugin._do_tap,
            "mobile.type_text": MobileExecutionPlugin._do_type_text,
            "mobile.assert_text": MobileExecutionPlugin._do_assert_text,
            "mobile.assert_visible": MobileExecutionPlugin._do_assert_visible,
            "mobile.select_option": MobileExecutionPlugin._do_select_option,
            "mobile.extract_text": MobileExecutionPlugin._do_extract_text,
            "mobile.screenshot": MobileExecutionPlugin._do_screenshot,
            "mobile.deep_link": MobileExecutionPlugin._do_deep_link,
        }

    async def _session(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], platform: str) -> WebDriverClient:
        key = (envelope.execution_id, platform)
        async with self._lock:
            session = self._sessions.get(key)
            if session:
                return session

            server_url = str(cfg.get("server_url") or os.getenv("APPIUM_SERVER_URL") or settings.appium_server_url)
            capabilities = dict(cfg.get("capabilities") or {})
            if "platformName" not in capabilities:
                capabilities["platformName"] = "Android" if platform == "android" else "iOS"
            session = WebDriverClient(server_url, timeout=float(cfg.get("timeout_seconds", 30)))
            await session.start_session(capabilities)
            self._sessions[key] = session
            await envelope.log("success", f"Appium {platform} session started", source="mobile")
            return session

    async def _require_session(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], platform: str) -> WebDriverClient:
        key = (envelope.execution_id, platform)
        async with self._lock:
            session = self._sessions.get(key)
        if session:
            return session
        if cfg.get("capabilities"):
            return await self._session(envelope, cfg, platform)
        raise WebDriverError("No mobile session exists. Add a mobile.launch node or provide capabilities on this node.")

    async def _find(self, session: WebDriverClient, cfg: dict[str, Any]):
        return await session.find_element(str(cfg.get("strategy", "accessibility id")), str(cfg["selector"]))

    async def _do_launch(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], platform: str) -> dict[str, Any]:
        session = await self._session(envelope, cfg, platform)
        return {"platform": platform, "session_id": session.session_id}

    async def _do_tap(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], platform: str) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg, platform)
        element = await self._find(session, cfg)
        await session.click(element)
        return {"platform": platform, "selector": cfg["selector"], "strategy": cfg.get("strategy", "accessibility id")}

    async def _do_type_text(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], platform: str) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg, platform)
        element = await self._find(session, cfg)
        await session.send_keys(element, str(cfg["value"]))
        return {"platform": platform, "selector": cfg["selector"], "chars": len(str(cfg["value"]))}

    async def _do_assert_text(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], platform: str) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg, platform)
        element = await self._find(session, cfg)
        actual = await session.element_text(element)
        expected = str(cfg["expected"])
        match = cfg.get("match", "contains")
        ok = actual == expected if match == "equals" else expected in actual
        if not ok:
            raise AssertionError(f"expected text {match} {expected!r}, got {actual!r}")
        return {"platform": platform, "selector": cfg["selector"], "actual": actual, "match": match}

    async def _do_assert_visible(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], platform: str) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg, platform)
        element = await self._find(session, cfg)
        visible = await session.element_displayed(element)
        if not visible:
            raise AssertionError(f"element {cfg['selector']!r} is present but not displayed")
        return {"platform": platform, "selector": cfg["selector"], "visible": True}

    async def _do_select_option(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], platform: str) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg, platform)
        # Open the dropdown / picker control first.
        control = await self._find(session, cfg)
        await session.click(control)
        # Locate the option element, defaulting to a text-based lookup per platform.
        value = str(cfg["value"])
        strategy, selector = self._option_locator(cfg, platform, value)
        option = await session.find_element(strategy, selector)
        await session.click(option)
        return {
            "platform": platform,
            "selector": cfg["selector"],
            "value": value,
            "option_strategy": strategy,
            "option_selector": selector,
        }

    @staticmethod
    def _option_locator(cfg: dict[str, Any], platform: str, value: str) -> tuple[str, str]:
        if cfg.get("option_selector"):
            strategy = str(cfg.get("option_strategy") or cfg.get("strategy", "accessibility id"))
            return strategy, str(cfg["option_selector"])
        if cfg.get("option_strategy"):
            return str(cfg["option_strategy"]), value
        if platform == "android":
            return "-android uiautomator", f'new UiSelector().text("{value}")'
        return "-ios predicate string", f'label == "{value}" OR name == "{value}" OR value == "{value}"'

    async def _do_extract_text(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], platform: str) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg, platform)
        element = await self._find(session, cfg)
        text = (await session.element_text(element)).strip()
        variable = str(cfg["variable"])
        return {"platform": platform, "selector": cfg["selector"], variable: text}

    async def _do_screenshot(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], platform: str) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg, platform)
        data = await session.screenshot_png()
        artifact = await envelope.artifacts.record_bytes(
            ArtifactKind.SCREENSHOT,
            str(cfg.get("name") or "mobile.png"),
            data,
            content_type="image/png",
            metadata={"platform": platform, "source": "appium"},
        )
        return {"platform": platform, "screenshot_artifact_id": artifact.id, "size_bytes": artifact.size_bytes}

    async def _do_deep_link(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], platform: str) -> dict[str, Any]:
        session = await self._require_session(envelope, cfg, platform)
        url = str(cfg["url"])
        if platform == "android":
            await session.execute_script("mobile: deepLink", [{"url": url, "package": cfg.get("package")}])
        else:
            await session.execute_script("mobile: launchApp", [{"bundleId": cfg.get("bundle_id")}])
            await session.execute_script("mobile: openUrl", [{"url": url}])
        return {"platform": platform, "url": url}

    async def _emit_action(
        self,
        envelope: ExecutionEnvelope,
        platform: str,
        action: str,
        *,
        selector: str | None = None,
        duration_ms: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        await envelope.emit(MobileAction(
            execution_id=envelope.execution_id,
            node_id=envelope.node_key,
            platform=platform,
            action=action.replace("mobile.", ""),
            selector=selector,
            duration_ms=duration_ms,
            metadata=metadata or {},
        ))

    async def _capture_failure_evidence(self, envelope: ExecutionEnvelope, platform: str, error: str) -> None:
        key = (envelope.execution_id, platform)
        async with self._lock:
            session = self._sessions.get(key)
        if not session:
            return
        try:
            data = await session.screenshot_png()
            await envelope.artifacts.record_bytes(
                ArtifactKind.SCREENSHOT,
                "mobile-failure.png",
                data,
                content_type="image/png",
                metadata={"platform": platform, "error": error},
            )
        except Exception:
            pass
        try:
            source = await session.source()
            await envelope.artifacts.record_text(
                ArtifactKind.TEXT,
                "mobile-source.xml",
                source,
                content_type="application/xml",
                metadata={"platform": platform, "error": error},
            )
        except Exception:
            pass
