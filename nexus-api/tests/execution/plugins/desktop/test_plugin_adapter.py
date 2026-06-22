import asyncio
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.execution.plugin import ExecutionEnvelope, PluginValidationError
from app.execution.plugins.desktop.drivers.base import DriverResult, LocatorCandidate
from app.execution.plugins.desktop.plugin import DesktopExecutionPlugin
from app.orchestration.context import ExecutionContext


def _mock_driver():
    driver = MagicMock()
    driver.launch = AsyncMock(return_value=DriverResult(success=True, metadata={"session_id": "sess1"}))
    driver.close = AsyncMock(return_value=DriverResult(success=True))
    driver.restart_app = AsyncMock(return_value=DriverResult(success=True, metadata={"session_id": "sess2"}))
    driver.attach = AsyncMock(return_value=DriverResult(success=True, metadata={"window_title": "Calculator"}))
    driver.activate_window = AsyncMock(return_value=DriverResult(success=True, metadata={"focused": True}))
    driver.switch_window = AsyncMock(return_value=DriverResult(success=True, metadata={"window_title": "Invoice"}))
    driver.wait_app = AsyncMock(return_value=DriverResult(success=True, metadata={"process_name": "invoice.exe"}))
    driver.wait_window = AsyncMock(return_value=DriverResult(success=True, metadata={"window_title": "Invoice"}))
    driver.report_capabilities = AsyncMock(return_value={"driver": "uia3", "platform": "windows"})
    driver.click = AsyncMock(return_value=DriverResult(success=True, metadata={"strategy": "accessibility_id"}))
    driver.double_click = AsyncMock(return_value=DriverResult(success=True, metadata={"strategy": "accessibility_id"}))
    driver.right_click = AsyncMock(return_value=DriverResult(success=True, metadata={"strategy": "accessibility_id"}))
    driver.hover = AsyncMock(return_value=DriverResult(success=True, metadata={"strategy": "accessibility_id"}))
    driver.click_coordinates = AsyncMock(return_value=DriverResult(success=True, metadata={"strategy": "coordinates", "x": 100, "y": 200}))
    driver.double_click_coordinates = AsyncMock(return_value=DriverResult(success=True, metadata={"strategy": "coordinates", "x": 100, "y": 200}))
    driver.hover_coordinates = AsyncMock(return_value=DriverResult(success=True, metadata={"strategy": "coordinates", "x": 100, "y": 200}))
    driver.type_text = AsyncMock(return_value=DriverResult(success=True, metadata={"chars": 5}))
    driver.set_text = AsyncMock(return_value=DriverResult(success=True, metadata={"chars": 5}))
    driver.clear_text = AsyncMock(return_value=DriverResult(success=True, metadata={}))
    driver.select = AsyncMock(return_value=DriverResult(success=True, metadata={"selected": "A"}))
    driver.set_checked = AsyncMock(return_value=DriverResult(success=True, metadata={"checked": True}))
    driver.press_key = AsyncMock(return_value=DriverResult(success=True, metadata={"key": "Enter"}))
    driver.hotkey = AsyncMock(return_value=DriverResult(success=True, metadata={"keys": ["Control", "S"]}))
    driver.key_sequence = AsyncMock(return_value=DriverResult(success=True, metadata={"keys": ["Tab", "Enter"]}))
    driver.scroll = AsyncMock(return_value=DriverResult(success=True, metadata={"scrolled": True}))
    driver.drag_and_drop = AsyncMock(return_value=DriverResult(success=True, metadata={"dragged": True}))
    driver.handle_modal = AsyncMock(return_value=DriverResult(success=True, metadata={"modal_action": "accept"}))
    driver.clipboard_set = AsyncMock(return_value=DriverResult(success=True, metadata={"clipboard": "set"}))
    driver.clipboard_get = AsyncMock(return_value=DriverResult(success=True, value="Copied text", metadata={"clipboard": "get"}))
    driver.get_text = AsyncMock(return_value=DriverResult(success=True, value="Ready", metadata={}))
    driver.get_property = AsyncMock(return_value=DriverResult(success=True, value="Submit", metadata={}))
    driver.screenshot = AsyncMock(return_value=DriverResult(success=True, screenshot_bytes=b"PNG", metadata={}))
    driver.get_ui_tree = AsyncMock(return_value=DriverResult(
        success=True,
        ui_tree='<Window Name="Invoice"><Button AutomationId="btnSave" Name="Save invoice"/></Window>',
        metadata={},
    ))
    return driver


