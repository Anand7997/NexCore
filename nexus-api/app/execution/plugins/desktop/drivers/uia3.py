"""UIA3 desktop adapter — uses pywinauto (no WinAppDriver server required)."""
from __future__ import annotations

import asyncio
from typing import Any

from .base import DesktopDriver, DriverResult, LocatorCandidate


class UIA3Adapter(DesktopDriver):
    """Drives Windows applications directly via the UI Automation API (pywinauto)."""

    def __init__(self) -> None:
        self._app = None      # pywinauto.Application
        self._top_window = None

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
            cmd = app_path if not args else f"{app_path} {' '.join(args)}"
            app = pw.Application(backend="uia").start(cmd)
            self._app = app
            self._top_window = app.top_window()
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
                app = pw.Application(backend="uia").connect(path=process_name)
            else:
                raise ValueError("window_title or process_name is required for attach")
            self._app = app
            self._top_window = app.top_window()
            return self._top_window.window_text()

        try:
            title = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"window_title": title})
        except Exception as exc:
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
