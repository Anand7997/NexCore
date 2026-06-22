"""NexCore Desktop MCP server.

This script is intentionally dependency-light and runs as a local stdio MCP
server. On Windows it can inspect the active desktop through UI Automation,
capture the object under the mouse, and post captured actions into a NexCore
Desktop Recorder session.
"""
from __future__ import annotations

import argparse
import base64
import ctypes
import json
import re
import sys
import threading
import time
import traceback
import urllib.request
from dataclasses import dataclass
from io import BytesIO
from typing import Any


SENSITIVE_HINTS = {
    "password",
    "passwd",
    "pwd",
    "pin",
    "secret",
    "token",
    "credential",
    "cvv",
    "ssn",
}

WINDOW_CONTROL_TYPES = {"window"}
WINDOW_CLASS_NAMES = {"sunawtframe", "wndclass_desked_gsk", "cabinetwclass"}


@dataclass
class ServerOptions:
    api_url: str = "http://localhost:8000/api"
    session_id: str = ""
    name: str = "MCP Desktop Capture"
    application: str = ""
    application_path: str = ""
    window_title: str = ""
    process_name: str = ""
    driver_type: str = "uia3"
    mode: str = "stdio"
    stop_hotkey: str = "ctrl+shift+q"
    pause_hotkey: str = "ctrl+shift+p"
    include_screenshot: bool = True
    redact_passwords: bool = True


def _normalize_api_url(api_url: str) -> str:
    return str(api_url or "http://localhost:8000/api").rstrip("/")


def _post_json(api_url: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{_normalize_api_url(api_url)}/{path.lstrip('/')}",
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        body = response.read().decode("utf-8")
        return json.loads(body) if body else {}


def _slug(value: str, fallback: str = "desktop_object") -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")
    return slug or fallback


def _looks_sensitive(*values: str) -> bool:
    text = " ".join(str(value or "").lower() for value in values)
    return any(hint in text for hint in SENSITIVE_HINTS)


def _is_placeholder_name(value: Any) -> bool:
    text = re.sub(r"\s+", "", str(value or "").strip().lower())
    return bool(re.fullmatch(r"untitled\d*", text))


def _has_coordinates(x: int | None, y: int | None) -> bool:
    return x is not None and y is not None


def _point_token(x: int | None, y: int | None) -> str:
    if not _has_coordinates(x, y):
        return ""
    return f"x={round(float(x or 0))},y={round(float(y or 0))}"


def _attr(obj: Any, *names: str, default: Any = "") -> Any:
    for name in names:
        try:
            value = getattr(obj, name)
        except Exception:
            continue
        if callable(value):
            try:
                value = value()
            except Exception:
                continue
        if value is not None:
            return value
    return default


def _rect_payload(rect: Any) -> dict[str, float] | None:
    if rect is None:
        return None
    try:
        left = float(_attr(rect, "left", default=0))
        top = float(_attr(rect, "top", default=0))
        right = float(_attr(rect, "right", default=0))
        bottom = float(_attr(rect, "bottom", default=0))
        return {
            "x": left,
            "y": top,
            "width": max(0.0, right - left),
            "height": max(0.0, bottom - top),
        }
    except Exception:
        return None


def _rect_contains(rect: dict[str, Any] | None, x: int | None, y: int | None) -> bool:
    if rect is None or not _has_coordinates(x, y):
        return False
    try:
        left = float(rect.get("x") or 0)
        top = float(rect.get("y") or 0)
        right = left + float(rect.get("width") or 0)
        bottom = top + float(rect.get("height") or 0)
        return left <= float(x or 0) <= right and top <= float(y or 0) <= bottom
    except Exception:
        return False


def _rect_area(rect: dict[str, Any] | None) -> float:
    if rect is None:
        return float("inf")
    try:
        return max(1.0, float(rect.get("width") or 0) * float(rect.get("height") or 0))
    except Exception:
        return float("inf")


def _element_info(element: Any) -> Any:
    return getattr(element, "element_info", element)


def _is_container_fallback(
    name_text: str,
    automation_id: str,
    class_name: str,
    control_type: str,
) -> bool:
    if automation_id:
        return False
    control = str(control_type or "").strip().lower()
    class_key = str(class_name or "").strip().lower()
    return (
        _is_placeholder_name(name_text)
        or control in WINDOW_CONTROL_TYPES
        or class_key in WINDOW_CLASS_NAMES
    )


def _element_specificity(element: Any) -> int:
    info = _element_info(element)
    name_text = str(_attr(info, "name", default="") or "")
    automation_id = str(_attr(info, "automation_id", default="") or "")
    class_name = str(_attr(info, "class_name", default="") or "")
    control_type = str(_attr(info, "control_type", default="") or "")
    score = 0
    if automation_id:
        score += 8
    if name_text and not _is_placeholder_name(name_text):
        score += 5
    if class_name:
        score += 2
    if control_type and control_type.strip().lower() not in WINDOW_CONTROL_TYPES:
        score += 2
    if _is_container_fallback(name_text, automation_id, class_name, control_type):
        score -= 4
    return score


def _iter_descendants(element: Any) -> list[Any]:
    for method_name in ("descendants", "children"):
        try:
            method = getattr(element, method_name)
        except Exception:
            continue
        if not callable(method):
            continue
        try:
            children = list(method())
        except Exception:
            continue
        if children:
            return children[:150]
    return []


def _refine_element_at_point(element: Any, x: int | None, y: int | None) -> Any:
    if element is None or not _has_coordinates(x, y):
        return element
    current_info = _element_info(element)
    current_name = str(_attr(current_info, "name", default="") or "")
    current_id = str(_attr(current_info, "automation_id", default="") or "")
    current_class = str(_attr(current_info, "class_name", default="") or "")
    current_control = str(_attr(current_info, "control_type", default="") or "")
    current_is_container = _is_container_fallback(current_name, current_id, current_class, current_control)
    current_score = _element_specificity(element)

    candidates: list[tuple[int, float, Any]] = []
    for child in _iter_descendants(element):
        info = _element_info(child)
        rect = _rect_payload(_attr(info, "rectangle", default=None))
        if not _rect_contains(rect, x, y):
            continue
        score = _element_specificity(child)
        if score <= 0:
            continue
        candidates.append((score, _rect_area(rect), child))

    if not candidates:
        return element
    candidates.sort(key=lambda item: (item[0], -item[1]), reverse=True)
    best_score, _area, best = candidates[0]
    return best if current_is_container or best_score > current_score else element


def _foreground_window_title() -> str:
    if sys.platform != "win32":
        return ""
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return ""
        buffer = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buffer, length + 1)
        return buffer.value
    except Exception:
        return ""


