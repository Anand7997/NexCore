"""Tests for enhanced recovery: fallback chains, quarantine, configurable rules."""
from __future__ import annotations

import pytest

from app.execution.plugins.desktop.recovery import (
    RecoveryPlan,
    classify_desktop_failure,
    recovery_plan_for_error,
    build_custom_rule,
    DEFAULT_RECOVERY_RULES,
)


# ── classify_desktop_failure ──────────────────────────────────────────────────

@pytest.mark.parametrize("error,expected", [
    ("Element not found: btnOK", "object_not_found"),
    ("window not found: Main Window", "window_not_found"),
    ("Session deleted: the browser has closed", "app_crash"),
    ("unexpected modal dialog blocked interaction", "unexpected_modal"),
    ("auth_prompt detected on screen", "auth_prompt"),
    ("expected 'Success' but got 'Error'", "assertion_failed"),
    ("Permission denied: C:\\app.exe", "environment_error"),
    ("totally unrelated error text xyz", "unknown"),
])
def test_classify_failure(error: str, expected: str) -> None:
    assert classify_desktop_failure(error) == expected


def test_classify_window_not_found_from_element_error():
    assert classify_desktop_failure("window not found when locating element") == "window_not_found"


# ── recovery_plan_for_error ───────────────────────────────────────────────────

def test_default_object_not_found_is_retryable():
    plan = recovery_plan_for_error("Element not found: btn")
    assert plan.retryable is True
    assert plan.category == "object_not_found"


def test_auth_prompt_is_quarantine():
    plan = recovery_plan_for_error("auth_prompt detected")
    assert plan.failure_outcome == "quarantine"
    assert plan.retryable is False


def test_unexpected_modal_is_continue():
    plan = recovery_plan_for_error("unexpected modal dialog blocked")
    assert plan.failure_outcome == "continue"


def test_assertion_failed_is_fail():
    plan = recovery_plan_for_error("expected value but got error")
    assert plan.failure_outcome == "fail"
    assert plan.retryable is False


def test_unknown_category_is_not_retryable():
    plan = recovery_plan_for_error("some totally unknown error")
    assert plan.category == "unknown"
    assert plan.retryable is False
    assert plan.failure_outcome == "fail"


# ── Configurable rules ────────────────────────────────────────────────────────

def test_custom_rule_overrides_default():
    custom_rules = [
        build_custom_rule(
            "object_not_found",
            retryable=False,
            failure_outcome="quarantine",
            reason="Custom: quarantine all missing-element failures",
        )
    ]
    plan = recovery_plan_for_error("Element not found", custom_rules)
    assert plan.failure_outcome == "quarantine"
    assert plan.retryable is False
    assert "quarantine" in plan.reason.lower()


def test_node_type_scoped_rule_takes_precedence():
    generic_rule = build_custom_rule("object_not_found", failure_outcome="continue")
    scoped_rule = build_custom_rule(
        "object_not_found",
        failure_outcome="quarantine",
        node_type="desktop.click",
    )
    plan = recovery_plan_for_error(
        "Element not found",
        [generic_rule, scoped_rule],
        node_type="desktop.click",
    )
    assert plan.failure_outcome == "quarantine"


def test_application_scoped_rule_takes_precedence_over_generic():
    generic_rule = build_custom_rule("object_not_found", failure_outcome="continue")
    app_rule = build_custom_rule(
        "object_not_found",
        failure_outcome="fail",
        application="SAPGui",
    )
    plan = recovery_plan_for_error(
        "Element not found",
        [generic_rule, app_rule],
        application="SAPGui",
    )
    assert plan.failure_outcome == "fail"


def test_unmatched_application_falls_through_to_generic():
    app_rule = build_custom_rule("object_not_found", failure_outcome="quarantine", application="SAPGui")
    plan = recovery_plan_for_error(
        "Element not found",
        [app_rule],
        application="AnotherApp",
    )
    # Should fall through to DEFAULT_RECOVERY_RULES (retryable=True, fail)
    assert plan.failure_outcome == "fail"
    assert plan.retryable is True


# ── node_chain ────────────────────────────────────────────────────────────────

def test_node_chain_is_empty_in_defaults():
    for rule in DEFAULT_RECOVERY_RULES:
        plan = recovery_plan_for_error(rule["category"] + " simulation")
        # node_chain always present
        assert isinstance(plan.node_chain, list)


def test_node_chain_preserved_from_custom_rule():
    chain = [
        {"node_type": "desktop.screenshot", "config": {}},
        {"node_type": "desktop.switch_window", "config": {"window_title": "Main"}},
    ]
    rule = build_custom_rule("window_not_found", failure_outcome="continue", node_chain=chain)
    plan = recovery_plan_for_error("window not found", [rule])
    assert len(plan.node_chain) == 2
    assert plan.node_chain[0]["node_type"] == "desktop.screenshot"


# ── RecoveryPlan.as_dict ──────────────────────────────────────────────────────

def test_as_dict_includes_failure_outcome():
    plan = RecoveryPlan(
        category="test",
        retryable=True,
        failure_outcome="continue",
        actions=[{"type": "capture_evidence"}],
        node_chain=[],
        reason="test reason",
    )
    d = plan.as_dict()
    assert d["failure_outcome"] == "continue"
    assert d["node_chain"] == []
    assert d["retryable"] is True


# ── build_custom_rule ─────────────────────────────────────────────────────────

def test_build_custom_rule_defaults():
    rule = build_custom_rule("app_crash")
    assert rule["category"] == "app_crash"
    assert rule["retryable"] is False
    assert rule["failure_outcome"] == "fail"
    assert "node_type" not in rule
    assert "application" not in rule


def test_build_custom_rule_with_scope():
    rule = build_custom_rule("app_crash", node_type="desktop.launch", application="MyApp")
    assert rule["node_type"] == "desktop.launch"
    assert rule["application"] == "MyApp"
