from __future__ import annotations

from app.execution.plugins.desktop.recovery import classify_desktop_failure, recovery_plan_for_error


def test_classify_desktop_failure_detects_object_lookup_errors():
    assert classify_desktop_failure("No such element: btnSubmit") == "object_not_found"
    assert classify_desktop_failure("Window not found: Invoice") == "window_not_found"


def test_recovery_plan_uses_default_object_not_found_actions():
    plan = recovery_plan_for_error("Unable to locate element by accessibility id")

    assert plan.category == "object_not_found"
    assert plan.retryable is True
    assert [action["type"] for action in plan.actions] == [
        "capture_evidence",
        "retry_with_ranked_locators",
        "suggest_repository_update",
    ]


def test_recovery_plan_allows_custom_rule_override():
    plan = recovery_plan_for_error(
        "popup blocked the target",
        rules=[
            {
                "category": "unexpected_modal",
                "retryable": True,
                "actions": [{"type": "click", "selector": "Close"}],
                "reason": "Close app-specific modal",
            }
        ],
    )

    assert plan.category == "unexpected_modal"
    assert plan.actions == [{"type": "click", "selector": "Close"}]
    assert plan.reason == "Close app-specific modal"
