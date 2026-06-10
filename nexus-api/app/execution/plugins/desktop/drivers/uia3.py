"""UIA3 desktop adapter — uses pywinauto (no WinAppDriver server required)."""
from __future__ import annotations

import asyncio
import os
import re
import shlex
import subprocess
import time
from typing import Any
from xml.sax.saxutils import quoteattr

from .base import DesktopDriver, DriverResult, LocatorCandidate


def _capability_bool(capabilities: dict[str, Any] | None, key: str, default: bool) -> bool:
    if not capabilities or key not in capabilities:
        return default
    value = capabilities.get(key)
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() not in {"0", "false", "no", "off"}


def _capability_seconds(
    capabilities: dict[str, Any] | None,
    key: str,
    default: float,
    *,
    value_is_ms: bool = True,
) -> float:
    if not capabilities or capabilities.get(key) in (None, ""):
        return default
    try:
        value = float(capabilities[key])
    except (TypeError, ValueError):
        return default
    return max(0.0, value / 1000 if value_is_ms else value)


def _safe_info_attr(info: Any, attr: str) -> str:
    try:
        value = getattr(info, attr, "")
    except Exception:
        return ""
    return "" if value is None else str(value)


def _rect_attrs(rectangle: Any) -> dict[str, str]:
    if rectangle is None:
        return {}
    try:
        left = float(getattr(rectangle, "left"))
        top = float(getattr(rectangle, "top"))
        right = float(getattr(rectangle, "right"))
        bottom = float(getattr(rectangle, "bottom"))
    except Exception:
        return {}
    return {
        "x": str(left),
        "y": str(top),
        "width": str(max(0.0, right - left)),
        "height": str(max(0.0, bottom - top)),
    }


def _path_literal(value: str, limit: int = 80) -> str:
    return str(value or "").replace("'", "\\'")[:limit]


def _uia_path_from_control(control: Any) -> str:
    parts: list[str] = []
    current = control
    for _ in range(12):
        try:
            info = current.element_info
        except Exception:
            break
        control_type = re.sub(r"[^A-Za-z0-9_]+", "", _safe_info_attr(info, "control_type")) or "Control"
        automation_id = _safe_info_attr(info, "automation_id")
        name_text = _safe_info_attr(info, "name")
        token = control_type
        if automation_id:
            token += f"[@AutomationId='{_path_literal(automation_id)}']"
        elif name_text:
            token += f"[@Name='{_path_literal(name_text)}']"
        parts.append(token)
        try:
            current = current.parent()
        except Exception:
            break
        if current is None:
            break
    return "/" + "/".join(reversed(parts)) if parts else ""


def _control_xml(control: Any, index: int) -> str | None:
    try:
        info = control.element_info
    except Exception:
        return None
    attrs = {
        "type": _safe_info_attr(info, "control_type") or "Control",
        "name": _safe_info_attr(info, "name"),
        "auto_id": _safe_info_attr(info, "automation_id"),
        "class_name": _safe_info_attr(info, "class_name"),
        "framework_id": _safe_info_attr(info, "framework_id"),
        "process_id": _safe_info_attr(info, "process_id"),
        "uia_path": _uia_path_from_control(control) or f"/Control[{index}]",
    }
    try:
        attrs.update(_rect_attrs(info.rectangle))
    except Exception:
        pass
    rendered = " ".join(
        f"{key}={quoteattr(value)}"
        for key, value in attrs.items()
        if value not in (None, "")
    )
    return f"<control {rendered} />"


def _window_identity(window: Any) -> tuple[Any, ...]:
    try:
        info = window.element_info
    except Exception:
        return (id(window),)
    runtime_id = _safe_info_attr(info, "runtime_id")
    return (
        runtime_id or getattr(info, "handle", "") or id(window),
        _safe_info_attr(info, "name"),
        _safe_info_attr(info, "class_name"),
        _safe_info_attr(info, "process_id"),
    )


def _safe_window_title(window: Any) -> str:
    try:
        return str(window.window_text() or "")
    except Exception:
        try:
            return _safe_info_attr(window.element_info, "name")
        except Exception:
            return ""


