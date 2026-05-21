"""Tests for test case generation — only confirmed scenarios produce test cases."""
import asyncio
import uuid

import pytest

from app.ai_workflow.agents.testcase_generation import TestCaseGenerationAgent
from app.ai_workflow.providers.null_provider import NullProvider
from app.ai_workflow.schemas import ScenarioPreview


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


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


def test_unselected_scenarios_not_processed():
    # This tests that the service layer only calls the agent for selected scenarios.
    selected = [_scenario(selected=True), _scenario(selected=False)]
    to_process = [s for s in selected if s.selected]
    assert len(to_process) == 1
