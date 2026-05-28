"""Desktop recorder API."""
from __future__ import annotations

import subprocess
import sys
import zipfile
import json
from io import BytesIO
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models import DesktopRecordedActionModel, DesktopRecordingSessionModel
from app.database.session import get_db
from app.execution.plugins.desktop.recorder import compile_recording

router = APIRouter(prefix="/desktop-recorder", tags=["desktop-recorder"])


def _db_utcnow() -> datetime:
    """Return naive UTC for Postgres TIMESTAMP WITHOUT TIME ZONE columns."""
    return datetime.now(UTC).replace(tzinfo=None)


class RecorderSessionCreate(BaseModel):
    name: str = "Desktop Recording"
    application: str = ""
    application_path: str = ""
    window_title: str = ""
    process_name: str = ""
    driver_type: str = "uia3"
    repository_page_id: Optional[str] = None
    metadata: dict[str, Any] = {}


class RecorderSessionResponse(BaseModel):
    id: str
    name: str
    status: str
    application: str = ""
    application_path: str = ""
    window_title: str = ""
    process_name: str = ""
    driver_type: str = "uia3"
    repository_page_id: Optional[str] = None
    metadata: dict[str, Any] = {}
    action_count: int = 0
    started_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class RecordedActionCreate(BaseModel):
    action_type: str
    object_key: str = ""
    object_name: str = ""
    control_type: str = ""
    automation_id: str = ""
    name_text: str = ""
    class_name: str = ""
    uia_path: str = ""
    locator_strategy: str = ""
    value: str = ""
    expected: str = ""
    property_name: str = ""
    variable: str = ""
    window_title: str = ""
    screen: str = ""
    x: Optional[float] = None
    y: Optional[float] = None
    duration_ms: Optional[int] = None
    locators: list[dict[str, Any]] = []
    screenshot_artifact_id: str = ""
    ui_tree_artifact_id: str = ""
    metadata: dict[str, Any] = {}


class RecordedActionResponse(RecordedActionCreate):
    id: str
    session_id: str
    action_order: int
    created_at: datetime


class RecorderSessionDetail(RecorderSessionResponse):
    actions: list[RecordedActionResponse]


class RecorderCompileResponse(BaseModel):
    session_id: str
    name: str
    platform: str
    keyword_steps: list[dict[str, Any]]
    workflow: dict[str, Any]
    repository_suggestions: list[dict[str, Any]]
    component_suggestions: list[dict[str, Any]] = Field(default_factory=list)
    summary: dict[str, Any]


class RecorderAgentCommandRequest(BaseModel):
    api_url: str = "http://localhost:8000/api"
    session_id: str = ""
    name: str = "Live Desktop Recording"
    application: str = ""
    application_path: str = ""
    window_title: str = ""
    process_name: str = ""
    driver_type: str = "uia3"
    stop_hotkey: str = "ctrl+shift+q"
    pause_hotkey: str = "ctrl+shift+p"
    flush_interval_ms: int = 900


class RecorderAgentCommandResponse(BaseModel):
    command: str
    script_path: str
    requirements: list[str]
    stop_hotkey: str
    pause_hotkey: str


class DesktopMcpCommandRequest(RecorderAgentCommandRequest):
    mode: str = Field(default="stdio", pattern="^(stdio|watch)$")


class DesktopMcpCommandResponse(RecorderAgentCommandResponse):
    mode: str
    tools: list[str]


AGENT_PACKAGE_ROOT = "nexcore-desktop-recorder-agent"
AGENT_REQUIREMENTS = ["pywinauto>=0.6.8", "pynput>=1.7.6"]
MCP_PACKAGE_ROOT = "nexcore-desktop-mcp-server"
MCP_REQUIREMENTS = ["pywinauto>=0.6.8", "pynput>=1.7.6", "Pillow>=10.0.0"]
MCP_TOOLS = [
    "desktop_active_window",
    "desktop_snapshot",
    "desktop_capture_object",
    "desktop_create_recorder_session",
    "desktop_record_action",
    "desktop_stop_recorder_session",
]


def _agent_script_path() -> Path:
    return Path(__file__).resolve().parents[3] / "tools" / "desktop_recorder_agent.py"


def _mcp_script_path() -> Path:
    return Path(__file__).resolve().parents[3] / "tools" / "desktop_mcp_server.py"


def _safe_filename(value: str, fallback: str = "desktop-recorder") -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in str(value or "").strip().lower())
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return cleaned or fallback