def _launch_window_hints(app_path: str, capabilities: dict[str, Any]) -> set[str]:
    raw = str(app_path or "").strip().strip('"')
    basename = os.path.basename(raw).lower()
    stem = os.path.splitext(basename)[0]
    hints = {
        str(capabilities.get("window_title") or "").strip().lower(),
        str(capabilities.get("process_name") or "").strip().lower(),
        basename,
        stem,
    }
    aliases = {
        "calc": {"calculator"},
        "calculator": {"calc"},
        "idea64": {"intellij", "idea"},
        "idea": {"intellij", "idea64"},
        "notepad": {"notepad"},
    }
    for hint in list(hints):
        hints.update(aliases.get(hint, set()))
    return {hint for hint in hints if hint}


def _desktop_windows(pw: Any) -> list[Any]:
    try:
        return list(pw.Desktop(backend="uia").windows())
    except Exception:
        return []


def _window_matches_hints(window: Any, hints: set[str]) -> bool:
    if not hints:
        return False
    title = _safe_window_title(window).lower()
    try:
        info = window.element_info
        class_name = _safe_info_attr(info, "class_name").lower()
        process_name = _safe_info_attr(info, "process_name").lower()
    except Exception:
        class_name = ""
        process_name = ""
    haystack = " ".join((title, class_name, process_name))
    return any(hint and hint in haystack for hint in hints)


def _find_desktop_window_after_launch(
    pw: Any,
    *,
    hints: set[str],
    before: set[tuple[Any, ...]],
    deadline: float,
) -> Any | None:
    best_hint_match: Any | None = None
    while time.monotonic() <= deadline:
        windows = _desktop_windows(pw)
        for window in windows:
            if _window_matches_hints(window, hints):
                return window
            if best_hint_match is None and _window_identity(window) not in before:
                best_hint_match = window
        if best_hint_match is not None:
            return best_hint_match
        time.sleep(0.25)
    return best_hint_match