def _envelope(node_type: str, config: dict):
    artifacts = MagicMock()
    artifacts.record_bytes = AsyncMock(return_value=MagicMock(id="artifact1", size_bytes=3))
    artifacts.record_text = AsyncMock(return_value=MagicMock(id="source1", size_bytes=9))
    return ExecutionEnvelope(
        execution_id="exec1",
        workflow_id="wf1",
        node_key="node1",
        node_label=node_type,
        node_type=node_type,
        config=config,
        timeout_seconds=30,
        attempt=1,
        context=ExecutionContext(),
        artifacts=artifacts,
        log=AsyncMock(),
        emit=AsyncMock(),
        cancel_event=asyncio.Event(),
    )


def test_node_specs_expose_driver_selection_and_locator_candidates():
    plugin = DesktopExecutionPlugin()
    specs = {spec.type: spec for spec in plugin.node_specs()}

    launch_schema = specs["desktop.launch"].config_schema
    click_schema = specs["desktop.click"].config_schema

    assert launch_schema["driver_type"]["enum"] == ["winappdriver", "uia3", "computer_vision", "auto"]
    assert launch_schema["driver_type"]["default"] == "uia3"
    assert "server_url" in launch_schema
    assert "window_title" in launch_schema
    assert "process_name" in launch_schema
    assert "window_required" in launch_schema
    assert "locators" in click_schema
    assert "x" in click_schema
    assert "y" in click_schema
    assert "analog" in click_schema
    assert "virtual_object" in click_schema
    assert "min_confidence" in click_schema
    assert "review_confidence" in click_schema
    assert "window_title" in click_schema
    assert "process_name" in click_schema
    assert "ocr" in click_schema["strategy"]["enum"]
    assert "visual" in click_schema["strategy"]["enum"]
    assert "relative" in click_schema["strategy"]["enum"]
    for node_type in (
        "desktop.attach",
        "desktop.close",
        "desktop.restart",
        "desktop.activate_window",
        "desktop.switch_window",
        "desktop.wait_app",
        "desktop.wait_window",
        "desktop.double_click",
        "desktop.right_click",
        "desktop.hover",
        "desktop.set_text",
        "desktop.clear",
        "desktop.select",
        "desktop.check",
        "desktop.uncheck",
        "desktop.press_key",
        "desktop.hotkey",
        "desktop.key_sequence",
        "desktop.scroll",
        "desktop.drag_and_drop",
        "desktop.handle_modal",
        "desktop.clipboard_set",
        "desktop.clipboard_get",
        "desktop.assert_property",
        "desktop.extract_property",
        "desktop.source_snapshot",
        "desktop.perceive",
        "desktop.sap_action",
        "desktop.java_action",
        "desktop.citrix_action",
        "desktop.terminal_action",
        "desktop.office_action",
        "desktop.custom_control_action",
    ):
        assert node_type in specs
    assert len(specs) == len(plugin.node_specs())


@pytest.mark.asyncio
async def test_validate_accepts_automation_id_without_selector():
    plugin = DesktopExecutionPlugin()
    envelope = _envelope("desktop.click", {"automation_id": "btnSubmit"})

    await plugin.validate(envelope)


@pytest.mark.asyncio
async def test_validate_rejects_missing_locator():
    plugin = DesktopExecutionPlugin()
    envelope = _envelope("desktop.click", {})

    with pytest.raises(PluginValidationError, match="selector"):
        await plugin.validate(envelope)


@pytest.mark.asyncio
async def test_validate_accepts_recorded_coordinates_without_locator():
    plugin = DesktopExecutionPlugin()
    envelope = _envelope("desktop.click", {"x": 104, "y": 56})

    await plugin.validate(envelope)


