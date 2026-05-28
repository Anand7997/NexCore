"""NL-to-workflow compiler API tests."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_compile_basic_description(client: AsyncClient):
    response = await client.post("/api/desktop-nl/compile", json={
        "description": "Launch the application. Click the Login button. Type admin in the username field. Click Submit.",
        "application": "MyApp",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["application"] == "MyApp"
    assert len(data["nodes"]) > 0
    assert data["workflow_id"]
    assert data["workflow_name"]


@pytest.mark.asyncio
async def test_compile_generates_repository_placeholders(client: AsyncClient):
    response = await client.post("/api/desktop-nl/compile", json={
        "description": "Click the Save button. Assert that the success label is visible.",
        "application": "TestApp",
    })
    assert response.status_code == 200
    data = response.json()
    assert len(data["repository_placeholders"]) > 0
    for ph in data["repository_placeholders"]:
        assert ph["placeholder_key"]
        assert ph["suggested_name"]


@pytest.mark.asyncio
async def test_compile_generates_test_data_for_type_steps(client: AsyncClient):
    response = await client.post("/api/desktop-nl/compile", json={
        "description": "Type 'hello world' in the search field.",
        "application": "TestApp",
    })
    assert response.status_code == 200
    data = response.json()
    assert len(data["test_data_placeholders"]) > 0


@pytest.mark.asyncio
async def test_compile_warns_when_no_application(client: AsyncClient):
    response = await client.post("/api/desktop-nl/compile", json={
        "description": "Click the OK button.",
    })
    assert response.status_code == 200
    data = response.json()
    assert any("application" in w.lower() or "{{test_data.application}}" in w for w in data["warnings"])
    assert any(q["field"] == "application" for q in data["clarifying_questions"])


@pytest.mark.asyncio
async def test_compile_rejects_empty_description(client: AsyncClient):
    response = await client.post("/api/desktop-nl/compile", json={
        "description": "    ",
        "application": "TestApp",
    })
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_compile_maps_known_actions_to_correct_node_types(client: AsyncClient):
    desc = (
        "Double-click the folder icon. "
        "Right-click the menu item. "
        "Drag the file to the destination. "
        "Press the Ctrl+S hotkey."
    )
    response = await client.post("/api/desktop-nl/compile", json={"description": desc, "application": "TestApp"})
    assert response.status_code == 200
    node_types = {n["node_type"] for n in response.json()["nodes"]}
    assert "desktop.double_click" in node_types or "desktop.drag_and_drop" in node_types or "desktop.hotkey" in node_types


@pytest.mark.asyncio
async def test_compile_assert_steps_produce_assert_nodes(client: AsyncClient):
    response = await client.post("/api/desktop-nl/compile", json={
        "description": "Verify that the status label shows 'Success'. Assert that the error dialog is not visible.",
        "application": "TestApp",
    })
    assert response.status_code == 200
    node_types = [n["node_type"] for n in response.json()["nodes"]]
    assert any("assert" in nt for nt in node_types)
