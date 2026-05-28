from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.routes.desktop_spy import DesktopSpyRequest, snapshot_desktop_objects
from app.execution.plugins.desktop.drivers.base import DriverResult


def _driver():
    driver = MagicMock()
    driver.attach = AsyncMock(return_value=DriverResult(success=True, metadata={"window_title": "Invoice"}))
    driver.launch = AsyncMock(return_value=DriverResult(success=True, metadata={"app": "invoice.exe"}))
    driver.screenshot = AsyncMock(return_value=DriverResult(success=True, screenshot_bytes=b"PNG"))
    driver.get_ui_tree = AsyncMock(return_value=DriverResult(
        success=True,
        ui_tree='<UITree><control type="Button" name="Submit" auto_id="btnSubmit" /></UITree>',
    ))
    driver.report_capabilities = AsyncMock(return_value={"driver": "uia3", "platform": "windows"})
    driver.close = AsyncMock(return_value=DriverResult(success=True))
    return driver


@pytest.mark.asyncio
async def test_snapshot_desktop_objects_attaches_and_parses_candidates():
    driver = _driver()

    with patch("app.api.routes.desktop_spy.get_driver", return_value=driver):
        response = await snapshot_desktop_objects(DesktopSpyRequest(window_title="Invoice", include_screenshot=True))

    assert response.driver == "uia3"
    assert response.attached is True
    assert response.screenshot_base64 == "UE5H"
    assert response.screenshot_size_bytes == 3
    assert response.candidates[0].automation_id == "btnSubmit"
    driver.attach.assert_awaited_once_with(window_title="Invoice", process_name=None)
    driver.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_snapshot_desktop_objects_requires_target():
    with pytest.raises(HTTPException) as exc:
        await snapshot_desktop_objects(DesktopSpyRequest())

    assert exc.value.status_code == 400