def _agent_arg_pairs(body: RecorderAgentCommandRequest) -> list[tuple[str, str]]:
    pairs = [
        ("--api-url", body.api_url),
        ("--name", body.name),
        ("--driver-type", body.driver_type),
        ("--stop-hotkey", body.stop_hotkey),
        ("--pause-hotkey", body.pause_hotkey),
        ("--flush-interval-ms", str(body.flush_interval_ms)),
    ]
    optional_args = {
        "--session-id": body.session_id,
        "--application": body.application,
        "--application-path": body.application_path,
        "--window-title": body.window_title,
        "--process-name": body.process_name,
    }
    for flag, value in optional_args.items():
        if value:
            pairs.append((flag, value))
    return pairs


def _build_agent_command(body: RecorderAgentCommandRequest) -> RecorderAgentCommandResponse:
    script_path = _agent_script_path()
    args = [
        sys.executable or "python",
        str(script_path),
    ]
    for flag, value in _agent_arg_pairs(body):
        args.extend([flag, value])
    return RecorderAgentCommandResponse(
        command=subprocess.list2cmdline(args),
        script_path=str(script_path),
        requirements=[item.split(">=")[0] for item in AGENT_REQUIREMENTS],
        stop_hotkey=body.stop_hotkey,
        pause_hotkey=body.pause_hotkey,
    )


def _mcp_arg_pairs(body: DesktopMcpCommandRequest) -> list[tuple[str, str]]:
    pairs = [
        ("--api-url", body.api_url),
        ("--name", body.name),
        ("--driver-type", body.driver_type),
        ("--mode", body.mode),
        ("--stop-hotkey", body.stop_hotkey),
        ("--pause-hotkey", body.pause_hotkey),
    ]
    optional_args = {
        "--session-id": body.session_id,
        "--application": body.application,
        "--application-path": body.application_path,
        "--window-title": body.window_title,
        "--process-name": body.process_name,
    }
    for flag, value in optional_args.items():
        if value:
            pairs.append((flag, value))
    return pairs


def _build_mcp_command(body: DesktopMcpCommandRequest) -> DesktopMcpCommandResponse:
    script_path = _mcp_script_path()
    args = [
        sys.executable or "python",
        str(script_path),
    ]
    for flag, value in _mcp_arg_pairs(body):
        args.extend([flag, value])
    return DesktopMcpCommandResponse(
        command=subprocess.list2cmdline(args),
        script_path=str(script_path),
        requirements=[item.split(">=")[0] for item in MCP_REQUIREMENTS],
        stop_hotkey=body.stop_hotkey,
        pause_hotkey=body.pause_hotkey,
        mode=body.mode,
        tools=MCP_TOOLS,
    )


def _ps_single_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _agent_config(body: RecorderAgentCommandRequest) -> dict[str, Any]:
    return {
        "api_url": body.api_url,
        "session_id": body.session_id,
        "name": body.name,
        "application": body.application,
        "application_path": body.application_path,
        "window_title": body.window_title,
        "process_name": body.process_name,
        "driver_type": body.driver_type,
        "stop_hotkey": body.stop_hotkey,
        "pause_hotkey": body.pause_hotkey,
        "flush_interval_ms": body.flush_interval_ms,
        "requirements": AGENT_REQUIREMENTS,
    }


def _mcp_config(body: DesktopMcpCommandRequest) -> dict[str, Any]:
    return {
        "api_url": body.api_url,
        "session_id": body.session_id,
        "name": body.name,
        "application": body.application,
        "application_path": body.application_path,
        "window_title": body.window_title,
        "process_name": body.process_name,
        "driver_type": body.driver_type,
        "mode": body.mode,
        "stop_hotkey": body.stop_hotkey,
        "pause_hotkey": body.pause_hotkey,
        "requirements": MCP_REQUIREMENTS,
        "tools": MCP_TOOLS,
    }


