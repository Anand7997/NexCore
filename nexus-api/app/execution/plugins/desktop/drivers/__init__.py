"""Desktop driver factory and exports."""
from __future__ import annotations

from typing import Any

from .base import DesktopDriver, DriverResult, LocatorCandidate
from .computer_vision import ComputerVisionAdapter
from .uia3 import UIA3Adapter
from .winappdriver import WinAppDriverAdapter


class AutoDesktopDriver(DesktopDriver):
    """Try deterministic drivers first, then fall back to computer vision."""

    def __init__(
        self,
        *,
        server_url: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self._drivers: list[DesktopDriver] = [
            WinAppDriverAdapter(server_url=server_url, timeout=timeout),
            UIA3Adapter(timeout=timeout),
            ComputerVisionAdapter(),
        ]
        self._active: DesktopDriver | None = None

    async def launch(
        self,
        app_path: str,
        args: list[str] | None = None,
        capabilities: dict[str, Any] | None = None,
    ) -> DriverResult:
        errors: list[str] = []
        for driver in self._drivers:
            result = await driver.launch(app_path, args=args, capabilities=capabilities)
            if result.success:
                self._active = driver
                result.metadata.setdefault("driver_type", (await driver.report_capabilities()).get("driver"))
                return result
            if result.error:
                errors.append(result.error)
        return DriverResult(success=False, error="; ".join(errors) or "No desktop driver could launch the app")

    async def attach(
        self,
        window_title: str | None = None,
        process_name: str | None = None,
    ) -> DriverResult:
        errors: list[str] = []
        for driver in self._drivers:
            result = await driver.attach(window_title=window_title, process_name=process_name)
            if result.success:
                self._active = driver
                result.metadata.setdefault("driver_type", (await driver.report_capabilities()).get("driver"))
                return result
            if result.error:
                errors.append(result.error)
        return DriverResult(success=False, error="; ".join(errors) or "No desktop driver could attach")

    def _require_active(self) -> DesktopDriver:
        if self._active is None:
            raise RuntimeError("No active desktop driver. Call launch() or attach() first.")
        return self._active

    async def close(self) -> DriverResult:
        if self._active is None:
            return DriverResult(success=True)
        result = await self._active.close()
        self._active = None
        return result

    async def restart_app(
        self,
        app_path: str,
        args: list[str] | None = None,
        capabilities: dict[str, Any] | None = None,
    ) -> DriverResult:
        if self._active is None:
            return await self.launch(app_path, args=args, capabilities=capabilities)
        result = await self._active.restart_app(app_path, args=args, capabilities=capabilities)
        if not result.success:
            self._active = None
        return result

    async def activate_window(self, window_title: str | None = None) -> DriverResult:
        return await self._require_active().activate_window(window_title)

    async def switch_window(
        self,
        window_title: str | None = None,
        process_name: str | None = None,
    ) -> DriverResult:
        return await self._require_active().switch_window(window_title=window_title, process_name=process_name)

    async def wait_window(
        self,
        window_title: str,
        timeout: float = 10.0,
        poll_interval: float = 0.5,
    ) -> DriverResult:
        return await self._require_active().wait_window(window_title, timeout=timeout, poll_interval=poll_interval)

    async def wait_app(
        self,
        process_name: str | None = None,
        timeout: float = 10.0,
    ) -> DriverResult:
        return await self._require_active().wait_app(process_name=process_name, timeout=timeout)

    async def find_element(self, candidates: list[LocatorCandidate], timeout: float = 10.0) -> DriverResult:
        return await self._require_active().find_element(candidates, timeout=timeout)

    async def click(self, candidates: list[LocatorCandidate], timeout: float = 10.0) -> DriverResult:
        return await self._require_active().click(candidates, timeout=timeout)

    async def double_click(self, candidates: list[LocatorCandidate], timeout: float = 10.0) -> DriverResult:
        return await self._require_active().double_click(candidates, timeout=timeout)

    async def right_click(self, candidates: list[LocatorCandidate], timeout: float = 10.0) -> DriverResult:
        return await self._require_active().right_click(candidates, timeout=timeout)

    async def hover(self, candidates: list[LocatorCandidate], timeout: float = 10.0) -> DriverResult:
        return await self._require_active().hover(candidates, timeout=timeout)

    async def type_text(self, candidates: list[LocatorCandidate], text: str, timeout: float = 10.0) -> DriverResult:
        return await self._require_active().type_text(candidates, text, timeout=timeout)

    async def set_text(self, candidates: list[LocatorCandidate], text: str, timeout: float = 10.0) -> DriverResult:
        return await self._require_active().set_text(candidates, text, timeout=timeout)

    async def clear_text(self, candidates: list[LocatorCandidate], timeout: float = 10.0) -> DriverResult:
        return await self._require_active().clear_text(candidates, timeout=timeout)

    async def press_key(self, key: str) -> DriverResult:
        return await self._require_active().press_key(key)

    async def hotkey(self, keys: list[str]) -> DriverResult:
        return await self._require_active().hotkey(keys)

    async def key_sequence(self, keys: list[str]) -> DriverResult:
        return await self._require_active().key_sequence(keys)

    async def scroll(self, candidates: list[LocatorCandidate] | None = None, delta: int = -5, timeout: float = 10.0) -> DriverResult:
        return await self._require_active().scroll(candidates, delta=delta, timeout=timeout)

    async def drag_and_drop(
        self,
        source_candidates: list[LocatorCandidate],
        target_candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        return await self._require_active().drag_and_drop(source_candidates, target_candidates, timeout=timeout)

    async def handle_modal(self, action: str = "accept", button_text: str | None = None, timeout: float = 10.0) -> DriverResult:
        return await self._require_active().handle_modal(action=action, button_text=button_text, timeout=timeout)

    async def clipboard_set(self, text: str) -> DriverResult:
        return await self._require_active().clipboard_set(text)

    async def clipboard_get(self) -> DriverResult:
        return await self._require_active().clipboard_get()

    async def select(self, candidates: list[LocatorCandidate], value: str, timeout: float = 10.0) -> DriverResult:
        return await self._require_active().select(candidates, value, timeout=timeout)

    async def set_checked(self, candidates: list[LocatorCandidate], checked: bool, timeout: float = 10.0) -> DriverResult:
        return await self._require_active().set_checked(candidates, checked, timeout=timeout)

    async def get_text(self, candidates: list[LocatorCandidate], timeout: float = 10.0) -> DriverResult:
        return await self._require_active().get_text(candidates, timeout=timeout)

    async def get_property(self, candidates: list[LocatorCandidate], property_name: str, timeout: float = 10.0) -> DriverResult:
        return await self._require_active().get_property(candidates, property_name, timeout=timeout)

    async def screenshot(self) -> DriverResult:
        return await self._require_active().screenshot()

    async def get_ui_tree(self) -> DriverResult:
        return await self._require_active().get_ui_tree()

    async def report_capabilities(self) -> dict[str, Any]:
        active = await self._active.report_capabilities() if self._active else None
        return {
            "driver": "auto",
            "active": active,
            "order": ["winappdriver", "uia3", "computer_vision"],
            "platform": "windows",
        }


def get_driver(
    driver_type: str | None = None,
    *,
    server_url: str | None = None,
    timeout: float = 30.0,
) -> DesktopDriver:
    """Create a desktop driver by type."""
    normalized = (driver_type or "winappdriver").strip().lower().replace("-", "_")
    if normalized in {"winappdriver", "appium_windows", "appium"}:
        return WinAppDriverAdapter(server_url=server_url, timeout=timeout)
    if normalized in {"uia3", "uia", "pywinauto"}:
        return UIA3Adapter(timeout=timeout)
    if normalized in {"computer_vision", "cv", "ocr", "visual"}:
        return ComputerVisionAdapter()
    if normalized == "auto":
        return AutoDesktopDriver(server_url=server_url, timeout=timeout)
    raise ValueError(f"Unsupported desktop driver_type: {driver_type}")


__all__ = [
    "AutoDesktopDriver",
    "ComputerVisionAdapter",
    "DesktopDriver",
    "DriverResult",
    "LocatorCandidate",
    "UIA3Adapter",
    "WinAppDriverAdapter",
    "get_driver",
]