def _cursor_position() -> tuple[int | None, int | None]:
    if sys.platform != "win32":
        return None, None
    try:
        class Point(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

        point = Point()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(point))
        return int(point.x), int(point.y)
    except Exception:
        return None, None


def _capture_screenshot_base64() -> dict[str, Any]:
    try:
        from PIL import ImageGrab

        image = ImageGrab.grab()
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        raw = buffer.getvalue()
        return {
            "screenshot_base64": base64.b64encode(raw).decode("ascii"),
            "screenshot_size_bytes": len(raw),
            "screenshot_format": "png",
            "screenshot_dimensions": list(image.size),
        }
    except Exception as exc:
        return {
            "screenshot_base64": "",
            "screenshot_size_bytes": 0,
            "screenshot_format": "",
            "screenshot_dimensions": [],
            "screenshot_error": str(exc),
        }


def _get_uia_element_at(x: int | None = None, y: int | None = None) -> Any | None:
    if sys.platform != "win32":
        return None
    try:
        from pywinauto import Desktop

        if x is None or y is None:
            x, y = _cursor_position()
        if x is None or y is None:
            return None
        return Desktop(backend="uia").from_point(int(x), int(y))
    except Exception:
        return None


def _uia_path_from_element(element: Any) -> str:
    parts: list[str] = []
    current = element
    for _ in range(12):
        try:
            info = current.element_info
        except Exception:
            break
        control_type = str(_attr(info, "control_type", default="Control") or "Control")
        automation_id = str(_attr(info, "automation_id", default="") or "")
        name_text = str(_attr(info, "name", default="") or "")
        token = re.sub(r"[^A-Za-z0-9_]+", "", control_type) or "Control"
        if automation_id:
            token += f"[@AutomationId='{automation_id}']"
        elif name_text:
            token += f"[@Name='{name_text[:60]}']"
        parts.append(token)
        try:
            current = current.parent()
        except Exception:
            break
        if current is None:
            break
    return "/" + "/".join(reversed(parts)) if parts else ""


