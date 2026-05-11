"""Small async W3C WebDriver client used by Appium and WinAppDriver plugins."""
from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

import httpx


class WebDriverError(Exception):
    """Raised when a WebDriver endpoint returns an error response."""


@dataclass
class WebDriverElement:
    element_id: str


class WebDriverClient:
    def __init__(self, base_url: str, *, timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(timeout),
        )
        self.session_id: str | None = None

    async def close(self) -> None:
        if self.session_id:
            try:
                await self.delete(f"/session/{self.session_id}")
            except Exception:
                pass
            self.session_id = None
        await self._client.aclose()

    async def start_session(self, capabilities: dict[str, Any]) -> str:
        body = {"capabilities": {"alwaysMatch": capabilities}}
        data = await self.post("/session", body)
        value = data.get("value", data)
        session_id = value.get("sessionId") or data.get("sessionId")
        if not session_id:
            raise WebDriverError("WebDriver server did not return a session id")
        self.session_id = str(session_id)
        return self.session_id

    async def post(self, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        return await self._request("POST", path, json=body or {})

    async def get(self, path: str) -> dict[str, Any]:
        return await self._request("GET", path)

    async def delete(self, path: str) -> dict[str, Any]:
        return await self._request("DELETE", path)

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = await self._client.request(method, path, **kwargs)
        except httpx.ConnectError as exc:
            raise WebDriverError(f"Cannot connect to WebDriver server at {self.base_url}") from exc
        except httpx.TimeoutException as exc:
            raise WebDriverError(f"WebDriver request timed out: {method} {path}") from exc

        try:
            data = response.json()
        except Exception:
            data = {"value": response.text}

        if response.status_code >= 400:
            value = data.get("value", {})
            if isinstance(value, dict):
                message = value.get("message") or value.get("error") or str(value)
            else:
                message = str(value)
            raise WebDriverError(message)
        return data

    def require_session(self) -> str:
        if not self.session_id:
            raise WebDriverError("WebDriver session has not been started")
        return self.session_id

    async def find_element(self, using: str, value: str) -> WebDriverElement:
        session_id = self.require_session()
        data = await self.post(
            f"/session/{session_id}/element",
            {"using": using, "value": value},
        )
        raw = data.get("value") or {}
        element_id = (
            raw.get("element-6066-11e4-a52e-4f735466cecf")
            or raw.get("ELEMENT")
            or raw.get("elementId")
        )
        if not element_id:
            raise WebDriverError(f"Element not found: {using}={value}")
        return WebDriverElement(str(element_id))

    async def click(self, element: WebDriverElement) -> None:
        session_id = self.require_session()
        await self.post(f"/session/{session_id}/element/{element.element_id}/click")

    async def send_keys(self, element: WebDriverElement, text: str) -> None:
        session_id = self.require_session()
        await self.post(
            f"/session/{session_id}/element/{element.element_id}/value",
            {"text": text, "value": list(text)},
        )

    async def element_text(self, element: WebDriverElement) -> str:
        session_id = self.require_session()
        data = await self.get(f"/session/{session_id}/element/{element.element_id}/text")
        return str(data.get("value") or "")

    async def screenshot_png(self) -> bytes:
        session_id = self.require_session()
        data = await self.get(f"/session/{session_id}/screenshot")
        encoded = str(data.get("value") or "")
        return base64.b64decode(encoded)

    async def source(self) -> str:
        session_id = self.require_session()
        data = await self.get(f"/session/{session_id}/source")
        return str(data.get("value") or "")

    async def execute_script(self, script: str, args: list[Any] | None = None) -> Any:
        session_id = self.require_session()
        data = await self.post(
            f"/session/{session_id}/execute/sync",
            {"script": script, "args": args or []},
        )
        return data.get("value")
