import unittest

from app.page_discovery.locators import ElementDiscoveryAgent


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


if __name__ == "__main__":
    unittest.main()
