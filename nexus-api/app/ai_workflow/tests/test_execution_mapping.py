from types import SimpleNamespace

from app.api.routes.executions import _node_type_and_config, _workflow_from_test_cases
from app.domain.executions.schemas import TestCaseExecutionTriggerSchema as ExecutionTriggerSchema
from app.execution.master_sheet import DesktopMasterSheet


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


def test_desktop_click_uses_desktop_node_and_automation_id():
    node_type, config = _node_type_and_config(_step(
        action_type="CLICK",
        target="Submit button",
        test_data={"platform": "desktop", "automation_id": "btnSubmit"},
        bindings={
            "desktop": {
                "object_name": "Submit button",
                "automation_id": "btnSubmit",
                "control_type": "button",
            }
        },
    ))

    assert node_type == "desktop.click"
    assert config["selector"] == "btnSubmit"
    assert config["strategy"] == "accessibility id"


def test_desktop_launch_uses_app_path_instead_of_web_url():
    node_type, config = _node_type_and_config(_step(
        action_type="LAUNCH_APP",
        input_value=r"C:\Program Files\Invoice\Invoice.exe",
        test_data={"platform": "desktop", "application_path": r"C:\Program Files\Invoice\Invoice.exe"},
        bindings={
            "desktop": {
                "application_path": r"C:\Program Files\Invoice\Invoice.exe",
                "app": r"C:\Program Files\Invoice\Invoice.exe",
            }
        },
    ))

    assert node_type == "desktop.launch"
    assert config["app"] == r"C:\Program Files\Invoice\Invoice.exe"


def test_desktop_double_click_maps_to_desktop_double_click_node():
    node_type, config = _node_type_and_config(_step(
        action_type="DOUBLE_CLICK",
        test_data={"platform": "desktop", "automation_id": "row42"},
        bindings={"desktop": {"automation_id": "row42"}},
    ))

    assert node_type == "desktop.double_click"
    assert config["selector"] == "row42"


def test_desktop_select_maps_to_desktop_select_node():
    node_type, config = _node_type_and_config(_step(
        action_type="SELECT",
        input_value="India",
        test_data={"platform": "desktop", "automation_id": "countryCombo"},
        bindings={"desktop": {"automation_id": "countryCombo", "control_type": "combobox"}},
    ))

    assert node_type == "desktop.select"
    assert config["value"] == "India"


def test_desktop_assert_property_maps_to_property_checkpoint():
    node_type, config = _node_type_and_config(_step(
        action_type="ASSERTION",
        expected_result="Enabled",
        test_data={"platform": "desktop", "automation_id": "submit", "property": "enabled"},
        bindings={"desktop": {"automation_id": "submit"}},
    ))

    assert node_type == "desktop.assert_property"
    assert config["property"] == "enabled"
    assert config["expected"] == "Enabled"


def test_desktop_workflow_starter_uses_application_path_variable():
    step = _step(
        action_type="CLICK",
        step_order=1,
        id="step1",
        page_id=None,
        page_element_id=None,
        is_enabled=True,
        bindings={
            "desktop": {
                "object_name": "Submit button",
                "automation_id": "btnSubmit",
                "control_type": "button",
            }
        },
        test_data={"platform": "desktop"},
        description="Click submit",
    )
    test_case = SimpleNamespace(
        id="case1",
        name="Desktop smoke",
        module_id="module1",
        project_id="project1",
        test_steps=[step],
    )
    schema = ExecutionTriggerSchema(
        platform="desktop",
        variables={"application_path": r"C:\Apps\Invoice.exe"},
    )

    workflow = _workflow_from_test_cases([test_case], schema)

    assert workflow.nodes[0].type == "desktop.launch"
    assert workflow.nodes[0].config["app"] == r"C:\Apps\Invoice.exe"


