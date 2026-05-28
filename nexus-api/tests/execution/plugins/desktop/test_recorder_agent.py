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
    assert payload["locators"][0]["strategy"] == "accessibility id"
    assert payload["locators"][0]["locator"] == "txtCustomerName"


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
