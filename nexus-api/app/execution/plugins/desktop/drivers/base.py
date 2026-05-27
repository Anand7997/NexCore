"""DesktopDriver interface — the common contract for all desktop automation adapters."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


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

    @abstractmethod
    async def get_text(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult: ...

    @abstractmethod
    async def screenshot(self) -> DriverResult: ...

    @abstractmethod
    async def get_ui_tree(self) -> DriverResult: ...

    @abstractmethod
    async def report_capabilities(self) -> dict[str, Any]: ...
