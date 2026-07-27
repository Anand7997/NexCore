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

from app.database.models import (
    DesktopRecordedActionModel,
    DesktopRecordingSessionModel,
    PageRepositoryModel,
    WorkflowModel,
)
from app.database.session import get_db
from app.execution.plugins.desktop.recorder import (
    build_object_repository_diff,
    compile_recording,
    _is_bad_window_title,
)

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


class RecordedActionUpdate(BaseModel):
    action_order: Optional[int] = None
    action_type: Optional[str] = None
    object_key: Optional[str] = None
    object_name: Optional[str] = None
    control_type: Optional[str] = None
    automation_id: Optional[str] = None
    name_text: Optional[str] = None
    class_name: Optional[str] = None
    uia_path: Optional[str] = None
    locator_strategy: Optional[str] = None
    value: Optional[str] = None
    expected: Optional[str] = None
    property_name: Optional[str] = None
    variable: Optional[str] = None
    window_title: Optional[str] = None
    screen: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    duration_ms: Optional[int] = None
    locators: Optional[list[dict[str, Any]]] = None
    screenshot_artifact_id: Optional[str] = None
    ui_tree_artifact_id: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


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
    checkpoint_suggestions: list[dict[str, Any]] = Field(default_factory=list)
    parameter_suggestions: list[dict[str, Any]] = Field(default_factory=list)
    evidence_summary: dict[str, Any] = Field(default_factory=dict)
    evidence_steps: list[dict[str, Any]] = Field(default_factory=list)
    semantic_steps: list[dict[str, Any]] = Field(default_factory=list)
    semantic_analysis: dict[str, Any] = Field(default_factory=dict)
    quality_report: dict[str, Any] = Field(default_factory=dict)
    execution_readiness: dict[str, Any] = Field(default_factory=dict)
    object_repository_diff: dict[str, Any] = Field(default_factory=dict)
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


def _strip_wrapping_quotes(value: str) -> str:
    text = str(value or "").strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {"'", '"'}:
        return text[1:-1]
    return text


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
            pairs.append((flag, _strip_wrapping_quotes(value)))
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
            pairs.append((flag, _strip_wrapping_quotes(value)))
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

Remove-Item Env:PIP_NO_INDEX -ErrorAction SilentlyContinue
Remove-Item Env:NO_INDEX -ErrorAction SilentlyContinue

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

& $Python -m pip install --upgrade pip --index-url https://pypi.org/simple --trusted-host pypi.org --trusted-host files.pythonhosted.org
if ($LASTEXITCODE -ne 0) {{ throw "Failed to upgrade pip (exit code $LASTEXITCODE)." }}
& $Pip install -r (Join-Path $Root 'requirements.txt') --index-url https://pypi.org/simple --trusted-host pypi.org --trusted-host files.pythonhosted.org
if ($LASTEXITCODE -ne 0) {{ throw "Failed to install recorder dependencies (exit code $LASTEXITCODE)." }}

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

Remove-Item Env:PIP_NO_INDEX -ErrorAction SilentlyContinue
Remove-Item Env:NO_INDEX -ErrorAction SilentlyContinue

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

& $Python -m pip install --upgrade pip --index-url https://pypi.org/simple --trusted-host pypi.org --trusted-host files.pythonhosted.org
if ($LASTEXITCODE -ne 0) {{ throw "Failed to upgrade pip (exit code $LASTEXITCODE)." }}
& $Pip install -r (Join-Path $Root 'requirements.txt') --index-url https://pypi.org/simple --trusted-host pypi.org --trusted-host files.pythonhosted.org
if ($LASTEXITCODE -ne 0) {{ throw "Failed to install desktop MCP dependencies (exit code $LASTEXITCODE)." }}

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


async def _load_action(
    session_id: str,
    action_id: str,
    db: AsyncSession,
) -> DesktopRecordedActionModel:
    result = await db.execute(
        select(DesktopRecordedActionModel)
        .where(
            DesktopRecordedActionModel.id == action_id,
            DesktopRecordedActionModel.session_id == session_id,
        )
    )
    action = result.scalar_one_or_none()
    if action is None:
        raise HTTPException(status_code=404, detail="Desktop recorded action not found")
    return action


def _renumber_actions(actions: list[DesktopRecordedActionModel]) -> None:
    for index, action in enumerate(sorted(actions, key=lambda item: int(item.action_order or 0)), start=1):
        action.action_order = index


async def _move_action(
    session: DesktopRecordingSessionModel,
    action: DesktopRecordedActionModel,
    target_order: int,
) -> None:
    actions = sorted(list(session.actions or []), key=lambda item: int(item.action_order or 0))
    if action not in actions:
        actions.append(action)
    actions = [item for item in actions if item.id != action.id]
    insert_at = max(0, min(target_order - 1, len(actions)))
    actions.insert(insert_at, action)
    for index, item in enumerate(actions, start=1):
        item.action_order = index


def _apply_session_context_from_action(
    session: DesktopRecordingSessionModel,
    body: RecordedActionCreate,
) -> None:
    """Fill empty session-level context from recorded action metadata."""
    metadata = body.metadata or {}
    if not session.window_title and body.window_title and not _is_bad_window_title(body.window_title):
        session.window_title = body.window_title
    if not session.application and metadata.get("application"):
        session.application = str(metadata.get("application") or "")
    if not session.application_path and metadata.get("application_path"):
        session.application_path = str(metadata.get("application_path") or "")
    if not session.process_name:
        process_name = metadata.get("process_name") or metadata.get("process") or metadata.get("process_id")
        if process_name:
            session.process_name = str(process_name)


