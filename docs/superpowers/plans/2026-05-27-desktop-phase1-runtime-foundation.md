# Desktop Phase 1: Runtime Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WinAppDriver-only desktop plugin with a pluggable `DesktopDriver` layer supporting WinAppDriver, UIA3 (pywinauto), and computer-vision (OCR + template matching) adapters, selectable via `driver_type` config.

**Architecture:** A `DesktopDriver` ABC in `drivers/base.py` defines a 10-method interface. Three concrete adapters implement it. `DesktopExecutionPlugin` selects the adapter at session start via a `driver_type` field (`"winappdriver"` | `"uia3"` | `"computer_vision"` | `"auto"`) and delegates all node execution through the interface. Zero changes to plugin registry, orchestration, or API boundaries.

**Tech Stack:** Python 3.11+, `pywinauto` (UIA3 adapter), `pytesseract` + `mss` + `opencv-python-headless` + `pyautogui` (CV adapter), `httpx` (WinAppDriver adapter — already present), `pytest` + `pytest-asyncio` (tests).

---

## File Map

| Action   | Path |
|----------|------|
| Create   | `nexus-api/pytest.ini` |
| Create   | `nexus-api/tests/__init__.py` |
| Create   | `nexus-api/tests/execution/__init__.py` |
| Create   | `nexus-api/tests/execution/plugins/__init__.py` |
| Create   | `nexus-api/tests/execution/plugins/desktop/__init__.py` |
| Create   | `nexus-api/app/execution/plugins/desktop/drivers/__init__.py` |
| Create   | `nexus-api/app/execution/plugins/desktop/drivers/base.py` |
| Create   | `nexus-api/app/execution/plugins/desktop/drivers/winappdriver.py` |
| Create   | `nexus-api/app/execution/plugins/desktop/drivers/uia3.py` |
| Create   | `nexus-api/app/execution/plugins/desktop/drivers/computer_vision.py` |
| Modify   | `nexus-api/app/execution/plugins/desktop/plugin.py` (full rewrite) |
| Modify   | `nexus-api/requirements.txt` |
| Create   | `nexus-api/tests/execution/plugins/desktop/test_driver_base.py` |
| Create   | `nexus-api/tests/execution/plugins/desktop/test_winappdriver_adapter.py` |
| Create   | `nexus-api/tests/execution/plugins/desktop/test_uia3_adapter.py` |
| Create   | `nexus-api/tests/execution/plugins/desktop/test_computer_vision_adapter.py` |
| Create   | `nexus-api/tests/execution/plugins/desktop/test_get_driver.py` |
| Create   | `nexus-api/tests/execution/plugins/desktop/test_plugin_adapter.py` |

---

## Task 1: Test Infrastructure + New Dependencies

**Files:**
- Create: `nexus-api/pytest.ini`
- Create: `nexus-api/tests/__init__.py` (empty)
- Create: `nexus-api/tests/execution/__init__.py` (empty)
- Create: `nexus-api/tests/execution/plugins/__init__.py` (empty)
- Create: `nexus-api/tests/execution/plugins/desktop/__init__.py` (empty)
- Modify: `nexus-api/requirements.txt`

- [ ] **Step 1: Create `nexus-api/pytest.ini`**

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
```

- [ ] **Step 2: Create empty `__init__.py` files for the test package tree**

Create these four files, each empty (0 bytes):
- `nexus-api/tests/__init__.py`
- `nexus-api/tests/execution/__init__.py`
- `nexus-api/tests/execution/plugins/__init__.py`
- `nexus-api/tests/execution/plugins/desktop/__init__.py`

- [ ] **Step 3: Add new dependencies to `nexus-api/requirements.txt`**

Replace the content of `nexus-api/requirements.txt` with:

```
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.7.4
pydantic-settings==2.1.0
sqlalchemy==2.0.23
asyncpg==0.29.0
alembic==1.12.1
python-multipart==0.0.6
websockets==11.0.3
python-dotenv==1.0.0

# Execution plugin layer
httpx==0.27.0
truststore>=0.10.0
playwright==1.45.0

# AI Workflow providers (optional — install for real AI calls)
openai>=1.30.0
anthropic>=0.28.0

# Desktop automation adapters
pywinauto>=0.6.8
pytesseract>=0.3.13
mss>=9.0.1
opencv-python-headless>=4.9.0
Pillow>=10.0.0
pyautogui>=0.9.54

# Test runner
pytest>=8.0.0
pytest-asyncio>=0.23.0

# Optional Phase 6 AI extras live in requirements-ai.txt.
```

- [ ] **Step 4: Verify pytest is importable**

Run from `nexus-api/` directory:
```
pip install pytest pytest-asyncio
pytest --co -q
```
Expected output: `no tests ran` (no test files yet — that's fine).

- [ ] **Step 5: Commit**

```bash
git add nexus-api/pytest.ini nexus-api/tests/ nexus-api/requirements.txt
git commit -m "chore: add test infrastructure and desktop adapter dependencies"
```

---

## Task 2: `DriverResult`, `LocatorCandidate`, `DesktopDriver` ABC

**Files:**
- Create: `nexus-api/app/execution/plugins/desktop/drivers/__init__.py` (placeholder)
- Create: `nexus-api/app/execution/plugins/desktop/drivers/base.py`
- Test: `nexus-api/tests/execution/plugins/desktop/test_driver_base.py`

- [ ] **Step 1: Write the failing tests**

Create `nexus-api/tests/execution/plugins/desktop/test_driver_base.py`:

```python
import pytest
from app.execution.plugins.desktop.drivers.base import (
    DesktopDriver,
    DriverResult,
    LocatorCandidate,
)


def test_driver_result_minimal():
    r = DriverResult(success=True)
    assert r.value is None
    assert r.screenshot_bytes is None
    assert r.ui_tree is None
    assert r.error is None
    assert r.metadata == {}


def test_driver_result_failure():
    r = DriverResult(success=False, error="connection refused", metadata={"attempt": 1})
    assert r.success is False
    assert r.error == "connection refused"
    assert r.metadata["attempt"] == 1


def test_driver_result_with_screenshot():
    r = DriverResult(success=True, screenshot_bytes=b"PNG", ui_tree="<root/>")
    assert r.screenshot_bytes == b"PNG"
    assert r.ui_tree == "<root/>"


def test_locator_candidate_default_confidence():
    c = LocatorCandidate(strategy="accessibility_id", value="btn_ok")
    assert c.confidence == 1.0


def test_locator_candidate_low_confidence():
    c = LocatorCandidate(strategy="ocr", value="Submit", confidence=0.75)
    assert c.strategy == "ocr"
    assert c.value == "Submit"
    assert c.confidence == 0.75


def test_desktop_driver_is_abstract():
    with pytest.raises(TypeError):
        DesktopDriver()


def test_desktop_driver_subclass_must_implement_all_methods():
    """A partial subclass with only some methods raises TypeError on instantiation."""

    class PartialDriver(DesktopDriver):
        async def launch(self, app_path, args=None, capabilities=None):
            pass

    with pytest.raises(TypeError):
        PartialDriver()
```

- [ ] **Step 2: Run tests — verify they fail**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_driver_base.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.execution.plugins.desktop.drivers'`

- [ ] **Step 3: Create empty `drivers/__init__.py` placeholder**

Create `nexus-api/app/execution/plugins/desktop/drivers/__init__.py` with content:

```python
# populated in Task 6
```

- [ ] **Step 4: Write `drivers/base.py`**

Create `nexus-api/app/execution/plugins/desktop/drivers/base.py`:

```python
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
```

- [ ] **Step 5: Run tests — verify they pass**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_driver_base.py -v
```
Expected: `7 passed`

- [ ] **Step 6: Commit**

```bash
git add nexus-api/app/execution/plugins/desktop/drivers/ nexus-api/tests/execution/plugins/desktop/test_driver_base.py
git commit -m "feat: add DesktopDriver ABC with DriverResult and LocatorCandidate"
```

---

## Task 3: `WinAppDriverAdapter`

**Files:**
- Create: `nexus-api/app/execution/plugins/desktop/drivers/winappdriver.py`
- Test: `nexus-api/tests/execution/plugins/desktop/test_winappdriver_adapter.py`

- [ ] **Step 1: Write the failing tests**

Create `nexus-api/tests/execution/plugins/desktop/test_winappdriver_adapter.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.execution.plugins.desktop.drivers.base import LocatorCandidate
from app.execution.plugins.webdriver_client import WebDriverElement, WebDriverError