@pytest.mark.asyncio
async def test_validate_rejects_display_name_as_launch_app():
    plugin = DesktopExecutionPlugin()
    envelope = _envelope("desktop.launch", {"app": "Desktop App", "driver_type": "uia3"})

    with pytest.raises(PluginValidationError, match="executable path"):
        await plugin.validate(envelope)


@pytest.mark.asyncio
async def test_legacy_placeholder_launch_attaches_without_create_process_when_scoped():
    driver = _mock_driver()
    envelope = _envelope(
        "desktop.launch",
        {
            "app": "Desktop App",
            "driver_type": "uia3",
            "window_title": "Invoice",
            "attach_if_running": True,
        },
    )

    with patch("app.execution.plugins.desktop.plugin.get_driver", return_value=driver):
        plugin = DesktopExecutionPlugin()
        result = await plugin.execute(envelope)

    assert result.success is True
    driver.attach.assert_awaited_once_with(window_title="Invoice", process_name=None)
    driver.launch.assert_not_awaited()
    assert plugin._sessions["exec1"] is driver


@pytest.mark.asyncio
async def test_launch_uses_selected_driver_and_stores_session():
    driver = _mock_driver()
    envelope = _envelope(
        "desktop.launch",
        {"app": "calc.exe", "driver_type": "uia3", "args": ["/safe"], "timeout_ms": 30000},
    )

    with patch("app.execution.plugins.desktop.plugin.get_driver", return_value=driver) as factory:
        plugin = DesktopExecutionPlugin()
        result = await plugin.execute(envelope)

    assert result.success is True
    factory.assert_called_once()
    assert factory.call_args.args[0] == "uia3"
    driver.launch.assert_awaited_once_with("calc.exe", args=["/safe"], capabilities={})
    assert plugin._sessions["exec1"] is driver


@pytest.mark.asyncio
async def test_launch_attaches_to_existing_scoped_window_before_starting_new_process():
    driver = _mock_driver()
    envelope = _envelope(
        "desktop.launch",
        {
            "app": r"C:\Users\VAnand\AppData\Local\Programs\Microsoft VS Code\Code.exe",
            "driver_type": "uia3",
            "window_title": "Visual Studio Code",
            "process_name": "17880",
            "attach_if_running": True,
        },
    )

    with patch("app.execution.plugins.desktop.plugin.get_driver", return_value=driver):
        plugin = DesktopExecutionPlugin()
        result = await plugin.execute(envelope)

    assert result.success is True
    driver.attach.assert_awaited_once_with(window_title="Visual Studio Code", process_name=None)
    driver.launch.assert_not_awaited()
    assert plugin._sessions["exec1"] is driver


@pytest.mark.asyncio
async def test_launch_attaches_by_title_after_delegating_app_starts_without_window():
    driver = _mock_driver()
    driver.attach = AsyncMock(side_effect=[
        DriverResult(success=False, error="Window not found: Visual Studio Code"),
        DriverResult(success=True, metadata={"window_title": "settings.json - Visual Studio Code"}),
    ])
    driver.launch = AsyncMock(return_value=DriverResult(success=False, error="No windows for that process could be found"))
    envelope = _envelope(
        "desktop.launch",
        {
            "app": r"C:\Users\VAnand\AppData\Local\Programs\Microsoft VS Code\Code.exe",
            "driver_type": "uia3",
            "window_title": "Visual Studio Code",
            "attach_if_running": True,
            "timeout_ms": 3000,
        },
    )

    with patch("app.execution.plugins.desktop.plugin.get_driver", return_value=driver):
        plugin = DesktopExecutionPlugin()
        result = await plugin.execute(envelope)

    assert result.success is True
    driver.launch.assert_awaited_once()
    assert driver.attach.await_count == 2
    assert plugin._sessions["exec1"] is driver


