"""Tests for AI workflow element binding quality and data hints."""

import asyncio
from types import SimpleNamespace

from app.ai_workflow.schemas import GeneratedTestCase, GeneratedTestStep, StepElementBindingDecision
from app.ai_workflow.service import (
    _bind_cases_with_ai_decisions,
    _build_step_scrape_intents,
    _build_step_bindings,
    _candidate_discovery_metadata,
    _candidate_locator_paths,
    _enhance_scraped_candidates_with_ai,
    _infer_workflow_action,
    _page_element_to_saved_candidate,
    _select_candidates_from_binding_decisions,
    _score_candidate,
    _step_binding_decision_prompt,
    _step_configured_input_value,
    _target_scraped_candidates_for_steps,
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


def test_build_step_scrape_intents_excludes_navigation_and_keeps_targets():
    test_case = GeneratedTestCase(
        title="Create Project",
        description="Create Project",
        steps=[
            GeneratedTestStep(step_number=1, description="Launch IntelliJ", action_type="navigate"),
            GeneratedTestStep(step_number=2, description="Enter project name", action_type="fill"),
            GeneratedTestStep(step_number=3, description="Click Create project", action_type="click"),
        ],
    )

    intents = _build_step_scrape_intents([test_case])

    assert [intent["step_number"] for intent in intents] == [2, 3]
    assert intents[0]["action_type"] == "fill"
    assert "project name" in intents[0]["target_hint"]
    assert intents[1]["action_type"] == "click"
    assert "create project" in intents[1]["target_hint"]


def test_target_scraped_candidates_for_steps_keeps_step_needed_objects_only():
    test_case = GeneratedTestCase(
        title="Create Project",
        description="Create Project",
        steps=[
            GeneratedTestStep(step_number=1, description="Launch IntelliJ", action_type="navigate"),
            GeneratedTestStep(step_number=2, description="Enter project name", action_type="fill"),
            GeneratedTestStep(step_number=3, description="Click Create project", action_type="click"),
        ],
    )
    candidates = [
        {
            "candidate_id": "project-name",
            "name": "Project Name",
            "element_type": "edit",
            "best_locator": "txtProjectName",
            "locator_strategy": "accessibility id",
            "automation_id": "txtProjectName",
            "id_attr": "txtProjectName",
            "name_text": "Project Name",
            "xpath": "/Window/Edit[@AutomationId='txtProjectName']",
            "confidence_score": 1.0,
            "locator_quality": 0.95,
            "tags": ["desktop"],
        },
        {
            "candidate_id": "create-button",
            "name": "Create",
            "element_type": "button",
            "best_locator": "btnCreate",
            "locator_strategy": "accessibility id",
            "automation_id": "btnCreate",
            "id_attr": "btnCreate",
            "name_text": "Create",
            "xpath": "/Window/Button[@AutomationId='btnCreate']",
            "confidence_score": 1.0,
            "locator_quality": 0.95,
            "tags": ["desktop"],
        },
        {
            "candidate_id": "help-button",
            "name": "Help",
            "element_type": "button",
            "best_locator": "btnHelp",
            "locator_strategy": "accessibility id",
            "automation_id": "btnHelp",
            "id_attr": "btnHelp",
            "name_text": "Help",
            "xpath": "/Window/Button[@AutomationId='btnHelp']",
            "confidence_score": 1.0,
            "locator_quality": 0.95,
            "tags": ["desktop"],
        },
    ]

    targeted = _target_scraped_candidates_for_steps([test_case], candidates)
    targeted_ids = {candidate["candidate_id"] for candidate in targeted}

    assert targeted_ids == {"project-name", "create-button"}
    assert all("step-targeted-scrape" in candidate["tags"] for candidate in targeted)
    assert all(candidate["test_data_hints"]["scrape_scope"] == "generated_step_intents" for candidate in targeted)

def test_desktop_binding_preserves_automation_id_and_fallback_bundle():
    step = GeneratedTestStep(
        step_number=1,
        description="Click submit invoice",
        action_type="click",
    )
    element = {
        "element_id": "element-1",
        "name": "Submit Invoice",
        "element_type": "button",
        "locator_strategy": "accessibility id",
        "best_locator": "btnSubmit",
        "xpath": "/Window/Button[@AutomationId='btnSubmit']",
        "id_attr": "btnSubmit",
        "automation_id": "btnSubmit",
        "name_text": "Submit Invoice",
        "object_key": "submit_invoice_button",
        "locator_context": {
            "parent_chain": ["Invoice"],
            "nearby_siblings": ["Customer Name"],
            "children": [],
        },
        "alternative_locators": [
            {"strategy": "accessibility id", "locator": "btnSubmit", "score": 1.0},
            {"strategy": "name", "locator": "Submit Invoice", "score": 0.86},
            {
                "strategy": "relative",
                "locator": "near('Customer Name') -> button[Name='Submit Invoice']",
                "score": 0.62,
            },
        ],
        "discovery_metadata": {
            "platform": "desktop",
            "object_key": "submit_invoice_button",
            "automation_id": "btnSubmit",
            "name_text": "Submit Invoice",
            "locator_context": {"nearby_siblings": ["Customer Name"]},
        },
    }

    bindings = _build_step_bindings(
        page_id="page-1",
        page_name="Invoice",
        step=step,
        element=element,
        platform="desktop",
    )

    desktop = bindings["desktop"]
    assert desktop["page"] == "Invoice"
    assert desktop["page_id"] == "page-1"
    assert desktop["driver_type"] == "uia3"
    assert desktop["automation_id"] == "btnSubmit"
    assert desktop["selector"] == "btnSubmit"
    assert desktop["object_key"] == "submit_invoice_button"
    assert desktop["locators"][1]["strategy"] == "name"
    assert desktop["locator_paths"] == desktop["locators"]
    assert desktop["locator_context"]["nearby_siblings"] == ["Customer Name"]
    assert desktop["requires_object_configuration"] is False


def test_candidate_locator_paths_save_all_desktop_paths():
    paths = _candidate_locator_paths({
        "locator_strategy": "accessibility id",
        "best_locator": "btnSubmit",
        "xpath": "/Window/Button[@AutomationId='btnSubmit']",
        "css_selector": "Button",
        "automation_id": "btnSubmit",
        "name_text": "Submit Invoice",
        "class_name": "Button",
        "confidence_score": 1.0,
        "alternative_locators": [
            {"strategy": "relative", "locator": "near('Customer Name') -> Button", "score": 0.62},
        ],
    })

    assert {
        (path["strategy"], path["locator"])
        for path in paths
    } >= {
        ("accessibility id", "btnSubmit"),
        ("automation id", "btnSubmit"),
        ("xpath", "/Window/Button[@AutomationId='btnSubmit']"),
        ("name", "Submit Invoice"),
        ("class name", "Button"),
        ("relative", "near('Customer Name') -> Button"),
    }


def test_candidate_locator_paths_keeps_three_healing_alternatives_for_sparse_web_candidate():
    paths = _candidate_locator_paths({
        "locator_strategy": "css",
        "best_locator": "#email",
        "css_selector": "#email",
        "id_attr": "email",
        "name_attr": "email",
        "label": "Email Address",
        "element_type": "input",
        "confidence_score": 0.91,
        "alternative_locators": [],
    })

    pairs = {(path["strategy"], path["locator"]) for path in paths}

    assert len(paths) >= 3
    assert ("css", "#email") in pairs
    assert ("id", "email") in pairs
    assert ("xpath", "//*[@id='email']") in pairs
    assert "accessibility id" not in {path["strategy"] for path in paths}


def test_candidate_locator_paths_keeps_three_healing_alternatives_for_sparse_desktop_candidate():
    paths = _candidate_locator_paths({
        "tags": ["desktop"],
        "locator_strategy": "name",
        "best_locator": "Run",
        "name": "Run",
        "element_type": "button",
        "class_name": "Button",
        "confidence_score": 0.84,
        "locator_context": {"parent_chain": ["Main Toolbar"]},
        "alternative_locators": [],
    })

    pairs = {(path["strategy"], path["locator"]) for path in paths}

    assert len(paths) >= 3
    assert ("name", "Run") in pairs
    assert ("uia", "Button[Name='Run']") in pairs
    assert ("relative", "Main Toolbar -> Button[Name='Run']") in pairs


def test_candidate_locator_paths_adds_class_and_parent_fallbacks_for_desktop_uid_path():
    paths = _candidate_locator_paths({
        "tags": ["desktop"],
        "locator_strategy": "xpath",
        "best_locator": "/Window/Pane/Button[3]",
        "xpath": "/Window/Pane/Button[3]",
        "element_type": "button",
        "class_name": "Button",
        "confidence_score": 0.74,
        "locator_context": {
            "parent_chain": ["IntelliJ IDEA", "Project Wizard"],
            "bounding_box": {"x": 100, "y": 200, "width": 80, "height": 24},
        },
        "alternative_locators": [],
    })

    pairs = {(path["strategy"], path["locator"]) for path in paths}

    assert len(paths) >= 3
    assert ("xpath", "/Window/Pane/Button[3]") in pairs
    assert ("class name", "Button") in pairs
    assert ("uia", "Button[ClassName='Button']") in pairs
    assert any(path["strategy"] == "relative" for path in paths)


def test_desktop_candidate_metadata_marks_desktop_mcp_source():
    metadata = _candidate_discovery_metadata(
        workflow_id="wf-1",
        candidate={
            "candidate_id": "scraped-1",
            "tags": ["desktop"],
            "best_locator": "btnSubmit",
            "xpath": "/Window/Button",
            "element_type": "button",
            "object_key": "submit_button",
            "automation_id": "btnSubmit",
            "locator_context": {"parent_chain": ["Invoice"]},
        },
    )

    assert metadata["source"] == "desktop_mcp_ai_workflow"
    assert metadata["candidate_id"] == "scraped-1"
    assert metadata["platform"] == "desktop"
    assert metadata["object_key"] == "submit_button"
    assert metadata["automation_id"] == "btnSubmit"
    assert metadata["locator_context"]["parent_chain"] == ["Invoice"]
    assert metadata["locator_paths"][0]["locator"] == "btnSubmit"


def test_page_repository_candidate_fetch_shape_preserves_ai_binding_key():
    element = SimpleNamespace(
        id="element-1",
        name="Submit Invoice",
        element_type="button",
        description="",
        locator_strategy="accessibility id",
        xpath="/Window/Button[@AutomationId='btnSubmit']",
        css_selector="Button",
        id_attr="btnSubmit",
        name_attr="Submit Invoice",
        confidence_score=0.94,
        alternative_locators=[
            {"strategy": "accessibility id", "locator": "btnSubmit", "score": 1.0},
            {"strategy": "name", "locator": "Submit Invoice", "score": 0.86},
        ],
        tags=["desktop", "ai-selected"],
        discovery_metadata={
            "workflow_id": "wf-1",
            "candidate_id": "scraped-9",
            "platform": "desktop",
            "object_key": "submit_invoice_button",
            "automation_id": "btnSubmit",
            "name_text": "Submit Invoice",
            "primary_locator": "btnSubmit",
            "locator_context": {"parent_chain": ["Invoice"]},
            "test_data_hints": {"input_type": "button"},
            "matched_steps": ["Create invoice: step 3"],
        },
    )

    saved = _page_element_to_saved_candidate(element)

    assert saved["candidate_id"] == "scraped-9"
    assert saved["element_id"] == "element-1"
    assert saved["automation_id"] == "btnSubmit"
    assert saved["object_key"] == "submit_invoice_button"
    assert saved["locator_paths"][0]["locator"] == "btnSubmit"
    assert saved["matched_steps"] == ["Create invoice: step 3"]


def test_ai_binding_decision_selects_candidate_and_refines_step_value():
    test_case = GeneratedTestCase(
        title="Create invoice",
        description="Create invoice",
        steps=[
            GeneratedTestStep(
                step_number=1,
                description="Enter customer name",
                action_type="click",
            )
        ],
    )
    customer_field = {
        "candidate_id": "scraped-1",
        "element_id": "element-1",
        "name": "Customer Name",
        "element_type": "edit",
        "best_locator": "txtCustomerName",
        "locator_strategy": "accessibility id",
        "automation_id": "txtCustomerName",
        "id_attr": "txtCustomerName",
        "alternative_locators": [{"strategy": "accessibility id", "locator": "txtCustomerName"}],
        "test_data_hints": {"sample_value": "Asha Rao", "input_type": "edit"},
        "tags": ["desktop"],
    }
    unrelated_button = {
        "candidate_id": "scraped-2",
        "element_id": "element-2",
        "name": "Submit",
        "element_type": "button",
        "best_locator": "btnSubmit",
        "tags": ["desktop"],
    }
    decisions = [
        StepElementBindingDecision(
            test_case_title="Create invoice",
            step_number=1,
            candidate_id="scraped-1",
            action_type="fill",
            input_value="Asha Rao",
            confidence=0.93,
            reason="Customer Name is the matching edit field",
        )
    ]

    selected = _select_candidates_from_binding_decisions(
        [test_case],
        [customer_field, unrelated_button],
        decisions,
    )
    bound = _bind_cases_with_ai_decisions(
        [test_case],
        "page-1",
        [{**customer_field, "locator_paths": customer_field["alternative_locators"]}],
        decisions,
    )

    assert {candidate["candidate_id"] for candidate in selected} == {"scraped-1"}
    step = bound[0].steps[0]
    assert step.page_element_id == "element-1"
    assert step.action_type == "fill"
    assert step.input_value == "Asha Rao"
    assert step.confidence == 0.93


def test_ai_needs_review_decision_with_saved_candidate_is_still_configured():
    test_case = GeneratedTestCase(
        title="Create invoice",
        description="Create invoice",
        steps=[
            GeneratedTestStep(
                step_number=1,
                description="Click Submit Invoice",
                action_type="click",
            )
        ],
    )
    submit_button = {
        "candidate_id": "scraped-9",
        "element_id": "element-9",
        "name": "Submit Invoice",
        "element_type": "button",
        "best_locator": "btnSubmit",
        "locator_strategy": "accessibility id",
        "automation_id": "btnSubmit",
        "confidence_score": 0.94,
        "locator_quality": 0.9,
    }
    decisions = [
        StepElementBindingDecision(
            test_case_title="Create invoice",
            step_number=1,
            candidate_id="scraped-9",
            action_type="click",
            confidence=0.41,
            needs_review=True,
            reason="AI selected the button but requested review",
        )
    ]

    bound = _bind_cases_with_ai_decisions([test_case], "page-1", [submit_button], decisions)

    step = bound[0].steps[0]
    assert step.page_element_id == "element-9"
    assert step.action_type == "click"
    assert step.needs_review is False
    assert step.review_reason is None


def test_ai_needs_review_decision_falls_back_to_step_targeted_saved_element():
    test_case = GeneratedTestCase(
        title="Dashboard navigation",
        description="Navigate from dashboard",
        steps=[
            GeneratedTestStep(
                step_number=2,
                description="Click Contacts from the dashboard navigation",
                action_type="click",
            )
        ],
    )
    contacts_button = {
        "candidate_id": "scraped-contacts",
        "element_id": "element-contacts",
        "name": "Unrelated button text",
        "element_type": "button",
        "best_locator": "contacts-button",
        "xpath": "//button[@data-nav='contacts']",
        "confidence_score": 0.1,
        "locator_quality": 0.1,
        "test_data_hints": {
            "targeted_steps": ["Dashboard navigation: step 2"],
        },
    }
    decisions = [
        StepElementBindingDecision(
            test_case_title="Dashboard navigation",
            step_number=2,
            candidate_id=None,
            action_type="click",
            confidence=0.1,
            needs_review=True,
            reason="AI could not match this step",
        )
    ]

    bound = _bind_cases_with_ai_decisions([test_case], "page-1", [contacts_button], decisions)

    step = bound[0].steps[0]
    assert step.page_element_id == "element-contacts"
    assert step.action_type == "click"
    assert step.needs_review is False
    assert step.review_reason is None
    assert step.confidence >= 0.72

def test_ai_needs_review_navigation_step_is_still_configured_without_element():
    test_case = GeneratedTestCase(
        title="Open dashboard",
        description="Open dashboard",
        steps=[
            GeneratedTestStep(
                step_number=1,
                description="Navigate to the dashboard URL",
                action_type="navigate",
                input_value="https://example.test/dashboard",
            )
        ],
    )
    decisions = [
        StepElementBindingDecision(
            test_case_title="Open dashboard",
            step_number=1,
            candidate_id=None,
            action_type="navigate",
            confidence=0.05,
            needs_review=True,
            reason="No UI element is needed for navigation",
        )
    ]

    bound = _bind_cases_with_ai_decisions([test_case], "page-1", [], decisions)

    step = bound[0].steps[0]
    assert step.page_id == "page-1"
    assert step.page_element_id is None
    assert step.action_type == "navigate"
    assert step.needs_review is False
    assert step.review_reason is None

def test_ai_binding_prompt_includes_testcase_and_step_descriptions():
    test_case = GeneratedTestCase(
        title="Create invoice",
        description="Validate customer invoice creation including final submit",
        steps=[
            GeneratedTestStep(
                step_number=1,
                description="Enter customer name",
                action_type="fill",
            ),
        ],
    )
    candidate = {
        "candidate_id": "customer-name",
        "name": "Customer Name",
        "element_type": "edit",
        "best_locator": "txtCustomerName",
        "locator_strategy": "accessibility id",
        "automation_id": "txtCustomerName",
        "tags": ["desktop"],
    }

    prompt = _step_binding_decision_prompt(
        test_cases=[test_case],
        candidates=[candidate],
        platform="desktop",
        page_name="Invoice",
    )

    assert "test_case_description" in prompt
    assert "Validate customer invoice creation including final submit" in prompt
    assert "Enter customer name" in prompt
    assert "Read test_case_description together with the step description" in prompt


def test_desktop_selection_does_not_collapse_many_steps_to_one_ai_candidate():
    test_case = GeneratedTestCase(
        title="Create IntelliJ Project",
        description="Create IntelliJ Project",
        steps=[
            GeneratedTestStep(step_number=1, description="Launch IntelliJ", action_type="navigate"),
            GeneratedTestStep(step_number=2, description="Enter project name", action_type="fill"),
            GeneratedTestStep(step_number=3, description="Click Create project", action_type="click"),
            GeneratedTestStep(step_number=4, description="Open Settings", action_type="click"),
        ],
    )
    candidates = [
        {
            "candidate_id": "window",
            "name": "IntelliJ IDEA",
            "element_type": "window",
            "best_locator": "/Window[@Name='IntelliJ IDEA']",
            "locator_strategy": "xpath",
            "xpath": "/Window[@Name='IntelliJ IDEA']",
            "name_text": "IntelliJ IDEA",
            "confidence_score": 0.9,
            "locator_quality": 0.8,
            "tags": ["desktop"],
        },
        {
            "candidate_id": "project-name",
            "name": "Project name",
            "element_type": "edit",
            "best_locator": "txtProjectName",
            "locator_strategy": "accessibility id",
            "automation_id": "txtProjectName",
            "id_attr": "txtProjectName",
            "name_text": "Project name",
            "xpath": "/Window/Edit[@AutomationId='txtProjectName']",
            "confidence_score": 1.0,
            "locator_quality": 0.95,
            "tags": ["desktop"],
        },
        {
            "candidate_id": "create-button",
            "name": "Create",
            "element_type": "button",
            "best_locator": "btnCreate",
            "locator_strategy": "accessibility id",
            "automation_id": "btnCreate",
            "id_attr": "btnCreate",
            "name_text": "Create",
            "xpath": "/Window/Button[@AutomationId='btnCreate']",
            "confidence_score": 1.0,
            "locator_quality": 0.95,
            "tags": ["desktop"],
        },
        {
            "candidate_id": "settings",
            "name": "Settings",
            "element_type": "menuitem",
            "best_locator": "Settings",
            "locator_strategy": "name",
            "name_text": "Settings",
            "xpath": "/Window/MenuItem[@Name='Settings']",
            "confidence_score": 0.86,
            "locator_quality": 0.8,
            "tags": ["desktop"],
        },
    ]
    decisions = [
        StepElementBindingDecision(
            test_case_title="Create IntelliJ Project",
            step_number=2,
            candidate_id="window",
            action_type="fill",
            confidence=0.9,
            reason="Overly broad AI match",
        )
    ]

    selected = _select_candidates_from_binding_decisions([test_case], candidates, decisions)
    selected_ids = {candidate["candidate_id"] for candidate in selected}

    assert {"project-name", "create-button", "settings"} <= selected_ids
    assert len(selected_ids) > 1


def test_desktop_selection_prefetches_stable_uid_candidates_for_sparse_steps():
    test_case = GeneratedTestCase(
        title="Sparse Desktop Smoke",
        description="Sparse Desktop Smoke",
        steps=[
            GeneratedTestStep(step_number=1, description="Click the primary action", action_type="click"),
        ],
    )
    candidates = [
        {
            "candidate_id": f"button-{index}",
            "name": f"Action {index}",
            "element_type": "button",
            "best_locator": f"btnAction{index}",
            "locator_strategy": "accessibility id",
            "automation_id": f"btnAction{index}",
            "id_attr": f"btnAction{index}",
            "name_text": f"Action {index}",
            "xpath": f"/Window/Button[@AutomationId='btnAction{index}']",
            "confidence_score": 1.0,
            "locator_quality": 0.95,
            "tags": ["desktop"],
        }
        for index in range(1, 6)
    ]

    selected = _select_candidates_from_binding_decisions([test_case], candidates, [])
    selected_ids = {candidate["candidate_id"] for candidate in selected}

    assert len(selected_ids) >= 5
    assert all(candidate_id in selected_ids for candidate_id in {f"button-{index}" for index in range(1, 6)})


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


class _LocatorEnhancementProvider:
    async def generate(self, prompt, schema):
        return schema(items=[{
            "candidate_id": "scraped-1",
            "recommended_strategy": "xpath",
            "recommended_locator": '//label[contains(normalize-space(.), "Email")]/following::input[1]',
            "locator_order": ["testid", "role", "css", "xpath"],
            "rationale": "Label-relative XPath is verified and more stable than the absolute path.",
        }])


def test_ai_locator_enhancement_promotes_verified_relative_xpath_and_keeps_fallbacks():
    candidates = [{
        "candidate_id": "scraped-1",
        "name": "Email",
        "element_type": "input",
        "locator_strategy": "css",
        "best_locator": "#customerEmail",
        "xpath": "/html/body/main/form/input[1]",
        "css_selector": "#customerEmail",
        "confidence_score": 0.92,
        "locator_quality": 0.91,
        "alternative_locators": [
            {"strategy": "css", "locator": "#customerEmail", "verified": True, "element_count": 1, "score": 0.88},
            {
                "strategy": "xpath",
                "locator": '//label[contains(normalize-space(.), "Email")]/following::input[1]',
                "verified": True,
                "element_count": 1,
                "score": 0.86,
            },
            {"strategy": "xpath", "locator": "/html/body/main/form/input[1]", "verified": True, "element_count": 1, "score": 0.2},
        ],
        "tags": [],
    }]

    [enhanced] = asyncio.run(
        _enhance_scraped_candidates_with_ai(
            _LocatorEnhancementProvider(),
            "gpt-5.5",
            candidates,
        )
    )

    assert enhanced["locator_strategy"] == "xpath"
    assert enhanced["best_locator"] == '//label[contains(normalize-space(.), "Email")]/following::input[1]'
    assert enhanced["xpath"] == '//label[contains(normalize-space(.), "Email")]/following::input[1]'
    assert enhanced["alternative_locators"][0]["locator"] == enhanced["best_locator"]
    assert "/html/body/main/form/input[1]" in {
        locator["locator"] for locator in enhanced["alternative_locators"]
    }
    assert enhanced["ai_locator_model"] == "gpt-5.5"
    assert "ai-locator-ranked" in enhanced["tags"]
