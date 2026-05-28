from app.execution.plugins.desktop.perception import DesktopPerceptionService


def test_perception_extracts_ranked_uia_candidates():
    service = DesktopPerceptionService()
    candidates = service.analyze(
        ui_tree='<Button AutomationId="btnSubmit" Name="Submit invoice" ClassName="Button"/>',
        hint="submit invoice",
    )

    payload = [candidate.as_dict() for candidate in candidates]

    assert payload[0]["strategy"] == "accessibility_id"
    assert payload[0]["locator"] == "btnSubmit"
    assert any(item["strategy"] == "name" and item["locator"] == "Submit invoice" for item in payload)


def test_perception_extracts_ocr_candidates_with_hint_filtering():
    service = DesktopPerceptionService()
    candidates = service.analyze(
        ocr_text="Cancel\nCreate Customer\nStatus",
        hint="Create Customer",
    )

    payload = [candidate.as_dict() for candidate in candidates]

    assert payload[0]["strategy"] == "ocr"
    assert payload[0]["locator"] == "Create Customer"
    assert payload[0]["confidence"] > 0.6


def test_perception_accepts_visual_template_candidate():
    service = DesktopPerceptionService()
    candidates = service.analyze(visual_template="templates/save-button.png")

    assert candidates[0].strategy == "visual"
    assert candidates[0].value == "templates/save-button.png"
    assert candidates[0].confidence >= 0.7