@pytest.mark.asyncio
async def test_launch_waits_for_scoped_window_after_successful_start():
    driver = _mock_driver()
    driver.attach = AsyncMock(side_effect=[
        DriverResult(success=False, error="Window not found: IDE"),
        DriverResult(success=True, metadata={"window_title": "IntelliJ IDEA"}),
    ])
    driver.launch = AsyncMock(return_value=DriverResult(success=True, metadata={"window_title": "Splash"}))
    envelope = _envelope(
        "desktop.launch",
        {
            "app": r"C:\Users\VAnand\AppData\Local\JetBrains\IntelliJ IDEA Community Edition 2024.3.5\bin\idea64.exe",
            "driver_type": "uia3",
            "window_title": "IDE",
            "attach_if_running": True,
            "timeout_ms": 3000,
        },
    )

    with patch("app.execution.plugins.desktop.plugin.get_driver", return_value=driver):
        plugin = DesktopExecutionPlugin()
        result = await plugin.execute(envelope)

    assert result.success is True
    driver.launch.assert_awaited_once()
    assert driver.attach.await_count == 2
    assert plugin._sessions["exec1"] is driver


@pytest.mark.asyncio
async def test_click_reuses_session_and_passes_locator_candidates():
    driver = _mock_driver()
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope(
        "desktop.click",
        {
            "automation_id": "btnSubmit",
            "locators": [{"strategy": "name", "locator": "Submit", "confidence": 0.8}],
        },
    )

    result = await plugin.execute(envelope)

    assert result.success is True
    candidates = driver.click.await_args.args[0]
    assert candidates == [
        LocatorCandidate(strategy="accessibility_id", value="btnSubmit", confidence=1.0),
        LocatorCandidate(strategy="name", value="Submit", confidence=0.8),
    ]
    assert result.output["locator_attempts"][0]["rank"] == 1
    assert result.output["locator_attempts"][0]["strategy"] == "accessibility_id"


@pytest.mark.asyncio
async def test_locator_action_applies_window_scope_before_driver_action():
    driver = _mock_driver()
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope("desktop.click", {"automation_id": "btnSubmit", "window_title": "Invoice"})

    result = await plugin.execute(envelope)

    assert result.success is True
    driver.switch_window.assert_awaited_once_with(window_title="Invoice", process_name=None)
    driver.click.assert_awaited_once()


@pytest.mark.asyncio
async def test_click_marks_successful_fallback_for_healing_review():
    driver = _mock_driver()
    driver.click = AsyncMock(return_value=DriverResult(success=True, metadata={"strategy": "name", "value": "Submit"}))
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope(
        "desktop.click",
        {
            "automation_id": "btnSubmitOld",
            "locators": [{"strategy": "name", "locator": "Submit", "confidence": 0.88}],
        },
    )

    result = await plugin.execute(envelope)

    assert result.success is True
    assert result.output["successful_locator"]["strategy"] == "name"
    assert result.output["successful_locator"]["healed"] is True
    assert result.output["healing_suggestion_candidate"]["successful_locator"] == "Submit"
    assert result.output["locator_attempts"][1]["success"] is True


@pytest.mark.asyncio
async def test_click_falls_back_to_recorded_coordinates_when_locator_fails():
    driver = _mock_driver()
    driver.click = AsyncMock(return_value=DriverResult(success=False, error="Element not found for click"))
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope(
        "desktop.click",
        {
            "selector": "untitled2",
            "strategy": "name",
            "x": 104,
            "y": 56,
            "coordinate_fallback": True,
        },
    )

    result = await plugin.execute(envelope)

    assert result.success is True
    driver.click.assert_awaited_once()
    driver.click_coordinates.assert_awaited_once_with(104.0, 56.0, button="left")
    assert result.output["coordinate_fallback"] is True
    assert result.output["strategy"] == "coordinates"


@pytest.mark.asyncio
async def test_click_uses_nested_analog_point_when_top_level_coordinates_are_missing():
    driver = _mock_driver()
    driver.click = AsyncMock(return_value=DriverResult(success=False, error="Element not found for click"))
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope(
        "desktop.click",
        {
            "selector": "OwnerDrawnGrid",
            "strategy": "name",
            "analog": {"point": {"x": 310, "y": 440}, "low_level": True},
            "coordinate_fallback": True,
        },
    )

    result = await plugin.execute(envelope)

    assert result.success is True
    driver.click_coordinates.assert_awaited_once_with(310.0, 440.0, button="left")
    assert result.output["coordinate_fallback"] is True