def _locator_candidates(
    automation_id: str,
    name_text: str,
    class_name: str,
    control_type: str,
    uia_path: str,
    *,
    x: int | None = None,
    y: int | None = None,
    rect: dict[str, Any] | None = None,
    window_fallback: bool = False,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add(strategy: str, locator: str, score: float, reason: str) -> None:
        value = str(locator or "").strip()
        if not value:
            return
        key = (strategy.lower(), value)
        if key in seen:
            return
        seen.add(key)
        candidates.append({
            "strategy": strategy,
            "locator": value,
            "score": score,
            "verified": False,
            "element_count": 0,
            "reason": reason,
        })

    add("accessibility id", automation_id, 1.0, "Captured stable UI Automation ID")
    add("automation id", automation_id, 1.0, "Captured Automation ID alias")
    add(
        "name",
        name_text,
        0.42 if window_fallback or _is_placeholder_name(name_text) else 0.86,
        "Captured top-level window title fallback" if window_fallback else "Captured UI Automation name/text",
    )
    add("xpath", uia_path, 0.74, "Captured UI Automation hierarchy path")
    add("class name", class_name, 0.56, "Captured class name")
    if control_type and name_text:
        add("uia", f"{control_type}:{name_text}", 0.68, "Captured control type and name")
    point = _point_token(x, y)
    if point:
        add("coordinate", point, 0.34, "Screen coordinate fallback from captured point")
    if point and rect and _rect_contains(rect, x, y):
        try:
            dx = round(float(x or 0) - float(rect.get("x") or 0))
            dy = round(float(y or 0) - float(rect.get("y") or 0))
            anchor = control_type or class_name or "Control"
            if automation_id:
                anchor += f"[@AutomationId='{automation_id}']"
            elif name_text:
                anchor += f"[@Name='{name_text[:60]}']"
            add("relative", f"{anchor}@offset({dx},{dy})", 0.4, "Relative coordinate inside captured UIA object")
        except Exception:
            pass
    return candidates


def _element_payload(
    element: Any = None,
    *,
    action_type: str = "capture",
    x: int | None = None,
    y: int | None = None,
    value: str = "",
    window_title: str = "",
    redact_passwords: bool = True,
) -> dict[str, Any]:
    element = _refine_element_at_point(element, x, y)
    info = _element_info(element)
    name_text = str(_attr(info, "name", default="") or "")
    automation_id = str(_attr(info, "automation_id", default="") or "")
    class_name = str(_attr(info, "class_name", default="") or "")
    control_type = str(_attr(info, "control_type", default="") or "")
    process_id = _attr(info, "process_id", default="")
    rect = _rect_payload(_attr(info, "rectangle", default=None))
    uia_path = _uia_path_from_element(element) if element is not None else ""
    window_fallback = _is_container_fallback(name_text, automation_id, class_name, control_type)
    public_name_text = "" if _is_placeholder_name(name_text) else name_text
    object_name = (
        (public_name_text if not window_fallback else "")
        or automation_id
        or (f"{control_type} / {class_name}" if control_type and class_name else "")
        or control_type
        or class_name
        or (_point_token(x, y) and f"Desktop Object @ {_point_token(x, y)}")
        or "Desktop Object"
    )
    object_key_source = (
        automation_id
        or (public_name_text if not window_fallback else "")
        or f"{control_type}_{class_name}"
        or object_name
    )
    if window_fallback and _point_token(x, y):
        object_key_source = f"{object_key_source}_{_point_token(x, y)}"
    object_key = _slug(object_key_source)
    sensitive = _looks_sensitive(name_text, automation_id, class_name, control_type)
    locator_strategy = (
        "accessibility id" if automation_id
        else "name" if public_name_text and not window_fallback
        else "xpath" if uia_path
        else "class name" if class_name
        else "coordinate" if _point_token(x, y)
        else ""
    )

    return {
        "action_type": action_type,
        "object_key": object_key,
        "object_name": object_name,
        "control_type": control_type,
        "automation_id": automation_id,
        "name_text": public_name_text,
        "class_name": class_name,
        "uia_path": uia_path,
        "locator_strategy": locator_strategy,
        "value": "[REDACTED]" if sensitive and value and redact_passwords else value,
        "window_title": window_title or _foreground_window_title(),
        "screen": window_title or _foreground_window_title(),
        "x": x,
        "y": y,
        "locators": _locator_candidates(
            automation_id,
            name_text,
            class_name,
            control_type,
            uia_path,
            x=x,
            y=y,
            rect=rect,
            window_fallback=window_fallback,
        ),
        "metadata": {
            "source": "nexcore_desktop_mcp_server",
            "redacted": bool(sensitive and value and redact_passwords),
            "raw_name_text": name_text,
            "capture_scope": "window_fallback" if window_fallback else "element",
            "process_id": str(process_id or ""),
            "bounding_box": rect,
            "captured_at": time.time(),
            **({
                "locator_warning": (
                    "UI Automation returned a top-level/container object; coordinate and relative locators were recorded as fallbacks."
                )
            } if window_fallback else {}),
        },
    }


def active_window(_: dict[str, Any] | None = None) -> dict[str, Any]:
    x, y = _cursor_position()
    return {
        "platform": sys.platform,
        "window_title": _foreground_window_title(),
        "cursor": {"x": x, "y": y},
        "uia_available": sys.platform == "win32",
    }


def capture_object(args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    x = args.get("x")
    y = args.get("y")
    if x is None or y is None:
        x, y = _cursor_position()
    element = _get_uia_element_at(x, y)
    payload = _element_payload(
        element,
        action_type=str(args.get("action_type") or "capture"),
        x=x,
        y=y,
        value=str(args.get("value") or ""),
        window_title=str(args.get("window_title") or ""),
        redact_passwords=bool(args.get("redact_passwords", True)),
    )
    payload["attached"] = element is not None
    if element is None:
        payload["metadata"]["warning"] = "UI Automation element not available; coordinate fallback only"
    return payload


def desktop_snapshot(args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    payload = {
        "active_window": active_window({}),
        "object_under_cursor": capture_object({}),
        "captured_at": time.time(),
    }
    if bool(args.get("include_screenshot", True)):
        payload.update(_capture_screenshot_base64())
    return payload


def create_recorder_session(options: ServerOptions, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    payload = {
        "name": args.get("name") or options.name,
        "application": args.get("application") or options.application,
        "application_path": args.get("application_path") or options.application_path,
        "window_title": args.get("window_title") or options.window_title,
        "process_name": args.get("process_name") or options.process_name,
        "driver_type": args.get("driver_type") or options.driver_type,
        "metadata": {"source": "nexcore_desktop_mcp_server"},
    }
    response = _post_json(options.api_url, "/desktop-recorder/sessions", payload)
    options.session_id = response.get("id") or options.session_id
    return response


def record_action(options: ServerOptions, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if not options.session_id:
        create_recorder_session(options, args)
    payload = capture_object(args)
    payload["action_type"] = str(args.get("action_type") or "click")
    if "expected" in args:
        payload["expected"] = str(args.get("expected") or "")
    if "property_name" in args:
        payload["property_name"] = str(args.get("property_name") or "")
    if "variable" in args:
        payload["variable"] = str(args.get("variable") or "")
    return _post_json(options.api_url, f"/desktop-recorder/sessions/{options.session_id}/actions", payload)


def stop_recorder_session(options: ServerOptions, _: dict[str, Any] | None = None) -> dict[str, Any]:
    if not options.session_id:
        return {"stopped": False, "reason": "No recorder session is active"}
    response = _post_json(options.api_url, f"/desktop-recorder/sessions/{options.session_id}/stop", {})
    return {"stopped": True, "session": response}


def _tool_definitions() -> list[dict[str, Any]]:
    return [
        {
            "name": "desktop_active_window",
            "description": "Return the current active desktop window and cursor position.",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "desktop_snapshot",
            "description": "Capture active window, object under cursor, locator candidates, and optional screenshot.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "include_screenshot": {"type": "boolean", "default": True},
                },
            },
        },
        {
            "name": "desktop_capture_object",
            "description": "Capture the UI Automation object at a point or under the mouse cursor.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "x": {"type": "number"},
                    "y": {"type": "number"},
                    "action_type": {"type": "string", "default": "capture"},
                    "value": {"type": "string"},
                    "window_title": {"type": "string"},
                },
            },
        },
        {
            "name": "desktop_create_recorder_session",
            "description": "Create a NexCore Desktop Recorder session from the MCP server.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "application": {"type": "string"},
                    "application_path": {"type": "string"},
                    "window_title": {"type": "string"},
                    "driver_type": {"type": "string", "default": "uia3"},
                },
            },
        },
        {
            "name": "desktop_record_action",
            "description": "Capture the object under the cursor and post it as a recorder action.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action_type": {"type": "string", "default": "click"},
                    "x": {"type": "number"},
                    "y": {"type": "number"},
                    "value": {"type": "string"},
                    "expected": {"type": "string"},
                    "variable": {"type": "string"},
                },
            },
        },
        {
            "name": "desktop_stop_recorder_session",
            "description": "Stop the active NexCore Desktop Recorder session.",
            "inputSchema": {"type": "object", "properties": {}},
        },
    ]