def _make_mock_client(session_id="sess1"):
    client = MagicMock()
    client.session_id = session_id
    client.start_session = AsyncMock(return_value=session_id)
    client.close = AsyncMock()
    client.find_element = AsyncMock()
    client.click = AsyncMock()
    client.send_keys = AsyncMock()
    client.element_text = AsyncMock(return_value="")
    client.screenshot_png = AsyncMock(return_value=b"PNG")
    client.source = AsyncMock(return_value="<UITree/>")
    return client


@pytest.mark.asyncio
async def test_launch_creates_session_and_sets_default_caps():
    mock_client = _make_mock_client()
    with patch(
        "app.execution.plugins.desktop.drivers.winappdriver.WebDriverClient",
        return_value=mock_client,
    ):
        from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
        adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
        result = await adapter.launch("notepad.exe")

    assert result.success is True
    assert result.metadata["app"] == "notepad.exe"
    assert result.metadata["session_id"] == "sess1"
    caps = mock_client.start_session.call_args[0][0]
    assert caps["app"] == "notepad.exe"
    assert caps["platformName"] == "Windows"
    assert caps["deviceName"] == "WindowsPC"


@pytest.mark.asyncio
async def test_launch_preserves_extra_capabilities():
    mock_client = _make_mock_client()
    with patch(
        "app.execution.plugins.desktop.drivers.winappdriver.WebDriverClient",
        return_value=mock_client,
    ):
        from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
        adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
        result = await adapter.launch("app.exe", capabilities={"customCap": "val"})

    caps = mock_client.start_session.call_args[0][0]
    assert caps["customCap"] == "val"
    assert result.success is True


@pytest.mark.asyncio
async def test_launch_returns_failure_on_webdriver_error():
    mock_client = _make_mock_client()
    mock_client.start_session = AsyncMock(side_effect=WebDriverError("server down"))
    with patch(
        "app.execution.plugins.desktop.drivers.winappdriver.WebDriverClient",
        return_value=mock_client,
    ):
        from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
        adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
        result = await adapter.launch("app.exe")

    assert result.success is False
    assert "server down" in result.error


@pytest.mark.asyncio
async def test_click_finds_element_then_clicks():
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el1")
    mock_client.find_element = AsyncMock(return_value=mock_el)

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    candidates = [LocatorCandidate(strategy="accessibility_id", value="btn_ok")]
    result = await adapter.click(candidates)

    assert result.success is True
    mock_client.find_element.assert_called_once_with("accessibility id", "btn_ok")
    mock_client.click.assert_called_once_with(mock_el)


@pytest.mark.asyncio
async def test_click_falls_back_to_second_candidate():
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el2")
    mock_client.find_element = AsyncMock(
        side_effect=[WebDriverError("not found"), mock_el]
    )

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    candidates = [
        LocatorCandidate(strategy="accessibility_id", value="btn_ok"),
        LocatorCandidate(strategy="name", value="OK"),
    ]
    result = await adapter.click(candidates)

    assert result.success is True
    assert mock_client.find_element.call_count == 2
    assert result.metadata["strategy"] == "name"


@pytest.mark.asyncio
async def test_click_fails_when_all_candidates_fail():
    mock_client = _make_mock_client()
    mock_client.find_element = AsyncMock(side_effect=WebDriverError("not found"))

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    candidates = [LocatorCandidate(strategy="name", value="Ghost")]
    result = await adapter.click(candidates)

    assert result.success is False


@pytest.mark.asyncio
async def test_type_text_sends_keys():
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el3")
    mock_client.find_element = AsyncMock(return_value=mock_el)

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    candidates = [LocatorCandidate(strategy="name", value="name_input")]
    result = await adapter.type_text(candidates, "hello world")

    assert result.success is True
    mock_client.send_keys.assert_called_once_with(mock_el, "hello world")
    assert result.metadata["chars"] == 11


@pytest.mark.asyncio
async def test_get_text_returns_element_text():
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el4")
    mock_client.find_element = AsyncMock(return_value=mock_el)
    mock_client.element_text = AsyncMock(return_value="Invoice #42")

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    candidates = [LocatorCandidate(strategy="accessibility_id", value="invoice_lbl")]
    result = await adapter.get_text(candidates)

    assert result.success is True
    assert result.value == "Invoice #42"


@pytest.mark.asyncio
async def test_screenshot_returns_png_bytes():
    mock_client = _make_mock_client()
    mock_client.screenshot_png = AsyncMock(return_value=b"\x89PNG_DATA")

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    result = await adapter.screenshot()

    assert result.success is True
    assert result.screenshot_bytes == b"\x89PNG_DATA"


@pytest.mark.asyncio
async def test_get_ui_tree_returns_source():
    mock_client = _make_mock_client()
    mock_client.source = AsyncMock(return_value="<UITree><Button name='OK'/></UITree>")

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    result = await adapter.get_ui_tree()

    assert result.success is True
    assert "<Button" in result.ui_tree


@pytest.mark.asyncio
async def test_report_capabilities():
    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://192.168.1.1:4723")
    caps = await adapter.report_capabilities()

    assert caps["driver"] == "winappdriver"
    assert caps["requires_server"] is True
    assert caps["server_url"] == "http://192.168.1.1:4723"


@pytest.mark.asyncio
async def test_strategy_map_normalises_legacy_names():
    """accessibility id (with space) maps to the W3C strategy string."""
    mock_client = _make_mock_client()
    mock_el = WebDriverElement(element_id="el5")
    mock_client.find_element = AsyncMock(return_value=mock_el)

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    # legacy strategy string with space (from old plugin.py config)
    candidates = [LocatorCandidate(strategy="accessibility id", value="btn")]
    result = await adapter.click(candidates)

    assert result.success is True
    mock_client.find_element.assert_called_once_with("accessibility id", "btn")


@pytest.mark.asyncio
async def test_close_calls_client_close():
    mock_client = _make_mock_client()

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    adapter = WinAppDriverAdapter(server_url="http://localhost:4723")
    adapter._client = mock_client

    result = await adapter.close()

    assert result.success is True
    mock_client.close.assert_called_once()
    assert adapter._client is None
```

- [ ] **Step 2: Run tests — verify they fail**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_winappdriver_adapter.py -v
```
Expected: `ImportError` — `winappdriver` module does not exist yet.

- [ ] **Step 3: Write `drivers/winappdriver.py`**

Create `nexus-api/app/execution/plugins/desktop/drivers/winappdriver.py`:

```python
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
```

- [ ] **Step 4: Run tests — verify they pass**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_winappdriver_adapter.py -v
```
Expected: `12 passed`

- [ ] **Step 5: Commit**

```bash
git add nexus-api/app/execution/plugins/desktop/drivers/winappdriver.py \
        nexus-api/tests/execution/plugins/desktop/test_winappdriver_adapter.py
git commit -m "feat: add WinAppDriverAdapter implementing DesktopDriver interface"
```

---

## Task 4: `UIA3Adapter`

**Files:**
- Create: `nexus-api/app/execution/plugins/desktop/drivers/uia3.py`
- Test: `nexus-api/tests/execution/plugins/desktop/test_uia3_adapter.py`

- [ ] **Step 1: Write the failing tests**

Create `nexus-api/tests/execution/plugins/desktop/test_uia3_adapter.py`:

```python
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from app.execution.plugins.desktop.drivers.base import LocatorCandidate


def _make_mock_pywinauto():
    """Return a fully mock pywinauto module."""
    pw = MagicMock()
    mock_app = MagicMock()
    mock_window = MagicMock()
    mock_window.window_text.return_value = "Notepad"
    mock_window.descendants.return_value = []
    mock_app.top_window.return_value = mock_window
    mock_app.start.return_value = mock_app
    mock_app.connect.return_value = mock_app
    mock_app.kill.return_value = None
    pw.Application.return_value = mock_app
    return pw, mock_app, mock_window


@pytest.mark.asyncio
async def test_launch_starts_application():
    pw, mock_app, mock_window = _make_mock_pywinauto()
    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        result = await adapter.launch("notepad.exe")

    assert result.success is True
    assert result.metadata["app"] == "notepad.exe"
    pw.Application.assert_called_with(backend="uia")