@pytest.mark.asyncio
async def test_attach_creates_driver_session_without_launching_app():
    driver = _mock_driver()
    envelope = _envelope("desktop.attach", {"window_title": "Calculator", "driver_type": "uia3"})

    with patch("app.execution.plugins.desktop.plugin.get_driver", return_value=driver):
        plugin = DesktopExecutionPlugin()
        result = await plugin.execute(envelope)

    assert result.success is True
    driver.attach.assert_awaited_once_with(window_title="Calculator", process_name=None)
    driver.launch.assert_not_awaited()
    assert plugin._sessions["exec1"] is driver


@pytest.mark.asyncio
async def test_double_click_delegates_to_driver():
    driver = _mock_driver()
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope("desktop.double_click", {"automation_id": "btnSubmit"})

    result = await plugin.execute(envelope)

    assert result.success is True
    driver.double_click.assert_awaited_once()


@pytest.mark.asyncio
async def test_select_and_check_delegate_to_driver():
    driver = _mock_driver()
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver

    select_result = await plugin.execute(_envelope("desktop.select", {"automation_id": "country", "value": "India"}))
    check_result = await plugin.execute(_envelope("desktop.check", {"automation_id": "agree"}))

    assert select_result.success is True
    assert check_result.success is True
    driver.select.assert_awaited_once()
    driver.set_checked.assert_awaited_once()


@pytest.mark.asyncio
async def test_window_and_wait_nodes_delegate_to_driver():
    driver = _mock_driver()
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver

    activate = await plugin.execute(_envelope("desktop.activate_window", {"window_title": "Invoice"}))
    switch = await plugin.execute(_envelope("desktop.switch_window", {"window_title": "Invoice"}))
    wait_app = await plugin.execute(_envelope("desktop.wait_app", {"process_name": "invoice.exe"}))
    wait_window = await plugin.execute(_envelope("desktop.wait_window", {"window_title": "Invoice"}))

    assert activate.success is True
    assert switch.success is True
    assert wait_app.success is True
    assert wait_window.success is True
    driver.activate_window.assert_any_await("Invoice")
    driver.switch_window.assert_awaited_once_with(window_title="Invoice", process_name=None)
    driver.wait_app.assert_awaited_once()
    driver.wait_window.assert_awaited_once()


@pytest.mark.asyncio
async def test_core_uft_style_nodes_delegate_to_driver():
    driver = _mock_driver()
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver

    set_text = await plugin.execute(_envelope("desktop.set_text", {"automation_id": "customer", "value": "Anand"}))
    key_sequence = await plugin.execute(_envelope("desktop.key_sequence", {"keys": ["Tab", "Enter"]}))
    scroll = await plugin.execute(_envelope("desktop.scroll", {"delta": -3}))
    drag = await plugin.execute(_envelope(
        "desktop.drag_and_drop",
        {
            "source_selector": "Available",
            "source_strategy": "name",
            "target_selector": "Selected",
            "target_strategy": "name",
        },
    ))
    modal = await plugin.execute(_envelope("desktop.handle_modal", {"action": "accept"}))
    set_clipboard = await plugin.execute(_envelope("desktop.clipboard_set", {"value": "abc"}))
    get_clipboard = await plugin.execute(_envelope("desktop.clipboard_get", {"variable": "clip"}))

    assert all(result.success for result in (set_text, key_sequence, scroll, drag, modal, set_clipboard, get_clipboard))
    driver.set_text.assert_awaited_once()
    driver.key_sequence.assert_awaited_once_with(["Tab", "Enter"])
    driver.scroll.assert_awaited_once()
    source_candidates, target_candidates = driver.drag_and_drop.await_args.args[:2]
    assert source_candidates[0] == LocatorCandidate(strategy="name", value="Available", confidence=1.0)
    assert target_candidates[0] == LocatorCandidate(strategy="name", value="Selected", confidence=1.0)
    assert get_clipboard.output["clip"] == "Copied text"