def _mcp_content(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(payload, indent=2, sort_keys=True)}],
        "structuredContent": payload,
    }


def handle_mcp_request(request: dict[str, Any], options: ServerOptions | None = None) -> dict[str, Any] | None:
    options = options or ServerOptions()
    request_id = request.get("id")
    method = request.get("method")
    if request_id is None and str(method or "").startswith("notifications/"):
        return None

    try:
        if method == "initialize":
            result = {
                "protocolVersion": request.get("params", {}).get("protocolVersion", "2024-11-05"),
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "nexcore-desktop-mcp", "version": "1.0.0"},
            }
        elif method == "tools/list":
            result = {"tools": _tool_definitions()}
        elif method == "tools/call":
            params = request.get("params") or {}
            name = params.get("name")
            args = params.get("arguments") or {}
            if name == "desktop_active_window":
                result = _mcp_content(active_window(args))
            elif name == "desktop_snapshot":
                result = _mcp_content(desktop_snapshot(args))
            elif name == "desktop_capture_object":
                result = _mcp_content(capture_object(args))
            elif name == "desktop_create_recorder_session":
                result = _mcp_content(create_recorder_session(options, args))
            elif name == "desktop_record_action":
                result = _mcp_content(record_action(options, args))
            elif name == "desktop_stop_recorder_session":
                result = _mcp_content(stop_recorder_session(options, args))
            else:
                raise ValueError(f"Unknown tool: {name}")
        else:
            raise ValueError(f"Unsupported MCP method: {method}")
        return {"jsonrpc": "2.0", "id": request_id, "result": result}
    except Exception as exc:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {
                "code": -32000,
                "message": str(exc),
                "data": traceback.format_exc(),
            },
        }


