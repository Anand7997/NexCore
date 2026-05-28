"""Desktop recorder timestamp regression tests."""
from __future__ import annotations

import json
import zipfile
from io import BytesIO

import pytest
from httpx import AsyncClient

from app.api.routes.desktop_recorder import _db_utcnow


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
