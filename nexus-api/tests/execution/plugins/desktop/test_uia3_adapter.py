import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from app.execution.plugins.desktop.drivers.base import LocatorCandidate


def _make_mock_pywinauto():
    """Return a fully mock pywinauto module."""
    pw = MagicMock()
    mock_app = MagicMock()
    mock_window = MagicMock()
    mock_window.window_text.return_value = "Notepad"
    mock_window.descendants.return_value = []
    mock_app.top_window.return_value = mock_window
    mock_app.start.return_value = mock_app
    mock_app.connect.return_value = mock_app
    mock_app.kill.return_value = None
    pw.Application.return_value = mock_app
    return pw, mock_app, mock_window


@pytest.mark.asyncio
async def test_launch_starts_application():
    pw, mock_app, mock_window = _make_mock_pywinauto()
    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        result = await adapter.launch("notepad.exe")

    assert result.success is True
    assert result.metadata["app"] == "notepad.exe"
    pw.Application.assert_called_with(backend="uia")


@pytest.mark.asyncio
async def test_launch_returns_failure_on_exception():
    pw, mock_app, _ = _make_mock_pywinauto()
    mock_app.start.side_effect = Exception("Access denied")
    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        result = await adapter.launch("locked.exe")

    assert result.success is False
    assert "Access denied" in result.error


@pytest.mark.asyncio
async def test_attach_by_title():
    pw, mock_app, mock_window = _make_mock_pywinauto()
    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        result = await adapter.attach(window_title="Notepad")

    assert result.success is True
    mock_app.connect.assert_called_once_with(title="Notepad")


@pytest.mark.asyncio
async def test_attach_requires_title_or_process():
    with patch.dict("sys.modules", {"pywinauto": MagicMock()}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        result = await adapter.attach()  # no title, no process

    assert result.success is False
    assert "required" in result.error.lower()


@pytest.mark.asyncio
async def test_find_element_by_automation_id():
    pw, mock_app, mock_window = _make_mock_pywinauto()
    mock_ctrl = MagicMock()
    mock_ctrl.exists.return_value = True
    mock_window.child_window.return_value = mock_ctrl

    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        adapter._app = mock_app
        adapter._top_window = mock_window

        candidates = [LocatorCandidate(strategy="accessibility_id", value="btn_submit")]
        result = await adapter.find_element(candidates)

    assert result.success is True
    mock_window.child_window.assert_called_once_with(auto_id="btn_submit")


@pytest.mark.asyncio
async def test_find_element_falls_back_to_second_candidate():
    pw, mock_app, mock_window = _make_mock_pywinauto()
    # first ctrl.exists() returns False, second returns True
    ctrl1 = MagicMock()
    ctrl1.exists.return_value = False
    ctrl2 = MagicMock()
    ctrl2.exists.return_value = True
    mock_window.child_window.side_effect = [ctrl1, ctrl2]

    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        adapter._app = mock_app
        adapter._top_window = mock_window

        candidates = [
            LocatorCandidate(strategy="accessibility_id", value="btn_x"),
            LocatorCandidate(strategy="name", value="Submit"),
        ]
        result = await adapter.find_element(candidates)

    assert result.success is True
    assert result.metadata["strategy"] == "name"


@pytest.mark.asyncio
async def test_find_element_fails_when_none_match():
    pw, mock_app, mock_window = _make_mock_pywinauto()
    ctrl = MagicMock()
    ctrl.exists.return_value = False
    mock_window.child_window.return_value = ctrl

    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        adapter._app = mock_app
        adapter._top_window = mock_window

        candidates = [LocatorCandidate(strategy="name", value="Ghost")]
        result = await adapter.find_element(candidates)

    assert result.success is False


@pytest.mark.asyncio
async def test_report_capabilities_no_server():
    with patch.dict("sys.modules", {"pywinauto": MagicMock()}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        caps = await adapter.report_capabilities()

    assert caps["driver"] == "uia3"
    assert caps["requires_server"] is False
    assert caps["platform"] == "windows"
    assert caps["backend"] == "pywinauto"


@pytest.mark.asyncio
async def test_close_kills_app():
    pw, mock_app, _ = _make_mock_pywinauto()
    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        adapter._app = mock_app

        result = await adapter.close()

    assert result.success is True
    mock_app.kill.assert_called_once()
    assert adapter._app is None
