import asyncio
import unittest
from types import SimpleNamespace

from app.api.routes.executions import _execution_display_context, _node_type_and_config


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeDB:
    async def scalar(self, stmt):
        return SimpleNamespace(name="Execution - Search Flights")

    async def execute(self, stmt):
        return _FakeResult([("Search flights", "Flights", "Travel")])


class ExecutionDisplayContextTests(unittest.TestCase):
    def test_builds_display_name_from_test_case_metadata(self):
        execution = SimpleNamespace(
            workflow_id="wf-1",
            project_id=None,
            module_id=None,
            variables={"test_case_ids": ["tc-1"]},
        )

        context = asyncio.run(_execution_display_context(_FakeDB(), execution))

        self.assertEqual(
            context,
            {
                "workflow_name": "Execution - Search Flights",
                "project_name": "Travel",
                "module_name": "Flights",
                "test_case_name": "Search flights",
                "display_name": "travel_flights_search_flights",
            },
        )


class WorkflowActionMappingTests(unittest.TestCase):
    def _step(self, action_type, selector="", value="", element_type=""):
        page_element = SimpleNamespace(
            element_type=element_type,
            alternative_locators=[],
            css_selector="",
            xpath=selector,
            id_attr="",
            name_attr="",
        ) if selector else None
        return SimpleNamespace(
            action_type=action_type,
            intent=action_type,
            name=action_type,
            input_value=value,
            expected_result="",
            secondary_value="",
            target="",
            test_data={"xpath": selector} if selector else {},
            bindings={},
            page_element=page_element,
            page=None,
        )

    def test_checkbox_maps_to_check_not_assertion(self):
        node_type, config = _node_type_and_config(
            self._step("HANDLE_CHECKBOX", "//input[@id='monday']", "true", "checkbox")
        )

        self.assertEqual(node_type, "web.check")
        self.assertTrue(config["checked"])

    def test_interaction_actions_map_to_playwright_specific_nodes(self):
        cases = [
            ("DOUBLE_CLICK", "web.double_click"),
            ("MOUSE_OVER", "web.hover"),
            ("RIGHT_CLICK", "web.right_click"),
        ]

        for action, expected_node_type in cases:
            with self.subTest(action=action):
                node_type, _ = _node_type_and_config(self._step(action, "//button[@id='x']"))
                self.assertEqual(node_type, expected_node_type)

    def test_click_on_select_with_value_uses_select_node(self):
        node_type, config = _node_type_and_config(
            self._step("CLICK", "//*[@id='colors']", "Green", "select")
        )

        self.assertEqual(node_type, "web.select")
        self.assertEqual(config["value"], "Green")

    def test_press_key_maps_keyboard_shortcut(self):
        node_type, config = _node_type_and_config(self._step("PRESS_KEY", value="CTRL+A"))

        self.assertEqual(node_type, "web.press_key")
        self.assertEqual(config["key"], "Control+A")

    def test_drag_and_drop_includes_target_locators(self):
        step = self._step("DRAG_AND_DROP", "//div[@id='draggable']")
        step.secondary_value = "//div[@id='droppable']"

        node_type, config = _node_type_and_config(step)

        self.assertEqual(node_type, "web.drag_and_drop")
        self.assertEqual(config["target_selector"], "xpath=//div[@id='droppable']")
