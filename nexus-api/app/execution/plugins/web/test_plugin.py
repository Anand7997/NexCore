import asyncio
import unittest
from types import SimpleNamespace

from app.execution.plugins.web.plugin import (
    WebExecutionPlugin,
    _blocked_page_reason,
    _locator_candidates_from_config,
    _selector_for_playwright,
)


class _Envelope:
    def __init__(self):
        self.execution_id = "execution-1"
        self.node_key = "node-1"
        self.events = []
        self.logs = []

    async def log(self, level, message, source=""):
        self.logs.append((level, message, source))

    async def emit(self, event):
        self.events.append(event)


class _Page:
    url = "https://www.ixigo.com/flights"

    async def goto(self, url, wait_until, timeout):
        return SimpleNamespace(status=403)

    async def title(self):
        return "Oops...too many requests !"


class _HealingLocator:
    def __init__(self, page, selector):
        self.page = page
        self.selector = selector

    async def fill(self, value, timeout):
        self.page.attempted.append(self.selector)
        if self.selector == "xpath=/html/body/main/div[31]/a[1]":
            raise TimeoutError("primary selector timed out")
        self.page.filled = (self.selector, value)


class _HealingPage:
    def __init__(self):
        self.attempted = []
        self.filled = None

    def locator(self, selector):
        return _HealingLocator(self, selector)


class WebPluginTests(unittest.TestCase):
    def test_blocked_page_reason_detects_http_error(self):
        self.assertEqual(_blocked_page_reason(403, "Oops...too many requests !"), "HTTP 403")

    def test_navigate_fails_on_http_error_page(self):
        plugin = WebExecutionPlugin()

        with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
            asyncio.run(
                plugin._do_navigate(
                    _Envelope(),
                    _Page(),
                    {"url": "https://www.ixigo.com/flights", "wait_until": "load", "timeout_ms": 30000},
                )
            )

    def test_locator_config_normalizes_xpath_candidates(self):
        self.assertEqual(_selector_for_playwright("xpath", "//label"), "xpath=//label")
        [candidate] = _locator_candidates_from_config({
            "locators": [{"strategy": "xpath", "locator": "//label[contains(normalize-space(.), 'To')]"}]
        })

        self.assertEqual(candidate["selector"], "xpath=//label[contains(normalize-space(.), 'To')]")

    def test_fill_heals_to_next_locator_candidate(self):
        plugin = WebExecutionPlugin()
        envelope = _Envelope()
        page = _HealingPage()

        output = asyncio.run(
            plugin._do_fill(
                envelope,
                page,
                {
                    "selector": "/html/body/main/div[31]/a[1]",
                    "value": "Lucknow",
                    "timeout_ms": 100,
                    "healing_timeout_ms": 100,
                    "locators": [
                        {
                            "strategy": "xpath",
                            "locator": "//label[contains(normalize-space(.), 'From')]/following::input[1]",
                        }
                    ],
                },
            )
        )

        self.assertEqual(
            page.attempted,
            [
                "xpath=/html/body/main/div[31]/a[1]",
                "xpath=//label[contains(normalize-space(.), 'From')]/following::input[1]",
            ],
        )
        self.assertEqual(page.filled, ("xpath=//label[contains(normalize-space(.), 'From')]/following::input[1]", "Lucknow"))
        self.assertEqual(output["locator_attempts"][0]["success"], False)
        self.assertEqual(output["locator_attempts"][1]["success"], True)