def _agent_launcher_ps1(body: RecorderAgentCommandRequest) -> str:
    arg_lines: list[str] = []
    for flag, value in _agent_arg_pairs(body):
        arg_lines.append(f"    {_ps_single_quote(flag)}")
        arg_lines.append(f"    {_ps_single_quote(value)}")
    args_literal = ",\n".join(arg_lines)
    return f"""$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv = Join-Path $Root '.venv'
$Python = Join-Path $Venv 'Scripts\\python.exe'
$Pip = Join-Path $Venv 'Scripts\\pip.exe'
$Script = Join-Path $Root 'desktop_recorder_agent.py'

if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) {{
    throw 'Python was not found. Install Python 3.11+ and rerun this launcher.'
}}

if (-not (Test-Path $Python)) {{
    if (Get-Command py -ErrorAction SilentlyContinue) {{
        py -3 -m venv $Venv
    }} else {{
        python -m venv $Venv
    }}
}}

& $Python -m pip install --upgrade pip
& $Pip install -r (Join-Path $Root 'requirements.txt')

$ArgsList = @(
{args_literal}
)

Write-Host 'Starting NexCore Desktop Recorder Agent...'
Write-Host 'Stop hotkey: {body.stop_hotkey} | Pause/resume hotkey: {body.pause_hotkey}'
& $Python $Script @ArgsList
"""


def _mcp_launcher_ps1(body: DesktopMcpCommandRequest) -> str:
    arg_lines: list[str] = []
    for flag, value in _mcp_arg_pairs(body):
        arg_lines.append(f"    {_ps_single_quote(flag)}")
        arg_lines.append(f"    {_ps_single_quote(value)}")
    args_literal = ",\n".join(arg_lines)
    return f"""$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv = Join-Path $Root '.venv'
$Python = Join-Path $Venv 'Scripts\\python.exe'
$Pip = Join-Path $Venv 'Scripts\\pip.exe'
$Script = Join-Path $Root 'desktop_mcp_server.py'

if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) {{
    throw 'Python was not found. Install Python 3.11+ and rerun this launcher.'
}}

if (-not (Test-Path $Python)) {{
    if (Get-Command py -ErrorAction SilentlyContinue) {{
        py -3 -m venv $Venv
    }} else {{
        python -m venv $Venv
    }}
}}

& $Python -m pip install --upgrade pip
& $Pip install -r (Join-Path $Root 'requirements.txt')

$ArgsList = @(
{args_literal}
)

Write-Host 'Starting NexCore Desktop MCP Server...'
Write-Host 'Mode: {body.mode} | Tools: {", ".join(MCP_TOOLS)}'
& $Python $Script @ArgsList
"""


def _agent_launcher_bat() -> str:
    return """@echo off
setlocal
set ROOT=%~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%start-recorder.ps1"
echo.
echo Recorder agent exited. Press any key to close this window.
pause > nul
"""


def _mcp_launcher_bat() -> str:
    return """@echo off
setlocal
set ROOT=%~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%start-mcp-server.ps1"
echo.
echo Desktop MCP server exited. Press any key to close this window.
pause > nul
"""


def _agent_readme(body: RecorderAgentCommandRequest) -> str:
    return f"""# NexCore Desktop Recorder Agent

This package records Windows desktop actions and posts them into NexCore Desktop Recorder.

## Start

1. Extract this zip on the Windows desktop machine where the app under test is installed.
2. Double-click `start-recorder.bat`.
3. Use the target desktop application normally.
4. Press `{body.pause_hotkey}` to pause or resume recording.
5. Press `{body.stop_hotkey}` to stop recording and close the agent.
6. Return to NexCore Desktop Recorder and click Compile.

## Session

- API URL: `{body.api_url}`
- Session ID: `{body.session_id or '(agent will create one)'}`
- Name: `{body.name}`
- Driver: `{body.driver_type}`

## Requirements

The launcher creates a local `.venv` folder and installs:

- pywinauto
- pynput

No project files are modified by this package.
"""


def _mcp_readme(body: DesktopMcpCommandRequest) -> str:
    tool_lines = "\n".join(f"- `{tool}`" for tool in MCP_TOOLS)
    return f"""# NexCore Desktop MCP Server

This package runs a local MCP-compatible desktop automation server for Windows.
It lets AI clients inspect the active desktop, capture UI Automation object
metadata, collect screenshot evidence, and post captured actions into NexCore
Desktop Recorder.

## Start

1. Extract this zip on the Windows desktop machine where the app under test is installed.
2. Double-click `start-mcp-server.bat` for a local run, or point your MCP client at `desktop_mcp_server.py`.
3. Use stdio mode for MCP clients. Use watch mode when you want automatic click capture into a recorder session.

## MCP Client Command

```powershell
python desktop_mcp_server.py --api-url {body.api_url} --mode stdio
```

## Included MCP Tools

{tool_lines}

## NexCore Session

- API URL: `{body.api_url}`
- Session ID: `{body.session_id or '(MCP server can create one)'}`
- Name: `{body.name}`
- Driver: `{body.driver_type}`
- Mode: `{body.mode}`

## Requirements

The launcher creates a local `.venv` folder and installs:

- pywinauto
- pynput
- Pillow
"""


