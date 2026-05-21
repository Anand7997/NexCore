"""Tests for workflow state machine transitions."""
import pytest

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
