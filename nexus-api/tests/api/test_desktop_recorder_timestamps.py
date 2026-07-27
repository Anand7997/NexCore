"""Desktop recorder timestamp regression tests."""
from __future__ import annotations

import json
import uuid
import zipfile
from io import BytesIO

import pytest
from sqlalchemy import func, select
from httpx import AsyncClient

from app.api.routes.desktop_recorder import _db_utcnow
from app.database.models import DesktopRecordedActionModel, WorkflowModel
from app.database.session import AsyncSessionLocal


def test_db_utcnow_returns_naive_datetime():
    now = _db_utcnow()

    assert now.tzinfo is None


@pytest.mark.asyncio
async def test_create_stop_and_delete_recording_session(client: AsyncClient):
    create_response = await client.post(
        "/api/desktop-recorder/sessions",
        json={
            "name": "Recorder Smoke Test",
            "application": "Desktop App",
            "driver_type": "uia3",
            "metadata": {"source": "pytest"},
        },
    )

    assert create_response.status_code == 201
    session = create_response.json()
    assert session["id"]
    assert session["status"] == "recording"
    assert session["started_at"] is not None

    stop_response = await client.post(f"/api/desktop-recorder/sessions/{session['id']}/stop")
    assert stop_response.status_code == 200
    stopped = stop_response.json()
    assert stopped["status"] == "stopped"
    assert stopped["stopped_at"] is not None

    delete_response = await client.delete(f"/api/desktop-recorder/sessions/{session['id']}")
    assert delete_response.status_code == 204
    assert delete_response.content == b""


@pytest.mark.asyncio
async def test_delete_recording_session_removes_recorded_actions(client: AsyncClient):
    create_response = await client.post(
        "/api/desktop-recorder/sessions",
        json={"name": "Delete With Actions", "application": "Desktop App"},
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    action_response = await client.post(
        f"/api/desktop-recorder/sessions/{session_id}/actions",
        json={
            "action_type": "click",
            "object_key": "ok_button",
            "object_name": "OK",
            "automation_id": "btnOK",
        },
    )
    assert action_response.status_code == 201

    delete_response = await client.delete(f"/api/desktop-recorder/sessions/{session_id}")
    assert delete_response.status_code == 204

    get_response = await client.get(f"/api/desktop-recorder/sessions/{session_id}")
    assert get_response.status_code == 404

    async with AsyncSessionLocal() as db:
        remaining = await db.scalar(
            select(func.count(DesktopRecordedActionModel.id)).where(
                DesktopRecordedActionModel.session_id == session_id,
            )
        )
    assert remaining == 0


@pytest.mark.asyncio
async def test_delete_recording_session_archives_saved_workflows(client: AsyncClient):
    create_response = await client.post(
        "/api/desktop-recorder/sessions",
        json={"name": "Legacy IntelliJ", "application": "IntelliJ", "driver_type": "uia3"},
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    linked_id = str(uuid.uuid4())
    legacy_id = str(uuid.uuid4())
    unrelated_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        db.add_all(
            [
                WorkflowModel(
                    id=linked_id,
                    name="Renamed Saved Workflow",
                    status="active",
                    tags=["desktop", "recorded"],
                    platforms=["desktop"],
                    variables={"desktop_recorder_session_id": session_id},
                ),
                WorkflowModel(
                    id=legacy_id,
                    name="Legacy IntelliJ Workflow",
                    status="active",
                    tags=["desktop", "recorded"],
                    platforms=["desktop"],
                    variables={},
                ),
                WorkflowModel(
                    id=unrelated_id,
                    name="Legacy IntelliJ Workflow",
                    status="active",
                    tags=["desktop"],
                    platforms=["desktop"],
                    variables={},
                ),
            ]
        )
        await db.commit()

    delete_response = await client.delete(f"/api/desktop-recorder/sessions/{session_id}")
    assert delete_response.status_code == 204

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(WorkflowModel.id, WorkflowModel.status).where(
                    WorkflowModel.id.in_([linked_id, legacy_id, unrelated_id])
                )
            )
        ).all()

    statuses = {workflow_id: status for workflow_id, status in rows}
    assert statuses[linked_id] == "archived"
    assert statuses[legacy_id] == "archived"
    assert statuses[unrelated_id] == "active"


