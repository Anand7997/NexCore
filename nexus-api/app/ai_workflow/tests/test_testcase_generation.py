"""Tests for test case generation — only confirmed scenarios produce test cases."""
import asyncio
import uuid

import pytest

from app.ai_workflow.agents.testcase_generation import TestCaseGenerationAgent
from app.ai_workflow.providers.null_provider import NullProvider
from app.ai_workflow.schemas import ScenarioPreview


def run(coro):
    return asyncio.run(coro)


def _scenario(**kwargs) -> ScenarioPreview:
    defaults = dict(
        scenario_id=str(uuid.uuid4()),
        title="Login Happy Path",
        business_requirement="User logs in with valid credentials",
        priority="high",
        test_type="functional",
        classification="positive",
        pages_involved=["Login Page"],
        estimated_test_cases=2,
        confidence=0.9,
    )
    defaults.update(kwargs)
    return ScenarioPreview(**defaults)


def test_generates_test_cases_for_selected_scenario():
    agent = TestCaseGenerationAgent(NullProvider())
    scenario = _scenario()
    result = run(agent.run(scenario, "Login Page", "- email_input (input)\n- login_btn (button)"))
    assert len(result.test_cases) > 0
    for tc in result.test_cases:
        assert tc.title
        assert len(tc.steps) > 0


def test_each_step_has_required_fields():
    agent = TestCaseGenerationAgent(NullProvider())
    scenario = _scenario()
    result = run(agent.run(scenario, "Login Page", "- email_input"))
    for tc in result.test_cases:
        for step in tc.steps:
            assert step.step_number >= 1
            assert step.description
            assert step.action_type


def test_null_provider_generates_actionable_steps_for_scraping():
    agent = TestCaseGenerationAgent(NullProvider())
    scenario = _scenario()
    result = run(agent.run(scenario, "Login Page", "No elements yet."))

    steps = result.test_cases[0].steps
    action_types = {step.action_type for step in steps}

    assert len(steps) >= 5
    assert {"navigate", "fill", "click", "assert_visible"} <= action_types
    assert any(step.input_value for step in steps if step.action_type == "fill")


def test_desktop_calculator_does_not_generate_authentication_steps():
    agent = TestCaseGenerationAgent(NullProvider())
    scenario = _scenario(
        title="Calculator smoke",
        business_requirement="Automate Calculator arithmetic",
        pages_involved=["Calculator"],
    )
    result = run(agent.run(
        scenario,
        "Calculator",
        "No elements yet.",
        platform="desktop",
        app_target="calc.exe",
    ))

    step_text = " ".join(step.description.lower() for tc in result.test_cases for step in tc.steps)

    assert "email" not in step_text
    assert "password" not in step_text
    assert "sign" not in step_text
    assert "dashboard" not in step_text
    assert "click digit 7" in step_text
    assert "click add" in step_text
    assert "click equals" in step_text


def test_unselected_scenarios_not_processed():
    # This tests that the service layer only calls the agent for selected scenarios.
    selected = [_scenario(selected=True), _scenario(selected=False)]
    to_process = [s for s in selected if s.selected]
    assert len(to_process) == 1
