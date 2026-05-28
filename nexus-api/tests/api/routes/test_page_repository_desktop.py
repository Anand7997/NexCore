from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.api.routes.page_repository import (
    _apply_element_to_test_step,
    _changed_fields,
    _desktop_object_impact_reasons,
    _desktop_object_locator_profile,
    _desktop_object_response,
    _desktop_object_snapshot,
    _desktop_healing_suggestion_preview,
    _impact_step_response,
)


def _desktop_page():
    return SimpleNamespace(
        id="page1",
        name="Invoice App",
        url_pattern=r"C:\Apps\Invoice.exe",
        platform="desktop",
    )


def _desktop_element():
    now = datetime.now(UTC)
    return SimpleNamespace(
        id="element1",
        page_id="page1",
        name="Submit Invoice",
        element_type="button",
        description="",
        xpath="/Window/Button[1]",
        css_selector="Button",
        id_attr="btnSubmitInvoice",
        name_attr="Submit Invoice",
        locator_strategy="accessibility id",
        tags=["desktop-object"],
        confidence_score=0.96,
        alternative_locators=[{"strategy": "name", "locator": "Submit"}],
        source_url="",
        last_verified_at=None,
        discovery_metadata={
            "platform": "desktop",
            "object_key": "submit_invoice_button",
            "application": "Invoice App",
            "application_path": r"C:\Apps\Invoice.exe",
            "repository_scope": "shared",
            "window": "Main",
            "screen": "Invoice",
            "ai_label": "submit button",
        },
        created_at=now,
        updated_at=now,
    )


def test_apply_desktop_repository_element_updates_desktop_bindings():
    step = SimpleNamespace(
        test_data={},
        bindings={"web": {"selector": "#old-web-selector"}},
        page_id=None,
        page_element_id=None,
        target="",
    )

    _apply_element_to_test_step(step, _desktop_page(), _desktop_element())

    assert step.page_id == "page1"
    assert step.page_element_id == "element1"
    assert step.target == "Submit Invoice"
    assert "web" not in step.bindings
    assert step.bindings["desktop"]["object_key"] == "submit_invoice_button"
    assert step.bindings["desktop"]["automation_id"] == "btnSubmitInvoice"
    assert step.bindings["desktop"]["uia_path"] == "/Window/Button[1]"
    assert step.bindings["desktop"]["window"] == "Main"
    assert step.test_data["platform"] == "desktop"
    assert step.test_data["path_location"] == "btnSubmitInvoice"


def test_desktop_object_response_exposes_uft_style_metadata():
    response = _desktop_object_response(_desktop_page(), _desktop_element())

    assert response.object_key == "submit_invoice_button"
    assert response.application == "Invoice App"
    assert response.application_path == r"C:\Apps\Invoice.exe"
    assert response.control_type == "button"
    assert response.automation_id == "btnSubmitInvoice"
    assert response.uia_path == "/Window/Button[1]"
    assert response.window == "Main"
    assert response.screen == "Invoice"
    assert response.ai_label == "submit button"
    assert response.alternative_locators[0]["strategy"] == "accessibility id"


def test_desktop_object_impact_reasons_match_repository_bindings():
    step = SimpleNamespace(
        id="step1",
        test_case_id="case1",
        step_order=3,
        name="Click submit",
        action_type="click",
        intent="",
        target="Submit Invoice",
        is_enabled=True,
        page_id="page1",
        page_element_id="element1",
        test_data={"object_key": "submit_invoice_button", "automation_id": "btnSubmitInvoice"},
        bindings={
            "desktop": {
                "object_key": "submit_invoice_button",
                "automation_id": "btnSubmitInvoice",
                "selector": "btnSubmitInvoice",
            }
        },
        test_case=SimpleNamespace(
            id="case1",
            name="Invoice flow",
            project_id="project1",
            module=SimpleNamespace(
                id="module1",
                name="Invoice module",
                project=SimpleNamespace(id="project1", name="Billing"),
            ),
        ),
    )

    reasons = _desktop_object_impact_reasons(step, _desktop_page(), _desktop_element())
    response = _impact_step_response(step, _desktop_page(), _desktop_element())

    assert "linked_page_element" in reasons
    assert "desktop_binding_object_key" in reasons
    assert "test_data_object_key" in reasons
    assert response.risk == "high"
    assert response.project_name == "Billing"
    assert response.current_locator == "btnSubmitInvoice"


