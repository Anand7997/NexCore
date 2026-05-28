import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.execution.plugins.desktop.drivers.base import LocatorCandidate
from app.execution.plugins.webdriver_client import WebDriverElement, WebDriverError


def _make_mock_client(session_id="sess1"):
    client = MagicMock()
    client.session_id = session_id
    client.start_session = AsyncMock(return_value=session_id)
    client.close = AsyncMock()
    client.find_element = AsyncMock()
    client.click = AsyncMock()
    client.pointer_action = AsyncMock()
    client.clear = AsyncMock()
    client.send_global_keys = AsyncMock()
    client.element_property = AsyncMock(return_value="")
    client.element_attribute = AsyncMock(return_value="")
    client.send_keys = AsyncMock()
    client.element_text = AsyncMock(return_value="")
    client.screenshot_png = AsyncMock(return_value=b"PNG")
    client.source = AsyncMock(return_value="<UITree/>")
    return client


@pytest.mark.asyncio
async def test_launch_creates_session_and_sets_default_caps():
    mock_client = _make_mock_client()
    with patch(
        "app.execution.plugins.desktop.drivers.winappdriver.WebDriverClient",
        return_value=mock_client,
    ):
        from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
        adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
        result = await adapter.launch("notepad.exe")

    assert result.success is True
    assert result.metadata["app"] == "notepad.exe"
    assert result.metadata["session_id"] == "sess1"
    caps = mock_client.start_session.call_args[0][0]
    assert caps["app"] == "notepad.exe"
    assert caps["platformName"] == "Windows"
    assert caps["deviceName"] == "WindowsPC"


@pytest.mark.asyncio
async def test_launch_preserves_extra_capabilities():
    mock_client = _make_mock_client()
    with patch(
        "app.execution.plugins.desktop.drivers.winappdriver.WebDriverClient",
        return_value=mock_client,
    ):
        from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
        adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
        result = await adapter.launch("app.exe", capabilities={"customCap": "val"})

    caps = mock_client.start_session.call_args[0][0]
    assert caps["customCap"] == "val"
    assert result.success is True


@pytest.mark.asyncio
async def test_launch_returns_failure_on_webdriver_error():
    mock_client = _make_mock_client()
    mock_client.start_session = AsyncMock(side_effect=WebDriverError("server down"))
    with patch(
        "app.execution.plugins.desktop.drivers.winappdriver.WebDriverClient",
        return_value=mock_client,
    ):
        from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
        adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
        result = await adapter.launch("app.exe")

    assert result.success is False
    assert "server down" in result.error


@pytest.mark.asyncio
async def test_click_finds_element_then_clicks():
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el1")
    mock_client.find_element = AsyncMock(return_value=mock_el)

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    candidates = [LocatorCandidate(strategy="accessibility_id", value="btn_ok")]
    result = await adapter.click(candidates)

    assert result.success is True
    mock_client.find_element.assert_called_once_with("accessibility id", "btn_ok")
    mock_client.click.assert_called_once_with(mock_el)


@pytest.mark.asyncio
async def test_click_falls_back_to_second_candidate():
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el2")
    mock_client.find_element = AsyncMock(
        side_effect=[WebDriverError("not found"), mock_el]
    )

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    candidates = [
        LocatorCandidate(strategy="accessibility_id", value="btn_ok"),
        LocatorCandidate(strategy="name", value="OK"),
    ]
    result = await adapter.click(candidates)

    assert result.success is True
    assert mock_client.find_element.call_count == 2
    assert result.metadata["strategy"] == "name"


@pytest.mark.asyncio
async def test_click_fails_when_all_candidates_fail():
    mock_client = _make_mock_client()
    mock_client.find_element = AsyncMock(side_effect=WebDriverError("not found"))

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    candidates = [LocatorCandidate(strategy="name", value="Ghost")]
    result = await adapter.click(candidates)

    assert result.success is False


@pytest.mark.asyncio
async def test_type_text_sends_keys():
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el3")
    mock_client.find_element = AsyncMock(return_value=mock_el)

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    candidates = [LocatorCandidate(strategy="name", value="name_input")]
    result = await adapter.type_text(candidates, "hello world")

    assert result.success is True
    mock_client.send_keys.assert_called_once_with(mock_el, "hello world")
    assert result.metadata["chars"] == 11


@pytest.mark.asyncio
async def test_double_click_uses_pointer_action():
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el6")
    mock_client.find_element = AsyncMock(return_value=mock_el)

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    result = await adapter.double_click([LocatorCandidate(strategy="accessibility_id", value="btn_ok")])

    assert result.success is True
    mock_client.pointer_action.assert_called_once_with(mock_el, kind="double_click")


@pytest.mark.asyncio
async def test_clear_text_calls_clear():
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el7")
    mock_client.find_element = AsyncMock(return_value=mock_el)

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    result = await adapter.clear_text([LocatorCandidate(strategy="name", value="Input")])

    assert result.success is True
    mock_client.clear.assert_called_once_with(mock_el)


@pytest.mark.asyncio
async def test_get_property_prefers_webdriver_property():
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el8")
    mock_client.find_element = AsyncMock(return_value=mock_el)
    mock_client.element_property = AsyncMock(return_value="Enabled")

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    result = await adapter.get_property([LocatorCandidate(strategy="name", value="Input")], "enabled")

    assert result.success is True
    assert result.value == "Enabled"
    mock_client.element_property.assert_called_once_with(mock_el, "enabled")


@pytest.mark.asyncio
async def test_get_text_returns_element_text():
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el4")
    mock_client.find_element = AsyncMock(return_value=mock_el)
    mock_client.element_text = AsyncMock(return_value="Invoice #42")

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    candidates = [LocatorCandidate(strategy="accessibility_id", value="invoice_lbl")]
    result = await adapter.get_text(candidates)

    assert result.success is True
    assert result.value == "Invoice #42"


@pytest.mark.asyncio
async def test_screenshot_returns_png_bytes():
    mock_client = _make_mock_client()
    mock_client.screenshot_png = AsyncMock(return_value=b"\x89PNG_DATA")

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    result = await adapter.screenshot()

    assert result.success is True
    assert result.screenshot_bytes == b"\x89PNG_DATA"


@pytest.mark.asyncio
async def test_get_ui_tree_returns_source():
    mock_client = _make_mock_client()
    mock_client.source = AsyncMock(return_value="<UITree><Button name='OK'/></UITree>")

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    result = await adapter.get_ui_tree()

    assert result.success is True
    assert "<Button" in result.ui_tree


@pytest.mark.asyncio
async def test_report_capabilities():
    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://192.168.1.1:4723")
    caps = await adapter.report_capabilities()

    assert caps["driver"] == "winappdriver"
    assert caps["requires_server"] is True
    assert caps["server_url"] == "http://192.168.1.1:4723"


@pytest.mark.asyncio
async def test_strategy_map_normalises_legacy_names():
    """accessibility id (with space) maps to the W3C strategy string."""
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el5")
    mock_client.find_element = AsyncMock(return_value=mock_el)

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    # legacy strategy string with space (from old plugin.py config)
    candidates = [LocatorCandidate(strategy="accessibility id", value="btn")]
    result = await adapter.click(candidates)

    assert result.success is True
    mock_client.find_element.assert_called_once_with("accessibility id", "btn")


@pytest.mark.asyncio
async def test_close_calls_client_close():
    mock_client = _make_mock_client()

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    result = await adapter.close()

    assert result.success is True
    mock_client.close.assert_called_once()
    assert adapter._client is None