def test_desktop_master_sheet_resolves_object_key_to_automation_id():
    sheet = DesktopMasterSheet({
        "elements": {
            "customer_name_input": {
                "friendly_name": "Customer Name",
                "control_type": "edit",
                "automation_id": "txtCustomerName",
                "uia_path": "/Window/Edit[1]",
                "locators": [{"strategy": "name", "locator": "Customer Name"}],
            }
        }
    })
    node_type, config = _node_type_and_config(_step(
        action_type="CLICK",
        target="customer_name_input",
        test_data={"platform": "desktop", "object_key": "customer_name_input"},
        bindings={"desktop": {"object_key": "customer_name_input"}},
    ), sheet)

    assert node_type == "desktop.click"
    assert config["selector"] == "txtCustomerName"
    assert config["strategy"] == "accessibility id"
    assert config["master_sheet"]["object_key"] == "customer_name_input"
    assert {"strategy": "name", "locator": "Customer Name", "source": "desktop_binding"} in config["locators"]


def test_desktop_master_sheet_resolves_app_object_and_data_keys_in_workflow():
    step = _step(
        action_type="TYPE",
        step_order=1,
        id="step1",
        page_id=None,
        page_element_id=None,
        is_enabled=True,
        description="Enter customer name",
        target="customer_name_input",
        test_data={
            "platform": "desktop",
            "object_key": "customer_name_input",
            "data_key": "customers.default.name",
        },
        bindings={"desktop": {"object_key": "customer_name_input"}},
    )
    test_case = SimpleNamespace(
        id="case1",
        name="Desktop data driven smoke",
        module_id="module1",
        project_id="project1",
        test_steps=[step],
    )
    schema = ExecutionTriggerSchema(
        platform="desktop",
        variables={
            "app_key": "invoice_app",
            "master_sheet": {
                "applications": {
                    "invoice_app": {"application_path": r"C:\Apps\Invoice.exe"}
                },
                "elements": {
                    "customer_name_input": {
                        "friendly_name": "Customer Name",
                        "control_type": "edit",
                        "automation_id": "txtCustomerName",
                    }
                },
                "test_data": {
                    "customers": {"default": {"name": "Asha Rao"}}
                },
            },
        },
    )

    workflow = _workflow_from_test_cases([test_case], schema)

    assert workflow.nodes[0].type == "desktop.launch"
    assert workflow.nodes[0].config["app"] == r"C:\Apps\Invoice.exe"
    assert workflow.nodes[0].config["master_sheet"]["app_key"] == "invoice_app"
    assert workflow.nodes[1].type == "desktop.type_text"
    assert workflow.nodes[1].config["selector"] == "txtCustomerName"
    assert workflow.nodes[1].config["value"] == "Asha Rao"
    assert workflow.nodes[1].config["master_sheet"]["object_key"] == "customer_name_input"
    assert workflow.nodes[1].config["master_sheet"]["data_key"] == "customers.default.name"


def test_desktop_master_sheet_missing_object_key_is_reported():
    sheet = DesktopMasterSheet({"elements": {}})

    node_type, config = _node_type_and_config(_step(
        action_type="CLICK",
        target="",
        test_data={"platform": "desktop", "object_key": "missing_button"},
        bindings={"desktop": {"object_key": "missing_button"}},
    ), sheet)

    assert node_type == "desktop.screenshot"
    assert "object_key:missing_button" in config["master_sheet"]["missing"]


def test_desktop_page_repository_element_maps_to_automation_id_locator():
    page = SimpleNamespace(id="page1", name="Invoice App", platform="desktop", url_pattern=r"C:\Apps\Invoice.exe")
    element = SimpleNamespace(
        id="element1",
        name="Submit Invoice",
        element_type="button",
        xpath="/Window/Button[1]",
        css_selector="Button",
        id_attr="btnSubmitInvoice",
        name_attr="Submit Invoice",
        locator_strategy="accessibility id",
        alternative_locators=[{"strategy": "name", "locator": "Submit"}],
        discovery_metadata={"platform": "desktop", "object_key": "submit_invoice_button"},
    )

    node_type, config = _node_type_and_config(_step(
        action_type="CLICK",
        target="Submit Invoice",
        bindings={},
        test_data={},
        page=page,
        page_element=element,
    ))

    assert node_type == "desktop.click"
    assert config["selector"] == "btnSubmitInvoice"
    assert config["strategy"] == "accessibility id"
    assert config["locators"][0] == {
        "strategy": "accessibility id",
        "locator": "btnSubmitInvoice",
        "source": "desktop_page_element",
    }
