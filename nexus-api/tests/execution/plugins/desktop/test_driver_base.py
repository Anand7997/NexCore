import pytest
from app.execution.plugins.desktop.drivers.base import (
    DesktopDriver,
    DriverResult,
    LocatorCandidate,
)


def test_driver_result_minimal():
    r = DriverResult(success=True)
    assert r.value is None
    assert r.screenshot_bytes is None
    assert r.ui_tree is None
    assert r.error is None
    assert r.metadata == {}


def test_driver_result_failure():
    r = DriverResult(success=False, error="connection refused", metadata={"attempt": 1})
    assert r.success is False
    assert r.error == "connection refused"
    assert r.metadata["attempt"] == 1


def test_driver_result_with_screenshot():
    r = DriverResult(success=True, screenshot_bytes=b"PNG", ui_tree="<root/>")
    assert r.screenshot_bytes == b"PNG"
    assert r.ui_tree == "<root/>"


def test_locator_candidate_default_confidence():
    c = LocatorCandidate(strategy="accessibility_id", value="btn_ok")
    assert c.confidence == 1.0


def test_locator_candidate_low_confidence():
    c = LocatorCandidate(strategy="ocr", value="Submit", confidence=0.75)
    assert c.strategy == "ocr"
    assert c.value == "Submit"
    assert c.confidence == 0.75


def test_desktop_driver_is_abstract():
    with pytest.raises(TypeError):
        DesktopDriver()


def test_desktop_driver_subclass_must_implement_all_methods():
    """A partial subclass with only some methods raises TypeError on instantiation."""

    class PartialDriver(DesktopDriver):
        async def launch(self, app_path, args=None, capabilities=None):
            pass

    with pytest.raises(TypeError):
        PartialDriver()
