import unittest
from types import SimpleNamespace

from app.api.routes.executions import _node_type_and_config


class ExecutionLocatorConfigTests(unittest.TestCase):
    def test_node_config_preserves_locator_candidates_for_healing(self) -> None:
        step = SimpleNamespace(
            action_type="CLEAR_AND_TYPE",
            intent="",
            name="Enter origin city",
            input_value="Lucknow",
            secondary_value="",
            expected_result="",
            target="",
            test_data={},
            bindings={
                "web": {
                    "selector": "/html/body/main/div[31]/a[1]",
                    "element_type": "input",
                    "alternative_locators": [
                        {
                            "strategy": "xpath",
                            "locator": "//label[contains(normalize-space(.), 'From')]/following::input[1]",
                        },
                        {"strategy": "css", "locator": "input[placeholder='From']"},
                    ],
                }
            },
            page=None,
            page_element=None,
        )

        node_type, config = _node_type_and_config(step)

        self.assertEqual(node_type, "web.fill")
        self.assertEqual(config["selector"], "xpath=//label[contains(normalize-space(.), 'From')]/following::input[1]")
        self.assertEqual(len(config["locators"]), 3)
        self.assertEqual(config["locators"][0]["strategy"], "xpath")
        self.assertEqual(config["locators"][1]["strategy"], "css")


if __name__ == "__main__":
    unittest.main()
