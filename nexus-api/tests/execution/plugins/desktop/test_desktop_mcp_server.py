from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_mcp_module():
    script = Path(__file__).resolve().parents[4] / "tools" / "desktop_mcp_server.py"
    spec = importlib.util.spec_from_file_location("desktop_mcp_server", script)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_desktop_mcp_server_lists_expected_tools():
    mcp = _load_mcp_module()

    tools = mcp._tool_definitions()
    names = {tool["name"] for tool in tools}

    assert "desktop_active_window" in names
    assert "desktop_snapshot" in names
    assert "desktop_capture_object" in names
    assert "desktop_record_action" in names


def test_desktop_mcp_server_handles_initialize_and_tools_list():
    mcp = _load_mcp_module()

    init_response = mcp.handle_mcp_request({"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    list_response = mcp.handle_mcp_request({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})

    assert init_response["result"]["serverInfo"]["name"] == "nexcore-desktop-mcp"
    assert list_response["result"]["tools"]
    assert list_response["result"]["tools"][0]["inputSchema"]["type"] == "object"


def test_desktop_mcp_capture_object_degrades_to_coordinate_fallback_without_uia():
    mcp = _load_mcp_module()

    response = mcp.handle_mcp_request({
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "desktop_capture_object",
            "arguments": {"x": 10, "y": 20, "action_type": "click"},
        },
    })

    payload = response["result"]["structuredContent"]
    assert payload["action_type"] == "click"
    assert payload["x"] == 10
    assert payload["y"] == 20
    assert "locators" in payload
    assert payload["metadata"]["source"] == "nexcore_desktop_mcp_server"