@pytest.mark.asyncio
async def test_launch_returns_failure_on_exception():
    pw, mock_app, _ = _make_mock_pywinauto()
    mock_app.start.side_effect = Exception("Access denied")
    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        result = await adapter.launch("locked.exe")

    assert result.success is False
    assert "Access denied" in result.error


@pytest.mark.asyncio
async def test_attach_by_title():
    pw, mock_app, mock_window = _make_mock_pywinauto()
    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        result = await adapter.attach(window_title="Notepad")

    assert result.success is True
    mock_app.connect.assert_called_once_with(title="Notepad")


@pytest.mark.asyncio
async def test_attach_requires_title_or_process():
    with patch.dict("sys.modules", {"pywinauto": MagicMock()}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        result = await adapter.attach()  # no title, no process

    assert result.success is False
    assert "required" in result.error.lower()


@pytest.mark.asyncio
async def test_find_element_by_automation_id():
    pw, mock_app, mock_window = _make_mock_pywinauto()
    mock_ctrl = MagicMock()
    mock_ctrl.exists.return_value = True
    mock_window.child_window.return_value = mock_ctrl

    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        adapter._app = mock_app
        adapter._top_window = mock_window

        candidates = [LocatorCandidate(strategy="accessibility_id", value="btn_submit")]
        result = await adapter.find_element(candidates)

    assert result.success is True
    mock_window.child_window.assert_called_once_with(auto_id="btn_submit")


@pytest.mark.asyncio
async def test_find_element_falls_back_to_second_candidate():
    pw, mock_app, mock_window = _make_mock_pywinauto()
    # first ctrl.exists() returns False, second returns True
    ctrl1 = MagicMock()
    ctrl1.exists.return_value = False
    ctrl2 = MagicMock()
    ctrl2.exists.return_value = True
    mock_window.child_window.side_effect = [ctrl1, ctrl2]

    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        adapter._app = mock_app
        adapter._top_window = mock_window

        candidates = [
            LocatorCandidate(strategy="accessibility_id", value="btn_x"),
            LocatorCandidate(strategy="name", value="Submit"),
        ]
        result = await adapter.find_element(candidates)

    assert result.success is True
    assert result.metadata["strategy"] == "name"


@pytest.mark.asyncio
async def test_find_element_fails_when_none_match():
    pw, mock_app, mock_window = _make_mock_pywinauto()
    ctrl = MagicMock()
    ctrl.exists.return_value = False
    mock_window.child_window.return_value = ctrl

    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        adapter._app = mock_app
        adapter._top_window = mock_window

        candidates = [LocatorCandidate(strategy="name", value="Ghost")]
        result = await adapter.find_element(candidates)

    assert result.success is False


@pytest.mark.asyncio
async def test_report_capabilities_no_server():
    with patch.dict("sys.modules", {"pywinauto": MagicMock()}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        caps = await adapter.report_capabilities()

    assert caps["driver"] == "uia3"
    assert caps["requires_server"] is False
    assert caps["platform"] == "windows"
    assert caps["backend"] == "pywinauto"


@pytest.mark.asyncio
async def test_close_kills_app():
    pw, mock_app, _ = _make_mock_pywinauto()
    with patch.dict("sys.modules", {"pywinauto": pw}):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.uia3 as mod
        reload(mod)
        adapter = mod.UIA3Adapter()
        adapter._app = mock_app

        result = await adapter.close()

    assert result.success is True
    mock_app.kill.assert_called_once()
    assert adapter._app is None
```

- [ ] **Step 2: Run tests — verify they fail**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_uia3_adapter.py -v
```
Expected: `ImportError` — `uia3` module does not exist yet.

- [ ] **Step 3: Write `drivers/uia3.py`**

Create `nexus-api/app/execution/plugins/desktop/drivers/uia3.py`:

```python
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
```

- [ ] **Step 4: Run tests — verify they pass**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_uia3_adapter.py -v
```
Expected: `9 passed`

- [ ] **Step 5: Commit**

```bash
git add nexus-api/app/execution/plugins/desktop/drivers/uia3.py \
        nexus-api/tests/execution/plugins/desktop/test_uia3_adapter.py
git commit -m "feat: add UIA3Adapter using pywinauto (no WinAppDriver server needed)"
```

---

## Task 5: `ComputerVisionAdapter`

**Files:**
- Create: `nexus-api/app/execution/plugins/desktop/drivers/computer_vision.py`
- Test: `nexus-api/tests/execution/plugins/desktop/test_computer_vision_adapter.py`

- [ ] **Step 1: Write the failing tests**

Create `nexus-api/tests/execution/plugins/desktop/test_computer_vision_adapter.py`:

```python
import pytest
from unittest.mock import MagicMock, patch, call
from app.execution.plugins.desktop.drivers.base import LocatorCandidate


def _patch_cv_deps(patcher_ctx, ocr_data=None, match_val=0.9, match_loc=(10, 20)):
    """Patch mss, pytesseract, cv2, pyautogui, PIL, subprocess, numpy inside a context."""
    import sys

    # PIL Image mock
    mock_image = MagicMock()
    mock_image.save = MagicMock()
    mock_image.convert = MagicMock(return_value=mock_image)

    # mss mock
    mock_sct = MagicMock()
    mock_screenshot = MagicMock()
    mock_screenshot.size = (1920, 1080)
    mock_screenshot.bgra = b"BGRA" * (1920 * 1080)
    mock_sct.__enter__ = MagicMock(return_value=mock_sct)
    mock_sct.__exit__ = MagicMock(return_value=False)
    mock_sct.monitors = [{"left": 0, "top": 0, "width": 1920, "height": 1080}]
    mock_sct.grab = MagicMock(return_value=mock_screenshot)
    mock_mss = MagicMock()
    mock_mss.mss = MagicMock(return_value=mock_sct)

    # pytesseract mock
    mock_tess = MagicMock()
    mock_tess.Output = MagicMock()
    mock_tess.Output.DICT = "dict"
    if ocr_data is None:
        ocr_data = {
            "text": ["Submit", "Cancel"],
            "conf": [90, 85],
            "left": [100, 200],
            "top": [50, 50],
            "width": [60, 60],
            "height": [20, 20],
        }
    mock_tess.image_to_data = MagicMock(return_value=ocr_data)

    # cv2 mock
    mock_cv2 = MagicMock()
    mock_np_result = MagicMock()
    mock_cv2.matchTemplate = MagicMock(return_value=mock_np_result)
    mock_cv2.minMaxLoc = MagicMock(return_value=(0.0, match_val, None, match_loc))
    mock_cv2.TM_CCOEFF_NORMED = 5
    mock_cv2.COLOR_RGB2GRAY = 6
    mock_cv2.cvtColor = MagicMock(return_value=MagicMock())
    mock_cv2.imread = MagicMock(return_value=MagicMock(shape=(30, 80)))
    mock_cv2.IMREAD_GRAYSCALE = 0

    # numpy mock
    mock_np = MagicMock()
    mock_np.array = MagicMock(return_value=MagicMock())

    # PIL mock
    mock_pil_image = MagicMock()
    mock_pil_image.frombytes = MagicMock(return_value=mock_image)
    mock_pil = MagicMock()
    mock_pil.Image = mock_pil_image

    # pyautogui mock
    mock_pyautogui = MagicMock()

    return {
        "mss": mock_mss,
        "pytesseract": mock_tess,
        "cv2": mock_cv2,
        "numpy": mock_np,
        "PIL": mock_pil,
        "pyautogui": mock_pyautogui,
        "_image": mock_image,
        "_sct": mock_sct,
    }


@pytest.mark.asyncio
async def test_report_capabilities():
    mocks = _patch_cv_deps(None)
    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        caps = await adapter.report_capabilities()

    assert caps["driver"] == "computer_vision"
    assert caps["requires_server"] is False
    assert caps["ocr"] is True
    assert caps["visual_matching"] is True


@pytest.mark.asyncio
async def test_screenshot_returns_bytes():
    import io
    mocks = _patch_cv_deps(None)
    fake_bytes = b"\x89PNG_FAKE"

    def fake_save(buf, format=None):
        buf.write(fake_bytes)

    mocks["_image"].save = fake_save

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        result = await adapter.screenshot()

    assert result.success is True
    assert result.screenshot_bytes == fake_bytes


@pytest.mark.asyncio
async def test_find_element_by_ocr_success():
    ocr_data = {
        "text": ["Submit", "Cancel"],
        "conf": [90, 85],
        "left": [100, 200],
        "top": [50, 50],
        "width": [60, 60],
        "height": [20, 20],
    }
    mocks = _patch_cv_deps(None, ocr_data=ocr_data)

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        candidates = [LocatorCandidate(strategy="ocr", value="Submit", confidence=0.9)]
        result = await adapter.find_element(candidates)

    assert result.success is True
    assert result.metadata["x"] == 130   # left(100) + width(60)//2
    assert result.metadata["y"] == 60    # top(50) + height(20)//2


@pytest.mark.asyncio
async def test_find_element_by_ocr_not_found():
    ocr_data = {
        "text": ["Cancel"],
        "conf": [85],
        "left": [200],
        "top": [50],
        "width": [60],
        "height": [20],
    }
    mocks = _patch_cv_deps(None, ocr_data=ocr_data)

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        candidates = [LocatorCandidate(strategy="ocr", value="Submit", confidence=0.9)]
        result = await adapter.find_element(candidates)

    assert result.success is False


@pytest.mark.asyncio
async def test_find_element_by_visual_match():
    mocks = _patch_cv_deps(None, match_val=0.92, match_loc=(50, 100))

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        candidates = [
            LocatorCandidate(strategy="visual", value="/path/to/btn.png", confidence=0.8)
        ]
        result = await adapter.find_element(candidates)

    assert result.success is True
    # center = match_loc(50,100) + template_size(80,30)//2 = (90, 115)
    assert result.metadata["x"] == 90
    assert result.metadata["y"] == 115


@pytest.mark.asyncio
async def test_find_element_visual_below_threshold():
    mocks = _patch_cv_deps(None, match_val=0.5)  # below 0.8 threshold

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        candidates = [
            LocatorCandidate(strategy="visual", value="/path/to/btn.png", confidence=0.8)
        ]
        result = await adapter.find_element(candidates)

    assert result.success is False


@pytest.mark.asyncio
async def test_click_by_ocr_calls_pyautogui():
    ocr_data = {
        "text": ["OK"],
        "conf": [95],
        "left": [300],
        "top": [200],
        "width": [40],
        "height": [20],
    }
    mocks = _patch_cv_deps(None, ocr_data=ocr_data)

    with patch.dict("sys.modules", mocks):
        from importlib import reload
        import app.execution.plugins.desktop.drivers.computer_vision as mod
        reload(mod)
        adapter = mod.ComputerVisionAdapter()
        candidates = [LocatorCandidate(strategy="ocr", value="OK", confidence=0.9)]
        result = await adapter.click(candidates)

    assert result.success is True
    mocks["pyautogui"].click.assert_called_once_with(320, 210)  # 300+20, 200+10
```

- [ ] **Step 2: Run tests — verify they fail**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_computer_vision_adapter.py -v
```
Expected: `ImportError` — `computer_vision` module does not exist yet.

- [ ] **Step 3: Write `drivers/computer_vision.py`**

Create `nexus-api/app/execution/plugins/desktop/drivers/computer_vision.py`:

```python
"""Computer-vision desktop adapter — screen capture + OCR + template matching."""
from __future__ import annotations

import asyncio
import io
import subprocess
import time
from typing import Any

from .base import DesktopDriver, DriverResult, LocatorCandidate

_TEMPLATE_MATCH_THRESHOLD = 0.8


class ComputerVisionAdapter(DesktopDriver):
    """Drives desktop apps using mss (capture), pytesseract (OCR), and opencv (visual)."""

    def __init__(self) -> None:
        self._process: subprocess.Popen | None = None

    # ── internal helpers (all synchronous, called via asyncio.to_thread) ───────

    def _grab_screen(self):
        import mss
        from PIL import Image
        with mss.mss() as sct:
            monitor = sct.monitors[0]
            shot = sct.grab(monitor)
            return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

    def _screenshot_bytes(self) -> bytes:
        img = self._grab_screen()
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    def _find_by_ocr(self, text: str) -> tuple[int, int] | None:
        import pytesseract
        img = self._grab_screen()
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        for i, word in enumerate(data["text"]):
            if text.lower() in str(word).lower() and int(data["conf"][i]) > 50:
                x = data["left"][i] + data["width"][i] // 2
                y = data["top"][i] + data["height"][i] // 2
                return (x, y)
        return None

    def _find_by_template(self, template_path: str) -> tuple[int, int] | None:
        import cv2
        import numpy as np
        img = self._grab_screen()
        screen_np = np.array(img.convert("RGB"))
        screen_gray = cv2.cvtColor(screen_np, cv2.COLOR_RGB2GRAY)
        template = cv2.imread(template_path, cv2.IMREAD_GRAYSCALE)
        if template is None:
            return None
        result = cv2.matchTemplate(screen_gray, template, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(result)
        if max_val >= _TEMPLATE_MATCH_THRESHOLD:
            h, w = template.shape
            return (max_loc[0] + w // 2, max_loc[1] + h // 2)
        return None

    def _locate(self, candidate: LocatorCandidate) -> tuple[int, int] | None:
        if candidate.strategy == "ocr":
            return self._find_by_ocr(candidate.value)
        if candidate.strategy == "visual":
            return self._find_by_template(candidate.value)
        return None

    # ── DesktopDriver interface ────────────────────────────────────────────────

    async def launch(
        self,
        app_path: str,
        args: list[str] | None = None,
        capabilities: dict[str, Any] | None = None,
    ) -> DriverResult:
        def _do():
            cmd = [app_path] + (args or [])
            self._process = subprocess.Popen(cmd)
            time.sleep(2.0)
            return self._process.pid

        try:
            pid = await asyncio.to_thread(_do)
            return DriverResult(success=True, metadata={"app": app_path, "pid": pid})
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def attach(
        self,
        window_title: str | None = None,
        process_name: str | None = None,
    ) -> DriverResult:
        return DriverResult(
            success=True,
            metadata={"window_title": window_title, "process_name": process_name},
        )

    async def close(self) -> DriverResult:
        def _do():
            if self._process:
                self._process.terminate()
                self._process = None

        try:
            await asyncio.to_thread(_do)
            return DriverResult(success=True)
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def find_element(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            for candidate in candidates:
                pos = self._locate(candidate)
                if pos:
                    return pos, candidate
            return None, None

        try:
            pos, candidate = await asyncio.to_thread(_do)
            if pos is None:
                return DriverResult(
                    success=False,
                    error="Element not found by OCR or template matching",
                )
            return DriverResult(
                success=True,
                metadata={
                    "x": pos[0],
                    "y": pos[1],
                    "strategy": candidate.strategy,
                    "value": candidate.value,
                },
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def click(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            import pyautogui
            for candidate in candidates:
                pos = self._locate(candidate)
                if pos:
                    pyautogui.click(pos[0], pos[1])
                    return pos, candidate
            return None, None

        try:
            pos, candidate = await asyncio.to_thread(_do)
            if pos is None:
                return DriverResult(success=False, error="Click failed: element not found")
            return DriverResult(
                success=True,
                metadata={"x": pos[0], "y": pos[1], "strategy": candidate.strategy},
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
            import pyautogui
            for candidate in candidates:
                pos = self._locate(candidate)
                if pos:
                    pyautogui.click(pos[0], pos[1])
                    pyautogui.typewrite(text, interval=0.05)
                    return pos, candidate
            return None, None

        try:
            pos, candidate = await asyncio.to_thread(_do)
            if pos is None:
                return DriverResult(
                    success=False, error="Type text failed: element not found"
                )
            return DriverResult(
                success=True,
                metadata={"strategy": candidate.strategy, "chars": len(text)},
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def get_text(
        self,
        candidates: list[LocatorCandidate],
        timeout: float = 10.0,
    ) -> DriverResult:
        def _do():
            import pytesseract
            img = self._grab_screen()
            for candidate in candidates:
                if candidate.strategy == "ocr":
                    data = pytesseract.image_to_data(
                        img, output_type=pytesseract.Output.DICT
                    )
                    words = [w for w in data["text"] if str(w).strip()]
                    return " ".join(words), candidate
            return None, None

        try:
            text, candidate = await asyncio.to_thread(_do)
            if text is None:
                return DriverResult(
                    success=False,
                    error="Get text requires an 'ocr' strategy candidate",
                )
            return DriverResult(
                success=True,
                value=text,
                metadata={"strategy": candidate.strategy},
            )
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def screenshot(self) -> DriverResult:
        try:
            data = await asyncio.to_thread(self._screenshot_bytes)
            return DriverResult(success=True, screenshot_bytes=data)
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def get_ui_tree(self) -> DriverResult:
        def _do():
            import pytesseract
            img = self._grab_screen()
            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
            parts = ["<OCRTree>"]
            for i, text in enumerate(data["text"]):
                if str(text).strip():
                    parts.append(
                        f'<text value="{text}" x="{data["left"][i]}" '
                        f'y="{data["top"][i]}" conf="{data["conf"][i]}" />'
                    )
            parts.append("</OCRTree>")
            return "\n".join(parts)

        try:
            tree = await asyncio.to_thread(_do)
            return DriverResult(success=True, ui_tree=tree)
        except Exception as exc:
            return DriverResult(success=False, error=str(exc))

    async def report_capabilities(self) -> dict[str, Any]:
        return {
            "driver": "computer_vision",
            "requires_server": False,
            "platform": "all",
            "ocr": True,
            "visual_matching": True,
        }
```

- [ ] **Step 4: Run tests — verify they pass**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_computer_vision_adapter.py -v
```
Expected: `8 passed`

- [ ] **Step 5: Commit**

```bash
git add nexus-api/app/execution/plugins/desktop/drivers/computer_vision.py \
        nexus-api/tests/execution/plugins/desktop/test_computer_vision_adapter.py
git commit -m "feat: add ComputerVisionAdapter using mss, pytesseract, and opencv"
```

---

## Task 6: `get_driver` Factory

**Files:**
- Modify: `nexus-api/app/execution/plugins/desktop/drivers/__init__.py`
- Test: `nexus-api/tests/execution/plugins/desktop/test_get_driver.py`

- [ ] **Step 1: Write the failing tests**

Create `nexus-api/tests/execution/plugins/desktop/test_get_driver.py`:

```python
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_get_driver_winappdriver():
    from app.execution.plugins.desktop.drivers import get_driver
    driver = await get_driver("winappdriver", {"server_url": "http://localhost:4723"})
    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    assert isinstance(driver, WinAppDriverAdapter)
    assert driver._server_url == "http://localhost:4723"


@pytest.mark.asyncio
async def test_get_driver_uia3():
    with patch.dict(sys.modules, {"pywinauto": MagicMock()}):
        from app.execution.plugins.desktop.drivers import get_driver
        from app.execution.plugins.desktop.drivers.uia3 import UIA3Adapter
        driver = await get_driver("uia3", {})
        assert isinstance(driver, UIA3Adapter)


@pytest.mark.asyncio
async def test_get_driver_computer_vision():
    from app.execution.plugins.desktop.drivers import get_driver
    from app.execution.plugins.desktop.drivers.computer_vision import ComputerVisionAdapter
    driver = await get_driver("computer_vision", {})
    assert isinstance(driver, ComputerVisionAdapter)


@pytest.mark.asyncio
async def test_get_driver_unknown_raises():
    from app.execution.plugins.desktop.drivers import get_driver
    with pytest.raises(ValueError, match="Unknown driver_type"):
        await get_driver("alien_driver", {})


@pytest.mark.asyncio
async def test_get_driver_auto_returns_winappdriver_when_server_reachable():
    import httpx
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(return_value=mock_resp)
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("httpx.AsyncClient", return_value=mock_client_instance):
        from importlib import reload
        import app.execution.plugins.desktop.drivers as mod
        reload(mod)
        driver = await mod.get_driver("auto", {"server_url": "http://localhost:4723"})

    from app.execution.plugins.desktop.drivers.winappdriver import WinAppDriverAdapter
    assert isinstance(driver, WinAppDriverAdapter)


@pytest.mark.asyncio
async def test_get_driver_auto_falls_to_uia3_when_no_server(monkeypatch):
    import httpx
    monkeypatch.setattr(sys, "platform", "win32")

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("httpx.AsyncClient", return_value=mock_client_instance):
        with patch.dict(sys.modules, {"pywinauto": MagicMock()}):
            from importlib import reload
            import app.execution.plugins.desktop.drivers as mod
            reload(mod)
            driver = await mod.get_driver("auto", {})

    from app.execution.plugins.desktop.drivers.uia3 import UIA3Adapter
    assert isinstance(driver, UIA3Adapter)


@pytest.mark.asyncio
async def test_get_driver_auto_falls_to_cv_when_no_server_and_not_win32(monkeypatch):
    import httpx
    monkeypatch.setattr(sys, "platform", "linux")

    mock_client_instance = AsyncMock()
    mock_client_instance.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("httpx.AsyncClient", return_value=mock_client_instance):
        from importlib import reload
        import app.execution.plugins.desktop.drivers as mod
        reload(mod)
        driver = await mod.get_driver("auto", {})

    from app.execution.plugins.desktop.drivers.computer_vision import ComputerVisionAdapter
    assert isinstance(driver, ComputerVisionAdapter)
```

- [ ] **Step 2: Run tests — verify they fail**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_get_driver.py -v
```
Expected: `ImportError: cannot import name 'get_driver'`

- [ ] **Step 3: Write `drivers/__init__.py`**

Replace `nexus-api/app/execution/plugins/desktop/drivers/__init__.py` with:

```python
"""Desktop driver factory — select and instantiate the right adapter."""
from __future__ import annotations

import os
import sys
from typing import Any

from .base import DesktopDriver, DriverResult, LocatorCandidate
from .winappdriver import WinAppDriverAdapter
from .uia3 import UIA3Adapter
from .computer_vision import ComputerVisionAdapter


async def get_driver(driver_type: str, config: dict[str, Any]) -> DesktopDriver:
    """Return the appropriate DesktopDriver for the given driver_type."""
    if driver_type == "winappdriver":
        return WinAppDriverAdapter(
            server_url=config.get("server_url"),
            timeout=float(config.get("timeout_seconds", 30)),
        )
    if driver_type == "uia3":
        return UIA3Adapter()
    if driver_type == "computer_vision":
        return ComputerVisionAdapter()
    if driver_type == "auto":
        return await _resolve_auto(config)
    raise ValueError(
        f"Unknown driver_type: {driver_type!r}. "
        "Valid values: winappdriver, uia3, computer_vision, auto"
    )


async def _resolve_auto(config: dict[str, Any]) -> DesktopDriver:
    """Try WinAppDriver → UIA3 → ComputerVision, return first available."""
    # 1. WinAppDriver: ping the server
    try:
        import httpx
        from app.config import settings
        server_url = (
            config.get("server_url")
            or os.getenv("WINAPPDRIVER_URL")
            or settings.winappdriver_url
        )
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{server_url}/status")
            if resp.status_code == 200:
                return WinAppDriverAdapter(
                    server_url=server_url,
                    timeout=float(config.get("timeout_seconds", 30)),
                )
    except Exception:
        pass

    # 2. UIA3: Windows + pywinauto available
    if sys.platform == "win32":
        try:
            import pywinauto  # noqa: F401
            return UIA3Adapter()
        except ImportError:
            pass

    # 3. Computer vision fallback
    return ComputerVisionAdapter()


__all__ = [
    "DesktopDriver",
    "DriverResult",
    "LocatorCandidate",
    "get_driver",
    "WinAppDriverAdapter",
    "UIA3Adapter",
    "ComputerVisionAdapter",
]
```

- [ ] **Step 4: Run tests — verify they pass**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_get_driver.py -v
```
Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add nexus-api/app/execution/plugins/desktop/drivers/__init__.py \
        nexus-api/tests/execution/plugins/desktop/test_get_driver.py
git commit -m "feat: add get_driver factory with auto-resolution (winappdriver→uia3→cv)"
```

---

## Task 7: Refactor `DesktopExecutionPlugin` to Use the Adapter

**Files:**
- Modify: `nexus-api/app/execution/plugins/desktop/plugin.py` (full rewrite)
- Test: `nexus-api/tests/execution/plugins/desktop/test_plugin_adapter.py`

The refactored plugin replaces `dict[str, WebDriverClient]` sessions with `dict[str, DesktopDriver]` drivers. Each node handler builds a `LocatorCandidate` list from config and delegates to the adapter. Existing node config shapes (`selector` + `strategy`) are preserved — backward compatible.

- [ ] **Step 1: Write the failing tests**

Create `nexus-api/tests/execution/plugins/desktop/test_plugin_adapter.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.execution.plugins.desktop.drivers.base import DriverResult, LocatorCandidate


def _make_envelope(node_type: str, config: dict, execution_id: str = "exec1"):
    envelope = MagicMock()
    envelope.node_type = node_type
    envelope.config = config
    envelope.execution_id = execution_id
    envelope.node_key = "node_1"
    envelope.log = AsyncMock()
    envelope.emit = AsyncMock()

    ctx = MagicMock()
    ctx.all = AsyncMock(return_value={})
    envelope.context = ctx

    artifacts = MagicMock()
    artifacts.record_bytes = AsyncMock(return_value=MagicMock(id="art1", size_bytes=512))
    artifacts.record_text = AsyncMock(return_value=MagicMock(id="art2", size_bytes=100))
    envelope.artifacts = artifacts

    return envelope


def _make_mock_driver(
    *,
    launch_result=None,
    click_result=None,
    type_result=None,
    text_result=None,
    screenshot_result=None,
    get_ui_tree_result=None,
):
    driver = MagicMock()
    driver.launch = AsyncMock(
        return_value=launch_result
        or DriverResult(success=True, metadata={"session_id": "s1", "app": "app.exe"})
    )
    driver.click = AsyncMock(
        return_value=click_result
        or DriverResult(success=True, metadata={"strategy": "accessibility_id"})
    )
    driver.type_text = AsyncMock(
        return_value=type_result
        or DriverResult(success=True, metadata={"chars": 5})
    )
    driver.get_text = AsyncMock(
        return_value=text_result
        or DriverResult(success=True, value="hello")
    )
    driver.screenshot = AsyncMock(
        return_value=screenshot_result
        or DriverResult(success=True, screenshot_bytes=b"PNG")
    )
    driver.get_ui_tree = AsyncMock(
        return_value=get_ui_tree_result
        or DriverResult(success=True, ui_tree="<UITree/>")
    )
    driver.close = AsyncMock(return_value=DriverResult(success=True))
    driver.report_capabilities = AsyncMock(return_value={"driver": "winappdriver"})
    return driver


@pytest.mark.asyncio
async def test_launch_creates_driver_and_calls_launch():
    mock_driver = _make_mock_driver()
    envelope = _make_envelope("desktop.launch", {"app": "notepad.exe"})

    with patch(
        "app.execution.plugins.desktop.plugin.get_driver",
        AsyncMock(return_value=mock_driver),
    ):
        from importlib import reload
        import app.execution.plugins.desktop.plugin as mod
        reload(mod)
        plugin = mod.DesktopExecutionPlugin()
        result = await plugin.execute(envelope)

    assert result.success is True
    mock_driver.launch.assert_called_once_with(
        "notepad.exe", args=None, capabilities={}
    )


@pytest.mark.asyncio
async def test_click_builds_locator_candidate_from_config():
    mock_driver = _make_mock_driver()
    envelope = _make_envelope(
        "desktop.click",
        {"selector": "btn_ok", "strategy": "accessibility_id"},
    )

    with patch(
        "app.execution.plugins.desktop.plugin.get_driver",
        AsyncMock(return_value=mock_driver),
    ):
        from importlib import reload
        import app.execution.plugins.desktop.plugin as mod
        reload(mod)
        plugin = mod.DesktopExecutionPlugin()
        plugin._drivers["exec1"] = mock_driver
        result = await plugin.execute(envelope)

    assert result.success is True
    mock_driver.click.assert_called_once()
    candidates = mock_driver.click.call_args[0][0]
    assert len(candidates) == 1
    assert candidates[0].strategy == "accessibility_id"
    assert candidates[0].value == "btn_ok"


@pytest.mark.asyncio
async def test_click_defaults_strategy_to_accessibility_id():
    mock_driver = _make_mock_driver()
    envelope = _make_envelope("desktop.click", {"selector": "btn_submit"})

    with patch(
        "app.execution.plugins.desktop.plugin.get_driver",
        AsyncMock(return_value=mock_driver),
    ):
        from importlib import reload
        import app.execution.plugins.desktop.plugin as mod
        reload(mod)
        plugin = mod.DesktopExecutionPlugin()
        plugin._drivers["exec1"] = mock_driver
        result = await plugin.execute(envelope)

    candidates = mock_driver.click.call_args[0][0]
    assert candidates[0].strategy == "accessibility_id"


@pytest.mark.asyncio
async def test_type_text_passes_value_to_adapter():
    mock_driver = _make_mock_driver()
    envelope = _make_envelope(
        "desktop.type_text",
        {"selector": "name_input", "strategy": "name", "value": "Alice"},
    )

    with patch(
        "app.execution.plugins.desktop.plugin.get_driver",
        AsyncMock(return_value=mock_driver),
    ):
        from importlib import reload
        import app.execution.plugins.desktop.plugin as mod
        reload(mod)
        plugin = mod.DesktopExecutionPlugin()
        plugin._drivers["exec1"] = mock_driver
        result = await plugin.execute(envelope)

    assert result.success is True
    mock_driver.type_text.assert_called_once()
    _, text, _ = mock_driver.type_text.call_args[0]
    assert text == "Alice"


@pytest.mark.asyncio
async def test_assert_text_passes_when_text_matches():
    mock_driver = _make_mock_driver(
        text_result=DriverResult(success=True, value="Invoice #42")
    )
    envelope = _make_envelope(
        "desktop.assert_text",
        {
            "selector": "inv_label",
            "strategy": "accessibility_id",
            "expected": "#42",
            "match": "contains",
        },
    )

    with patch(
        "app.execution.plugins.desktop.plugin.get_driver",
        AsyncMock(return_value=mock_driver),
    ):
        from importlib import reload
        import app.execution.plugins.desktop.plugin as mod
        reload(mod)
        plugin = mod.DesktopExecutionPlugin()
        plugin._drivers["exec1"] = mock_driver
        result = await plugin.execute(envelope)

    assert result.success is True


@pytest.mark.asyncio
async def test_assert_text_fails_when_text_does_not_match():
    mock_driver = _make_mock_driver(
        text_result=DriverResult(success=True, value="Something else")
    )
    envelope = _make_envelope(
        "desktop.assert_text",
        {
            "selector": "inv_label",
            "strategy": "accessibility_id",
            "expected": "Invoice #42",
            "match": "contains",
        },
    )

    with patch(
        "app.execution.plugins.desktop.plugin.get_driver",
        AsyncMock(return_value=mock_driver),
    ):
        from importlib import reload
        import app.execution.plugins.desktop.plugin as mod
        reload(mod)
        plugin = mod.DesktopExecutionPlugin()
        plugin._drivers["exec1"] = mock_driver
        result = await plugin.execute(envelope)

    assert result.success is False
    assert "expected" in result.error.lower() or "got" in result.error.lower()


@pytest.mark.asyncio
async def test_extract_text_stores_variable_in_output():
    mock_driver = _make_mock_driver(
        text_result=DriverResult(success=True, value="  ACME Corp  ")
    )
    envelope = _make_envelope(
        "desktop.extract_text",
        {
            "selector": "company_lbl",
            "strategy": "name",
            "variable": "company_name",
        },
    )

    with patch(
        "app.execution.plugins.desktop.plugin.get_driver",
        AsyncMock(return_value=mock_driver),
    ):
        from importlib import reload
        import app.execution.plugins.desktop.plugin as mod
        reload(mod)
        plugin = mod.DesktopExecutionPlugin()
        plugin._drivers["exec1"] = mock_driver
        result = await plugin.execute(envelope)

    assert result.success is True
    assert result.output["company_name"] == "ACME Corp"


@pytest.mark.asyncio
async def test_screenshot_records_artifact():
    mock_driver = _make_mock_driver(
        screenshot_result=DriverResult(success=True, screenshot_bytes=b"\x89PNG")
    )
    envelope = _make_envelope("desktop.screenshot", {"name": "step1.png"})

    with patch(
        "app.execution.plugins.desktop.plugin.get_driver",
        AsyncMock(return_value=mock_driver),
    ):
        from importlib import reload
        import app.execution.plugins.desktop.plugin as mod
        reload(mod)
        plugin = mod.DesktopExecutionPlugin()
        plugin._drivers["exec1"] = mock_driver
        result = await plugin.execute(envelope)

    assert result.success is True
    envelope.artifacts.record_bytes.assert_called_once()
    call_kwargs = envelope.artifacts.record_bytes.call_args
    assert call_kwargs[0][1] == "step1.png"
    assert call_kwargs[0][2] == b"\x89PNG"


@pytest.mark.asyncio
async def test_on_execution_end_closes_driver():
    mock_driver = _make_mock_driver()

    from importlib import reload
    import app.execution.plugins.desktop.plugin as mod
    reload(mod)
    plugin = mod.DesktopExecutionPlugin()
    plugin._drivers["exec1"] = mock_driver

    await plugin.on_execution_end("exec1")

    mock_driver.close.assert_called_once()
    assert "exec1" not in plugin._drivers


@pytest.mark.asyncio
async def test_validate_rejects_missing_app_on_launch():
    from importlib import reload
    import app.execution.plugins.desktop.plugin as mod
    reload(mod)
    from app.execution.plugin import PluginValidationError

    plugin = mod.DesktopExecutionPlugin()
    envelope = _make_envelope("desktop.launch", {})
    with pytest.raises(PluginValidationError, match="`app`"):
        await plugin.validate(envelope)


@pytest.mark.asyncio
async def test_validate_rejects_missing_selector_on_click():
    from importlib import reload
    import app.execution.plugins.desktop.plugin as mod
    reload(mod)
    from app.execution.plugin import PluginValidationError

    plugin = mod.DesktopExecutionPlugin()
    envelope = _make_envelope("desktop.click", {})
    with pytest.raises(PluginValidationError, match="`selector`"):
        await plugin.validate(envelope)


@pytest.mark.asyncio
async def test_driver_type_defaults_to_winappdriver():
    """desktop.launch with no driver_type creates a WinAppDriverAdapter."""
    mock_get_driver = AsyncMock(return_value=_make_mock_driver())
    envelope = _make_envelope("desktop.launch", {"app": "calc.exe"})

    with patch(
        "app.execution.plugins.desktop.plugin.get_driver", mock_get_driver
    ):
        from importlib import reload
        import app.execution.plugins.desktop.plugin as mod
        reload(mod)
        plugin = mod.DesktopExecutionPlugin()
        await plugin.execute(envelope)

    mock_get_driver.assert_called_once()
    call_args = mock_get_driver.call_args[0]
    assert call_args[0] == "winappdriver"
```

- [ ] **Step 2: Run tests — verify they fail**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_plugin_adapter.py -v
```
Expected: tests fail because `plugin.py` still uses `WebDriverClient` directly.

- [ ] **Step 3: Rewrite `plugin.py`**

Replace the full contents of `nexus-api/app/execution/plugins/desktop/plugin.py`:

```python
"""Desktop execution plugin — delegates to pluggable DesktopDriver adapters."""
from __future__ import annotations

import asyncio
import time
from typing import Any

from app.events.types import DesktopAction
from app.execution.artifacts import ArtifactKind
from app.execution.interpolation import VariableInterpolator
from app.execution.plugin import (
    ExecutionEnvelope,
    ExecutionPlugin,
    PluginNodeSpec,
    PluginResult,
    PluginValidationError,
)
from app.execution.plugins.desktop.drivers import get_driver
from app.execution.plugins.desktop.drivers.base import DesktopDriver, LocatorCandidate


class DesktopExecutionPlugin(ExecutionPlugin):
    name = "desktop"
    version = "2.0.0"
    description = "Pluggable Windows desktop execution (WinAppDriver / UIA3 / CV)"

    def __init__(self) -> None:
        super().__init__()
        self._drivers: dict[str, DesktopDriver] = {}
        self._lock = asyncio.Lock()

    # ── Node specs ─────────────────────────────────────────────────────────────

    def node_specs(self) -> list[PluginNodeSpec]:
        driver_type_field = {
            "driver_type": {
                "type": "string",
                "enum": ["winappdriver", "uia3", "computer_vision", "auto"],
                "default": "winappdriver",
            }
        }
        selector_fields = {
            "selector": {"type": "string", "required": True, "supports_template": True},
            "strategy": {
                "type": "string",
                "enum": [
                    "accessibility_id", "name", "xpath", "class_name",
                    # legacy values kept for backward compat
                    "accessibility id", "class name",
                ],
                "default": "accessibility_id",
            },
        }
        return [
            PluginNodeSpec(
                type="desktop.launch",
                plugin="desktop",
                label="Launch Desktop App",
                category="Desktop Automation",
                description="Start a desktop application session.",
                icon="monitor",
                color="#64748b",
                config_schema={
                    "app": {"type": "string", "required": True, "supports_template": True},
                    "app_args": {"type": "array", "items": {"type": "string"}},
                    "capabilities": {"type": "object"},
                    "timeout_seconds": {"type": "number", "default": 30},
                    **driver_type_field,
                },
            ),
            PluginNodeSpec(
                type="desktop.click",
                plugin="desktop",
                label="Click Desktop Element",
                category="Desktop Automation",
                description="Click a Windows UI element.",
                icon="mouse-pointer",
                color="#475569",
                config_schema=selector_fields,
            ),
            PluginNodeSpec(
                type="desktop.type_text",
                plugin="desktop",
                label="Type Desktop Text",
                category="Desktop Automation",
                description="Enter text into a Windows control.",
                icon="text-cursor-input",
                color="#334155",
                config_schema={
                    **selector_fields,
                    "value": {"type": "string", "required": True, "supports_template": True},
                },
            ),
            PluginNodeSpec(
                type="desktop.assert_text",
                plugin="desktop",
                label="Assert Desktop Text",
                category="Desktop Automation",
                description="Verify text from a Windows control.",
                icon="check-circle",
                color="#16a34a",
                config_schema={
                    **selector_fields,
                    "expected": {"type": "string", "required": True, "supports_template": True},
                    "match": {
                        "type": "string",
                        "enum": ["contains", "equals"],
                        "default": "contains",
                    },
                },
            ),
            PluginNodeSpec(
                type="desktop.extract_text",
                plugin="desktop",
                label="Extract Desktop Text",
                category="Desktop Automation",
                description="Read Windows control text into execution context.",
                icon="copy",
                color="#7c3aed",
                config_schema={
                    **selector_fields,
                    "variable": {"type": "string", "required": True},
                },
            ),
            PluginNodeSpec(
                type="desktop.screenshot",
                plugin="desktop",
                label="Desktop Screenshot",
                category="Desktop Automation",
                description="Capture a desktop session screenshot.",
                icon="camera",
                color="#0ea5e9",
                config_schema={"name": {"type": "string", "default": "desktop.png"}},
            ),
        ]

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def on_execution_end(self, execution_id: str) -> None:
        async with self._lock:
            driver = self._drivers.pop(execution_id, None)
        if driver:
            await driver.close()

    # ── Validation ─────────────────────────────────────────────────────────────

    async def validate(self, envelope: ExecutionEnvelope) -> None:
        cfg = envelope.config
        nt = envelope.node_type
        if nt == "desktop.launch" and cfg.get("app") in (None, ""):
            raise PluginValidationError("`app` is required")
        if nt in {"desktop.click", "desktop.type_text", "desktop.assert_text",
                  "desktop.extract_text"} and cfg.get("selector") in (None, ""):
            raise PluginValidationError("`selector` is required")
        if nt == "desktop.type_text" and cfg.get("value") in (None, ""):
            raise PluginValidationError("`value` is required")
        if nt == "desktop.assert_text" and cfg.get("expected") in (None, ""):
            raise PluginValidationError("`expected` is required")
        if nt == "desktop.extract_text" and cfg.get("variable") in (None, ""):
            raise PluginValidationError("`variable` is required")

    # ── Execution ──────────────────────────────────────────────────────────────

    async def execute(self, envelope: ExecutionEnvelope) -> PluginResult:
        ctx_vars = await envelope.context.all()
        cfg = VariableInterpolator.interpolate(envelope.config, ctx_vars)
        start = time.perf_counter()
        try:
            handler = {
                "desktop.launch": self._do_launch,
                "desktop.click": self._do_click,
                "desktop.type_text": self._do_type_text,
                "desktop.assert_text": self._do_assert_text,
                "desktop.extract_text": self._do_extract_text,
                "desktop.screenshot": self._do_screenshot,
            }.get(envelope.node_type)

            if handler is None:
                return PluginResult(
                    False, 0,
                    error=f"Unsupported desktop node type: {envelope.node_type}",
                )
            output = await handler(envelope, cfg)
            duration_ms = int((time.perf_counter() - start) * 1000)
            output.setdefault("duration_ms", duration_ms)
            await self._emit_action(
                envelope, envelope.node_type, duration_ms=duration_ms, metadata=output
            )
            return PluginResult(True, duration_ms, output=output)
        except asyncio.CancelledError:
            return PluginResult(False, 0, error="Cancelled")
        except Exception as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            await envelope.log("error", f"[{envelope.node_type}] {exc}", source="desktop")
            await self._capture_failure_evidence(envelope)
            return PluginResult(False, duration_ms, error=str(exc))

    # ── Driver session management ──────────────────────────────────────────────

    async def _get_driver(
        self, envelope: ExecutionEnvelope, cfg: dict[str, Any]
    ) -> DesktopDriver:
        async with self._lock:
            driver = self._drivers.get(envelope.execution_id)
            if driver is None:
                driver_type = str(cfg.get("driver_type") or "winappdriver")
                driver = await get_driver(driver_type, cfg)
                self._drivers[envelope.execution_id] = driver
            return driver

    async def _require_driver(
        self, envelope: ExecutionEnvelope, cfg: dict[str, Any]
    ) -> DesktopDriver:
        async with self._lock:
            driver = self._drivers.get(envelope.execution_id)
        if driver:
            return driver
        if cfg.get("app"):
            driver = await self._get_driver(envelope, cfg)
            await driver.launch(
                str(cfg["app"]),
                args=cfg.get("app_args"),
                capabilities=dict(cfg.get("capabilities") or {}),
            )
            return driver
        raise RuntimeError(
            "No desktop session. Add a desktop.launch node before this step."
        )

    # ── Helpers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _candidates(cfg: dict[str, Any]) -> list[LocatorCandidate]:
        strategy = str(cfg.get("strategy") or "accessibility_id")
        value = str(cfg["selector"])
        return [LocatorCandidate(strategy=strategy, value=value)]

    # ── Node handlers ──────────────────────────────────────────────────────────

    async def _do_launch(
        self, envelope: ExecutionEnvelope, cfg: dict[str, Any]
    ) -> dict[str, Any]:
        driver = await self._get_driver(envelope, cfg)
        result = await driver.launch(
            str(cfg["app"]),
            args=cfg.get("app_args"),
            capabilities=dict(cfg.get("capabilities") or {}),
        )
        if not result.success:
            raise RuntimeError(result.error or "launch failed")
        await envelope.log("success", "Desktop session started", source="desktop")
        return result.metadata

    async def _do_click(
        self, envelope: ExecutionEnvelope, cfg: dict[str, Any]
    ) -> dict[str, Any]:
        driver = await self._require_driver(envelope, cfg)
        result = await driver.click(self._candidates(cfg))
        if not result.success:
            raise RuntimeError(result.error or "click failed")
        return {"selector": cfg["selector"], **result.metadata}

    async def _do_type_text(
        self, envelope: ExecutionEnvelope, cfg: dict[str, Any]
    ) -> dict[str, Any]:
        driver = await self._require_driver(envelope, cfg)
        result = await driver.type_text(self._candidates(cfg), str(cfg["value"]))
        if not result.success:
            raise RuntimeError(result.error or "type_text failed")
        return {"selector": cfg["selector"], **result.metadata}

    async def _do_assert_text(
        self, envelope: ExecutionEnvelope, cfg: dict[str, Any]
    ) -> dict[str, Any]:
        driver = await self._require_driver(envelope, cfg)
        result = await driver.get_text(self._candidates(cfg))
        if not result.success:
            raise RuntimeError(result.error or "get_text failed")
        actual = str(result.value or "")
        expected = str(cfg["expected"])
        match = cfg.get("match", "contains")
        ok = actual == expected if match == "equals" else expected in actual
        if not ok:
            raise AssertionError(
                f"expected text {match} {expected!r}, got {actual!r}"
            )
        return {"selector": cfg["selector"], "actual": actual, "match": match}

    async def _do_extract_text(
        self, envelope: ExecutionEnvelope, cfg: dict[str, Any]
    ) -> dict[str, Any]:
        driver = await self._require_driver(envelope, cfg)
        result = await driver.get_text(self._candidates(cfg))
        if not result.success:
            raise RuntimeError(result.error or "get_text failed")
        variable = str(cfg["variable"])
        text = (result.value or "").strip()
        return {"selector": cfg["selector"], variable: text}

    async def _do_screenshot(
        self, envelope: ExecutionEnvelope, cfg: dict[str, Any]
    ) -> dict[str, Any]:
        driver = await self._require_driver(envelope, cfg)
        result = await driver.screenshot()
        if not result.success:
            raise RuntimeError(result.error or "screenshot failed")
        artifact = await envelope.artifacts.record_bytes(
            ArtifactKind.SCREENSHOT,
            str(cfg.get("name") or "desktop.png"),
            result.screenshot_bytes,
            content_type="image/png",
            metadata={"driver": "desktop"},
        )
        return {"screenshot_artifact_id": artifact.id, "size_bytes": artifact.size_bytes}

    # ── Events and evidence ────────────────────────────────────────────────────

    async def _emit_action(
        self,
        envelope: ExecutionEnvelope,
        action: str,
        *,
        duration_ms: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        await envelope.emit(DesktopAction(
            execution_id=envelope.execution_id,
            node_id=envelope.node_key,
            action=action.replace("desktop.", ""),
            selector=None,
            duration_ms=duration_ms,
            metadata=metadata or {},
        ))

    async def _capture_failure_evidence(self, envelope: ExecutionEnvelope) -> None:
        async with self._lock:
            driver = self._drivers.get(envelope.execution_id)
        if not driver:
            return
        try:
            r = await driver.screenshot()
            if r.success and r.screenshot_bytes:
                await envelope.artifacts.record_bytes(
                    ArtifactKind.SCREENSHOT,
                    "desktop-failure.png",
                    r.screenshot_bytes,
                    content_type="image/png",
                    metadata={"source": "failure"},
                )
        except Exception:
            pass
        try:
            r = await driver.get_ui_tree()
            if r.success and r.ui_tree:
                await envelope.artifacts.record_text(
                    ArtifactKind.TEXT,
                    "desktop-source.xml",
                    r.ui_tree,
                    content_type="application/xml",
                    metadata={"source": "failure"},
                )
        except Exception:
            pass
```

- [ ] **Step 4: Run tests — verify they pass**

```
cd nexus-api && pytest tests/execution/plugins/desktop/test_plugin_adapter.py -v
```
Expected: `12 passed`

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```
cd nexus-api && pytest tests/ -v
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add nexus-api/app/execution/plugins/desktop/plugin.py \
        nexus-api/tests/execution/plugins/desktop/test_plugin_adapter.py
git commit -m "feat: refactor DesktopExecutionPlugin to use pluggable DesktopDriver adapters"
```

---

## Final Verification

- [ ] Run the full test suite one more time

```
cd nexus-api && pytest tests/ -v --tb=short
```
Expected: all tasks' tests pass (approximately 50 tests total).

- [ ] Confirm the desktop plugin still self-registers cleanly

```
cd nexus-api && python -c "from app.execution.plugins.desktop import DesktopExecutionPlugin; p = DesktopExecutionPlugin(); print(p.name, p.version, len(p.node_specs()), 'nodes')"
```
Expected output: `desktop 2.0.0 6 nodes`

- [ ] Confirm `driver_type` is present in the launch node spec

```
cd nexus-api && python -c "
from app.execution.plugins.desktop import DesktopExecutionPlugin
p = DesktopExecutionPlugin()
launch_spec = next(s for s in p.node_specs() if s.type == 'desktop.launch')
print(launch_spec.config_schema.get('driver_type'))
"
```
Expected: `{'type': 'string', 'enum': ['winappdriver', 'uia3', 'computer_vision', 'auto'], 'default': 'winappdriver'}`

---

## Self-Review Notes

- All spec requirements from Phase 1 are covered: DesktopDriver interface ✓, WinAppDriver adapter ✓, UIA3 real adapter ✓, CV real adapter ✓, `driver_type` config ✓, `auto` resolution ✓, existing nodes backward-compatible ✓.
- No changes to `registry.py`, `engine.py`, `plugin.py` (base), or any API routes.
- Legacy strategy strings (`"accessibility id"`, `"class name"` with spaces) handled in WinAppDriver's `_STRATEGY_MAP` and preserved in node_specs enum.
- UIA3 and CV adapters use `asyncio.to_thread()` throughout — safe to call from async plugin context.
- pywinauto and CV deps are import-guarded at use-time, not at module load — plugin imports cleanly on non-Windows CI.
