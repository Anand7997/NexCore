import unittest
from unittest.mock import MagicMock

import pytest

from app.ai_workflow.discovery.adapter import BrowserDiscoveryAdapter
from app.ai_workflow.discovery.mcp_adapter import MCPPlaywrightAdapter
from app.page_discovery.schemas import DiscoveryResponse, DiscoverySummary


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


@pytest.mark.asyncio
async def test_browser_adapter_accepts_small_step_targeted_mcp_result(monkeypatch) -> None:
    async def available(self):
        return True

    async def discover(self, url, *, step_intents=None):
        return {
            "elements": [
                {
                    "selector": "#create",
                    "element_type": "button",
                    "text": "Create",
                }
            ]
        }

    async def to_discovery(self, parsed, raw, url, page_name, platform, save_mode, page_id, db, *, step_intents=None):
        return DiscoveryResponse(
            page={"id": page_id, "scrape_step_intents": step_intents or []},
            summary=DiscoverySummary(
                url=url,
                elements_found=len(parsed),
                elements_saved=0,
                low_confidence=0,
                duration_ms=0,
            ),
            elements=[],
        )

    monkeypatch.setattr(MCPPlaywrightAdapter, "is_available", available)
    monkeypatch.setattr(MCPPlaywrightAdapter, "discover", discover)
    monkeypatch.setattr(BrowserDiscoveryAdapter, "_mcp_elements_to_discovery", to_discovery)

    result = await BrowserDiscoveryAdapter(
        mcp_url="http://mcp.local",
        playwright_fallback=False,
    ).discover(
        "https://example.test",
        "Example",
        "web",
        "preview",
        "page-1",
        MagicMock(),
        step_intents=[{"step_number": 3, "action_type": "click", "target_hint": "create"}],
    )

    assert result.summary.elements_found == 1
    assert result.page["scrape_step_intents"][0]["target_hint"] == "create"

if __name__ == "__main__":
    unittest.main()