def test_desktop_object_snapshot_and_diff_capture_locator_changes():
    before = _desktop_object_snapshot(_desktop_page(), _desktop_element())
    updated = _desktop_element()
    updated.id_attr = "btnSubmitInvoiceV2"
    updated.discovery_metadata = {**updated.discovery_metadata, "primary_locator": "btnSubmitInvoiceV2"}
    after = _desktop_object_snapshot(_desktop_page(), updated)

    changed = _changed_fields(before, after)

    assert before["automation_id"] == "btnSubmitInvoice"
    assert after["automation_id"] == "btnSubmitInvoiceV2"
    assert "automation_id" in changed
    assert "primary_locator" in changed


def test_desktop_object_locator_profile_flags_stale_weak_object():
    element = _desktop_element()
    element.id_attr = ""
    element.xpath = ""
    element.name_attr = ""
    element.locator_strategy = "class name"
    element.confidence_score = 0.61
    history = [
        SimpleNamespace(changed_fields=["automation_id"], created_at=datetime.now(UTC)),
        SimpleNamespace(changed_fields=["primary_locator"], created_at=datetime.now(UTC)),
        SimpleNamespace(changed_fields=["uia_path"], created_at=datetime.now(UTC)),
    ]

    profile = _desktop_object_locator_profile(_desktop_page(), element, history)

    assert profile.stale is True
    assert profile.stability_score < 0.68
    assert profile.locator_change_count == 3
    assert "Automation ID is missing." in profile.stale_reasons
    assert any("Automation ID" in suggestion for suggestion in profile.suggestions)


def test_desktop_object_locator_profile_scores_automation_id_as_strong():
    profile = _desktop_object_locator_profile(_desktop_page(), _desktop_element(), [])

    assert profile.stale is False
    assert profile.stability_score >= 0.85
    assert profile.candidates[0].strategy == "accessibility id"
    assert profile.candidates[0].strength == "strong"


def test_desktop_healing_suggestion_preview_promotes_new_deterministic_locator():
    element = _desktop_element()
    element.id_attr = "btnSubmitInvoiceOld"
    attempts = [
        {"strategy": "accessibility_id", "value": "btnSubmitInvoiceV2", "confidence": 0.93, "success": True},
    ]

    suggestion = _desktop_healing_suggestion_preview(
        _desktop_page(),
        element,
        attempts,
        source="smart_identification",
    )

    assert suggestion is not None
    assert suggestion["suggested_strategy"] == "accessibility id"
    assert suggestion["suggested_field"] == "automation_id"
    assert suggestion["preview_update"]["automation_id"] == "btnSubmitInvoiceV2"
    assert suggestion["preview_update"]["primary_locator"] == "btnSubmitInvoiceV2"
    assert suggestion["preview_update"]["alternative_locators"][-1]["verified"] is True


def test_desktop_healing_suggestion_preview_ignores_existing_locator():
    attempts = [
        {"strategy": "name", "value": "Submit", "confidence": 0.9, "success": True},
    ]

    suggestion = _desktop_healing_suggestion_preview(_desktop_page(), _desktop_element(), attempts)

    assert suggestion is None


def test_desktop_healing_suggestion_preview_rejects_low_confidence_match():
    attempts = [
        {"strategy": "ocr", "value": "Submit Invoice", "confidence": 0.4, "success": True},
    ]

    suggestion = _desktop_healing_suggestion_preview(
        _desktop_page(),
        _desktop_element(),
        attempts,
        min_confidence=0.65,
    )

    assert suggestion is None
