import pytest
from unittest.mock import AsyncMock, MagicMock

from app.execution.plugins.desktop.drivers import AutoDesktopDriver, get_driver
from app.execution.plugins.desktop.drivers.base import DriverResult, LocatorCandidate
from app.execution.plugins.desktop.drivers.computer_vision import ComputerVisionAdapter
from app.execution.plugins.desktop.drivers.uia3 import UIA3Adapter
from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter


def test_get_driver_winappdriver():
    driver = get_driver("winappdriver", server_url="http://localhost:4723", timeout=12)

    assert isinstance(driver, WinAppDriverAdapter)
    assert driver._server_url == "http://localhost:4723"
    assert driver._timeout == 12


def test_get_driver_uia3():
    assert isinstance(get_driver("uia3"), UIA3Adapter)


def test_get_driver_computer_vision():
    assert isinstance(get_driver("computer_vision"), ComputerVisionAdapter)


def test_get_driver_auto():
    assert isinstance(get_driver("auto"), AutoDesktopDriver)


def test_get_driver_unknown_raises():
    with pytest.raises(ValueError, match="Unsupported desktop driver_type"):
        get_driver("alien_driver")


@pytest.mark.asyncio
async def test_auto_driver_launch_tries_until_success_then_delegates_to_active():
    fail_driver = MagicMock()
    fail_driver.launch = AsyncMock(return_value=DriverResult(success=False, error="server down"))

    ok_driver = MagicMock()
    ok_driver.launch = AsyncMock(return_value=DriverResult(success=True, metadata={}))
    ok_driver.report_capabilities = AsyncMock(return_value={"driver": "uia3"})
    ok_driver.click = AsyncMock(return_value=DriverResult(success=True, metadata={"clicked": True}))

    driver = AutoDesktopDriver()
    driver._drivers = [fail_driver, ok_driver]

    launch_result = await driver.launch("calc.exe")
    click_result = await driver.click([LocatorCandidate(strategy="name", value="OK")])

    assert launch_result.success is True
    assert launch_result.metadata["driver_type"] == "uia3"
    assert click_result.success is True
    fail_driver.launch.assert_awaited_once()
    ok_driver.launch.assert_awaited_once()
    ok_driver.click.assert_awaited_once()

