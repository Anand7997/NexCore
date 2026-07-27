import unittest

from app.page_discovery.locators import ElementDiscoveryAgent
from app.page_discovery.service import _filter_raw_elements_for_step_intents


class LocatorGenerationTests(unittest.TestCase):
    def test_input_with_label_gets_relative_following_xpath_before_absolute_xpath(self) -> None:
        agent = ElementDiscoveryAgent()
        [element] = agent.process_elements([
            {
                "tag": "input",
                "attributes": {
                    "label_text": "To",
                    "type": "text",
                    "xpath": "/html/body/main/div[2]/input[1]",
                    "css_path": "body > main > div:nth-of-type(2) > input:nth-of-type(1)",
                    "visible": True,
                    "enabled": True,
                },
                "roles": ["textbox"],
                "visible": True,
                "enabled": True,
                "match_count_xpath": 1,
                "match_count_css": 1,
            }
        ])

        locators = [candidate.locator for candidate in element.alternative_locators]

        self.assertIn('//label[contains(normalize-space(.), "To")]/following::input[1]', locators)
        self.assertEqual(element.xpath, '//label[contains(normalize-space(.), "To")]/following::input[1]')

    def test_text_hint_element_gets_contains_text_xpath(self) -> None:
        agent = ElementDiscoveryAgent()
        [element] = agent.process_elements([
            {
                "tag": "p",
                "attributes": {
                    "text_content": "Departure Date",
                    "xpath": "/html/body/main/div[3]/p[1]",
                    "css_path": "body > main > div:nth-of-type(3) > p:nth-of-type(1)",
                    "visible": True,
                    "enabled": True,
                },
                "roles": [],
                "visible": True,
                "enabled": True,
                "match_count_xpath": 1,
                "match_count_text": 1,
            }
        ])

        locators = [candidate.locator for candidate in element.alternative_locators]

        self.assertIn('//p[contains(normalize-space(.), "Departure Date")]', locators)

    def test_scrape_keeps_css_relative_and_absolute_xpath_fallbacks(self) -> None:
        agent = ElementDiscoveryAgent()
        [element] = agent.process_elements([
            {
                "tag": "input",
                "attributes": {
                    "id": "customerEmail",
                    "label_text": "Email",
                    "type": "email",
                    "xpath": '//*[@id="customerEmail"]',
                    "absolute_xpath": "/html/body/main/form/input[1]",
                    "css_path": "body > main > form:nth-of-type(1) > input:nth-of-type(1)",
                    "visible": True,
                    "enabled": True,
                },
                "roles": ["textbox"],
                "visible": True,
                "enabled": True,
                "match_count_id": 1,
                "match_count_css": 1,
                "match_count_xpath": 1,
            }
        ])

        locators = [candidate.locator for candidate in element.alternative_locators]

        self.assertIn("#customerEmail", locators)
        self.assertIn('//label[contains(normalize-space(.), "Email")]/following::input[1]', locators)
        self.assertIn("/html/body/main/form/input[1]", locators)
        self.assertIn("body > main > form:nth-of-type(1) > input:nth-of-type(1)", locators)


    def test_step_intent_filter_keeps_only_relevant_raw_elements(self) -> None:
        raw_elements = [
            {
                "tag": "input",
                "attributes": {"label_text": "Project Name", "type": "text", "id": "projectName"},
                "roles": ["textbox"],
            },
            {
                "tag": "button",
                "attributes": {"text_content": "Create", "id": "create"},
                "roles": ["button"],
            },
            {
                "tag": "button",
                "attributes": {"text_content": "Help", "id": "help"},
                "roles": ["button"],
            },
        ]
        intents = [
            {"step_number": 2, "action_type": "fill", "description": "Enter project name", "target_hint": "project name"},
            {"step_number": 3, "action_type": "click", "description": "Click Create project", "target_hint": "create project"},
        ]

        filtered = _filter_raw_elements_for_step_intents(raw_elements, intents)
        labels = {item["attributes"].get("label_text") or item["attributes"].get("text_content") for item in filtered}

        self.assertEqual(labels, {"Project Name", "Create"})

if __name__ == "__main__":
    unittest.main()