class AutoCapture:
    def __init__(self, options: ServerOptions):
        self.options = options
        self.paused = False
        self.stopped = threading.Event()

    def _ensure_session(self) -> None:
        if not self.options.session_id:
            create_recorder_session(self.options, {})

    def _record_click(self, x: int, y: int) -> None:
        if self.paused or self.stopped.is_set():
            return
        try:
            self._ensure_session()
            record_action(self.options, {"action_type": "click", "x": x, "y": y})
        except Exception as exc:
            print(f"capture failed: {exc}", file=sys.stderr)

    def run(self) -> int:
        try:
            from pynput import mouse
        except Exception as exc:
            print(f"pynput is required for --watch mode: {exc}", file=sys.stderr)
            return 2

        def on_click(x: int, y: int, button: Any, pressed: bool) -> None:
            if pressed:
                self._record_click(x, y)

        self._ensure_session()
        print(f"NexCore Desktop MCP auto-capture started. Session: {self.options.session_id}", file=sys.stderr)
        with mouse.Listener(on_click=on_click) as listener:
            try:
                while not self.stopped.is_set():
                    time.sleep(0.2)
            except KeyboardInterrupt:
                self.stopped.set()
            listener.stop()
        stop_recorder_session(self.options, {})
        return 0


def run_stdio(options: ServerOptions) -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except Exception as exc:
            response = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(exc)}}
        else:
            response = handle_mcp_request(request, options)
        if response is not None:
            print(json.dumps(response), flush=True)
    return 0


def parse_args(argv: list[str]) -> ServerOptions:
    parser = argparse.ArgumentParser(description="NexCore Desktop MCP server")
    parser.add_argument("--api-url", default="http://localhost:8000/api")
    parser.add_argument("--session-id", default="")
    parser.add_argument("--name", default="MCP Desktop Capture")
    parser.add_argument("--application", default="")
    parser.add_argument("--application-path", default="")
    parser.add_argument("--window-title", default="")
    parser.add_argument("--process-name", default="")
    parser.add_argument("--driver-type", default="uia3")
    parser.add_argument("--mode", choices=["stdio", "watch"], default="stdio")
    parser.add_argument("--stop-hotkey", default="ctrl+shift+q")
    parser.add_argument("--pause-hotkey", default="ctrl+shift+p")
    ns = parser.parse_args(argv)
    return ServerOptions(**vars(ns))


def main(argv: list[str] | None = None) -> int:
    options = parse_args(argv or sys.argv[1:])
    if options.mode == "watch":
        return AutoCapture(options).run()
    return run_stdio(options)


if __name__ == "__main__":
    raise SystemExit(main())
