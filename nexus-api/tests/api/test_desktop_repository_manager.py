"""Desktop repository manager API coverage."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_desktop_repository_crud_profile_history_and_repository_match(client: AsyncClient):
    create = await client.post("/api/page-repository/desktop/objects", json={
        "application": "Invoice",
        "application_path": r"C:\Apps\Invoice.exe",
        "object_key": "save_button",
        "name": "Save",
        "control_type": "button",
        "automation_id": "btnSave",
        "name_text": "Save",
        "class_name": "Button",
        "locator_strategy": "accessibility id",
        "primary_locator": "btnSave",
        "tags": ["desktop-object"],
    })
    assert create.status_code == 201
    obj = create.json()

    listed = await client.get("/api/page-repository/desktop/objects?search=save")
    assert listed.status_code == 200
    assert any(item["object_key"] == "save_button" for item in listed.json())

    profile = await client.get("/api/page-repository/desktop/objects/save_button/locator-profile")
    assert profile.status_code == 200
    assert profile.json()["best_strategy"] in {"accessibility id", "accessibility_id"}

    update = await client.put("/api/page-repository/desktop/objects/save_button", json={"automation_id": "btnSave2"})
    assert update.status_code == 200
    assert update.json()["automation_id"] == "btnSave2"

    history = await client.get("/api/page-repository/desktop/objects/save_button/history")
    assert history.status_code == 200
    assert len(history.json()) >= 1

    match = await client.post("/api/desktop-spy/repository-match", json={
        "page_id": obj["page_id"],
        "candidate": {
            "object_key": "save_button_candidate",
            "name": "Save",
            "name_text": "Save",
            "automation_id": "btnSave2",
            "class_name": "Button",
            "control_type": "button",
        },
    })
    assert match.status_code == 200
    assert match.json()["suggestions"][0]["object_key"] == "save_button"
