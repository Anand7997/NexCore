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
        "metadata": {},
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


def test_compile_recorded_click_demotes_placeholder_window_name():
    compiled = compile_recorded_action(_action(
        object_key="untitled2",
        object_name="untitled2",
        control_type="Window",
        automation_id="",
        name_text="untitled2",
        class_name="SunAwtFrame",
        uia_path="/Pane[@Name='Desktop 1']/Window[@Name='untitled2']",
        locator_strategy="name",
    ), 1)

    assert compiled["keyword"]["object"] == "Window / SunAwtFrame"
    assert compiled["node"]["config"]["strategy"] == "xpath"
    assert compiled["node"]["config"]["selector"] == "/Pane[@Name='Desktop 1']/Window[@Name='untitled2']"
    assert compiled["repository_suggestion"]["name_text"] == ""


def test_compile_recorded_action_uses_coordinate_fallback_when_no_uia_locator():
    compiled = compile_recorded_action(_action(
        object_key="",
        object_name="",
        control_type="",
        automation_id="",
        name_text="",
        class_name="",
        uia_path="",
        locator_strategy="coordinate",
        x=12,
        y=34,
    ), 1)

    assert compiled["node"]["config"]["strategy"] == "coordinate"
    assert compiled["node"]["config"]["selector"] == "x=12,y=34"
    assert compiled["node"]["config"]["coordinate_fallback"] is True
    assert compiled["node"]["config"]["analog"]["low_level"] is True
    assert any(
        item["strategy"] == "coordinate" and item["locator"] == "x=12,y=34"
        for item in compiled["node"]["config"]["locators"]
    )


def test_compile_recorded_action_promotes_virtual_object_to_custom_control():
    compiled = compile_recorded_action(_action(
        automation_id="",
        name_text="",
        class_name="OwnerDrawnGrid",
        control_type="CustomGrid",
        locator_strategy="coordinate",
        x=140,
        y=220,
        metadata={
            "recording_mode": "analog",
            "capture_scope": "window_fallback",
            "virtual_object": {
                "name": "Ledger Grid",
                "object_class": "OwnerDrawnGrid",
                "control_type": "CustomGrid",
                "class_name": "OwnerDrawnGrid",
                "locator_strategy": "coordinate",
                "primary_locator": "x=140,y=220",
                "locators": [{"strategy": "coordinate", "locator": "x=140,y=220", "score": 0.34}],
            },
        },
    ), 1)

    assert compiled["node"]["type"] == "desktop.custom_control_action"
    assert compiled["node"]["config"]["extension_pack"] == "custom_control"
    assert compiled["node"]["config"]["action"] == "click"
    assert compiled["node"]["config"]["recording_mode"] == "analog"
    assert compiled["node"]["config"]["virtual_object"]["object_class"] == "OwnerDrawnGrid"
    assert compiled["repository_suggestion"]["metadata"]["virtual_object"]["object_class"] == "OwnerDrawnGrid"


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
    assert compiled["workflow"]["nodes"][0]["config"]["attach_if_running"] is True
    assert compiled["workflow"]["nodes"][1]["config"]["selector"] == "btnNew"
    assert compiled["workflow"]["nodes"][2]["config"]["selector"] == "txtName"
    assert compiled["workflow"]["edges"] == [
        {"source_key": "desktop_launch", "target_key": "recorded_step_1", "execution_order": 1},
        {"source_key": "recorded_step_1", "target_key": "recorded_step_2", "execution_order": 2},
    ]


def test_compile_recording_carries_window_scope_to_launch_node():
    session = SimpleNamespace(
        id="session1",
        name="Generic editor flow",
        application_path=r"C:\Tools\generic-editor.exe",
        application="Generic Editor",
        driver_type="uia3",
        window_title="Generic Editor",
        process_name="17880",
    )
    compiled = compile_recording(session, [_action()])

    launch_config = compiled["workflow"]["nodes"][0]["config"]
    assert launch_config["window_title"] == "Generic Editor"
    assert launch_config["process_name"] == ""
    assert "args" not in launch_config
    assert launch_config["attach_if_running"] is True


def test_compile_recording_does_not_launch_placeholder_application_name():
    session = SimpleNamespace(
        id="session1",
        name="Recorded flow",
        application_path="",
        application="Desktop App",
        driver_type="uia3",
        window_title="Invoice",
        process_name="",
    )
    compiled = compile_recording(session, [_action()])

    first_node = compiled["workflow"]["nodes"][0]
    assert first_node["type"] == "desktop.attach"
    assert first_node["config"]["window_title"] == "Invoice"
    assert "app" not in first_node["config"]
    assert compiled["workflow"]["edges"][0] == {
        "source_key": "desktop_attach",
        "target_key": "recorded_step_1",
        "execution_order": 1,
    }


def test_compile_recording_ignores_shell_window_title_without_launchable_app():
    session = SimpleNamespace(
        id="session1",
        name="Recorded flow",
        application_path="",
        application="Desktop App",
        driver_type="uia3",
        window_title="Windows PowerShell",
        process_name="",
    )
    compiled = compile_recording(session, [_action()])

    assert compiled["workflow"]["nodes"][0]["node_key"] == "recorded_step_1"
    assert all(node["type"] != "desktop.launch" for node in compiled["workflow"]["nodes"])


def test_compile_recording_replaces_bad_shell_window_title_with_application_name():
    session = SimpleNamespace(
        id="session1",
        name="Generic editor flow",
        application_path=r"C:\Tools\generic-editor.exe",
        application="Generic Editor",
        driver_type="uia3",
        window_title="Snap Assist",
        process_name="17880",
    )
    compiled = compile_recording(session, [_action()])

    launch_node = compiled["workflow"]["nodes"][0]
    launch_config = launch_node["config"]
    assert launch_config["window_title"] == "Generic Editor"
    assert launch_config["process_name"] == ""
    assert "args" not in launch_config
    assert launch_node["retry_policy"]["max_attempts"] == 1


def test_compile_recording_infers_launch_scope_from_application_name_and_path():
    session = SimpleNamespace(
        id="session1",
        name="Custom tool flow",
        application_path=r"C:\Apps\custom-tool.exe",
        application="Custom Tool",
        driver_type="uia3",
        window_title="Windows PowerShell",
        process_name="",
    )
    compiled = compile_recording(session, [_action()])

    launch_config = compiled["workflow"]["nodes"][0]["config"]
    assert launch_config["app"] == r"C:\Apps\custom-tool.exe"
    assert launch_config["window_title"] == "Custom Tool"
    assert launch_config["process_name"] == "custom-tool.exe"


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
