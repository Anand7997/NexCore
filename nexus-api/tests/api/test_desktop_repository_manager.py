"""Desktop repository manager API coverage."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.events.brokers.memory import InMemoryBroker
from app.events.bus import init_event_bus


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


@pytest.mark.asyncio
async def test_sync_desktop_workflow_objects_into_repository(client: AsyncClient):
    init_event_bus(InMemoryBroker())

    workflow = await client.post("/api/workflows/", json={
        "name": "Invoice Workflow",
        "tags": ["desktop", "recorded"],
        "platforms": ["desktop"],
        "variables": {
            "desktop_recorder_session_name": "Invoice",
            "application_path": r"C:\Apps\Invoice.exe",
            "window_title": "Invoice",
            "process_name": "Invoice.exe",
        },
        "nodes": [
            {
                "node_key": "desktop_launch",
                "type": "desktop.launch",
                "label": "Launch Desktop Application",
                "config": {
                    "app": r"C:\Apps\Invoice.exe",
                    "window_title": "Invoice",
                    "process_name": "Invoice.exe",
                },
                "position": {"x": 0, "y": 120},
            },
            {
                "node_key": "recorded_step_1",
                "type": "desktop.click",
                "label": "Click - Save",
                "config": {
                    "object_key": "save_button",
                    "selector": "btnSave",
                    "strategy": "accessibility id",
                    "locators": [
                        {"strategy": "accessibility id", "locator": "btnSave", "score": 0.98},
                        {"strategy": "name", "locator": "Save", "score": 0.86},
                    ],
                },
                "position": {"x": 120, "y": 120},
            },
        ],
        "edges": [
            {"source_key": "desktop_launch", "target_key": "recorded_step_1", "execution_order": 1},
        ],
    })
    assert workflow.status_code == 201

    sync = await client.post("/api/page-repository/desktop/sync-workflows", json={})
    assert sync.status_code == 200
    body = sync.json()
    assert body["created"] == 1
    assert body["objects"][0]["object_key"] == "save_button"
    assert body["objects"][0]["workflow_name"] == "Invoice Workflow"

    listed = await client.get("/api/page-repository/desktop/objects?search=save")
    assert listed.status_code == 200
    objects = listed.json()
    assert len(objects) == 1
    assert objects[0]["application"] == "Invoice"
    assert objects[0]["automation_id"] == "btnSave"
    assert objects[0]["window"] == "Invoice"


@pytest.mark.asyncio
async def test_sync_recorded_window_uses_application_name_for_placeholder_title(client: AsyncClient):
    session_response = await client.post("/api/desktop-recorder/sessions", json={
        "name": "Intellij",
        "application_path": r"C:\Apps\idea64.exe",
        "window_title": "IDE",
        "driver_type": "uia3",
    })
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    action_response = await client.post(f"/api/desktop-recorder/sessions/{session_id}/actions", json={
        "action_type": "click",
        "object_key": "untitled2",
        "object_name": "untitled2",
        "control_type": "Window",
        "name_text": "untitled2",
        "class_name": "SunAwtFrame",
        "uia_path": "/Pane[@Name='Desktop 1']/Window[@Name='untitled2']",
        "locator_strategy": "name",
        "window_title": "IDE",
        "screen": "IDE",
        "locators": [
            {"strategy": "name", "locator": "untitled2", "score": 0.86},
            {"strategy": "xpath", "locator": "/Pane[@Name='Desktop 1']/Window[@Name='untitled2']", "score": 0.74},
            {"strategy": "class name", "locator": "SunAwtFrame", "score": 0.56},
            {"strategy": "uia", "locator": "Window:untitled2", "score": 0.68},
        ],
    })
    assert action_response.status_code == 201

    sync = await client.post("/api/page-repository/desktop/sync-workflows", json={})
    assert sync.status_code == 200
    assert sync.json()["created"] == 1

    listed = await client.get("/api/page-repository/desktop/objects")
    assert listed.status_code == 200
    objects = listed.json()
    assert len(objects) == 1
    assert objects[0]["application"] == "Intellij"
    assert objects[0]["object_key"] == "intellij_window"
    assert objects[0]["name"] == "Intellij Window"
    assert objects[0]["primary_locator"] == "untitled2"
    assert objects[0]["name_text"] == "untitled2"
