"""WinAppDriver / Appium Windows compatibility adapter."""
from __future__ import annotations

import os
import asyncio
from typing import Any

from app.config import settings
from app.execution.plugins.webdriver_client import WebDriverClient, WebDriverError
from .base import DesktopDriver, DriverResult, LocatorCandidate

_STRATEGY_MAP: dict[str, str] = {
    "accessibility_id": "accessibility id",
    "name": "name",
    "xpath": "xpath",
    "class_name": "class name",
    # legacy strings already used by old plugin.py configs
    "accessibility id": "accessibility id",
    "class name": "class name",
}


class WinAppDriverAdapter(DesktopDriver):
    """Wraps WebDriverClient to implement the DesktopDriver interface."""

    def __init__(self, server_url: str | None = None, timeout: float = 30.0) -> None:
        self._server_url = (
            server_url
            or os.getenv("WINAPPDRIVER_URL")
            or settings.winappdriver_url
        )
        self._timeout = timeout
        self._client: WebDriverClient | None = None

    async def launch(
        self,
        app_path: str,
        args: list[str] | None = None,
        capabilities: dict[str, Any] | None = None,
    ) -> DriverResult:
        caps = dict(capabilities or {})
        caps.setdefault("platformName", "Windows")
        caps.setdefault("deviceName", "WindowsPC")
        caps["app"] = app_path
        self._client = WebDriverClient(self._server_url, timeout=self._timeout)
        try:
            session_id = await self._client.start_session(caps)
            return DriverResult(
                success=True,
                metadata={"session_id": session_id, "app": app_path},
            )
        except WebDriverError as exc:
            return DriverResult(success=False, error=str(exc))

    async def attach(
        self,
        window_title: str | None = None,
        process_name: str | None = None,
    ) -> DriverResult:
        caps = {
            "platformName": "Windows",
            "deviceName": "WindowsPC",
            "app": "Root",
        }
        self._client = WebDriverClient(self._server_url, timeout=self._timeout)
        try:
            session_id = await self._client.start_session(caps)
            return DriverResult(
                success=True,
                metadata={"session_id": session_id, "window_title": window_title},
            )
        except WebDriverError as exc:
            return DriverResult(success=False, error=str(exc))

    async def close(self) -> DriverResult:
        if self._client:
            await self._client.close()
            self._client = None
        return DriverResult(success=True)

    async def activate_window(self, window_title: str | None = None) -> DriverResult:
        client = self._require_client()
        if not window_title:
            return DriverResult(success=True, metadata={"window_title": ""})
        try:
            element = await client.find_element("name", window_title)
        except WebDriverError:
            try:
                element = await client.find_element("xpath", f"//*[contains(@Name, '{window_title}')]")
            except WebDriverError as exc:
                return DriverResult(success=False, error=str(exc))
        try:
            await client.pointer_action(element, kind="click")
            return DriverResult(success=True, metadata={"window_title": window_title})
        except WebDriverError as exc:
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
        return DriverResult(success=True, metadata={"window_title": ""})

    async def wait_app(
        self,
        process_name: str | None = None,
        timeout: float = 10.0,
    ) -> DriverResult:
        if self._client and self._client.session_id:
            return DriverResult(success=True, metadata={"process_name": process_name or ""})
        if process_name:
            return await self.attach(process_name=process_name)
        return DriverResult(success=False, error="No active WinAppDriver session")

    def _require_client(self) -> WebDriverClient:
        if self._client is None or self._client.session_id is None:
            raise WebDriverError(
                "No WinAppDriver session. Call launch() or attach() first."
            )
        return self._client

    async def _find_candidate(
        self,
        candidates: list[LocatorCandidate],
    ):
        client = self._require_client()
        for candidate in candidates:
            using = _STRATEGY_MAP.get(candidate.strategy, candidate.strategy)
            try:
                return await client.find_element(using, candidate.value), candidate
            except WebDriverError:
                continue
        return None, None

    async def find_element(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        element, candidate = await self._find_candidate(candidates)
        if element is not None and candidate is not None:
            return DriverResult(
                success=True,
                metadata={
                    "element_id": element.element_id,
                    "strategy": candidate.strategy,
                    "value": candidate.value,
                },
            )
        return DriverResult(
            success=False,
            error=f"Element not found with any of {len(candidates)} candidate(s)",
        )

    async def click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        client = self._require_client()
        element, candidate = await self._find_candidate(candidates)
        if element is not None and candidate is not None:
            await client.click(element)
            return DriverResult(
                success=True,
                metadata={"strategy": candidate.strategy, "value": candidate.value},
            )
        return DriverResult(success=False, error="Click failed: element not found")

    async def double_click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        client = self._require_client()
        element, candidate = await self._find_candidate(candidates)
        if element is None or candidate is None:
            return DriverResult(success=False, error="Double click failed: element not found")
        try:
            await client.pointer_action(element, kind="double_click")
            return DriverResult(success=True, metadata={"strategy": candidate.strategy, "value": candidate.value})
        except WebDriverError as exc:
            return DriverResult(success=False, error=str(exc))

    async def right_click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        client = self._require_client()
        element, candidate = await self._find_candidate(candidates)
        if element is None or candidate is None:
            return DriverResult(success=False, error="Right click failed: element not found")
        try:
            await client.pointer_action(element, kind="click", button=2)
            return DriverResult(success=True, metadata={"strategy": candidate.strategy, "value": candidate.value})
        except WebDriverError as exc:
            return DriverResult(success=False, error=str(exc))

    async def hover(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        client = self._require_client()
        element, candidate = await self._find_candidate(candidates)
        if element is None or candidate is None:
            return DriverResult(success=False, error="Hover failed: element not found")
        try:
            await client.pointer_action(element, kind="hover")
            return DriverResult(success=True, metadata={"strategy": candidate.strategy, "value": candidate.value})
        except WebDriverError as exc:
            return DriverResult(success=False, error=str(exc))

    async def type_text(
        self,
        candidates: list[LocatorCandidate],
        text: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        client = self._require_client()
        element, candidate = await self._find_candidate(candidates)
        if element is not None and candidate is not None:
            await client.send_keys(element, text)
            return DriverResult(
                success=True,
                metadata={
                    "strategy": candidate.strategy,
                    "value": candidate.value,
                    "chars": len(text),
                },
            )
        return DriverResult(success=False, error="Type text failed: element not found")

    async def clear_text(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        client = self._require_client()
        element, candidate = await self._find_candidate(candidates)
        if element is None or candidate is None:
            return DriverResult(success=False, error="Clear text failed: element not found")
        try:
            await client.clear(element)
            return DriverResult(success=True, metadata={"strategy": candidate.strategy, "value": candidate.value})
        except WebDriverError as exc:
            return DriverResult(success=False, error=str(exc))

    async def scroll(
        self,
        candidates: list[LocatorCandidate] | None = None,
        delta: int = -5,
        timeout: float = 10.0,
    ) -> DriverResult:
        key = "{PGDN}" if int(delta) < 0 else "{PGUP}"
        result = await self.press_key(key)
        if result.success:
            result.metadata["delta"] = delta
        return result

    async def press_key(self, key: str) -> DriverResult:
        client = self._require_client()
        try:
            await client.send_global_keys(key)
            return DriverResult(success=True, metadata={"key": key})
        except WebDriverError as exc:
            return DriverResult(success=False, error=str(exc))

    async def hotkey(self, keys: list[str]) -> DriverResult:
        return await self.press_key("+".join(keys))

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

    async def select(
        self,
        candidates: list[LocatorCandidate],
        value: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        clear = await self.clear_text(candidates, timeout=timeout)
        if clear.success:
            return await self.type_text(candidates, value, timeout=timeout)
        click = await self.click(candidates, timeout=timeout)
        if not click.success:
            return click
        return await self.press_key(value)

    async def set_checked(
        self,
        candidates: list[LocatorCandidate],
        checked: bool,
        timeout: float = 10.0,
    ) -> DriverResult:
        click = await self.click(candidates, timeout=timeout)
        if click.success:
            click.metadata["checked"] = checked
        return click

    async def get_text(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        client = self._require_client()
        element, candidate = await self._find_candidate(candidates)
        if element is not None and candidate is not None:
            text = await client.element_text(element)
            return DriverResult(
                success=True,
                value=text,
                metadata={"strategy": candidate.strategy, "value": candidate.value},
            )
        return DriverResult(success=False, error="Get text failed: element not found")

    async def get_property(
        self,
        candidates: list[LocatorCandidate],
        property_name: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        client = self._require_client()
        element, candidate = await self._find_candidate(candidates)
        if element is None or candidate is None:
            return DriverResult(success=False, error="Get property failed: element not found")
        try:
            if property_name.lower() in {"text", "name"}:
                value = await client.element_text(element)
            else:
                try:
                    value = await client.element_property(element, property_name)
                except WebDriverError:
                    value = await client.element_attribute(element, property_name)
            return DriverResult(success=True, value=value, metadata={"strategy": candidate.strategy, "property": property_name})
        except WebDriverError as exc:
            return DriverResult(success=False, error=str(exc))

    async def screenshot(self) -> DriverResult:
        client = self._require_client()
        try:
            data = await client.screenshot_png()
            return DriverResult(success=True, screenshot_bytes=data)
        except WebDriverError as exc:
            return DriverResult(success=False, error=str(exc))

    async def get_ui_tree(self) -> DriverResult:
        client = self._require_client()
        try:
            source = await client.source()
            return DriverResult(success=True, ui_tree=source)
        except WebDriverError as exc:
            return DriverResult(success=False, error=str(exc))

    async def report_capabilities(self) -> dict[str, Any]:
        return {
            "driver": "winappdriver",
            "requires_server": True,
            "server_url": self._server_url,
            "platform": "windows",
        }

    async def menu_action(self, menu_path: list[str], timeout: float = 10.0) -> DriverResult:
        """Click through a menu hierarchy by item names."""
        client = self._require_client()
        for item_name in menu_path:
            # Try exact name first, then partial match
            element = None
            for using, value in [
                ("name", item_name),
                ("xpath", f"//*[contains(@Name, '{item_name}')]"),
            ]:
                try:
                    element = await client.find_element(using, value)
                    break
                except WebDriverError:
                    continue
            if element is None:
                return DriverResult(success=False, error=f"Menu item not found: {item_name!r}")
            try:
                await client.click(element)
            except WebDriverError as exc:
                return DriverResult(success=False, error=f"Menu click failed on {item_name!r}: {exc}")
        return DriverResult(success=True, metadata={"menu_path": menu_path})

    async def file_dialog(
        self,
        dialog_type: str = "open",
        file_path: str = "",
        timeout: float = 10.0,
    ) -> DriverResult:
        """Type a file path into a Windows file-picker dialog and confirm."""
        client = self._require_client()
        # Standard Windows file dialog filename field candidates
        filename_selectors = [
            ("accessibility id", "1148"),
            ("xpath", "//*[@AutomationId='1148']"),
            ("name", "File name:"),
            ("class name", "ComboBoxEx32"),
        ]
        element = None
        for using, value in filename_selectors:
            try:
                element = await client.find_element(using, value)
                break
            except WebDriverError:
                continue
        if element is None:
            return DriverResult(success=False, error="File dialog filename field not found")
        try:
            await client.click(element)
            await client.clear(element)
            await client.send_keys(element, file_path)
        except WebDriverError as exc:
            return DriverResult(success=False, error=f"File dialog input failed: {exc}")
        # Click Open/Save button or press Enter
        button_name = "Save" if dialog_type == "save" else "Open"
        try:
            btn = await client.find_element("name", button_name)
            await client.click(btn)
        except WebDriverError:
            try:
                await client.send_global_keys("\ue007")  # Enter
            except WebDriverError as exc:
                return DriverResult(success=False, error=f"Could not confirm file dialog: {exc}")
        return DriverResult(success=True, metadata={"dialog_type": dialog_type, "file_path": file_path})

    async def print_dialog(
        self,
        action: str = "print",
        printer: str = "",
        timeout: float = 10.0,
    ) -> DriverResult:
        """Handle a Windows print dialog."""
        client = self._require_client()
        if action == "cancel":
            try:
                btn = await client.find_element("name", "Cancel")
                await client.click(btn)
                return DriverResult(success=True, metadata={"action": "cancel"})
            except WebDriverError as exc:
                return DriverResult(success=False, error=f"Cancel button not found: {exc}")
        if printer:
            try:
                combo = await client.find_element("class name", "ComboBox")
                await client.click(combo)
                await asyncio.sleep(0.3)
                item = await client.find_element("name", printer)
                await client.click(item)
            except WebDriverError:
                pass  # best-effort printer selection
        # Click Print button
        for btn_name in ("Print", "OK"):
            try:
                btn = await client.find_element("name", btn_name)
                await client.click(btn)
                return DriverResult(success=True, metadata={"action": action, "printer": printer})
            except WebDriverError:
                continue
        return DriverResult(success=False, error="Print/OK button not found in print dialog")
