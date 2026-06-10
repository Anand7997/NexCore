from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai_workflow.discovery.desktop_adapter import DesktopDiscoveryAdapter
from app.execution.plugins.desktop.drivers.base import DriverResult


def _driver(ui_tree: str):
    driver = MagicMock()
    driver.launch = AsyncMock(return_value=DriverResult(
        success=True,
        metadata={"window_title": "Invoice"},
    ))
    driver.attach = AsyncMock(return_value=DriverResult(success=True))
    driver.get_ui_tree = AsyncMock(return_value=DriverResult(success=True, ui_tree=ui_tree))
    driver.close = AsyncMock(return_value=DriverResult(success=True))
    return driver


def _driver_with_trees(ui_trees: list[str]):
    driver = _driver(ui_trees[-1] if ui_trees else "")
    calls = {"index": 0}

    async def get_ui_tree():
        index = min(calls["index"], max(len(ui_trees) - 1, 0))
        calls["index"] += 1
        return DriverResult(success=True, ui_tree=ui_trees[index] if ui_trees else "")

    driver.get_ui_tree = AsyncMock(side_effect=get_ui_tree)
    driver.wait_app = AsyncMock(return_value=DriverResult(success=True))
    driver.wait_window = AsyncMock(return_value=DriverResult(success=True))
    return driver


@pytest.mark.asyncio
async def test_desktop_discovery_launches_app_and_builds_context_fallbacks():
    ui_tree = """
    <UITree>
      <control type="Edit" name="Customer Name" auto_id="txtCustomer" class_name="Edit" />
      <control type="Button" name="Submit Invoice" auto_id="btnSubmit" class_name="Button" />
    </UITree>
    """
    driver = _driver(ui_tree)

    with patch("app.ai_workflow.discovery.desktop_adapter.get_driver", return_value=driver):
        result = await DesktopDiscoveryAdapter(driver_type="uia3").discover(
            app=r"C:\Apps\Invoice.exe",
            page_name="Invoice",
            platform="desktop",
            save_mode="preview",
            page_id="page-1",
            db=MagicMock(),
        )

    assert result.summary.elements_found == 2
    driver.launch.assert_awaited_once()
    driver.close.assert_awaited_once()

    submit = next(element for element in result.elements if element.id_attr == "btnSubmit")
    assert submit.locator_strategy == "accessibility id"
    assert submit.best_locator == "btnSubmit"
    assert submit.test_data_hints["desktop_object_key"] == "btnsubmit"
    assert submit.test_data_hints["locator_context"]["nearby_siblings"] == ["Customer Name"]
    assert {
        (locator.strategy, locator.locator)
        for locator in submit.alternative_locators
    } >= {
        ("accessibility id", "btnSubmit"),
        ("name", "Submit Invoice"),
        ("class name", "Button"),
    }


@pytest.mark.asyncio
async def test_desktop_discovery_uses_generated_step_intents_before_scraping():
    ui_tree = """
    <UITree>
      <control type="Edit" name="Project Name" auto_id="txtProjectName" class_name="Edit" />
      <control type="Button" name="Create" auto_id="btnCreate" class_name="Button" />
    </UITree>
    """
    driver = _driver(ui_tree)
    step_intents = [
        {
            "test_case_title": "Create IntelliJ Project",
            "step_number": 2,
            "action_type": "fill",
            "description": "Enter project name",
            "target_hint": "project name",
            "input_value": "SampleProject",
            "data_intent": "",
        },
        {
            "test_case_title": "Create IntelliJ Project",
            "step_number": 3,
            "action_type": "click",
            "description": "Click Create project",
            "target_hint": "create project",
            "input_value": "",
            "data_intent": "",
        },
    ]

    with patch("app.ai_workflow.discovery.desktop_adapter.get_driver", return_value=driver):
        result = await DesktopDiscoveryAdapter(driver_type="uia3").discover(
            app=r"C:\Apps\idea64.exe",
            page_name="IntelliJ IDEA",
            platform="desktop",
            save_mode="preview",
            page_id="page-1",
            db=MagicMock(),
            step_intents=step_intents,
        )

    project_name = next(element for element in result.elements if element.id_attr == "txtProjectName")
    create = next(element for element in result.elements if element.id_attr == "btnCreate")

    assert result.page["scrape_step_intents"] == step_intents
    assert "step-aware-scrape" in project_name.tags
    assert "step-intent-match" in project_name.tags
    assert project_name.test_data_hints["matched_step_intents"][0]["step_number"] == 2
    assert create.test_data_hints["matched_step_intents"][0]["step_number"] == 3
    assert project_name.confidence_score == 1.0


@pytest.mark.asyncio
async def test_desktop_discovery_can_attach_when_app_path_is_empty():
    driver = _driver('<UITree><control type="Button" name="OK" auto_id="btnOk" /></UITree>')

    with patch("app.ai_workflow.discovery.desktop_adapter.get_driver", return_value=driver):
        result = await DesktopDiscoveryAdapter(driver_type="uia3").discover(
            app="",
            page_name="Existing Window",
            platform="desktop",
            save_mode="preview",
            page_id="page-1",
            db=MagicMock(),
            window_title="Existing Window",
        )

    assert result.elements[0].id_attr == "btnOk"
    driver.attach.assert_awaited_once_with(window_title="Existing Window", process_name=None)


@pytest.mark.asyncio
async def test_desktop_discovery_waits_until_ui_tree_has_objects():
    driver = _driver_with_trees([
        "<UITree></UITree>",
        '<UITree><control type="Button" name="Run" auto_id="btnRun" /></UITree>',
        '<UITree><control type="Button" name="Run" auto_id="btnRun" /></UITree>',
    ])

    with patch("app.ai_workflow.discovery.desktop_adapter.get_driver", return_value=driver):
        result = await DesktopDiscoveryAdapter(
            driver_type="uia3",
            poll_interval_ms=1,
            settle_ms=0,
        ).discover(
            app=r"C:\Apps\idea64.exe",
            page_name="IntelliJ IDEA",
            platform="desktop",
            save_mode="preview",
            page_id="page-1",
            db=MagicMock(),
        )

    assert result.summary.elements_found == 1
    assert result.elements[0].id_attr == "btnRun"
    assert driver.get_ui_tree.await_count == 3
    driver.wait_app.assert_awaited_once()


@pytest.mark.asyncio
async def test_desktop_discovery_raises_when_no_objects_are_captured():
    driver = _driver_with_trees(["<UITree></UITree>", "<UITree></UITree>"])

    with patch("app.ai_workflow.discovery.desktop_adapter.get_driver", return_value=driver):
        with pytest.raises(RuntimeError, match="UID/UIA object candidates"):
            await DesktopDiscoveryAdapter(
                driver_type="uia3",
                timeout_ms=1000,
                poll_interval_ms=1,
                settle_ms=0,
            ).discover(
                app=r"C:\Apps\idea64.exe",
                page_name="IntelliJ IDEA",
                platform="desktop",
                save_mode="preview",
                page_id="page-1",
                db=MagicMock(),
            )
