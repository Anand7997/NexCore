"""UIA3 desktop adapter — uses pywinauto (no WinAppDriver server required)."""
from __future__ import annotations

import asyncio
import os
import re
import shlex
import subprocess
import time
from typing import Any

from .base import DesktopDriver, DriverResult, LocatorCandidate


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
            app = str(app_path or "").strip().strip('"')
            cmd_parts = [app, *(args or [])]
            cmd = subprocess.list2cmdline(cmd_parts) if os.name == "nt" else shlex.join(cmd_parts)
            app = pw.Application(backend="uia").start(cmd)
            self._app = app
            deadline = time.monotonic() + min(max(self._timeout, 1.0), 5.0)
            last_error: Exception | None = None
            while time.monotonic() <= deadline:
                try:
                    self._top_window = app.top_window()
                    break
                except Exception as exc:
                    last_error = exc
                    time.sleep(0.25)
            else:
                if last_error:
                    raise last_error
                raise RuntimeError("No application window was found after launch")
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
            parts = ["<UITree>"]
            for ctrl in self._top_window.descendants():
                try:
                    parts.append(
                        f'<control type="{ctrl.element_info.control_type}" '
                        f'name="{ctrl.window_text()}" '
                        f'auto_id="{ctrl.element_info.automation_id}" />'
                    )
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
