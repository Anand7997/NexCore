"""Real-device Appium smoke test for the mobile plugin.

This drives a full node chain against a live Appium server + device:

    mobile.launch -> mobile.tap -> mobile.type_text -> mobile.assert_visible -> mobile.screenshot

It is SKIPPED by default. To run it against a real machine:

    set NEXUS_MOBILE_E2E=1
    set APPIUM_SERVER_URL=http://127.0.0.1:4723
    set NEXUS_E2E_CAPS={"platformName":"Android","automationName":"UiAutomator2",
                        "appPackage":"com.android.settings","appActivity":".Settings"}
    set NEXUS_E2E_TAP_SELECTOR=Search settings          # accessibility id
    set NEXUS_E2E_TYPE_SELECTOR=...                      # optional
    set NEXUS_E2E_ASSERT_SELECTOR=Search settings        # accessibility id

If NEXUS_MOBILE_E2E is unset, or the android runtime is not "available"
(server unreachable / no device), the whole module is skipped — so CI without
a device farm stays green.
"""
from __future__ import annotations

import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.execution.plugin import ExecutionEnvelope
from app.execution.plugins.mobile.plugin import MobileExecutionPlugin
from app.orchestration.context import ExecutionContext
from app.platform_adapters import validate_adapter_environment

pytestmark = pytest.mark.asyncio


def _should_skip() -> str | None:
    if os.getenv("NEXUS_MOBILE_E2E") != "1":
        return "NEXUS_MOBILE_E2E != 1 (set it to run the real-device smoke test)"
    report = validate_adapter_environment("android")
    if not report["valid"]:
        return f"android runtime not ready: {report['reason']} :: {report['runtime']['diagnostics']}"
    return None


_SKIP = _should_skip()
if _SKIP:
    pytest.skip(_SKIP, allow_module_level=True)


def _envelope(plugin_session_id: str, node_type: str, config: dict) -> ExecutionEnvelope:
    artifacts = MagicMock()
    artifacts.record_bytes = AsyncMock(return_value=MagicMock(id="artifact1", size_bytes=1024))
    artifacts.record_text = AsyncMock(return_value=MagicMock(id="source1", size_bytes=64))
    return ExecutionEnvelope(
        execution_id=plugin_session_id,
        workflow_id="e2e-smoke",
        node_key=node_type,
        node_label=node_type,
        node_type=node_type,
        config=config,
        timeout_seconds=120,
        attempt=1,
        context=ExecutionContext(),
        artifacts=artifacts,
        log=AsyncMock(),
        emit=AsyncMock(),
        cancel_event=asyncio.Event(),
    )


async def test_mobile_launch_to_screenshot_against_real_device():
    caps = json.loads(os.environ["NEXUS_E2E_CAPS"])
    tap_selector = os.getenv("NEXUS_E2E_TAP_SELECTOR")
    type_selector = os.getenv("NEXUS_E2E_TYPE_SELECTOR")
    assert_selector = os.getenv("NEXUS_E2E_ASSERT_SELECTOR", tap_selector)

    plugin = MobileExecutionPlugin()
    exec_id = "e2e-1"
    try:
        launch = await plugin.execute(_envelope(exec_id, "mobile.launch", {"capabilities": caps}))
        assert launch.success, launch.error
        assert launch.output["session_id"]

        if tap_selector:
            tap = await plugin.execute(_envelope(exec_id, "mobile.tap", {"selector": tap_selector}))
            assert tap.success, tap.error

        if type_selector:
            typed = await plugin.execute(
                _envelope(exec_id, "mobile.type_text", {"selector": type_selector, "value": "nexcore"})
            )
            assert typed.success, typed.error

        visible = await plugin.execute(
            _envelope(exec_id, "mobile.assert_visible", {"selector": assert_selector})
        )
        assert visible.success, visible.error
        assert visible.output["visible"] is True

        shot = await plugin.execute(_envelope(exec_id, "mobile.screenshot", {"name": "e2e.png"}))
        assert shot.success, shot.error
        assert shot.output["screenshot_artifact_id"]
    finally:
        await plugin.on_execution_end(exec_id)
