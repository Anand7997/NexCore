from __future__ import annotations

from app.api.routes.desktop_recorder import (
    DesktopMcpCommandRequest,
    RecorderAgentCommandRequest,
    _build_agent_command,
    _build_mcp_command,
)


def test_build_recorder_agent_command_includes_session_and_hotkeys():
    response = _build_agent_command(
        RecorderAgentCommandRequest(
            api_url="http://nexcore.local/api",
            session_id="session-123",
            name="Invoice Flow",
            application_path=r"C:\Apps\Invoice.exe",
            window_title="Invoice",
            stop_hotkey="ctrl+shift+x",
            pause_hotkey="ctrl+shift+y",
        )
    )

    assert "desktop_recorder_agent.py" in response.command
    assert "--api-url http://nexcore.local/api" in response.command
    assert "--session-id session-123" in response.command
    assert "--application-path C:\\Apps\\Invoice.exe" in response.command
    assert "--window-title Invoice" in response.command
    assert response.stop_hotkey == "ctrl+shift+x"
    assert response.pause_hotkey == "ctrl+shift+y"
    assert response.requirements == ["pywinauto", "pynput"]


def test_build_desktop_mcp_command_exposes_mcp_tools():
    response = _build_mcp_command(
        DesktopMcpCommandRequest(
            api_url="http://nexcore.local/api",
            session_id="session-123",
            name="Invoice MCP",
            application_path=r"C:\Apps\Invoice.exe",
            window_title="Invoice",
            mode="stdio",
        )
    )

    assert "desktop_mcp_server.py" in response.command
    assert "--api-url http://nexcore.local/api" in response.command
    assert "--mode stdio" in response.command
    assert "--session-id session-123" in response.command
    assert response.mode == "stdio"
    assert response.requirements == ["pywinauto", "pynput", "Pillow"]
    assert "desktop_snapshot" in response.tools
    assert "desktop_record_action" in response.tools
