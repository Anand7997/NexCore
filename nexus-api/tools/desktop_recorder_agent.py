"""Live Windows desktop recorder agent.

This script runs on a Windows desktop machine, listens for mouse/keyboard input,
enriches actions with UI Automation metadata, and posts actions into the NexCore
desktop recorder API.
"""
from __future__ import annotations

import argparse
import json
import queue
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
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

SPECIAL_KEYS = {
    "enter": "Enter",
    "tab": "Tab",
    "esc": "Escape",
    "escape": "Escape",
    "backspace": "Backspace",
    "delete": "Delete",
    "space": "Space",
}

WINDOW_CONTROL_TYPES = {"window"}
WINDOW_CLASS_NAMES = {"sunawtframe", "wndclass_desked_gsk", "cabinetwclass"}


@dataclass
class AgentOptions:
    api_url: str
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
    redact_passwords: bool = True


@dataclass
class ClickCandidate:
    payload: dict[str, Any]
    timestamp: float
    timer: threading.Timer


def _slug(value: str, fallback: str = "desktop_object") -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")
    return slug or fallback


def _looks_sensitive(*values: str) -> bool:
    text = " ".join(str(value or "").lower() for value in values)
    return any(hint in text for hint in SENSITIVE_HINTS)


def _safe_text(value: str, sensitive: bool, redact: bool = True) -> str:
    if sensitive and redact:
        return "[REDACTED]"
    return value


def _is_placeholder_name(value: Any) -> bool:
    text = re.sub(r"\s+", "", str(value or "").strip().lower())
    return bool(re.fullmatch(r"untitled\d*", text))


def _has_coordinates(x: float | None, y: float | None) -> bool:
    return x is not None and y is not None


def _point_token(x: float | None, y: float | None) -> str:
    if not _has_coordinates(x, y):
        return ""
    return f"x={round(float(x or 0))},y={round(float(y or 0))}"


def _attr(obj: Any, *names: str, default: str = "") -> Any:
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


def _rect_payload(rect: Any) -> dict[str, Any] | None:
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


def _rect_contains(rect: dict[str, Any] | None, x: float | None, y: float | None) -> bool:
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


def _refine_element_at_point(element: Any, x: float | None, y: float | None) -> Any:
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


def _locator_candidates(
    automation_id: str,
    name_text: str,
    class_name: str,
    control_type: str,
    uia_path: str,
    *,
    x: float | None = None,
    y: float | None = None,
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
            "verified": False,
            "element_count": 0,
            "score": score,
            "reason": reason,
        })

    add("accessibility id", automation_id, 1.0, "Captured Automation ID from UIA")
    add("automation id", automation_id, 1.0, "Captured Automation ID alias")
    add(
        "name",
        name_text,
        0.42 if window_fallback or _is_placeholder_name(name_text) else 0.86,
        "Captured top-level window title fallback" if window_fallback else "Captured UIA name/text",
    )
    add("xpath", uia_path, 0.74, "Captured UIA hierarchy path")
    add("class name", class_name, 0.56, "Captured UIA class name")
    if control_type and name_text:
        add("uia", f"{control_type}:{name_text}", 0.68, "Captured control type and name")
    point = _point_token(x, y)
    if point:
        add("coordinate", point, 0.34, "Screen coordinate fallback from recorded click")
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


def _uia_path_from_element(element: Any) -> str:
    parts: list[str] = []
    current = element
    for _ in range(10):
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