@pytest.mark.asyncio
async def test_perceive_returns_ai_locator_candidates_and_artifacts():
    driver = _mock_driver()
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope("desktop.perceive", {"hint": "Save invoice", "include_screenshot": True})

    result = await plugin.execute(envelope)

    assert result.success is True
    assert result.output["candidate_count"] >= 1
    assert any(candidate["strategy"] == "accessibility_id" and candidate["locator"] == "btnSave" for candidate in result.output["candidates"])
    assert result.output["source_artifact_id"] == "source1"
    assert result.output["screenshot_artifact_id"] == "artifact1"


@pytest.mark.asyncio
async def test_recovery_handles_modal_and_retries_failed_step():
    driver = _mock_driver()
    driver.click = AsyncMock(side_effect=[
        DriverResult(success=False, error="popup blocked the target"),
        DriverResult(success=True, metadata={"strategy": "accessibility_id", "value": "btnSubmit"}),
    ])
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope("desktop.click", {"automation_id": "btnSubmit"})

    result = await plugin.execute(envelope)

    assert result.success is True
    assert result.output["recovery"]["plan"]["category"] == "unexpected_modal"
    assert result.output["recovery"]["recovered"] is True
    assert [action["type"] for action in result.output["recovery"]["actions"]] == [
        "capture_evidence",
        "handle_modal",
        "retry_step",
    ]
    driver.handle_modal.assert_awaited_once()
    assert driver.click.await_count == 2


@pytest.mark.asyncio
async def test_assert_property_reads_driver_property():
    driver = _mock_driver()
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope("desktop.assert_property", {"automation_id": "btnSubmit", "property": "name", "expected": "Submit"})

    result = await plugin.execute(envelope)

    assert result.success is True
    driver.get_property.assert_awaited_once()


@pytest.mark.asyncio
async def test_source_snapshot_records_ui_tree_artifact():
    driver = _mock_driver()
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope("desktop.source_snapshot", {"name": "source.xml"})

    result = await plugin.execute(envelope)

    assert result.success is True
    assert result.output["source_artifact_id"] == "source1"
    envelope.artifacts.record_text.assert_awaited_once()


@pytest.mark.asyncio
async def test_screenshot_records_artifact_from_driver():
    driver = _mock_driver()
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope("desktop.screenshot", {"name": "screen.png"})

    result = await plugin.execute(envelope)

    assert result.success is True
    assert result.output["screenshot_artifact_id"] == "artifact1"
    envelope.artifacts.record_bytes.assert_awaited_once()


@pytest.mark.asyncio
async def test_screenshot_records_crop_artifact_when_crop_box_present():
    Image = pytest.importorskip("PIL.Image")
    buffer = BytesIO()
    Image.new("RGB", (8, 8), "red").save(buffer, format="PNG")
    driver = _mock_driver()
    driver.screenshot = AsyncMock(return_value=DriverResult(success=True, screenshot_bytes=buffer.getvalue(), metadata={}))
    artifacts = MagicMock()
    artifacts.record_bytes = AsyncMock(side_effect=[
        MagicMock(id="full", size_bytes=len(buffer.getvalue())),
        MagicMock(id="crop", size_bytes=12),
    ])
    envelope = _envelope("desktop.screenshot", {"name": "screen.png", "crop_box": {"x": 1, "y": 2, "width": 3, "height": 4}})
    envelope.artifacts = artifacts
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver

    result = await plugin.execute(envelope)

    assert result.success is True
    assert result.output["screenshot_artifact_id"] == "full"
    assert result.output["crop_artifact_id"] == "crop"
    assert result.output["crop_box"] == {"x": 1, "y": 2, "width": 3, "height": 4}
    assert artifacts.record_bytes.await_count == 2


@pytest.mark.asyncio
async def test_enterprise_extension_pack_action_compiles_to_driver_primitive():
    driver = _mock_driver()
    plugin = DesktopExecutionPlugin()
    plugin._sessions["exec1"] = driver
    envelope = _envelope(
        "desktop.sap_action",
        {
            "extension_pack": "sap",
            "object_class": "GuiTextField",
            "action": "set_text",
            "automation_id": "usr/txtCustomer",
            "value": "Asha",
        },
    )

    result = await plugin.execute(envelope)

    assert result.success is True
    assert result.output["extension_pack"] == "sap"
    driver.set_text.assert_awaited_once()
