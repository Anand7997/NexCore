"""Tests for smart_identification historical success boost + relative anchor scoring."""
from __future__ import annotations

import pytest

from app.execution.plugins.desktop.smart_identification import (
    STRATEGY_WEIGHTS,
    anchor_relative_boost,
    historical_success_boost,
    record_locator_success,
    seed_success_registry,
    rank_locator_candidates,
    explain_locator_candidates,
    _SUCCESS_REGISTRY,
    _TOTAL_REGISTRY,
)

CANDIDATES = [
    {"strategy": "accessibility_id", "locator": "btnOK"},
    {"strategy": "name", "locator": "OK"},
    {"strategy": "xpath", "locator": "//Button[@AutomationId='btnOK']"},
    {"strategy": "ocr", "locator": "OK"},
]


def _clear_registry() -> None:
    _SUCCESS_REGISTRY.clear()
    _TOTAL_REGISTRY.clear()


# ── historical_success_boost ──────────────────────────────────────────────────

def test_boost_zero_with_no_history():
    _clear_registry()
    assert historical_success_boost("obj1", "accessibility_id", "btnOK") == 0.0


def test_boost_positive_after_success():
    _clear_registry()
    record_locator_success("obj1", "accessibility_id", "btnOK", succeeded=True)
    boost = historical_success_boost("obj1", "accessibility_id", "btnOK")
    assert boost > 0.0
    assert boost <= 0.12


def test_boost_capped_at_max_boost():
    _clear_registry()
    for _ in range(50):
        record_locator_success("obj2", "name", "Submit", succeeded=True)
    boost = historical_success_boost("obj2", "name", "Submit", max_boost=0.12)
    assert boost <= 0.12


def test_failure_does_not_boost():
    _clear_registry()
    record_locator_success("obj3", "xpath", "//Button", succeeded=False)
    boost = historical_success_boost("obj3", "xpath", "//Button")
    assert boost == 0.0


def test_partial_success_rate_reduces_boost():
    _clear_registry()
    for _ in range(5):
        record_locator_success("obj4", "ocr", "Save", succeeded=True)
    for _ in range(5):
        record_locator_success("obj4", "ocr", "Save", succeeded=False)
    boost = historical_success_boost("obj4", "ocr", "Save", max_boost=0.12)
    assert 0.0 < boost < 0.12


# ── seed_success_registry ─────────────────────────────────────────────────────

def test_seed_success_registry():
    _clear_registry()
    records = [
        {"object_key": "obj5", "strategy": "name", "locator_value": "Cancel", "healed": False},
        {"object_key": "obj5", "strategy": "name", "locator_value": "Cancel", "healed": False},
    ]
    seed_success_registry(records)
    boost = historical_success_boost("obj5", "name", "Cancel")
    assert boost > 0.0


def test_seed_skips_records_without_required_fields():
    _clear_registry()
    records = [
        {"object_key": "obj6", "strategy": "name"},  # missing locator_value
        {},  # empty
    ]
    seed_success_registry(records)  # should not raise
    assert historical_success_boost("obj6", "name", "anything") == 0.0


# ── anchor_relative_boost ─────────────────────────────────────────────────────

def test_anchor_boost_with_matching_automation_id():
    candidate = {"strategy": "accessibility_id", "locator": "btnOK", "automation_id": "panelMain_btnOK"}
    boost = anchor_relative_boost(candidate, anchor_automation_id="panelMain")
    assert boost > 0.0


def test_anchor_boost_zero_when_no_match():
    candidate = {"strategy": "name", "locator": "OK"}
    boost = anchor_relative_boost(candidate, anchor_automation_id="panelUnrelated")
    assert boost == 0.0


def test_anchor_boost_uses_name_fallback():
    candidate = {"strategy": "name", "locator": "btnOK_GroupBox"}
    boost = anchor_relative_boost(candidate, anchor_name="GroupBox")
    assert boost > 0.0


# ── rank_locator_candidates ───────────────────────────────────────────────────

def test_rank_without_history_uses_strategy_weights():
    _clear_registry()
    ranked = rank_locator_candidates(CANDIDATES)
    assert len(ranked) == len(CANDIDATES)
    # accessibility_id has highest weight — should be first
    assert ranked[0].strategy == "accessibility_id"


def test_rank_with_history_boosts_lower_weight_strategy():
    _clear_registry()
    for _ in range(20):
        record_locator_success("elem1", "name", "OK", succeeded=True)
    ranked = rank_locator_candidates(CANDIDATES, object_key="elem1")
    # name should move up compared to its default weight
    name_rank = next(i for i, r in enumerate(ranked) if r.strategy == "name")
    assert name_rank <= 1  # either first or second


def test_rank_returns_all_candidates():
    _clear_registry()
    ranked = rank_locator_candidates(CANDIDATES)
    assert {r.strategy for r in ranked} == {c["strategy"] for c in CANDIDATES}


# ── explain_locator_candidates ────────────────────────────────────────────────

def test_explain_includes_score_and_reason():
    _clear_registry()
    explanation = explain_locator_candidates(CANDIDATES[:2])
    assert len(explanation) == 2
    for item in explanation:
        assert "score" in item
        assert "reason" in item
        assert item["score"] >= 0.0


def test_explain_includes_hist_boost_when_present():
    _clear_registry()
    record_locator_success("obj7", "accessibility_id", "btnOK", succeeded=True)
    explanation = explain_locator_candidates(
        [{"strategy": "accessibility_id", "locator": "btnOK"}],
        object_key="obj7",
    )
    assert "hist_boost" in explanation[0].get("reason", "")
