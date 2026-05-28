"""DesktopDriver interface — the common contract for all desktop automation adapters."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any
import asyncio


@dataclass
class DriverResult:
    """Return value for every DesktopDriver method."""
    success: bool
    value: str | None = None                # text or property value
    screenshot_bytes: bytes | None = None
    ui_tree: str | None = None              # XML or pseudo-XML UI snapshot
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class LocatorCandidate:
    """A single element locator with a strategy and confidence score."""
    strategy: str   # "accessibility_id" | "name" | "xpath" | "class_name" | "ocr" | "visual"
    value: str
    confidence: float = 1.0  # 1.0 = deterministic; < 1.0 = AI/OCR/visual


class DesktopDriver(ABC):
    """Common interface every desktop runtime adapter must implement."""

    @abstractmethod
    async def launch(
        self,
        app_path: str,
        args: list[str] | None = None,
        capabilities: dict[str, Any] | None = None,
    ) -> DriverResult: ...

    @abstractmethod
    async def attach(
        self,
        window_title: str | None = None,
        process_name: str | None = None,
    ) -> DriverResult: ...

    @abstractmethod
    async def close(self) -> DriverResult: ...

    async def restart_app(
        self,
        app_path: str,
        args: list[str] | None = None,
        capabilities: dict[str, Any] | None = None,
    ) -> DriverResult:
        close_result = await self.close()
        if not close_result.success:
            return close_result
        return await self.launch(app_path, args=args, capabilities=capabilities)

    async def activate_window(self, window_title: str | None = None) -> DriverResult:
        return DriverResult(success=False, error="activate_window is not supported by this desktop driver")

    async def switch_window(
        self,
        window_title: str | None = None,
        process_name: str | None = None,
    ) -> DriverResult:
        return await self.attach(window_title=window_title, process_name=process_name)

    async def wait_window(
        self,
        window_title: str,
        timeout: float = 10.0,
        poll_interval: float = 0.5,
    ) -> DriverResult:
        deadline = asyncio.get_running_loop().time() + timeout
        last_error = ""
        while asyncio.get_running_loop().time() <= deadline:
            result = await self.activate_window(window_title)
            if result.success:
                return result
            last_error = result.error or ""
            await asyncio.sleep(max(0.05, poll_interval))
        return DriverResult(success=False, error=last_error or f"Window not found: {window_title}")

    async def wait_app(
        self,
        process_name: str | None = None,
        timeout: float = 10.0,
    ) -> DriverResult:
        return DriverResult(success=False, error="wait_app is not supported by this desktop driver")

    @abstractmethod
    async def find_element(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult: ...

    @abstractmethod
    async def click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult: ...

    @abstractmethod
    async def type_text(
        self,
        candidates: list[LocatorCandidate],
        text: str,
        timeout: float = 10.0,
    ) -> DriverResult: ...

    async def set_text(
        self,
        candidates: list[LocatorCandidate],
        text: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        clear = await self.clear_text(candidates, timeout=timeout)
        if not clear.success:
            return clear
        return await self.type_text(candidates, text, timeout=timeout)

    @abstractmethod
    async def get_text(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult: ...

    async def double_click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        return DriverResult(success=False, error="double_click is not supported by this desktop driver")

    async def right_click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        return DriverResult(success=False, error="right_click is not supported by this desktop driver")

    async def hover(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        return DriverResult(success=False, error="hover is not supported by this desktop driver")

    async def clear_text(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        return DriverResult(success=False, error="clear_text is not supported by this desktop driver")

    async def press_key(self, key: str) -> DriverResult:
        return DriverResult(success=False, error="press_key is not supported by this desktop driver")

    async def hotkey(self, keys: list[str]) -> DriverResult:
        return DriverResult(success=False, error="hotkey is not supported by this desktop driver")

    async def key_sequence(self, keys: list[str]) -> DriverResult:
        for key in keys:
            result = await self.press_key(key)
            if not result.success:
                return result
        return DriverResult(success=True, metadata={"keys": keys})

    async def scroll(
        self,
        candidates: list[LocatorCandidate] | None = None,
        delta: int = -5,
        timeout: float = 10.0,
    ) -> DriverResult:
        return DriverResult(success=False, error="scroll is not supported by this desktop driver")

    async def drag_and_drop(
        self,
        source_candidates: list[LocatorCandidate],
        target_candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        return DriverResult(success=False, error="drag_and_drop is not supported by this desktop driver")

    async def handle_modal(
        self,
        action: str = "accept",
        button_text: str | None = None,
        timeout: float = 10.0,
    ) -> DriverResult:
        if button_text:
            result = await self.click([LocatorCandidate(strategy="name", value=button_text)], timeout=timeout)
            if result.success:
                result.metadata["modal_action"] = action
                return result
        key = "Enter" if action in {"accept", "ok", "yes"} else "Escape"
        result = await self.press_key(key)
        if result.success:
            result.metadata["modal_action"] = action
        return result

    async def clipboard_set(self, text: str) -> DriverResult:
        return DriverResult(success=False, error="clipboard_set is not supported by this desktop driver")

    async def clipboard_get(self) -> DriverResult:
        return DriverResult(success=False, error="clipboard_get is not supported by this desktop driver")

    # ── New driver-level capabilities ─────────────────────────────────────────

    async def menu_action(self, menu_path: list[str], timeout: float = 10.0) -> DriverResult:
        """Click through a menu hierarchy by item names (e.g. ['File', 'Open'])."""
        return DriverResult(success=False, error="menu_action is not supported by this desktop driver")

    async def ribbon_action(self, tab: str, group: str, button: str, timeout: float = 10.0) -> DriverResult:
        """Click a ribbon button identified by tab/group/button names."""
        return DriverResult(success=False, error="ribbon_action is not supported by this desktop driver")

    async def table_cell_action(
        self,
        candidates: list[LocatorCandidate],
        row: int,
        column: str,
        action: str = "click",
        value: str = "",
        timeout: float = 10.0,
    ) -> DriverResult:
        """Perform an action on a DataGrid/ListView cell by zero-based row index and column name."""
        return DriverResult(success=False, error="table_cell_action is not supported by this desktop driver")

    async def tree_action(
        self,
        candidates: list[LocatorCandidate],
        node_path: str,
        action: str = "select",
        timeout: float = 10.0,
    ) -> DriverResult:
        """Expand, collapse, or select a TreeView node by its path string."""
        return DriverResult(success=False, error="tree_action is not supported by this desktop driver")

    async def extract_table(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        """Read DataGrid/ListView rows as a list of dicts in ``result.metadata['rows']``."""
        return DriverResult(success=False, error="extract_table is not supported by this desktop driver")

    async def file_dialog(
        self,
        dialog_type: str = "open",
        file_path: str = "",
        timeout: float = 10.0,
    ) -> DriverResult:
        """Type a file path into an open Windows file picker dialog and confirm."""
        return DriverResult(success=False, error="file_dialog is not supported by this desktop driver")

    async def print_dialog(
        self,
        action: str = "print",
        printer: str = "",
        timeout: float = 10.0,
    ) -> DriverResult:
        """Handle a Windows print dialog (print / cancel / preview)."""
        return DriverResult(success=False, error="print_dialog is not supported by this desktop driver")

    async def select(
        self,
        candidates: list[LocatorCandidate],
        value: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        return DriverResult(success=False, error="select is not supported by this desktop driver")

    async def set_checked(
        self,
        candidates: list[LocatorCandidate],
        checked: bool,
        timeout: float = 10.0,
    ) -> DriverResult:
        return DriverResult(success=False, error="set_checked is not supported by this desktop driver")

    async def get_property(
        self,
        candidates: list[LocatorCandidate],
        property_name: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        if property_name.lower() in {"text", "name", "value"}:
            return await self.get_text(candidates, timeout=timeout)
        return DriverResult(success=False, error=f"get_property({property_name}) is not supported by this desktop driver")

    @abstractmethod
    async def screenshot(self) -> DriverResult: ...

    @abstractmethod
    async def get_ui_tree(self) -> DriverResult: ...

    @abstractmethod
    async def report_capabilities(self) -> dict[str, Any]: ...
