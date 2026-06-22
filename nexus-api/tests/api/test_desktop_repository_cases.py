"""Reusable desktop testcase repository API coverage."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_save_and_insert_desktop_repository_case_uses_page_repository_links(client: AsyncClient):
    project = await client.post("/api/test-configuration/projects/", json={
        "name": "Desktop Project",
        "status": "active",
        "tags": ["desktop"],
    })
    assert project.status_code == 201
    project_id = project.json()["id"]

    module = await client.post(f"/api/test-configuration/projects/{project_id}/modules/", json={
        "name": "Invoice",
        "status": "active",
    })
    assert module.status_code == 201
    module_id = module.json()["id"]

    source_case = await client.post(f"/api/test-configuration/modules/{module_id}/cases/", json={
        "name": "Save Invoice",
        "platforms": ["desktop"],
        "tags": ["smoke"],
    })
    assert source_case.status_code == 201
    source_case_id = source_case.json()["id"]

    target_case = await client.post(f"/api/test-configuration/modules/{module_id}/cases/", json={
        "name": "Reuse Save Invoice",
        "platforms": ["desktop"],
    })
    assert target_case.status_code == 201
    target_case_id = target_case.json()["id"]

    page = await client.post("/api/page-repository/pages", json={
        "name": "Invoice App",
        "platform": "desktop",
        "url_pattern": r"C:\Apps\Invoice.exe",
    })
    assert page.status_code == 201
    page_id = page.json()["id"]

    element = await client.post(f"/api/page-repository/pages/{page_id}/elements", json={
        "name": "Save",
        "element_type": "button",
        "id_attr": "btnSave",
        "name_attr": "Save",
        "locator_strategy": "accessibility id",
        "discovery_metadata": {
            "platform": "desktop",
            "object_key": "save_button",
            "application": "Invoice App",
        },
    })
    assert element.status_code == 201
    element_id = element.json()["id"]

    step = await client.post(f"/api/test-configuration/cases/{source_case_id}/steps/", json={
        "name": "Click Save",
        "description": "Click Save",
        "step_order": 1,
        "action_type": "CLICK",
        "intent": "CLICK",
        "target": "Save",
        "page_id": page_id,
        "page_element_id": element_id,
        "test_data": {
            "platform": "desktop",
            "value": "",
        },
        "bindings": {
            "desktop": {
                "page_id": page_id,
                "page_element_id": element_id,
                "object_key": "save_button",
            },
        },
    })
    assert step.status_code == 201

    saved = await client.post("/api/desktop-repository/cases/from-test-case", json={
        "test_case_id": source_case_id,
        "tags": ["library"],
    })
    assert saved.status_code == 201
    library_case = saved.json()
    assert library_case["name"] == "Save Invoice"
    assert library_case["step_count"] == 1
    assert library_case["steps"][0]["page_element_id"] == element_id

    inserted = await client.post(f"/api/desktop-repository/cases/{library_case['id']}/insert", json={
        "target_test_case_id": target_case_id,
    })
    assert inserted.status_code == 200
    target = inserted.json()
    assert len(target["test_steps"]) == 1
    inserted_step = target["test_steps"][0]
    assert inserted_step["page_id"] == page_id
    assert inserted_step["page_element_id"] == element_id
    assert inserted_step["path_location"] == "btnSave"
    assert inserted_step["bindings"]["desktop"]["object_key"] == "save_button"
    assert inserted_step["test_data"]["desktop_repository"]["desktop_repository_case_id"] == library_case["id"]

    deleted = await client.delete(f"/api/desktop-repository/cases/{library_case['id']}")
    assert deleted.status_code == 204

    repeated_delete = await client.delete(f"/api/desktop-repository/cases/{library_case['id']}")
    assert repeated_delete.status_code == 204

    repository_cases = await client.get("/api/desktop-repository/cases")
    assert repository_cases.status_code == 200
    assert repository_cases.json() == []

    project_after_delete = await client.get(f"/api/test-configuration/projects/{project_id}")
    assert project_after_delete.status_code == 200
    cases_after_delete = {
        case["id"]: case
        for module_item in project_after_delete.json()["modules"]
        for case in module_item["test_cases"]
    }
    assert source_case_id in cases_after_delete
    assert target_case_id in cases_after_delete
    assert len(cases_after_delete[target_case_id]["test_steps"]) == 1
