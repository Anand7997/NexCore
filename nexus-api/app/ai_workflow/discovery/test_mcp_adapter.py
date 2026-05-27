import unittest

from app.ai_workflow.discovery.mcp_adapter import MCPPlaywrightAdapter


class MCPAdapterTests(unittest.TestCase):
    def test_parse_elements_preserves_mcp_alternative_locators(self) -> None:
        [element] = MCPPlaywrightAdapter.parse_elements({
            "elements": [
                {
                    "selector": "/html/body/main/div[31]/a[1]",
                    "element_type": "input",
                    "label": "From",
                    "placeholder": "From",
                    "alternative_locators": [
                        {
                            "strategy": "xpath",
                            "locator": "//label[contains(normalize-space(.), 'From')]/following::input[1]",
                            "score": 0.91,
                        }
                    ],
                }
            ]
        })

        self.assertEqual(element.xpath, "")
        self.assertEqual(element.css_selector, "")
        self.assertEqual(element.alternative_locators[0]["strategy"], "xpath")
        self.assertIn("following::input[1]", element.alternative_locators[0]["locator"])
        self.assertTrue(any("following::input[1]" in item["locator"] for item in element.semantic_locator_candidates()))


if __name__ == "__main__":
    unittest.main()