def _normalized_match_text(value: Any) -> str:
    return " ".join(str(value or "").casefold().split())


def _has_workflow_marker(workflow: WorkflowModel, marker: str) -> bool:
    raw_tags = workflow.tags or []
    if not isinstance(raw_tags, list):
        return False
    return marker in {str(tag).casefold() for tag in raw_tags}


def _is_desktop_recording_workflow(workflow: WorkflowModel) -> bool:
    return _has_workflow_marker(workflow, "desktop") and _has_workflow_marker(workflow, "recorded")


def _workflow_matches_recording_session(
    workflow: WorkflowModel,
    session: DesktopRecordingSessionModel,
) -> bool:
    if not _is_desktop_recording_workflow(workflow):
        return False

    variables = workflow.variables or {}
    if not isinstance(variables, dict):
        variables = {}

    session_id = str(session.id)
    if str(variables.get("desktop_recorder_session_id") or "") == session_id:
        return True

    session_name = _normalized_match_text(session.name)
    if session_name and _normalized_match_text(variables.get("desktop_recorder_session_name")) == session_name:
        return True

    legacy_workflow_name = _normalized_match_text(f"{session.name} Workflow")
    return bool(legacy_workflow_name and _normalized_match_text(workflow.name) == legacy_workflow_name)


async def _archive_workflows_for_recording_session(
    session: DesktopRecordingSessionModel,
    db: AsyncSession,
) -> int:
    result = await db.execute(select(WorkflowModel).where(WorkflowModel.status == "active"))
    count = 0
    now = _db_utcnow()
    for workflow in result.scalars():
        if _workflow_matches_recording_session(workflow, session):
            workflow.status = "archived"
            workflow.updated_at = now
            count += 1
    return count


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
    _apply_session_context_from_action(session, body)
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
    session.updated_at = _db_utcnow()
    await db.commit()
    await db.refresh(action)
    return _action_response(action)


@router.patch("/sessions/{session_id}/actions/{action_id}", response_model=RecordedActionResponse)
async def update_recorded_action(
    session_id: str,
    action_id: str,
    body: RecordedActionUpdate,
    db: AsyncSession = Depends(get_db),
):
    session = await _load_session(session_id, db)
    action = await _load_action(session_id, action_id, db)
    changes = body.model_dump(exclude_unset=True)
    target_order = changes.pop("action_order", None)
    for field, value in changes.items():
        model_field = "action_metadata" if field == "metadata" else field
        setattr(action, model_field, value)
    if target_order is not None:
        await _move_action(session, action, int(target_order))
    session.updated_at = _db_utcnow()
    await db.commit()
    await db.refresh(action)
    return _action_response(action)


@router.delete(
    "/sessions/{session_id}/actions/{action_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_recorded_action(session_id: str, action_id: str, db: AsyncSession = Depends(get_db)):
    session = await _load_session(session_id, db)
    action = await _load_action(session_id, action_id, db)
    await db.delete(action)
    remaining = [item for item in (session.actions or []) if item.id != action_id]
    _renumber_actions(remaining)
    session.updated_at = _db_utcnow()
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _load_existing_desktop_objects(db: AsyncSession, application: str = "") -> list[dict[str, Any]]:
    """Load existing desktop repository objects, optionally scoped by application name."""
    result = await db.execute(
        select(PageRepositoryModel)
        .where(PageRepositoryModel.platform.in_(["desktop", "windows"]))
        .options(selectinload(PageRepositoryModel.elements))
    )
    app_norm = str(application or "").strip().lower()
    objects: list[dict[str, Any]] = []
    for page in result.scalars():
        if app_norm and app_norm not in str(page.name or "").lower():
            continue
        for elem in page.elements or []:
            metadata = elem.discovery_metadata or {}
            objects.append(
                {
                    "object_key": str(
                        metadata.get("object_key")
                        or metadata.get("repository_key")
                        or metadata.get("element_key")
                        or elem.id
                    ),
                    "name": elem.name or "",
                    "automation_id": elem.id_attr or "",
                    "name_text": elem.name_attr or "",
                    "class_name": elem.css_selector or "",
                    "uia_path": elem.xpath or "",
                    "control_type": elem.element_type or "",
                    "locator_strategy": elem.locator_strategy or "",
                    "primary_locator": str(metadata.get("primary_locator") or ""),
                    "window": str(metadata.get("window") or ""),
                }
            )
    return objects


async def _compile_recording_result(
    session: DesktopRecordingSessionModel,
    db: AsyncSession,
) -> dict[str, Any]:
    result = compile_recording(session, list(session.actions or []))
    existing_objects = await _load_existing_desktop_objects(db, session.application or "")
    result["object_repository_diff"] = build_object_repository_diff(
        result.get("repository_suggestions") or [],
        existing_objects,
    )
    result["summary"]["repository_diff_new"] = result["object_repository_diff"]["summary"]["new"]
    result["summary"]["repository_diff_changed"] = result["object_repository_diff"]["summary"]["changed"]
    return result


@router.post("/sessions/{session_id}/compile", response_model=RecorderCompileResponse)
async def compile_recording_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await _load_session(session_id, db)
    return await _compile_recording_result(session, db)


@router.post("/sessions/{session_id}/analyze", response_model=RecorderCompileResponse)
async def analyze_recording_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await _load_session(session_id, db)
    return await _compile_recording_result(session, db)


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_recording_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await _load_session(session_id, db)
    await _archive_workflows_for_recording_session(session, db)
    await db.execute(delete(DesktopRecordedActionModel).where(DesktopRecordedActionModel.session_id == session_id))
    await db.execute(delete(DesktopRecordingSessionModel).where(DesktopRecordingSessionModel.id == session_id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