def _build_agent_package(body: RecorderAgentCommandRequest) -> bytes:
    script_path = _agent_script_path()
    if not script_path.exists():
        raise HTTPException(status_code=500, detail="Desktop recorder agent script not found")

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        root = AGENT_PACKAGE_ROOT
        archive.writestr(f"{root}/desktop_recorder_agent.py", script_path.read_text(encoding="utf-8"))
        archive.writestr(f"{root}/requirements.txt", "\n".join(AGENT_REQUIREMENTS) + "\n")
        archive.writestr(f"{root}/agent-config.json", json.dumps(_agent_config(body), indent=2))
        archive.writestr(f"{root}/start-recorder.ps1", _agent_launcher_ps1(body))
        archive.writestr(f"{root}/start-recorder.bat", _agent_launcher_bat())
        archive.writestr(f"{root}/README.md", _agent_readme(body))
    return buffer.getvalue()


def _build_mcp_package(body: DesktopMcpCommandRequest) -> bytes:
    script_path = _mcp_script_path()
    recorder_path = _agent_script_path()
    if not script_path.exists():
        raise HTTPException(status_code=500, detail="Desktop MCP server script not found")

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        root = MCP_PACKAGE_ROOT
        archive.writestr(f"{root}/desktop_mcp_server.py", script_path.read_text(encoding="utf-8"))
        if recorder_path.exists():
            archive.writestr(f"{root}/desktop_recorder_agent.py", recorder_path.read_text(encoding="utf-8"))
        archive.writestr(f"{root}/requirements.txt", "\n".join(MCP_REQUIREMENTS) + "\n")
        archive.writestr(f"{root}/mcp-config.json", json.dumps(_mcp_config(body), indent=2))
        archive.writestr(f"{root}/start-mcp-server.ps1", _mcp_launcher_ps1(body))
        archive.writestr(f"{root}/start-mcp-server.bat", _mcp_launcher_bat())
        archive.writestr(f"{root}/README.md", _mcp_readme(body))
    return buffer.getvalue()