@pytest.mark.asyncio
async def test_recorded_action_fills_empty_session_context(client: AsyncClient):
    create_response = await client.post(
        "/api/desktop-recorder/sessions",
        json={"name": "Context Learning", "application": "", "application_path": "", "window_title": ""},
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    action_response = await client.post(
        f"/api/desktop-recorder/sessions/{session_id}/actions",
        json={
            "action_type": "click",
            "object_key": "save_button",
            "object_name": "Save",
            "window_title": "Invoice App - Order 42",
            "metadata": {
                "application": "Invoice App",
                "application_path": r"C:\Apps\Invoice.exe",
                "process_name": "Invoice.exe",
            },
        },
    )
    assert action_response.status_code == 201

    session_response = await client.get(f"/api/desktop-recorder/sessions/{session_id}")
    assert session_response.status_code == 200
    session = session_response.json()
    assert session["application"] == "Invoice App"
    assert session["application_path"] == r"C:\Apps\Invoice.exe"
    assert session["window_title"] == "Invoice App - Order 42"
    assert session["process_name"] == "Invoice.exe"


@pytest.mark.asyncio
async def test_update_and_delete_recorded_actions_recompile_steps(client: AsyncClient):
    create_response = await client.post(
        "/api/desktop-recorder/sessions",
        json={"name": "Action CRUD", "application": "Desktop App"},
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    actions = [
        {"action_type": "click", "object_key": "first", "object_name": "First"},
        {"action_type": "click", "object_key": "second", "object_name": "Second"},
        {"action_type": "click", "object_key": "third", "object_name": "Third"},
    ]
    created = []
    for action in actions:
        response = await client.post(f"/api/desktop-recorder/sessions/{session_id}/actions", json=action)
        assert response.status_code == 201
        created.append(response.json())

    update_response = await client.patch(
        f"/api/desktop-recorder/sessions/{session_id}/actions/{created[1]['id']}",
        json={"action_type": "type_text", "value": "edited", "action_order": 1},
    )
    assert update_response.status_code == 200
    assert update_response.json()["action_type"] == "type_text"
    assert update_response.json()["action_order"] == 1

    delete_response = await client.delete(
        f"/api/desktop-recorder/sessions/{session_id}/actions/{created[0]['id']}",
    )
    assert delete_response.status_code == 204

    session_response = await client.get(f"/api/desktop-recorder/sessions/{session_id}")
    assert session_response.status_code == 200
    rows = session_response.json()["actions"]
    assert [row["action_order"] for row in rows] == [1, 2]
    assert [row["object_key"] for row in rows] == ["second", "third"]

    compile_response = await client.post(f"/api/desktop-recorder/sessions/{session_id}/compile")
    assert compile_response.status_code == 200
    compiled = compile_response.json()
    assert [step["step"] for step in compiled["keyword_steps"]] == [1, 2]
    assert compiled["keyword_steps"][0]["operation"] == "type_text"
    assert compiled["keyword_steps"][0]["value"] == "edited"


@pytest.mark.asyncio
async def test_live_agent_actions_compile_to_stable_keyword_workflow(client: AsyncClient):
    create_response = await client.post(
        "/api/desktop-recorder/sessions",
        json={
            "name": "Live Agent Compile Test",
            "application": "Invoice App",
            "application_path": r"C:\Apps\Invoice.exe",
            "window_title": "Invoice",
            "driver_type": "uia3",
            "metadata": {"source": "live_agent"},
        },
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    live_actions = [
        {
            "action_type": "click",
            "object_key": "new_invoice_button",
            "object_name": "New Invoice",
            "control_type": "button",
            "automation_id": "btnNewInvoice",
            "class_name": "Button",
            "window_title": "Invoice",
            "metadata": {"capture_source": "uia_agent"},
        },
        {
            "action_type": "type_text",
            "object_key": "customer_name_input",
            "object_name": "Customer Name",
            "control_type": "edit",
            "automation_id": "txtCustomerName",
            "value": "Asha Rao",
            "window_title": "Invoice",
            "metadata": {"capture_source": "uia_agent"},
        },
        {
            "action_type": "assert_text",
            "object_key": "status_label",
            "object_name": "Status",
            "control_type": "text",
            "automation_id": "lblStatus",
            "expected": "Draft",
            "window_title": "Invoice",
            "metadata": {"capture_source": "uia_agent"},
        },
    ]

    for action in live_actions:
        response = await client.post(f"/api/desktop-recorder/sessions/{session_id}/actions", json=action)
        assert response.status_code == 201

    compile_response = await client.post(f"/api/desktop-recorder/sessions/{session_id}/compile")
    assert compile_response.status_code == 200
    compiled = compile_response.json()

    node_types = [node["type"] for node in compiled["workflow"]["nodes"]]
    assert node_types == ["desktop.launch", "desktop.click", "desktop.type_text", "desktop.assert_text"]
    assert [step["operation"] for step in compiled["keyword_steps"]] == ["click", "type_text", "assert_text"]
    assert compiled["workflow"]["nodes"][1]["config"]["selector"] == "btnNewInvoice"
    assert compiled["workflow"]["nodes"][2]["config"]["value"] == "Asha Rao"
    assert compiled["repository_suggestions"][0]["object_key"] == "new_invoice_button"


@pytest.mark.asyncio
async def test_compile_returns_object_repository_diff_against_existing_objects(client: AsyncClient):
    create_object = await client.post(
        "/api/page-repository/desktop/objects",
        json={
            "application": "DiffApp",
            "object_key": "save_button",
            "name": "Save",
            "automation_id": "btnSave",
            "name_text": "Save",
            "class_name": "Button",
            "uia_path": "/Window/Button[1]",
            "locator_strategy": "accessibility id",
            "primary_locator": "btnSave",
            "window": "DiffApp",
        },
    )
    assert create_object.status_code == 201

    create_session = await client.post(
        "/api/desktop-recorder/sessions",
        json={"name": "Diff Flow", "application": "DiffApp", "driver_type": "uia3"},
    )
    assert create_session.status_code == 201
    session_id = create_session.json()["id"]

    actions = [
        {
            "action_type": "click",
            "object_key": "save_button",
            "object_name": "Save",
            "automation_id": "btnSave",
            "name_text": "Save",
            "class_name": "Button",
            "uia_path": "/Window/Button[1]",
            "window_title": "DiffApp",
        },
        {
            "action_type": "click",
            "object_key": "brand_new_button",
            "object_name": "Brand New",
            "automation_id": "btnBrandNew",
            "window_title": "DiffApp",
        },
    ]
    for action in actions:
        response = await client.post(f"/api/desktop-recorder/sessions/{session_id}/actions", json=action)
        assert response.status_code == 201

    compile_response = await client.post(f"/api/desktop-recorder/sessions/{session_id}/compile")
    assert compile_response.status_code == 200
    diff = compile_response.json()["object_repository_diff"]

    assert diff["summary"]["matched"] == 1
    assert diff["summary"]["new"] == 1
    matched_keys = [item["object_key"] for item in diff["matched"]]
    new_keys = [item["object_key"] for item in diff["new"]]
    assert "save_button" in matched_keys
    assert "brand_new_button" in new_keys


@pytest.mark.asyncio
async def test_analyze_recording_session_returns_semantics_and_evidence(client: AsyncClient):
    create_response = await client.post(
        "/api/desktop-recorder/sessions",
        json={"name": "Analyze Flow", "application": "Invoice", "application_path": r"C:\Apps\Invoice.exe", "window_title": "Invoice"},
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["id"]

    action_response = await client.post(
        f"/api/desktop-recorder/sessions/{session_id}/actions",
        json={
            "action_type": "click",
            "object_key": "save_button",
            "object_name": "Save",
            "automation_id": "btnSave",
            "screenshot_artifact_id": "png-save",
        },
    )
    assert action_response.status_code == 201

    analyze_response = await client.post(f"/api/desktop-recorder/sessions/{session_id}/analyze")
    assert analyze_response.status_code == 200
    body = analyze_response.json()

    assert body["semantic_analysis"]["total_steps"] == 1
    assert body["semantic_steps"][0]["semantic_intent"] == "submit_form"
    assert body["evidence_summary"]["steps_with_screenshot"] == 1
    assert body["evidence_steps"][0]["screenshot_artifact_id"] == "png-save"
    assert body["summary"]["semantic_step_count"] == 1


@pytest.mark.asyncio
async def test_download_recorder_agent_package_contains_launchers(client: AsyncClient):
    response = await client.post(
        "/api/desktop-recorder/agent-package",
        json={
            "api_url": "http://nexcore.local/api",
            "session_id": "session-123",
            "name": "Invoice Recording",
            "application_path": r"C:\Apps\Invoice.exe",
            "window_title": "Invoice",
            "stop_hotkey": "ctrl+shift+x",
            "pause_hotkey": "ctrl+shift+y",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/zip")
    assert "nexcore-desktop-recorder-agent-invoice-recording.zip" in response.headers["content-disposition"]

    with zipfile.ZipFile(BytesIO(response.content)) as archive:
        names = set(archive.namelist())
        root = "nexcore-desktop-recorder-agent"
        assert f"{root}/desktop_recorder_agent.py" in names
        assert f"{root}/requirements.txt" in names
        assert f"{root}/start-recorder.ps1" in names
        assert f"{root}/start-recorder.bat" in names
        assert f"{root}/README.md" in names
        config = json.loads(archive.read(f"{root}/agent-config.json").decode("utf-8"))
        launcher = archive.read(f"{root}/start-recorder.ps1").decode("utf-8")

    assert config["session_id"] == "session-123"
    assert config["api_url"] == "http://nexcore.local/api"
    assert "--session-id" in launcher
    assert "session-123" in launcher
    assert "ctrl+shift+x" in launcher
    assert "--trusted-host pypi.org" in launcher


@pytest.mark.asyncio
async def test_download_desktop_mcp_package_contains_mcp_server_and_config(client: AsyncClient):
    response = await client.post(
        "/api/desktop-recorder/mcp-package",
        json={
            "api_url": "http://nexcore.local/api",
            "session_id": "session-123",
            "name": "Invoice MCP",
            "application_path": r"C:\Apps\Invoice.exe",
            "window_title": "Invoice",
            "mode": "stdio",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/zip")
    assert "nexcore-desktop-mcp-server-invoice-mcp.zip" in response.headers["content-disposition"]

    with zipfile.ZipFile(BytesIO(response.content)) as archive:
        names = set(archive.namelist())
        root = "nexcore-desktop-mcp-server"
        assert f"{root}/desktop_mcp_server.py" in names
        assert f"{root}/desktop_recorder_agent.py" in names
        assert f"{root}/requirements.txt" in names
        assert f"{root}/start-mcp-server.ps1" in names
        assert f"{root}/start-mcp-server.bat" in names
        assert f"{root}/README.md" in names
        config = json.loads(archive.read(f"{root}/mcp-config.json").decode("utf-8"))
        launcher = archive.read(f"{root}/start-mcp-server.ps1").decode("utf-8")

    assert config["session_id"] == "session-123"
    assert config["mode"] == "stdio"
    assert "desktop_snapshot" in config["tools"]
    assert "--mode" in launcher
    assert "desktop_mcp_server.py" in launcher
    assert "--trusted-host pypi.org" in launcher