class UIA3Adapter(DesktopDriver):
    """Drives Windows applications directly via the UI Automation API (pywinauto)."""

    def __init__(self, timeout: float = 30.0) -> None:
        self._app = None      # pywinauto.Application
        self._top_window = None
        self._timeout = timeout

    def _import_pywinauto(self):
        try:
            import pywinauto
            return pywinauto
        except ImportError as exc:
            raise RuntimeError(
                "pywinauto is not installed. Run: pip install pywinauto"
            ) from exc

    async def launch(
        self,
        app_path: str,
        args: list[str] | None = None,
        capabilities: dict[str, Any] | None = None,
    ) -> DriverResult:
        def _do():
            pw = self._import_pywinauto()
            caps = dict(capabilities or {})
            app = str(app_path or "").strip().strip('"')
            cmd_parts = [app, *(args or [])]
            cmd = subprocess.list2cmdline(cmd_parts) if os.name == "nt" else shlex.join(cmd_parts)
            launch_timeout = _capability_seconds(caps, "launch_window_timeout_ms", self._timeout)
            ready_timeout = _capability_seconds(caps, "ready_timeout_ms", self._timeout)
            wait_for_ready = _capability_bool(caps, "wait_for_ready", True)
            post_launch_delay = _capability_seconds(caps, "post_launch_delay_ms", 0.0)
            hints = _launch_window_hints(app, caps)
            before_windows = {_window_identity(window) for window in _desktop_windows(pw)}
            app = pw.Application(backend="uia").start(cmd)
            self._app = app
            self._top_window = None
            deadline = time.monotonic() + max(launch_timeout, 1.0)
            last_error: Exception | None = None
            while time.monotonic() <= deadline:
                try:
                    self._top_window = app.top_window()
                    break
                except Exception as exc:
                    last_error = exc
                    time.sleep(0.25)
            if self._top_window is None:
                self._top_window = _find_desktop_window_after_launch(
                    pw,
                    hints=hints,
                    before=before_windows,
                    deadline=max(
                        deadline,
                        time.monotonic() + max(1.0, min(launch_timeout, 3.0)),
                    ),
                )
            if self._top_window is None:
                if last_error:
                    raise last_error
                raise RuntimeError("No application window was found after launch")
            if wait_for_ready and hasattr(self._top_window, "wait"):
                self._top_window.wait(
                    "exists visible enabled ready",
                    timeout=max(ready_timeout, 1.0),
                )
            if post_launch_delay > 0:
                time.sleep(post_launch_delay)
            return self._top_window.window_text()

        try:
            title = await asyncio.to_thread(_do)
            return DriverResult(
                success=True,
                metadata={"app": app_path, "window_title": title},
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def attach(
        self,
        window_title: str | None = None,
        process_name: str | None = None,
    ) -> DriverResult:
        def _do():
            pw = self._import_pywinauto()
            if window_title:
                app = pw.Application(backend="uia").connect(title=window_title)
            elif process_name:
                process = str(process_name).strip()
                if process.isdigit():
                    app = pw.Application(backend="uia").connect(process=int(process))
                else:
                    app = pw.Application(backend="uia").connect(path=process)
            else:
                raise ValueError("window_title or process_name is required for attach")
            self._app = app
            self._top_window = app.top_window()
            return self._top_window.window_text()

        try:
            title = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"window_title": title, "process_name": process_name or ""})
        except Exception as exc:
            if window_title:
                def _fallback_title_re():
                    pw = self._import_pywinauto()
                    app = pw.Application(backend="uia").connect(title_re=f".*{re.escape(window_title)}.*")
                    self._app = app
                    self._top_window = app.top_window()
                    return self._top_window.window_text()

                try:
                    title = await asyncio.to_thread(_fallback_title_re)
                    return DriverResult(success=True, metadata={"window_title": title, "title_match": "contains"})
                except Exception:
                    pass
            if window_title and process_name and not str(process_name).strip().isdigit():
                return await self.attach(process_name=process_name)
            return DriverResult(success=False, error=str(exc))

    async def close(self) -> DriverResult:
        def _do():
            if self._app:
                self._app.kill()
                self._app = None
                self._top_window = None

        try:
            await asyncio.to_thread(_do)
            return DriverResult(success=True)
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def activate_window(self, window_title: str | None = None) -> DriverResult:
        def _do():
            if self._app is None:
                raise RuntimeError("No UIA3 session. Call launch() or attach() first.")
            window = self._top_window
            if window_title:
                window = self._app.window(title=window_title)
                if not window.exists(timeout=0.5):
                    window = self._app.window(title_re=f".*{window_title}.*")
            if window is None or not window.exists(timeout=0.5):
                raise RuntimeError(f"Window not found: {window_title or 'active'}")
            window.set_focus()
            self._top_window = window
            return window.window_text()

        try:
            title = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"window_title": title})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def switch_window(
        self,
        window_title: str | None = None,
        process_name: str | None = None,
    ) -> DriverResult:
        if window_title:
            return await self.activate_window(window_title)
        if process_name:
            return await self.attach(process_name=process_name)
        return await self.activate_window()

    async def wait_app(
        self,
        process_name: str | None = None,
        timeout: float = 10.0,
    ) -> DriverResult:
        if process_name:
            return await self.attach(process_name=process_name)
        result = await self.activate_window()
        if result.success:
            return result
        return DriverResult(success=False, error="No active UIA3 application window is available")

    def _find_sync(
        self, candidates: list[LocatorCandidate]
    ) -> tuple[Any, LocatorCandidate | None]:
        if self._top_window is None:
            raise RuntimeError("No UIA3 session. Call launch() or attach() first.")
        for candidate in candidates:
            try:
                if candidate.strategy in ("accessibility_id", "automation_id"):
                    ctrl = self._top_window.child_window(auto_id=candidate.value)
                elif candidate.strategy == "name":
                    ctrl = self._top_window.child_window(title=candidate.value)
                elif candidate.strategy == "class_name":
                    ctrl = self._top_window.child_window(class_name=candidate.value)
                elif candidate.strategy in ("xpath", "path"):
                    ctrl = self._top_window.child_window(best_match=candidate.value)
                else:
                    continue
                if ctrl.exists(timeout=0.5):
                    return ctrl, candidate
            except Exception:
                continue
        return None, None

    async def find_element(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        try:
            ctrl, candidate = await asyncio.to_thread(self._find_sync, candidates)
            if ctrl is None:
                return DriverResult(
                    success=False,
                    error="Element not found with any candidate",
                )
            return DriverResult(
                success=True,
                metadata={"strategy": candidate.strategy, "value": candidate.value},
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            ctrl, candidate = self._find_sync(candidates)
            if ctrl is None:
                raise RuntimeError("Element not found for click")
            ctrl.click_input()
            return candidate

        try:
            candidate = await asyncio.to_thread(_do)
            return DriverResult(
                success=True,
                metadata={"strategy": candidate.strategy, "value": candidate.value},
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def double_click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            ctrl, candidate = self._find_sync(candidates)
            if ctrl is None:
                raise RuntimeError("Element not found for double_click")
            ctrl.double_click_input()
            return candidate

        try:
            candidate = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"strategy": candidate.strategy, "value": candidate.value})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def right_click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            ctrl, candidate = self._find_sync(candidates)
            if ctrl is None:
                raise RuntimeError("Element not found for right_click")
            ctrl.right_click_input()
            return candidate

        try:
            candidate = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"strategy": candidate.strategy, "value": candidate.value})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def hover(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            ctrl, candidate = self._find_sync(candidates)
            if ctrl is None:
                raise RuntimeError("Element not found for hover")
            ctrl.move_mouse_input()
            return candidate

        try:
            candidate = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"strategy": candidate.strategy, "value": candidate.value})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def type_text(
        self,
        candidates: list[LocatorCandidate],
        text: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            ctrl, candidate = self._find_sync(candidates)
            if ctrl is None:
                raise RuntimeError("Element not found for type_text")
            ctrl.set_edit_text(text)
            return candidate

        try:
            candidate = await asyncio.to_thread(_do)
            return DriverResult(
                success=True,
                metadata={
                    "strategy": candidate.strategy,
                    "value": candidate.value,
                    "chars": len(text),
                },
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def click_coordinates(
        self,
        x: float,
        y: float,
        button: str = "left",
    ) -> DriverResult:
        def _do():
            pw = self._import_pywinauto()
            if self._top_window is not None:
                try:
                    self._top_window.set_focus()
                except Exception:
                    pass
            coords = (int(float(x)), int(float(y)))
            pw.mouse.click(button=button, coords=coords)
            return coords

        try:
            coords = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"strategy": "coordinates", "x": coords[0], "y": coords[1], "button": button})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def double_click_coordinates(
        self,
        x: float,
        y: float,
    ) -> DriverResult:
        def _do():
            pw = self._import_pywinauto()
            if self._top_window is not None:
                try:
                    self._top_window.set_focus()
                except Exception:
                    pass
            coords = (int(float(x)), int(float(y)))
            pw.mouse.double_click(button="left", coords=coords)
            return coords

        try:
            coords = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"strategy": "coordinates", "x": coords[0], "y": coords[1], "button": "left"})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def hover_coordinates(
        self,
        x: float,
        y: float,
    ) -> DriverResult:
        def _do():
            pw = self._import_pywinauto()
            coords = (int(float(x)), int(float(y)))
            pw.mouse.move(coords=coords)
            return coords

        try:
            coords = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"strategy": "coordinates", "x": coords[0], "y": coords[1]})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def clear_text(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            ctrl, candidate = self._find_sync(candidates)
            if ctrl is None:
                raise RuntimeError("Element not found for clear_text")
            ctrl.set_edit_text("")
            return candidate

        try:
            candidate = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"strategy": candidate.strategy, "value": candidate.value})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def scroll(
        self,
        candidates: list[LocatorCandidate] | None = None,
        delta: int = -5,
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            ctrl = self._top_window
            candidate = None
            if candidates:
                ctrl, candidate = self._find_sync(candidates)
            if ctrl is None:
                raise RuntimeError("No UIA control available for scroll")
            ctrl.wheel_mouse_input(wheel_dist=int(delta))
            return candidate

        try:
            candidate = await asyncio.to_thread(_do)
            metadata = {"delta": delta}
            if candidate:
                metadata.update({"strategy": candidate.strategy, "value": candidate.value})
            return DriverResult(success=True, metadata=metadata)
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def drag_and_drop(
        self,
        source_candidates: list[LocatorCandidate],
        target_candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            source, source_candidate = self._find_sync(source_candidates)
            target, target_candidate = self._find_sync(target_candidates)
            if source is None or target is None:
                raise RuntimeError("Source or target element not found for drag_and_drop")
            source.drag_mouse_input(dst=target)
            return source_candidate, target_candidate

        try:
            source_candidate, target_candidate = await asyncio.to_thread(_do)
            return DriverResult(
                success=True,
                metadata={
                    "source_strategy": source_candidate.strategy,
                    "source_value": source_candidate.value,
                    "target_strategy": target_candidate.strategy,
                    "target_value": target_candidate.value,
                },
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def press_key(self, key: str) -> DriverResult:
        def _do():
            from pywinauto.keyboard import send_keys
            send_keys(key)

        try:
            await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"key": key})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def hotkey(self, keys: list[str]) -> DriverResult:
        key_text = "+".join(f"{{{key}}}" if len(key) > 1 else key for key in keys)
        return await self.press_key(key_text)

    async def select(
        self,
        candidates: list[LocatorCandidate],
        value: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            ctrl, candidate = self._find_sync(candidates)
            if ctrl is None:
                raise RuntimeError("Element not found for select")
            try:
                ctrl.select(value)
            except Exception:
                ctrl.set_edit_text(value)
            return candidate

        try:
            candidate = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"strategy": candidate.strategy, "value": candidate.value, "selected": value})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def set_checked(
        self,
        candidates: list[LocatorCandidate],
        checked: bool,
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            ctrl, candidate = self._find_sync(candidates)
            if ctrl is None:
                raise RuntimeError("Element not found for set_checked")
            if checked and hasattr(ctrl, "check"):
                ctrl.check()
            elif not checked and hasattr(ctrl, "uncheck"):
                ctrl.uncheck()
            else:
                ctrl.click_input()
            return candidate

        try:
            candidate = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"strategy": candidate.strategy, "value": candidate.value, "checked": checked})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def clipboard_set(self, text: str) -> DriverResult:
        def _do():
            import tkinter as tk
            root = tk.Tk()
            root.withdraw()
            root.clipboard_clear()
            root.clipboard_append(text)
            root.update()
            root.destroy()

        try:
            await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"chars": len(text)})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def clipboard_get(self) -> DriverResult:
        def _do():
            import tkinter as tk
            root = tk.Tk()
            root.withdraw()
            value = root.clipboard_get()
            root.destroy()
            return value

        try:
            value = await asyncio.to_thread(_do)
            return DriverResult(success=True, value=str(value), metadata={"chars": len(str(value))})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def get_text(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            ctrl, candidate = self._find_sync(candidates)
            if ctrl is None:
                raise RuntimeError("Element not found for get_text")
            return ctrl.window_text(), candidate

        try:
            text, candidate = await asyncio.to_thread(_do)
            return DriverResult(
                success=True,
                value=text,
                metadata={"strategy": candidate.strategy, "value": candidate.value},
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def get_property(
        self,
        candidates: list[LocatorCandidate],
        property_name: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            ctrl, candidate = self._find_sync(candidates)
            if ctrl is None:
                raise RuntimeError("Element not found for get_property")
            prop = property_name.lower()
            if prop in {"text", "name"}:
                value = ctrl.window_text()
            elif prop in {"control_type", "type"}:
                value = ctrl.element_info.control_type
            elif prop in {"automation_id", "auto_id"}:
                value = ctrl.element_info.automation_id
            elif prop in {"class", "class_name"}:
                value = ctrl.element_info.class_name
            elif hasattr(ctrl.element_info, property_name):
                value = getattr(ctrl.element_info, property_name)
            else:
                value = ctrl.get_properties().get(property_name)
            return "" if value is None else str(value), candidate

        try:
            value, candidate = await asyncio.to_thread(_do)
            return DriverResult(success=True, value=value, metadata={"strategy": candidate.strategy, "property": property_name})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def screenshot(self) -> DriverResult:
        def _do():
            if self._top_window is None:
                raise RuntimeError("No UIA3 session")
            import io
            img = self._top_window.capture_as_image()
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue()

        try:
            data = await asyncio.to_thread(_do)
            return DriverResult(success=True, screenshot_bytes=data)
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def get_ui_tree(self) -> DriverResult:
        def _do():
            if self._top_window is None:
                raise RuntimeError("No UIA3 session")
            if self._app is not None:
                try:
                    self._top_window = self._app.top_window()
                except Exception:
                    pass
            parts = ["<UITree>"]
            controls: list[Any] = [self._top_window]
            try:
                controls.extend(list(self._top_window.descendants()))
            except Exception:
                pass
            seen: set[int] = set()
            for index, ctrl in enumerate(controls, start=1):
                try:
                    marker = id(ctrl)
                    if marker in seen:
                        continue
                    seen.add(marker)
                    xml = _control_xml(ctrl, index)
                    if xml:
                        parts.append(xml)
                except Exception:
                    pass
            parts.append("</UITree>")
            return "\n".join(parts)

        try:
            tree = await asyncio.to_thread(_do)
            return DriverResult(success=True, ui_tree=tree)
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def report_capabilities(self) -> dict[str, Any]:
        return {
            "driver": "uia3",
            "requires_server": False,
            "platform": "windows",
            "backend": "pywinauto",
        }
