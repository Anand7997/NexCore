"""WinAppDriver / Appium Windows compatibility adapter."""
from __future__ import annotations

import os
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

    def _require_client(self) -> WebDriverClient:
        if self._client is None or self._client.session_id is None:
            raise WebDriverError(
                "No WinAppDriver session. Call launch() or attach() first."
            )
        return self._client

    async def find_element(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        client = self._require_client()
        for candidate in candidates:
            using = _STRATEGY_MAP.get(candidate.strategy, candidate.strategy)
            try:
                element = await client.find_element(using, candidate.value)
                return DriverResult(
                    success=True,
                    metadata={
                        "element_id": element.element_id,
                        "strategy": candidate.strategy,
                        "value": candidate.value,
                    },
                )
            except WebDriverError:
                continue
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
        for candidate in candidates:
            using = _STRATEGY_MAP.get(candidate.strategy, candidate.strategy)
            try:
                element = await client.find_element(using, candidate.value)
                await client.click(element)
                return DriverResult(
                    success=True,
                    metadata={"strategy": candidate.strategy, "value": candidate.value},
                )
            except WebDriverError:
                continue
        return DriverResult(success=False, error="Click failed: element not found")

    async def type_text(
        self,
        candidates: list[LocatorCandidate],
        text: str,
        timeout: float = 10.0,
    ) -> DriverResult:
        client = self._require_client()
        for candidate in candidates:
            using = _STRATEGY_MAP.get(candidate.strategy, candidate.strategy)
            try:
                element = await client.find_element(using, candidate.value)
                await client.send_keys(element, text)
                return DriverResult(
                    success=True,
                    metadata={
                        "strategy": candidate.strategy,
                        "value": candidate.value,
                        "chars": len(text),
                    },
                )
            except WebDriverError:
                continue
        return DriverResult(success=False, error="Type text failed: element not found")

    async def get_text(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        client = self._require_client()
        for candidate in candidates:
            using = _STRATEGY_MAP.get(candidate.strategy, candidate.strategy)
            try:
                element = await client.find_element(using, candidate.value)
                text = await client.element_text(element)
                return DriverResult(
                    success=True,
                    value=text,
                    metadata={"strategy": candidate.strategy, "value": candidate.value},
                )
            except WebDriverError:
                continue
        return DriverResult(success=False, error="Get text failed: element not found")

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
