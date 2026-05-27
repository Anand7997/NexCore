import unittest
from types import SimpleNamespace

from app.api.routes.intelligence import (
    _apply_locator_to_test_step,
    _blocked_navigation_reason,
    _candidate_locator,
    _is_quick_heal_scope,
    _runtime_healed_locator,
)


class IntelligenceHelperTests(unittest.TestCase):
    def test_blocked_navigation_reason_detects_http_error_output(self):
        reason = _blocked_navigation_reason(
            {"status_code": 403, "title": "Oops...too many requests !"}
        )

        self.assertEqual(reason, "Navigation returned HTTP 403 (Oops...too many requests !).")

    def test_blocked_navigation_reason_detects_failed_navigation_error(self):
        reason = _blocked_navigation_reason({}, "Navigation failed for https://example.test: HTTP 429")

        self.assertEqual(reason, "Navigation failed for https://example.test: HTTP 429")

    def test_quick_heal_scope_rejects_content_assertion_mismatch(self):
        node = SimpleNamespace(
            node_type="web.assert_text",
            error="text assertion failed at \"xpath=//input\": expected contains 'true', got ''",
            output={},
        )
        workflow_node = SimpleNamespace(type="web.assert_text", config={"selector": "xpath=//input"})

        self.assertFalse(_is_quick_heal_scope(node, workflow_node))

    def test_runtime_healed_locator_uses_successful_fallback_only_after_failure(self):
        node = SimpleNamespace(
            output={
                "locator_attempts": [
                    {"strategy": "xpath", "locator": "//input[@id='old']", "success": False},
                    {"strategy": "xpath", "locator": "//input[@id='new']", "success": True},
                ]
            }
        )

        candidate = _runtime_healed_locator(node, "xpath=//input[@id='old']")

        self.assertEqual(candidate[0], "xpath")
        self.assertEqual(candidate[1], "//input[@id='new']")
        self.assertGreaterEqual(candidate[2], 0.9)

    def test_candidate_locator_treats_xpath_prefix_as_same_locator(self):
        element = SimpleNamespace(
            alternative_locators=[
                {"strategy": "xpath", "locator": "xpath=//input[@id='old']", "score": 0.99},
                {"strategy": "css", "locator": "input[name='email']", "score": 0.92},
            ]
        )

        candidate = _candidate_locator(element, "//input[@id='old']")

        self.assertEqual(candidate[0], "css")
        self.assertEqual(candidate[1], "input[name='email']")

    def test_inline_test_step_fix_updates_test_data_and_bindings(self):
        step = SimpleNamespace(
            target="//input[@id='old']",
            test_data={"xpath": "//input[@id='old']"},
            bindings={"web": {"selector": "//input[@id='old']"}},
        )

        _apply_locator_to_test_step(
            step,
            locator="//input[@id='new']",
            strategy="xpath",
            execution_id="exec-1",
            node_key="node-1",
        )

        self.assertEqual(step.target, "//input[@id='new']")
        self.assertEqual(step.test_data["xpath"], "//input[@id='new']")
        self.assertEqual(step.test_data["locator"], "//input[@id='new']")
        self.assertEqual(step.bindings["web"]["selector"], "//input[@id='new']")
        self.assertEqual(step.bindings["web"]["last_ai_fix"]["scope"], "execution_quick_heal")
