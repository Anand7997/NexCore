"""Tests for workflow state machine transitions."""
from types import SimpleNamespace

import pytest

from app.ai_workflow.service import _apply_rollback_fields, _rollback_stage_key
from app.ai_workflow.state import STATE_PROGRESS, WorkflowState


def test_all_states_have_progress():
    for state in WorkflowState:
        assert state in STATE_PROGRESS, f"{state} missing from STATE_PROGRESS"


def test_completed_is_100():
    assert STATE_PROGRESS[WorkflowState.COMPLETED] == 100


def test_failed_is_zero():
    assert STATE_PROGRESS[WorkflowState.FAILED] == 0


def test_progress_increases_through_happy_path():
    happy_path = [
        WorkflowState.CREATED,
        WorkflowState.PROJECT_READY,
        WorkflowState.MODULE_READY,
        WorkflowState.PAGE_CREATED,
        WorkflowState.DISCOVERY_RUNNING,
        WorkflowState.DISCOVERY_DONE,
        WorkflowState.LOCATORS_RANKED,
        WorkflowState.PAGE_SAVED,
        WorkflowState.SCENARIOS_GENERATING,
        WorkflowState.SCENARIOS_READY,
        WorkflowState.TESTCASES_GENERATING,
        WorkflowState.TESTCASES_READY,
        WorkflowState.REVIEW_READY,
        WorkflowState.COMPLETED,
    ]
    prev = -1
    for state in happy_path:
        current = STATE_PROGRESS[state]
        assert current > prev, f"{state} progress {current} not greater than {prev}"
        prev = current


def test_workflow_state_is_str_enum():
    assert WorkflowState.CREATED == "CREATED"
    assert WorkflowState("PAGE_SAVED") == WorkflowState.PAGE_SAVED


def test_awaiting_confirmation_same_progress_as_scenarios_ready():
    assert (
        STATE_PROGRESS[WorkflowState.AWAITING_CONFIRMATION]
        == STATE_PROGRESS[WorkflowState.SCENARIOS_READY]
    )


def _workflow_stub():
    return SimpleNamespace(
        state=WorkflowState.REVIEW_READY.value,
        progress_percent=96,
        current_message="Review ready",
        errors=["old error"],
        review_data={"workflow_id": "wf-1"},
        scenarios=[{"scenario_id": "s1", "selected": True}],
        testcases_created=3,
        teststeps_created=9,
        unmapped_steps=2,
        page_id="page-1",
        elements_saved=5,
        scraped_candidates=[{"candidate_id": "c1"}],
        selected_elements=[{"candidate_id": "c1"}],
        low_confidence_locators=1,
        activity_log=[],
    )


def test_rollback_to_testcases_keeps_scenarios_and_clears_downstream_artifacts():
    wf = _workflow_stub()

    target_state = _apply_rollback_fields(wf, "testcases")

    assert target_state == WorkflowState.AWAITING_CONFIRMATION
    assert wf.state == WorkflowState.AWAITING_CONFIRMATION.value
    assert wf.scenarios == [{"scenario_id": "s1", "selected": True}]
    assert wf.testcases_created == 0
    assert wf.teststeps_created == 0
    assert wf.page_id is None
    assert wf.scraped_candidates == []
    assert wf.selected_elements == []
    assert wf.review_data == {}
    assert wf.current_message.startswith("Rolled back to pipeline stage: testcases")


def test_rollback_to_scrape_keeps_scraped_candidates_but_clears_selected_elements():
    wf = _workflow_stub()

    target_state = _apply_rollback_fields(wf, "scrape")

    assert target_state == WorkflowState.DISCOVERY_DONE
    assert wf.page_id == "page-1"
    assert wf.scraped_candidates == [{"candidate_id": "c1"}]
    assert wf.selected_elements == []
    assert wf.elements_saved == 0
    assert wf.testcases_created == 3
    assert wf.teststeps_created == 9


def test_unknown_rollback_stage_is_rejected():
    with pytest.raises(ValueError, match="Unknown workflow rollback stage"):
        _rollback_stage_key("review")
