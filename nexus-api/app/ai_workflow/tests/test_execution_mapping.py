from types import SimpleNamespace

from app.api.routes.executions import _node_type_and_config


def _step(**overrides):
    defaults = {
        "action_type": "SELECT",
        "intent": "",
        "name": "Select one-way trip type",
        "input_value": "",
        "secondary_value": "",
        "expected_result": "",
        "target": "",
        "test_data": {},
        "bindings": {
            "web": {
                "selector": "[data-testid='one-way']",
                "element_type": "radio",
            }
        },
        "page": None,
        "page_element": None,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def test_select_without_value_on_radio_executes_as_click():
    node_type, config = _node_type_and_config(_step())

    assert node_type == "web.click"
    assert config["selector"] == "[data-testid='one-way']"
    assert "value" not in config


def test_real_dropdown_select_requires_and_passes_value():
    node_type, config = _node_type_and_config(_step(
        name="Select cabin class",
        input_value="Economy",
        bindings={
            "web": {
                "selector": "#cabin",
                "element_type": "select",
            }
        },
    ))

    assert node_type == "web.select"
    assert config["selector"] == "#cabin"
    assert config["value"] == "Economy"
