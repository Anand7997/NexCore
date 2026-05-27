# Desktop Phase 1: Runtime Foundation — Design Spec

**Date:** 2026-05-27
**Scope:** Phase 1 of Desktop.md — pluggable DesktopDriver layer with real WinAppDriver, UIA3, and CV adapters.

---

## Problem

The current desktop plugin (`nexus-api/app/execution/plugins/desktop/plugin.py`) couples all desktop automation directly to WinAppDriver. There is no abstraction layer, so adding UIA3, computer-vision, or enterprise adapters requires forking the plugin. Phase 1 decouples the runtime from a single driver without changing any plugin registry, orchestration, or API boundaries.

---

## Approach

Strategy Pattern inside the existing desktop plugin folder. A `DesktopDriver` ABC with a `DriverResult` dataclass lives at `drivers/base.py`. Three concrete adapters implement it. The plugin selects the adapter at session-start based on a `driver_type` config field and delegates all node execution through the interface.

---

## File Structure

```
nexus-api/app/execution/plugins/desktop/
├── plugin.py                   ← refactored: selects adapter, delegates all calls
├── drivers/
│   ├── __init__.py             ← exports DesktopDriver, DriverResult, get_driver
│   ├── base.py                 ← DesktopDriver ABC + DriverResult + LocatorCandidate
│   ├── winappdriver.py         ← WebDriverClient logic extracted from old plugin.py
│   ├── uia3.py                 ← pywinauto-based real UIA3 adapter
│   └── computer_vision.py      ← mss + pytesseract + opencv real CV adapter
```

No other packages change.

---

## DesktopDriver Interface (`drivers/base.py`)

```python
class DriverResult:
    success: bool
    value: str | None          # text, property value, or None
    screenshot_b64: str | None # base64 PNG
    ui_tree: str | None        # XML UI tree
    error: str | None
    metadata: dict             # locator used, duration_ms, confidence, etc.

class LocatorCandidate:
    strategy: str   # "accessibility_id", "name", "xpath", "class_name", "ocr", "visual"
    value: str
    confidence: float  # 1.0 for deterministic, <1.0 for AI/OCR/visual

class DesktopDriver(ABC):
    async def launch(self, app_path: str, args: list[str], capabilities: dict) -> DriverResult
    async def attach(self, window_title: str | None, process_name: str | None) -> DriverResult
    async def close(self) -> DriverResult
    async def find_element(self, candidates: list[LocatorCandidate], timeout: float) -> DriverResult
    async def click(self, candidates: list[LocatorCandidate], timeout: float) -> DriverResult
    async def type_text(self, candidates: list[LocatorCandidate], text: str, timeout: float) -> DriverResult
    async def get_text(self, candidates: list[LocatorCandidate], timeout: float) -> DriverResult
    async def screenshot(self) -> DriverResult
    async def get_ui_tree(self) -> DriverResult
    async def report_capabilities(self) -> dict
```

---

## WinAppDriver Adapter (`drivers/winappdriver.py`)

Extracts the existing `WebDriverClient` code verbatim from the current `plugin.py`. No logic change — only moves into `DesktopDriver` method signatures. Locator strategies unchanged: `accessibility_id`, `name`, `xpath`, `class_name`. `report_capabilities` returns `{"driver": "winappdriver", "requires_server": True}`.

---

## UIA3 Adapter (`drivers/uia3.py`)

Uses `pywinauto` (backend `"uia"`). No WinAppDriver server required — direct Windows UI Automation API.

- `launch` → `pywinauto.Application(backend="uia").start(app_path)`
- `attach` → `Application().connect(title=window_title)` or `connect(process=pid)`
- `find_element` → tries candidates in order: automation id, name, class name, xpath-style path via `pywinauto` control tree
- `get_ui_tree` → walks `app.top_window().descendants()` and serializes to XML
- `report_capabilities` → `{"driver": "uia3", "requires_server": False, "platform": "windows"}`

---

## Computer Vision Adapter (`drivers/computer_vision.py`)

Uses `mss` for screen capture, `pytesseract` for OCR, `opencv-python-headless` for template matching.

- `launch` → `subprocess.Popen(app_path, args)`, waits for window via polling
- `screenshot` → `mss.mss().grab(monitor)` → PIL Image → base64 PNG
- `find_element` for `ocr` strategy → `pytesseract.image_to_data()` → find bounding box by text
- `find_element` for `visual` strategy → `cv2.matchTemplate()` against reference screenshot crop
- `click` → `pyautogui.click(x, y)` at found bounding box center
- `get_ui_tree` → returns OCR full-page text as pseudo-XML (best-effort, not real UIA tree)
- `report_capabilities` → `{"driver": "computer_vision", "requires_server": False, "ocr": True, "visual_matching": True}`

---

## Plugin Refactor (`plugin.py`)

### New config field

```python
driver_type: Literal["winappdriver", "uia3", "computer_vision", "auto"] = "winappdriver"
```

`"auto"` tries `winappdriver` → `uia3` → `computer_vision` in order, using the first that initializes without error.

### Session structure change

```python
# Before
session[execution_id] = {"driver": WebDriverClient, ...}

# After
session[execution_id] = {"driver": DesktopDriver, "driver_type": str, ...}
```

All six existing node handlers (`launch`, `click`, `type_text`, `assert_text`, `extract_text`, `screenshot`) are rewritten to build `LocatorCandidate` lists from node config and delegate to `self._get_driver(execution_id).<method>(candidates, ...)`.

The existing locator config shape (`locator_strategy` + `locator_value`) maps to a single `LocatorCandidate(strategy, value, confidence=1.0)`.

---

## New Dependencies

Added to `nexus-api/requirements.txt`:

```
pywinauto>=0.6.8          # UIA3 adapter
pytesseract>=0.3.13       # OCR in CV adapter
mss>=9.0.1                # Fast screen capture
opencv-python-headless>=4.9.0  # Template matching
Pillow>=10.0.0            # Image processing (likely already present)
pyautogui>=0.9.54         # Mouse/keyboard for CV adapter
```

All are Windows-compatible. `pywinauto`, `pyautogui`, and `mss` are Windows-only at runtime; the import is guarded with `sys.platform == "win32"` so the plugin loads on non-Windows CI without crashing.

---

## Auto Mode Resolution

```
driver_type == "auto":
  1. Try WinAppDriver: ping WINAPPDRIVER_URL/status → if 200, use winappdriver
  2. Try UIA3: import pywinauto; if win32 → use uia3
  3. Fall back to computer_vision
```

---

## Backward Compatibility

- All existing node configs (`desktop.launch`, `desktop.click`, etc.) continue to work unchanged.
- Default `driver_type` is `"winappdriver"` — no existing workflow breaks.
- `PluginNodeSpec` for the desktop plugin gains an optional `driver_type` enum field in the schema.

---

## Testing

- Unit tests for `LocatorCandidate` construction and ordering.
- Unit tests for `auto` mode resolution logic (mock availability checks).
- Contract tests: each adapter's `report_capabilities()` returns required keys.
- Integration tests against Notepad (UIA3 adapter) and Calculator (WinAppDriver adapter).
- CV adapter tests using stored screenshot fixtures (no live screen required).

---

## Out of Scope for Phase 1

- New `desktop.*` node types (Phase 2).
- Object repository and master-sheet (Phase 3).
- Smart identification / healing (Phase 4).
- Recorder / keyword view (Phase 5).
- Recovery scenarios (Phase 6).
- Enterprise extension packs (Phase 7).