def _element_payload(
    action_type: str,
    element: Any = None,
    *,
    x: float | None = None,
    y: float | None = None,
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

    locators = _locator_candidates(
        automation_id,
        name_text,
        class_name,
        control_type,
        uia_path,
        x=x,
        y=y,
        rect=rect,
        window_fallback=window_fallback,
    )
    point = {"x": float(x), "y": float(y)} if _has_coordinates(x, y) else None
    relative_locator = next(
        (
            str(item.get("locator") or "")
            for item in locators
            if str(item.get("strategy") or "").lower() == "relative"
        ),
        "",
    )
    recording_mode = "uia"
    if point and (window_fallback or not automation_id):
        recording_mode = "analog"
    elif point:
        recording_mode = "hybrid"

    metadata = {
        "source": "live_desktop_recorder_agent",
        "redacted": bool(sensitive and value and redact_passwords),
        "raw_name_text": name_text,
        "capture_scope": "window_fallback" if window_fallback else "element",
        "process_id": str(process_id or ""),
        "bounding_box": rect,
        "captured_at": time.time(),
        "recording_mode": recording_mode,
    }
    if point:
        metadata["analog"] = {
            "point": point,
            "relative_locator": relative_locator,
            "bounding_box": rect,
            "low_level": True,
        }
    if window_fallback or (point and not automation_id):
        metadata["virtual_object"] = {
            "name": object_name,
            "object_class": class_name or control_type or "OwnerDrawnControl",
            "control_type": control_type or "CustomControl",
            "class_name": class_name,
            "locator_strategy": locator_strategy or "coordinate",
            "primary_locator": point and _point_token(x, y) or uia_path or public_name_text or object_name,
            "locators": locators,
            "capture_scope": metadata["capture_scope"],
        }

    payload = {
        "action_type": action_type,
        "object_key": object_key,
        "object_name": object_name,
        "control_type": control_type,
        "automation_id": automation_id,
        "name_text": public_name_text,
        "class_name": class_name,
        "uia_path": uia_path,
        "locator_strategy": locator_strategy,
        "value": _safe_text(value, sensitive, redact_passwords),
        "window_title": window_title,
        "screen": window_title,
        "x": x,
        "y": y,
        "locators": locators,
        "metadata": metadata,
    }
    if window_fallback:
        payload["metadata"]["locator_warning"] = (
            "UI Automation returned a top-level/container object; coordinate and relative locators were recorded as fallbacks."
        )
    return payload


def _normalize_api_url(api_url: str) -> str:
    return str(api_url or "http://localhost:8000/api").rstrip("/")


def _foreground_window_title() -> str:
    if sys.platform != "win32":
        return ""
    try:
        import ctypes

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


def _post_json(api_url: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"{_normalize_api_url(api_url)}/{path.lstrip('/')}"
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API request failed: {exc.code} {body}") from exc


def _get_json(api_url: str, path: str) -> dict[str, Any]:
    url = f"{_normalize_api_url(api_url)}/{path.lstrip('/')}"
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API request failed: {exc.code} {body}") from exc


def _parse_hotkey(value: str) -> set[str]:
    aliases = {
        "control": "ctrl",
        "ctrl_l": "ctrl",
        "ctrl_r": "ctrl",
        "shift_l": "shift",
        "shift_r": "shift",
        "alt_l": "alt",
        "alt_r": "alt",
    }
    parts = re.split(r"[+, ]+", str(value or "").lower())
    return {aliases.get(part.strip(), part.strip()) for part in parts if part.strip()}


def _key_name(key: Any) -> str:
    char = getattr(key, "char", None)
    if char:
        return str(char).lower()
    raw = str(key).replace("Key.", "").lower()
    aliases = {
        "ctrl_l": "ctrl",
        "ctrl_r": "ctrl",
        "shift_l": "shift",
        "shift_r": "shift",
        "alt_l": "alt",
        "alt_r": "alt",
        "cmd": "meta",
        "cmd_l": "meta",
        "cmd_r": "meta",
    }
    return aliases.get(raw, raw)


class LiveDesktopRecorderAgent:
    def __init__(self, options: AgentOptions) -> None:
        self.options = options
        self.session_id = options.session_id
        self.action_queue: queue.Queue[dict[str, Any] | None] = queue.Queue()
        self.stop_event = threading.Event()
        self.paused = False
        self.pressed_keys: set[str] = set()
        self.stop_hotkey = _parse_hotkey(options.stop_hotkey)
        self.pause_hotkey = _parse_hotkey(options.pause_hotkey)
        self.last_hotkey_at = 0.0
        self.text_buffer: list[str] = []
        self.text_target: Any = None
        self.text_window_title = ""
        self.last_key_at = 0.0
        self.pending_click: ClickCandidate | None = None
        self.click_lock = threading.Lock()
        self.desktop = None
        self.last_status_check_at = 0.0

    def run(self) -> None:
        try:
            from pynput import keyboard, mouse
            from pywinauto import Desktop
        except ImportError as exc:
            missing = str(exc).split("'")[1] if "'" in str(exc) else str(exc)
            print(f"Missing dependency: {missing}", file=sys.stderr)
            print("Install desktop recorder dependencies with: pip install -r requirements.txt", file=sys.stderr)
            raise SystemExit(2) from exc

        self.desktop = Desktop(backend="uia")
        if not self.session_id:
            self.session_id = self._create_session()
        print(f"NexCore desktop recorder agent started. Session: {self.session_id}")
        print(f"Stop: {self.options.stop_hotkey} | Pause/resume: {self.options.pause_hotkey}")

        worker = threading.Thread(target=self._post_worker, daemon=True)
        worker.start()

        with mouse.Listener(on_click=self._on_click), keyboard.Listener(
            on_press=self._on_press,
            on_release=self._on_release,
        ):
            while not self.stop_event.wait(0.1):
                self._flush_idle_text()
                self._stop_if_session_closed()

        self._flush_pending_click()
        self._flush_text_buffer()
        self.action_queue.put(None)
        worker.join(timeout=5)
        self._stop_session()
        print("NexCore desktop recorder agent stopped.")

    def _create_session(self) -> str:
        response = _post_json(
            self.options.api_url,
            "/desktop-recorder/sessions",
            {
                "name": self.options.name,
                "application": self.options.application,
                "application_path": self.options.application_path,
                "window_title": self.options.window_title,
                "process_name": self.options.process_name,
                "driver_type": self.options.driver_type,
                "metadata": {"source": "live_desktop_recorder_agent"},
            },
        )
        session_id = str(response.get("id") or "")
        if not session_id:
            raise RuntimeError("Recorder API did not return a session id")
        return session_id

    def _stop_session(self) -> None:
        try:
            _post_json(self.options.api_url, f"/desktop-recorder/sessions/{self.session_id}/stop", {})
        except Exception as exc:
            print(f"Could not stop recorder session: {exc}", file=sys.stderr)

    def _stop_if_session_closed(self) -> None:
        now = time.time()
        if not self.session_id or now - self.last_status_check_at < 2.0:
            return
        self.last_status_check_at = now
        try:
            session = _get_json(self.options.api_url, f"/desktop-recorder/sessions/{self.session_id}")
        except Exception:
            return
        if str(session.get("status") or "").lower() == "stopped":
            print("Recorder session was stopped from NexCore. Exiting agent.")
            self.stop_event.set()

    def _post_worker(self) -> None:
        while True:
            payload = self.action_queue.get()
            if payload is None:
                return
            try:
                _post_json(self.options.api_url, f"/desktop-recorder/sessions/{self.session_id}/actions", payload)
                print(f"Recorded {payload.get('action_type')} -> {payload.get('object_name')}")
            except Exception as exc:
                print(f"Failed to post recorded action: {exc}", file=sys.stderr)
                if "409" in str(exc) and "not accepting actions" in str(exc):
                    self.stop_event.set()

    def _queue_action(self, payload: dict[str, Any]) -> None:
        if self.paused:
            return
        self.action_queue.put(payload)

    def _active_window_title(self) -> str:
        if self.options.window_title:
            return self.options.window_title
        foreground_title = _foreground_window_title()
        if foreground_title:
            return foreground_title
        try:
            active = self.desktop.active()
            return str(active.window_text() or "")
        except Exception:
            return ""

    def _element_from_point(self, x: float, y: float) -> Any:
        try:
            return self.desktop.from_point(int(x), int(y))
        except Exception:
            return None

    def _focused_element(self) -> Any:
        try:
            return self.desktop.get_focus()
        except Exception:
            try:
                return self.desktop.active()
            except Exception:
                return None

    def _on_click(self, x: float, y: float, button: Any, pressed: bool) -> None:
        if not pressed or self.stop_event.is_set():
            return
        self._flush_text_buffer()
        button_name = str(button).replace("Button.", "").lower()
        element = self._element_from_point(x, y)
        window_title = self._active_window_title()
        if button_name == "right":
            self._flush_pending_click()
            self._queue_action(_element_payload(
                "right_click",
                element,
                x=x,
                y=y,
                window_title=window_title,
                redact_passwords=self.options.redact_passwords,
            ))
            return
        if button_name != "left":
            return

        payload = _element_payload(
            "click",
            element,
            x=x,
            y=y,
            window_title=window_title,
            redact_passwords=self.options.redact_passwords,
        )
        now = time.time()
        with self.click_lock:
            if self.pending_click and self._is_same_click(self.pending_click.payload, payload, now):
                self.pending_click.timer.cancel()
                double_payload = dict(payload)
                double_payload["action_type"] = "double_click"
                self.pending_click = None
                self._queue_action(double_payload)
                return
            self._flush_pending_click_locked()
            timer = threading.Timer(0.38, self._emit_pending_click)
            self.pending_click = ClickCandidate(payload=payload, timestamp=now, timer=timer)
            timer.daemon = True
            timer.start()

    def _emit_pending_click(self) -> None:
        with self.click_lock:
            self._flush_pending_click_locked()

    def _flush_pending_click(self) -> None:
        with self.click_lock:
            self._flush_pending_click_locked()

    def _flush_pending_click_locked(self) -> None:
        if self.pending_click is None:
            return
        payload = self.pending_click.payload
        self.pending_click = None
        self._queue_action(payload)

    def _is_same_click(self, first: dict[str, Any], second: dict[str, Any], now: float) -> bool:
        if not self.pending_click or now - self.pending_click.timestamp > 0.45:
            return False
        first_x = float(first.get("x") or 0)
        first_y = float(first.get("y") or 0)
        second_x = float(second.get("x") or 0)
        second_y = float(second.get("y") or 0)
        if abs(first_x - second_x) > 5 or abs(first_y - second_y) > 5:
            return False
        first_id = first.get("automation_id") or first.get("name_text") or first.get("object_key")
        second_id = second.get("automation_id") or second.get("name_text") or second.get("object_key")
        return bool(first_id and first_id == second_id)

    def _on_press(self, key: Any) -> bool | None:
        key_name = _key_name(key)
        self.pressed_keys.add(key_name)
        if self._hotkey_down(self.stop_hotkey):
            self.stop_event.set()
            return False
        if self._hotkey_down(self.pause_hotkey):
            now = time.time()
            if now - self.last_hotkey_at > 0.45:
                self.last_hotkey_at = now
                self._flush_text_buffer()
                self.paused = not self.paused
                print("Recorder paused." if self.paused else "Recorder resumed.")
            return None
        if self.paused:
            return None
        char = getattr(key, "char", None)
        if char:
            if not self.text_buffer:
                self.text_target = self._focused_element()
                self.text_window_title = self._active_window_title()
            self.text_buffer.append(str(char))
            self.last_key_at = time.time()
            return None
        if key_name == "backspace" and self.text_buffer:
            self.text_buffer.pop()
            self.last_key_at = time.time()
            return None
        if key_name in SPECIAL_KEYS:
            self._flush_text_buffer()
            self._queue_action(_element_payload(
                "press_key",
                self._focused_element(),
                value=SPECIAL_KEYS[key_name],
                window_title=self._active_window_title(),
                redact_passwords=self.options.redact_passwords,
            ))
        return None

    def _on_release(self, key: Any) -> None:
        self.pressed_keys.discard(_key_name(key))

    def _hotkey_down(self, combo: set[str]) -> bool:
        return bool(combo) and combo.issubset(self.pressed_keys)

    def _flush_idle_text(self) -> None:
        if not self.text_buffer:
            return
        idle_ms = (time.time() - self.last_key_at) * 1000
        if idle_ms >= self.options.flush_interval_ms:
            self._flush_text_buffer()

    def _flush_text_buffer(self) -> None:
        if not self.text_buffer:
            return
        value = "".join(self.text_buffer)
        self.text_buffer = []
        target = self.text_target or self._focused_element()
        window_title = self.text_window_title or self._active_window_title()
        self.text_target = None
        self.text_window_title = ""
        self._queue_action(_element_payload(
            "type_text",
            target,
            value=value,
            window_title=window_title,
            redact_passwords=self.options.redact_passwords,
        ))


def _options_from_args(argv: list[str]) -> AgentOptions:
    parser = argparse.ArgumentParser(description="NexCore live Windows desktop recorder agent")
    parser.add_argument("--api-url", default="http://localhost:8000/api")
    parser.add_argument("--session-id", default="")
    parser.add_argument("--name", default="Live Desktop Recording")
    parser.add_argument("--application", default="")
    parser.add_argument("--application-path", default="")
    parser.add_argument("--window-title", default="")
    parser.add_argument("--process-name", default="")
    parser.add_argument("--driver-type", default="uia3")
    parser.add_argument("--stop-hotkey", default="ctrl+shift+q")
    parser.add_argument("--pause-hotkey", default="ctrl+shift+p")
    parser.add_argument("--flush-interval-ms", type=int, default=900)
    parser.add_argument("--no-redact-passwords", action="store_true")
    args = parser.parse_args(argv)
    return AgentOptions(
        api_url=args.api_url,
        session_id=args.session_id,
        name=args.name,
        application=args.application,
        application_path=args.application_path,
        window_title=args.window_title,
        process_name=args.process_name,
        driver_type=args.driver_type,
        stop_hotkey=args.stop_hotkey,
        pause_hotkey=args.pause_hotkey,
        flush_interval_ms=args.flush_interval_ms,
        redact_passwords=not args.no_redact_passwords,
    )


def main(argv: list[str] | None = None) -> int:
    options = _options_from_args(argv if argv is not None else sys.argv[1:])
    LiveDesktopRecorderAgent(options).run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
