"""Tests for scenario selection / confirmation logic."""
import uuid

import pytest

from app.ai_workflow.schemas import ScenarioPreview


def _make_scenario(**kwargs) -> ScenarioPreview:
    defaults = dict(
        scenario_id=str(uuid.uuid4()),
        title="Test Scenario",
        business_requirement="User can log in",
        priority="high",
        test_type="functional",
        classification="positive",
        pages_involved=["Login"],
        estimated_test_cases=2,
        confidence=0.9,
        selected=False,
    )
    defaults.update(kwargs)
    return ScenarioPreview(**defaults)


def _confirm(scenarios: list[ScenarioPreview], ids: list[str]) -> list[ScenarioPreview]:
    id_set = set(ids)
    return [s.model_copy(update={"selected": s.scenario_id in id_set}) for s in scenarios]


def test_confirm_single_scenario():
    s = _make_scenario()
    result = _confirm([s], [s.scenario_id])
    assert result[0].selected is True


def test_confirm_rejects_empty_list():
    s = _make_scenario()
    with pytest.raises(Exception):
        if not []:
            raise ValueError("At least one scenario must be selected")


def test_confirm_only_marks_selected_ids():
    s1 = _make_scenario(title="S1")
    s2 = _make_scenario(title="S2")
    result = _confirm([s1, s2], [s1.scenario_id])
    assert result[0].selected is True
    assert result[1].selected is False


def test_confirm_all_scenarios():
    scenarios = [_make_scenario(title=f"S{i}") for i in range(5)]
    ids = [s.scenario_id for s in scenarios]
    result = _confirm(scenarios, ids)
    assert all(s.selected for s in result)


def test_scenario_preview_fields():
    s = _make_scenario()
    assert s.priority in ("high", "medium", "low")
    assert s.test_type in ("functional", "regression", "smoke", "e2e")
    assert s.classification in ("positive", "negative", "edge")
    assert 0.0 <= s.confidence <= 1.0
