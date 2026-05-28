from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api.routes.master_sheets import (
    MasterSheetPreviewRequest,
    _master_element_to_desktop_values,
    get_master_sheet_template,
    preview_master_sheet,
)
from app.execution.master_sheet import DesktopMasterSheet, normalise_master_sheet


@pytest.mark.asyncio
async def test_preview_master_sheet_returns_summary_and_valid_flag():
    response = await preview_master_sheet(
        MasterSheetPreviewRequest(
            master_sheet={
                "applications": {"invoice_app": {"application_path": r"C:\Apps\Invoice.exe"}},
                "elements": {"submit_button": {"automation_id": "btnSubmit", "control_type": "Button"}},
                "paths": {"export_folder": {"path": r"C:\Exports"}},
                "test_data": {"customer_name": "Asha Rao"},
            }
        )
    )

    assert response.valid is True
    assert response.summary["applications"] == 1
    assert response.summary["elements"] == 1
    assert response.normalized["elements"]["submit_button"]["automation_id"] == "btnSubmit"


@pytest.mark.asyncio
async def test_preview_master_sheet_surfaces_validation_errors():
    response = await preview_master_sheet(
        MasterSheetPreviewRequest(
            master_sheet={
                "applications": {"invoice_app": {"name": "Invoice"}},
                "elements": {"submit_button": {"name": "Submit"}},
            }
        )
    )

    assert response.valid is False
    assert any(issue.section == "applications" for issue in response.issues)
    assert any(issue.section == "elements" for issue in response.issues)


@pytest.mark.asyncio
async def test_preview_master_sheet_requires_input():
    with pytest.raises(HTTPException) as exc:
        await preview_master_sheet(MasterSheetPreviewRequest())

    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_master_sheet_template_contains_desktop_sections():
    response = await get_master_sheet_template()

    assert ".xlsx" in response.supported_extensions
    assert "applications" in response.template
    assert "elements" in response.template


def test_master_sheet_element_maps_to_desktop_repository_values():
    normalized = normalise_master_sheet({
        "applications": {
            "invoice_app": {
                "name": "Invoice App",
                "application_path": r"C:\Apps\Invoice.exe",
                "process_name": "Invoice.exe",
            }
        },
        "windows": {
            "invoice_main": {"title": "Invoice Manager"}
        },
        "elements": {
            "submit_button": {
                "name": "Submit",
                "application_key": "invoice_app",
                "window_key": "invoice_main",
                "control_type": "Button",
                "automation_id": "btnSubmit",
                "locator_strategy": "accessibility id",
            }
        },
    })
    sheet = DesktopMasterSheet(normalized, source="inline")

    values = _master_element_to_desktop_values(
        "submit_button",
        sheet.element("submit_button"),
        sheet,
        repository_scope="shared",
    )

    assert values["object_key"] == "submit_button"
    assert values["application"] == "Invoice App"
    assert values["application_path"] == r"C:\Apps\Invoice.exe"
    assert values["window"] == "Invoice Manager"
    assert values["automation_id"] == "btnSubmit"
    assert values["primary_locator"] == "btnSubmit"
    assert values["metadata"]["app_key"] == "invoice_app"
