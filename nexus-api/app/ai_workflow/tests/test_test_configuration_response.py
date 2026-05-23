"""Tests for test configuration response shaping."""

from types import SimpleNamespace
from datetime import datetime, timezone

from app.api.routes.test_configuration import _to_step_response


def test_step_response_includes_bound_page_element_xpath():
    step = SimpleNamespace(
        id="step-1",
        step_order=1,
        name="Click search",
        description="Click the search button",
        action_type="CLICK",
        intent="CLICK",
        page_id="page-1",
        page_element_id="el-1",
        api_endpoint_id=None,
        input_value="",
        assertion_type="",
        secondary_action="",
        secondary_value="",
        target="Search",
        expected_result="",
        test_data={},
        tags=[],
        bindings={"web": {"selector": "button.search"}},
        is_enabled=True,
        created_at=datetime(2026, 5, 23, tzinfo=timezone.utc),
        updated_at=datetime(2026, 5, 23, tzinfo=timezone.utc),
    )
    step.__dict__["page_element"] = SimpleNamespace(xpath="//button[@data-testid='search']")

    response = _to_step_response(step)

    assert response.xpath == "//button[@data-testid='search']"
    assert response.path_location == "//button[@data-testid='search']"
