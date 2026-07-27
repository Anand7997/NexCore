from __future__ import annotations

from types import SimpleNamespace

from app.execution.plugins.desktop.semantics import analyze_recorded_action, summarize_semantics


def _action(**overrides):
    defaults = {
        "action_order": 1,
        "action_type": "click",
        "object_key": "save_button",
        "object_name": "Save",
        "control_type": "button",
        "automation_id": "btnSave",
        "name_text": "Save",
        "window_title": "Invoice",
        "screen": "Main",
        "value": "",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def test_semantics_identifies_login_flow_actions():
    username = analyze_recorded_action(
        _action(action_order=1, action_type="type", object_key="username", object_name="Username", value="qa.user"),
        1,
    )
    password = analyze_recorded_action(
        _action(action_order=2, action_type="type", object_key="password", object_name="Password", value="[REDACTED]"),
        2,
    )
    submit = analyze_recorded_action(
        _action(action_order=3, action_type="click", object_key="login_button", object_name="Login"),
        3,
    )

    assert username["semantic_intent"] == "enter_username"
    assert password["semantic_intent"] == "enter_password"
    assert password["parameter_suggestion"]["sensitive"] is True
    assert submit["semantic_intent"] == "submit_login"
    assert submit["checkpoint_suggestion"]["node_type"] == "desktop.assert_text"


def test_semantics_summarizes_business_flow_and_categories():
    steps = [
        analyze_recorded_action(_action(action_type="type", object_key="customer_name", object_name="Customer Name", value="Asha"), 1),
        analyze_recorded_action(_action(action_type="click", object_key="save_button", object_name="Save"), 2),
        analyze_recorded_action(_action(action_type="assert_text", object_key="status", object_name="Status"), 3),
    ]

    summary = summarize_semantics(steps)

    assert summary["total_steps"] == 3
    assert summary["categories"]["data_entry"] == 1
    assert summary["categories"]["transaction"] == 1
    assert summary["categories"]["verification"] == 1
    assert summary["business_flow"] == ["Enter Customer Name", "Submit form", "Verify Status"]
    assert summary["checkpoint_suggestions"][0]["semantic_intent"] == "submit_form"

