import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.execution.plugin import ExecutionEnvelope, PluginValidationError
from app.execution.plugins.mobile.plugin import MobileExecutionPlugin
from app.execution.plugins.webdriver_client import WebDriverElement
from app.orchestration.context import ExecutionContext


def _mock_session():
    session = MagicMock()
    session.session_id = "sess1"
    session.find_element = AsyncMock(return_value=WebDriverElement("el1"))
    session.click = AsyncMock()
    session.send_keys = AsyncMock()
    session.element_text = AsyncMock(return_value="Ready")
    session.element_displayed = AsyncMock(return_value=True)
    session.screenshot_png = AsyncMock(return_value=b"PNG")
    session.source = AsyncMock(return_value="<hierarchy/>")
    session.close = AsyncMock()
    return session


def _envelope(node_type: str, config: dict):
    artifacts = MagicMock()
    artifacts.record_bytes = AsyncMock(return_value=MagicMock(id="artifact1", size_bytes=3))
    artifacts.record_text = AsyncMock(return_value=MagicMock(id="source1", size_bytes=12))
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


def _seed(plugin: MobileExecutionPlugin, session, platform: str = "android"):
    plugin._sessions[("exec1", platform)] = session


# ── Node specs / contract ───────────────────────────────────────────────────

def test_node_specs_include_select_option_and_assert_visible():
    plugin = MobileExecutionPlugin()
    specs = {spec.type: spec for spec in plugin.node_specs()}

    # These two node types are advertised by the Nest intent registry
    # (form.select -> mobile.select_option, ui.assert_visible -> mobile.assert_visible)
    # and must have matching handlers on the Python side.
    assert "mobile.select_option" in specs
    assert "mobile.assert_visible" in specs
    assert "value" in specs["mobile.select_option"].config_schema
    assert "selector" in specs["mobile.assert_visible"].config_schema


def test_advertised_node_types_all_have_handlers():
    plugin = MobileExecutionPlugin()
    handlers = MobileExecutionPlugin._handlers()
    for spec in plugin.node_specs():
        assert spec.type in handlers, f"{spec.type} has no handler"


# ── Validation ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_validate_rejects_missing_selector_for_assert_visible():
    plugin = MobileExecutionPlugin()
    with pytest.raises(PluginValidationError, match="selector"):
        await plugin.validate(_envelope("mobile.assert_visible", {}))


@pytest.mark.asyncio
async def test_validate_rejects_missing_selector_for_select_option():
    plugin = MobileExecutionPlugin()
    with pytest.raises(PluginValidationError, match="selector"):
        await plugin.validate(_envelope("mobile.select_option", {"value": "India"}))


@pytest.mark.asyncio
async def test_validate_rejects_missing_value_for_select_option():
    plugin = MobileExecutionPlugin()
    with pytest.raises(PluginValidationError, match="value"):
        await plugin.validate(_envelope("mobile.select_option", {"selector": "country"}))


@pytest.mark.asyncio
async def test_validate_accepts_well_formed_nodes():
    plugin = MobileExecutionPlugin()
    await plugin.validate(_envelope("mobile.assert_visible", {"selector": "title"}))
    await plugin.validate(_envelope("mobile.select_option", {"selector": "country", "value": "India"}))


# ── assert_visible ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_assert_visible_passes_when_element_displayed():
    session = _mock_session()
    session.element_displayed = AsyncMock(return_value=True)
    plugin = MobileExecutionPlugin()
    _seed(plugin, session)

    result = await plugin.execute(_envelope("mobile.assert_visible", {"selector": "title"}))

    assert result.success is True
    assert result.output["visible"] is True
    session.element_displayed.assert_awaited_once()


@pytest.mark.asyncio
async def test_assert_visible_fails_when_element_not_displayed():
    session = _mock_session()
    session.element_displayed = AsyncMock(return_value=False)
    plugin = MobileExecutionPlugin()
    _seed(plugin, session)

    result = await plugin.execute(_envelope("mobile.assert_visible", {"selector": "title"}))

    assert result.success is False
    assert "not displayed" in (result.error or "")


# ── select_option ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_select_option_taps_control_then_option_with_android_default_locator():
    session = _mock_session()
    plugin = MobileExecutionPlugin()
    _seed(plugin, session, "android")

    result = await plugin.execute(
        _envelope("mobile.select_option", {"selector": "country", "value": "India", "platform": "android"})
    )

    assert result.success is True
    # control opened, then option tapped
    assert session.click.await_count == 2
    # option located via android uiautomator text selector
    strategy, selector = session.find_element.await_args_list[-1].args
    assert strategy == "-android uiautomator"
    assert 'text("India")' in selector
    assert result.output["value"] == "India"


@pytest.mark.asyncio
async def test_select_option_uses_explicit_option_selector_when_provided():
    session = _mock_session()
    plugin = MobileExecutionPlugin()
    _seed(plugin, session, "android")

    result = await plugin.execute(
        _envelope(
            "mobile.select_option",
            {
                "selector": "country",
                "value": "India",
                "option_selector": "//android.widget.TextView[@text='India']",
                "option_strategy": "xpath",
            },
        )
    )

    assert result.success is True
    strategy, selector = session.find_element.await_args_list[-1].args
    assert strategy == "xpath"
    assert selector == "//android.widget.TextView[@text='India']"


@pytest.mark.asyncio
async def test_select_option_uses_ios_predicate_default_locator():
    session = _mock_session()
    plugin = MobileExecutionPlugin()
    _seed(plugin, session, "ios")

    result = await plugin.execute(
        _envelope("mobile.select_option", {"selector": "picker", "value": "Blue", "platform": "ios"})
    )

    assert result.success is True
    strategy, selector = session.find_element.await_args_list[-1].args
    assert strategy == "-ios predicate string"
    assert '"Blue"' in selector
