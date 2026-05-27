import unittest
from types import SimpleNamespace

from app.api.routes.page_repository import _apply_element_to_test_step


class PageRepositorySyncTests(unittest.TestCase):
    def test_page_element_update_rewrites_linked_step_locator_fields(self) -> None:
        page = SimpleNamespace(id="page-1", name="Automation_Practice")
        element = SimpleNamespace(
            id="element-1",
            page_id="page-1",
            name="Email",
            xpath="//input[@id='email-new']",
            css_selector="input[name='email']",
            id_attr="",
            name_attr="email",
            locator_strategy="xpath",
            alternative_locators=[
                {"strategy": "css", "locator": "input[type='email']", "reason": "semantic fallback"},
            ],
        )
        step = SimpleNamespace(
            page_id="page-1",
            page_element_id="element-1",
            target="Email",
            test_data={"value": "user@example.com", "xpath": "//input[@id='email-old']"},
            bindings={"web": {"selector": "//input[@id='email-old']"}},
        )

        _apply_element_to_test_step(step, page, element)

        self.assertEqual(step.page_id, "page-1")
        self.assertEqual(step.page_element_id, "element-1")
        self.assertEqual(step.target, "Email")
        self.assertEqual(step.test_data["xpath"], "//input[@id='email-new']")
        self.assertEqual(step.test_data["locator"], "//input[@id='email-new']")
        self.assertEqual(step.bindings["web"]["selector"], "//input[@id='email-new']")
        self.assertEqual(step.bindings["web"]["page"], "Automation_Practice")
        self.assertEqual(step.bindings["web"]["page_element_id"], "element-1")
        self.assertTrue(
            any(
                locator["locator"] == "input[type='email']"
                for locator in step.bindings["web"]["locators"]
            )
        )


if __name__ == "__main__":
    unittest.main()
