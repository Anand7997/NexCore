from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace


def _load_agent_module():
    script = Path(__file__).resolve().parents[4] / "tools" / "desktop_recorder_agent.py"
    spec = importlib.util.spec_from_file_location("desktop_recorder_agent", script)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_recorder_agent_slug_and_sensitive_detection():
    agent = _load_agent_module()

    assert agent._slug("Customer Name Input") == "customer_name_input"
    assert agent._slug("") == "desktop_object"
    assert agent._looks_sensitive("PasswordBox", "txtPassword") is True
    assert agent._looks_sensitive("Customer Name") is False


def test_recorder_agent_builds_uia_action_payload_with_locators():
    agent = _load_agent_module()
    rect = SimpleNamespace(left=10, top=20, right=110, bottom=50)
    info = SimpleNamespace(
        name="Customer Name",
        automation_id="txtCustomerName",
        class_name="Edit",
        control_type="Edit",
        rectangle=rect,
        process_id=1234,
    )
    element = SimpleNamespace(element_info=info)

    payload = agent._element_payload(
        "type_text",
        element,
        value="Asha Rao",
        window_title="Invoice",
    )

    assert payload["action_type"] == "type_text"
    assert payload["object_key"] == "txtcustomername"
    assert payload["automation_id"] == "txtCustomerName"
    assert payload["locator_strategy"] == "accessibility id"
    assert payload["value"] == "Asha Rao"
    assert payload["window_title"] == "Invoice"
    assert payload["metadata"]["bounding_box"] == {"x": 10.0, "y": 20.0, "width": 100.0, "height": 30.0}
    assert payload["metadata"]["recording_mode"] == "uia"
    assert payload["locators"][0]["strategy"] == "accessibility id"
    assert payload["locators"][0]["locator"] == "txtCustomerName"


def test_recorder_agent_refines_window_capture_to_child_at_click_point():
    agent = _load_agent_module()

    class FakeElement:
        def __init__(self, info, children=None, parent=None):
            self.element_info = info
            self._children = children or []
            self._parent = parent

        def descendants(self):
            return self._children

        def parent(self):
            if self._parent is None:
                raise RuntimeError("no parent")
            return self._parent

    root_info = SimpleNamespace(
        name="untitled2",
        automation_id="",
        class_name="SunAwtFrame",
        control_type="Window",
        rectangle=SimpleNamespace(left=0, top=0, right=1000, bottom=800),
        process_id=1234,
    )
    child_info = SimpleNamespace(
        name="Save",
        automation_id="btnSave",
        class_name="Button",
        control_type="Button",
        rectangle=SimpleNamespace(left=40, top=40, right=120, bottom=70),
        process_id=1234,
    )
    root = FakeElement(root_info)
    child = FakeElement(child_info, parent=root)
    root._children = [child]

    payload = agent._element_payload("click", root, x=50, y=55, window_title="IDE")

    assert payload["object_name"] == "Save"
    assert payload["object_key"] == "btnsave"
    assert payload["automation_id"] == "btnSave"
    assert payload["locator_strategy"] == "accessibility id"
    assert payload["metadata"]["capture_scope"] == "element"


def test_recorder_agent_demotes_placeholder_window_and_adds_coordinate_locators():
    agent = _load_agent_module()
    rect = SimpleNamespace(left=0, top=0, right=1000, bottom=800)
    info = SimpleNamespace(
        name="untitled2",
        automation_id="",
        class_name="SunAwtFrame",
        control_type="Window",
        rectangle=rect,
        process_id=1234,
    )

    payload = agent._element_payload(
        "click",
        SimpleNamespace(element_info=info),
        x=320,
        y=240,
        window_title="IDE",
    )

    assert payload["object_name"] == "Window / SunAwtFrame"
    assert payload["object_key"] == "window_sunawtframe_x_320_y_240"
    assert payload["name_text"] == ""
    assert payload["locator_strategy"] == "xpath"
    assert payload["metadata"]["raw_name_text"] == "untitled2"
    assert payload["metadata"]["capture_scope"] == "window_fallback"
    assert payload["metadata"]["recording_mode"] == "analog"
    assert payload["metadata"]["analog"]["point"] == {"x": 320.0, "y": 240.0}
    assert payload["metadata"]["virtual_object"]["object_class"] == "SunAwtFrame"
    locators = {(item["strategy"], item["locator"]) for item in payload["locators"]}
    assert ("coordinate", "x=320,y=240") in locators
    assert any(strategy == "relative" and "@offset(320,240)" in locator for strategy, locator in locators)


def test_recorder_agent_redacts_sensitive_type_values():
    agent = _load_agent_module()
    info = SimpleNamespace(
        name="Password",
        automation_id="txtPassword",
        class_name="PasswordBox",
        control_type="Edit",
        rectangle=None,
        process_id=1234,
    )
    payload = agent._element_payload("type_text", SimpleNamespace(element_info=info), value="secret")

    assert payload["value"] == "[REDACTED]"
    assert payload["metadata"]["redacted"] is True


def test_recorder_agent_stops_when_session_status_is_stopped(monkeypatch):
    agent = _load_agent_module()
    recorder = agent.LiveDesktopRecorderAgent(
        agent.AgentOptions(api_url="http://nexcore.local/api", session_id="session-123"),
    )

    monkeypatch.setattr(agent, "_get_json", lambda *_args: {"status": "stopped"})
    recorder._stop_if_session_closed()

    assert recorder.stop_event.is_set()


def test_recorder_agent_ignores_active_session_status(monkeypatch):
    agent = _load_agent_module()
    recorder = agent.LiveDesktopRecorderAgent(
        agent.AgentOptions(api_url="http://nexcore.local/api", session_id="session-123"),
    )

    monkeypatch.setattr(agent, "_get_json", lambda *_args: {"status": "recording"})
    recorder._stop_if_session_closed()

    assert not recorder.stop_event.is_set()
