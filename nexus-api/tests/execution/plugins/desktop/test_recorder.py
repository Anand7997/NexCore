from __future__ import annotations

from types import SimpleNamespace

from app.execution.plugins.desktop.recorder import compile_recorded_action, compile_recording, normalize_recorded_action


def _action(**overrides):
    defaults = {
        "action_order": 1,
        "action_type": "click",
        "object_key": "submit_button",
        "object_name": "Submit",
        "control_type": "button",
        "automation_id": "btnSubmit",
        "name_text": "Submit",
        "class_name": "Button",
        "uia_path": "/Window/Button[1]",
        "locator_strategy": "",
        "value": "",
        "expected": "",
        "property_name": "",
        "variable": "",
        "window_title": "Invoice",
        "screen": "Main",
        "locators": [],
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def test_normalize_recorded_action_aliases():
    assert normalize_recorded_action("Left Click") == "click"
    assert normalize_recorded_action("verify-text") == "assert_text"
    assert normalize_recorded_action("shortcut") == "hotkey"


def test_compile_recorded_click_prefers_automation_id():
    compiled = compile_recorded_action(_action(), 1)

    assert compiled["keyword"]["operation"] == "click"
    assert compiled["keyword"]["object"] == "Submit"
    assert compiled["node"]["type"] == "desktop.click"
    assert compiled["node"]["config"]["selector"] == "btnSubmit"
    assert compiled["node"]["config"]["strategy"] == "accessibility id"
    assert compiled["repository_suggestion"]["object_key"] == "submit_button"


def test_compile_recorded_type_adds_value_to_node_config():
    compiled = compile_recorded_action(_action(action_type="type", value="Asha Rao"), 1)

    assert compiled["node"]["type"] == "desktop.type_text"
    assert compiled["node"]["config"]["value"] == "Asha Rao"
    assert compiled["keyword"]["value"] == "Asha Rao"


def test_compile_recording_adds_launch_node_and_edges():
    session = SimpleNamespace(
        id="session1",
        name="Invoice flow",
        application_path=r"C:\Apps\Invoice.exe",
        application="Invoice",
        driver_type="uia3",
    )
    compiled = compile_recording(session, [
        _action(action_order=2, action_type="type", object_key="name", object_name="Name", automation_id="txtName", value="Asha"),
        _action(action_order=1, action_type="click", object_key="new", object_name="New", automation_id="btnNew"),
    ])

    assert compiled["summary"]["action_count"] == 2
    assert compiled["workflow"]["nodes"][0]["type"] == "desktop.launch"
    assert compiled["workflow"]["nodes"][1]["config"]["selector"] == "btnNew"
    assert compiled["workflow"]["nodes"][2]["config"]["selector"] == "txtName"
    assert compiled["workflow"]["edges"] == [
        {"source_key": "desktop_launch", "target_key": "recorded_step_1", "execution_order": 1},
        {"source_key": "recorded_step_1", "target_key": "recorded_step_2", "execution_order": 2},
    ]


def test_compile_recording_suggests_login_reusable_component():
    session = SimpleNamespace(
        id="session1",
        name="Login flow",
        application_path=r"C:\Apps\Invoice.exe",
        application="Invoice",
        driver_type="uia3",
    )
    compiled = compile_recording(session, [
        _action(action_order=1, action_type="type", object_key="username", object_name="Username", automation_id="txtUser", value="qa.user"),
        _action(action_order=2, action_type="type", object_key="password", object_name="Password", automation_id="txtPassword", value="[REDACTED]"),
        _action(action_order=3, action_type="click", object_key="login_button", object_name="Login", automation_id="btnLogin"),
    ])

    names = [item["name"] for item in compiled["component_suggestions"]]
    assert "Login Component" in names
    login = next(item for item in compiled["component_suggestions"] if item["name"] == "Login Component")
    assert login["component_type"] == "action_group"
    assert login["confidence"] >= 0.9
    assert login["start_step"] == 1
    assert login["end_step"] == 3
    assert login["suggested_parameters"][0]["name"] == "username"
    assert compiled["summary"]["component_suggestion_count"] >= 1


def test_compile_recording_suggests_form_and_checkpoint_components():
    session = SimpleNamespace(
        id="session1",
        name="Customer flow",
        application_path=r"C:\Apps\Invoice.exe",
        application="Invoice",
        driver_type="uia3",
    )
    compiled = compile_recording(session, [
        _action(action_order=1, action_type="type", object_key="customer_name", object_name="Customer Name", automation_id="txtName", value="Asha"),
        _action(action_order=2, action_type="select", object_key="country", object_name="Country", automation_id="cmbCountry", value="India"),
        _action(action_order=3, action_type="click", object_key="save_button", object_name="Save", automation_id="btnSave"),
        _action(action_order=4, action_type="assert_text", object_key="status", object_name="Status", automation_id="lblStatus", expected="Saved"),
        _action(action_order=5, action_type="extract_text", object_key="customer_id", object_name="Customer ID", automation_id="lblCustomerId", variable="customer_id"),
    ])

    names = [item["name"] for item in compiled["component_suggestions"]]
    assert "Save Form Component" in names
    assert "Verification Component" in names
    verification = next(item for item in compiled["component_suggestions"] if item["name"] == "Verification Component")
    assert verification["component_type"] == "checkpoint_group"
    assert verification["suggested_outputs"][0]["name"] == "customer_id"