def _session_response(session: DesktopRecordingSessionModel, action_count: int | None = None) -> RecorderSessionResponse:
    return RecorderSessionResponse(
        id=session.id,
        name=session.name,
        status=session.status,
        application=session.application or "",
        application_path=session.application_path or "",
        window_title=session.window_title or "",
        process_name=session.process_name or "",
        driver_type=session.driver_type or "uia3",
        repository_page_id=session.repository_page_id,
        metadata=session.metadata_ or {},
        action_count=action_count if action_count is not None else len(session.actions or []),
        started_at=session.started_at,
        stopped_at=session.stopped_at,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def _action_response(action: DesktopRecordedActionModel) -> RecordedActionResponse:
    return RecordedActionResponse(
        id=action.id,
        session_id=action.session_id,
        action_order=action.action_order,
        action_type=action.action_type,
        object_key=action.object_key or "",
        object_name=action.object_name or "",
        control_type=action.control_type or "",
        automation_id=action.automation_id or "",
        name_text=action.name_text or "",
        class_name=action.class_name or "",
        uia_path=action.uia_path or "",
        locator_strategy=action.locator_strategy or "",
        value=action.value or "",
        expected=action.expected or "",
        property_name=action.property_name or "",
        variable=action.variable or "",
        window_title=action.window_title or "",
        screen=action.screen or "",
        x=action.x,
        y=action.y,
        duration_ms=action.duration_ms,
        locators=action.locators or [],
        screenshot_artifact_id=action.screenshot_artifact_id or "",
        ui_tree_artifact_id=action.ui_tree_artifact_id or "",
        metadata=action.action_metadata or {},
        created_at=action.created_at,
    )


async def _load_session(session_id: str, db: AsyncSession) -> DesktopRecordingSessionModel:
    result = await db.execute(
        select(DesktopRecordingSessionModel)
        .where(DesktopRecordingSessionModel.id == session_id)
        .options(selectinload(DesktopRecordingSessionModel.actions))
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Desktop recording session not found")
    return session


@router.post("/agent-command", response_model=RecorderAgentCommandResponse)
async def build_recorder_agent_command(body: RecorderAgentCommandRequest):
    return _build_agent_command(body)


@router.post("/mcp-command", response_model=DesktopMcpCommandResponse)
async def build_desktop_mcp_command(body: DesktopMcpCommandRequest):
    return _build_mcp_command(body)


@router.post("/agent-package")
async def download_recorder_agent_package(body: RecorderAgentCommandRequest):
    package = _build_agent_package(body)
    filename = f"nexcore-desktop-recorder-agent-{_safe_filename(body.name)}.zip"
    return StreamingResponse(
        BytesIO(package),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/mcp-package")
async def download_desktop_mcp_package(body: DesktopMcpCommandRequest):
    package = _build_mcp_package(body)
    filename = f"nexcore-desktop-mcp-server-{_safe_filename(body.name, 'desktop-mcp')}.zip"
    return StreamingResponse(
        BytesIO(package),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sessions", response_model=list[RecorderSessionResponse])
async def list_recording_sessions(status_filter: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = (
        select(DesktopRecordingSessionModel, func.count(DesktopRecordedActionModel.id))
        .outerjoin(DesktopRecordedActionModel)
        .group_by(DesktopRecordingSessionModel.id)
        .order_by(DesktopRecordingSessionModel.created_at.desc())
    )
    if status_filter:
        query = query.where(DesktopRecordingSessionModel.status == status_filter)
    rows = (await db.execute(query)).all()
    return [_session_response(session, int(count or 0)) for session, count in rows]


@router.post("/sessions", response_model=RecorderSessionDetail, status_code=status.HTTP_201_CREATED)
async def create_recording_session(body: RecorderSessionCreate, db: AsyncSession = Depends(get_db)):
    now = _db_utcnow()
    session = DesktopRecordingSessionModel(
        name=body.name,
        status="recording",
        application=body.application,
        application_path=body.application_path,
        window_title=body.window_title,
        process_name=body.process_name,
        driver_type=body.driver_type,
        repository_page_id=body.repository_page_id,
        metadata_=body.metadata,
        started_at=now,
    )
    db.add(session)
    await db.commit()
    return await get_recording_session(session.id, db)


@router.get("/sessions/{session_id}", response_model=RecorderSessionDetail)
async def get_recording_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await _load_session(session_id, db)
    base = _session_response(session)
    return RecorderSessionDetail(**base.model_dump(), actions=[_action_response(action) for action in session.actions or []])


@router.post("/sessions/{session_id}/stop", response_model=RecorderSessionDetail)
async def stop_recording_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await _load_session(session_id, db)
    session.status = "stopped"
    session.stopped_at = _db_utcnow()
    await db.commit()
    return await get_recording_session(session_id, db)


@router.post("/sessions/{session_id}/actions", response_model=RecordedActionResponse, status_code=status.HTTP_201_CREATED)
async def add_recorded_action(session_id: str, body: RecordedActionCreate, db: AsyncSession = Depends(get_db)):
    session = await _load_session(session_id, db)
    if session.status not in {"recording", "paused"}:
        raise HTTPException(status_code=409, detail="Recording session is not accepting actions")
    next_order = len(session.actions or []) + 1
    action = DesktopRecordedActionModel(
        session_id=session.id,
        action_order=next_order,
        action_type=body.action_type,
        object_key=body.object_key,
        object_name=body.object_name,
        control_type=body.control_type,
        automation_id=body.automation_id,
        name_text=body.name_text,
        class_name=body.class_name,
        uia_path=body.uia_path,
        locator_strategy=body.locator_strategy,
        value=body.value,
        expected=body.expected,
        property_name=body.property_name,
        variable=body.variable,
        window_title=body.window_title,
        screen=body.screen,
        x=body.x,
        y=body.y,
        duration_ms=body.duration_ms,
        locators=body.locators,
        screenshot_artifact_id=body.screenshot_artifact_id,
        ui_tree_artifact_id=body.ui_tree_artifact_id,
        action_metadata=body.metadata,
    )
    db.add(action)
    await db.commit()
    await db.refresh(action)
    return _action_response(action)


@router.post("/sessions/{session_id}/compile", response_model=RecorderCompileResponse)
async def compile_recording_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await _load_session(session_id, db)
    return compile_recording(session, list(session.actions or []))


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_recording_session(session_id: str, db: AsyncSession = Depends(get_db)):
    await _load_session(session_id, db)
    await db.execute(delete(DesktopRecordingSessionModel).where(DesktopRecordingSessionModel.id == session_id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
