"""Tests for AI workflow element binding quality and data hints."""

from app.ai_workflow.schemas import GeneratedTestStep
from app.ai_workflow.service import (
    _build_step_bindings,
    _infer_workflow_action,
    _score_candidate,
    _step_configured_input_value,
    _workflow_action_to_test_config,
)
from app.page_discovery.locators import ElementDiscoveryAgent


def test_discovery_infers_date_format_from_placeholder():
    agent = ElementDiscoveryAgent()
    [element] = agent.process_elements([
        {
            "tag": "input",
            "attributes": {
                "id": "dob",
                "name": "dateOfBirth",
                "placeholder": "DD MMM YYYY",
                "xpath": "//*[@id='dob']",
                "css_path": "#dob",
                "visible": True,
                "enabled": True,
            },
            "roles": ["textbox"],
            "visible": True,
            "enabled": True,
            "match_count_id": 1,
            "match_count_css": 1,
            "match_count_xpath": 1,
        }
    ])

    assert element.test_data_hints["data_type"] == "date"
    assert element.test_data_hints["date_format"] == "dd mmm yyyy"
    assert element.test_data_hints["sample_value"] == "10 Feb 2000"


def test_date_step_scores_date_candidate_above_generic_text_candidate():
    step = GeneratedTestStep(
        step_number=1,
        description="Enter passenger date of birth",
        action_type="fill",
    )
    date_candidate = {
        "name": "Date of birth",
        "description": "",
        "element_type": "input",
        "input_type": "date",
        "placeholder": "YYYY-MM-DD",
        "test_data_hints": {
            "data_type": "date",
            "date_format": "yyyy-mm-dd",
            "sample_value": "2000-02-10",
        },
        "locator_strategy": "id",
        "best_locator": "#dob",
        "confidence_score": 0.95,
        "locator_quality": 0.92,
    }
    text_candidate = {
        "name": "Passenger name",
        "description": "",
        "element_type": "input",
        "input_type": "text",
        "placeholder": "Name",
        "test_data_hints": {"data_type": "text", "sample_value": "test data"},
        "locator_strategy": "id",
        "best_locator": "#name",
        "confidence_score": 0.95,
        "locator_quality": 0.92,
    }

    assert _score_candidate(step, date_candidate) > _score_candidate(step, text_candidate)


def test_step_input_value_uses_scraped_sample_value_when_ai_left_blank():
    step = GeneratedTestStep(
        step_number=1,
        description="Enter travel date",
        action_type="fill",
    )
    element = {
        "element_type": "input",
        "test_data_hints": {
            "data_type": "date",
            "date_format": "dd ddd yyyy",
            "sample_value": "10 Thu 2000",
        },
    }

    assert _step_configured_input_value(step, element) == "10 Thu 2000"


def test_select_trip_type_radio_is_configured_as_human_click():
    step = GeneratedTestStep(
        step_number=1,
        description="Select one-way trip type",
        action_type="select",
    )
    element = {
        "element_id": "trip-one-way",
        "name": "One way",
        "element_type": "radio",
        "best_locator": "[data-testid='one-way']",
        "confidence_score": 0.9,
    }

    assert _infer_workflow_action(step, "radio") == "click"
    assert _workflow_action_to_test_config("click", element) == "RADIO_BUTTON"


def test_dropdown_select_keeps_value_in_web_binding():
    step = GeneratedTestStep(
        step_number=1,
        description="Select cabin class",
        action_type="select",
        input_value="Economy",
    )
    element = {
        "element_id": "cabin-class",
        "name": "Cabin class",
        "element_type": "select",
        "best_locator": "#cabin",
        "confidence_score": 0.9,
    }

    bindings = _build_step_bindings(
        page_id="page-1",
        page_name="Flights",
        step=step,
        element=element,
    )

    assert bindings["web"]["action_type"] == "SELECT"
    assert bindings["web"]["value"] == "Economy"


def test_navigate_step_uses_real_page_url_over_ai_placeholder():
    step = GeneratedTestStep(
        step_number=1,
        description="Navigate to the checkout page",
        action_type="navigate",
        input_value="https://example.com",
    )
    real_url = "https://payments.example-bank.test/checkout"

    bindings = _build_step_bindings(
        page_id="page-1",
        page_name="Checkout",
        page_url=real_url,
        step=step,
        element=None,
    )

    assert _step_configured_input_value(step, None, page_url=real_url) == real_url
    assert bindings["web"]["action_type"] == "NAVIGATE_TO_URL"
    assert bindings["web"]["value"] == real_url
    assert bindings["web"]["url"] == real_url
