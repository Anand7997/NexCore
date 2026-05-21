"""Tests for unmapped step fallback — missing elements mark steps as needs_review."""
import pytest

from app.ai_workflow.agents.teststep_binding import TestStepBindingAgent
from app.ai_workflow.schemas import GeneratedTestCase, GeneratedTestStep


def _make_step(n: int, desc: str) -> GeneratedTestStep:
    return GeneratedTestStep(
        step_number=n,
        description=desc,
        action_type="click",
        confidence=0.9,
    )


def _make_case(steps: list[GeneratedTestStep]) -> GeneratedTestCase:
    return GeneratedTestCase(
        title="Test Case",
        description="A test case",
        test_type="functional",
        priority="medium",
        steps=steps,
    )


def test_matched_step_is_not_needs_review():
    binder = TestStepBindingAgent()
    step = _make_step(1, "Click login button")
    tc = _make_case([step])
    elements = [{"id": "el-001", "name": "login button"}]
    result = binder.bind(tc, "page-001", elements)
    assert result.steps[0].needs_review is False
    assert result.steps[0].page_element_id == "el-001"


def test_unmatched_step_is_needs_review():
    binder = TestStepBindingAgent()
    step = _make_step(1, "Click the nonexistent widget XYZ")
    tc = _make_case([step])
    elements = [{"id": "el-001", "name": "login button"}]
    result = binder.bind(tc, "page-001", elements)
    assert result.steps[0].needs_review is True
    assert result.steps[0].review_reason == "element not found in page repository"
    assert result.steps[0].page_element_id is None


def test_empty_elements_list_marks_all_needs_review():
    binder = TestStepBindingAgent()
    steps = [_make_step(i, f"Step {i}") for i in range(1, 4)]
    tc = _make_case(steps)
    result = binder.bind(tc, "page-001", [])
    assert all(s.needs_review for s in result.steps)


def test_page_id_always_set():
    binder = TestStepBindingAgent()
    step = _make_step(1, "Some step")
    tc = _make_case([step])
    result = binder.bind(tc, "page-999", [])
    assert result.steps[0].page_id == "page-999"


def test_review_reason_is_element_not_found():
    binder = TestStepBindingAgent()
    step = _make_step(1, "Completely unrelated action zzz")
    tc = _make_case([step])
    result = binder.bind(tc, "page-001", [{"id": "el-1", "name": "submit"}])
    if result.steps[0].needs_review:
        assert "element not found" in result.steps[0].review_reason
