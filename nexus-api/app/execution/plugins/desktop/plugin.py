"""Pluggable desktop execution plugin."""
from __future__ import annotations

import asyncio
import fnmatch
import json
import os
import re
import shlex
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from app.config import settings
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
from app.execution.plugins.desktop.drivers import DesktopDriver, DriverResult, LocatorCandidate, get_driver
from app.execution.plugins.desktop.extension_packs import EXTENSION_PACKS, extension_pack_specs
from app.execution.plugins.desktop.perception import DesktopPerceptionService
from app.execution.plugins.desktop.recorder import _is_bad_window_title, _is_launchable_app
from app.execution.plugins.desktop.recovery import recovery_plan_for_error
from app.execution.plugins.desktop.smart_identification import locator_attempt_evidence, rank_locator_candidates, record_locator_success


def _normalise_strategy(value: str | None) -> str:
    strategy = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "": "accessibility_id",
        "accessibility": "accessibility_id",
        "accessibility_id": "accessibility_id",
        "automation_id": "accessibility_id",
        "id": "accessibility_id",
        "name": "name",
        "text": "name",
        "xpath": "xpath",
        "uia_path": "xpath",
        "path": "xpath",
        "class": "class_name",
        "class_name": "class_name",
        "ocr": "ocr",
        "visual": "visual",
    }
    return aliases.get(strategy, strategy)


def _coerce_args(value: Any) -> list[str] | None:
    if value in (None, ""):
        return None
    if isinstance(value, list):
        return [str(item) for item in value]
    return shlex.split(str(value))


def _coerce_keys(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    return [part.strip() for part in str(value or "").replace("+", ",").split(",") if part.strip()]


class DesktopExecutionPlugin(ExecutionPlugin):
    name = "desktop"
    version = "1.1.0"
    description = "Pluggable Windows desktop execution with WinAppDriver, UIA3, and computer-vision drivers"

    def __init__(self) -> None:
        super().__init__()
        self._sessions: dict[str, DesktopDriver] = {}
        self._lock = asyncio.Lock()
        self._perception = DesktopPerceptionService()

    def node_specs(self) -> list[PluginNodeSpec]:
        driver = {
            "driver_type": {
                "type": "string",
                "enum": ["winappdriver", "uia3", "computer_vision", "auto"],
                "default": "winappdriver",
            },
            "server_url": {"type": "string", "default": settings.winappdriver_url},
            "recovery_rules": {"type": "array"},
        }
        selector = {
            **driver,
            "selector": {"type": "string", "required": True, "supports_template": True},
            "strategy": {
                "type": "string",
                "enum": ["accessibility id", "automation id", "name", "xpath", "class name", "ocr", "visual"],
                "default": "accessibility id",
            },
            "locators": {"type": "array"},
            "x": {"type": "number", "supports_template": True},
            "y": {"type": "number", "supports_template": True},
            "coordinate_fallback": {"type": "boolean", "default": True},
            "min_confidence": {"type": "number", "default": 0.55},
            "review_confidence": {"type": "number", "default": 0.8},
            "timeout_ms": {"type": "number", "default": 15000},
            "window_title": {"type": "string", "supports_template": True},
            "process_name": {"type": "string", "supports_template": True},
            "window_required": {"type": "boolean", "default": True},
        }
        window_scope = {
            **driver,
            "window_title": {"type": "string", "supports_template": True},
            "process_name": {"type": "string", "supports_template": True},
            "timeout_ms": {"type": "number", "default": 15000},
        }
        return [
            PluginNodeSpec(
                type="desktop.launch",
                plugin="desktop",
                label="Launch Desktop App",
                category="Desktop Automation",
                description="Start a desktop automation session.",
                icon="monitor",
                color="#64748b",
                config_schema={
                    **driver,
                    "app": {"type": "string", "required": True, "supports_template": True},
                    "args": {"type": "array"},
                    "capabilities": {"type": "object"},
                    "timeout_ms": {"type": "number", "default": 30000},
                },
            ),
            PluginNodeSpec(
                type="desktop.attach",
                plugin="desktop",
                label="Attach Desktop App",
                category="Desktop Automation",
                description="Attach to an existing desktop window or process.",
                icon="monitor-up",
                color="#64748b",
                config_schema={
                    **driver,
                    "window_title": {"type": "string", "supports_template": True},
                    "process_name": {"type": "string", "supports_template": True},
                    "timeout_ms": {"type": "number", "default": 30000},
                },
            ),
            PluginNodeSpec(
                type="desktop.close",
                plugin="desktop",
                label="Close Desktop App",
                category="Desktop Automation",
                description="Close the active desktop automation session.",
                icon="x-circle",
                color="#64748b",
                config_schema=driver,
            ),
            PluginNodeSpec(
                type="desktop.restart",
                plugin="desktop",
                label="Restart Desktop App",
                category="Desktop Automation",
                description="Restart the current desktop application session.",
                icon="refresh-cw",
                color="#64748b",
                config_schema={
                    **driver,
                    "app": {"type": "string", "required": True, "supports_template": True},
                    "args": {"type": "array"},
                    "capabilities": {"type": "object"},
                    "timeout_ms": {"type": "number", "default": 30000},
                },
            ),
            PluginNodeSpec(
                type="desktop.activate_window",
                plugin="desktop",
                label="Activate Window",
                category="Desktop Automation",
                description="Bring a desktop window to the foreground.",
                icon="panel-top",
                color="#64748b",
                config_schema=window_scope,
            ),
            PluginNodeSpec(
                type="desktop.switch_window",
                plugin="desktop",
                label="Switch Window",
                category="Desktop Automation",
                description="Switch the active desktop automation context to another window.",
                icon="panels-top-left",
                color="#64748b",
                config_schema=window_scope,
            ),
            PluginNodeSpec(
                type="desktop.wait_app",
                plugin="desktop",
                label="Wait For App",
                category="Desktop Automation",
                description="Wait until a desktop app/process is available.",
                icon="timer",
                color="#64748b",
                config_schema=window_scope,
            ),
            PluginNodeSpec(
                type="desktop.wait_window",
                plugin="desktop",
                label="Wait For Window",
                category="Desktop Automation",
                description="Wait until a desktop window is available.",
                icon="timer",
                color="#64748b",
                config_schema={**window_scope, "window_title": {"type": "string", "required": True, "supports_template": True}},
            ),
            PluginNodeSpec(
                type="desktop.click",
                plugin="desktop",
                label="Click Desktop Element",
                category="Desktop Automation",
                description="Click a Windows desktop element.",
                icon="mouse-pointer",
                color="#475569",
                config_schema=selector,
            ),
            PluginNodeSpec(
                type="desktop.double_click",
                plugin="desktop",
                label="Double Click Desktop Element",
                category="Desktop Automation",
                description="Double-click a Windows desktop element.",
                icon="mouse-pointer-2",
                color="#475569",
                config_schema=selector,
            ),
            PluginNodeSpec(
                type="desktop.right_click",
                plugin="desktop",
                label="Right Click Desktop Element",
                category="Desktop Automation",
                description="Open a context menu on a Windows desktop element.",
                icon="panel-top-open",
                color="#475569",
                config_schema=selector,
            ),
            PluginNodeSpec(
                type="desktop.hover",
                plugin="desktop",
                label="Hover Desktop Element",
                category="Desktop Automation",
                description="Move the mouse over a Windows desktop element.",
                icon="mouse-pointer",
                color="#475569",
                config_schema=selector,
            ),
            PluginNodeSpec(
                type="desktop.type_text",
                plugin="desktop",
                label="Type Desktop Text",
                category="Desktop Automation",
                description="Enter text into a Windows control.",
                icon="text-cursor-input",
                color="#334155",
                config_schema={**selector, "value": {"type": "string", "required": True, "supports_template": True}},
            ),
            PluginNodeSpec(
                type="desktop.set_text",
                plugin="desktop",
                label="Set Desktop Text",
                category="Desktop Automation",
                description="Replace text in a Windows control.",
                icon="text-cursor-input",
                color="#334155",
                config_schema={**selector, "value": {"type": "string", "required": True, "supports_template": True}},
            ),
            PluginNodeSpec(
                type="desktop.clear",
                plugin="desktop",
                label="Clear Desktop Text",
                category="Desktop Automation",
                description="Clear text from a Windows input control.",
                icon="eraser",
                color="#334155",
                config_schema=selector,
            ),
            PluginNodeSpec(
                type="desktop.select",
                plugin="desktop",
                label="Select Desktop Value",
                category="Desktop Automation",
                description="Select a value in a Windows combo/list control.",
                icon="list-checks",
                color="#334155",
                config_schema={**selector, "value": {"type": "string", "required": True, "supports_template": True}},
            ),
            PluginNodeSpec(
                type="desktop.check",
                plugin="desktop",
                label="Check Desktop Control",
                category="Desktop Automation",
                description="Check a Windows checkbox/toggle control.",
                icon="check-square",
                color="#334155",
                config_schema=selector,
            ),
            PluginNodeSpec(
                type="desktop.uncheck",
                plugin="desktop",
                label="Uncheck Desktop Control",
                category="Desktop Automation",
                description="Uncheck a Windows checkbox/toggle control.",
                icon="square",
                color="#334155",
                config_schema=selector,
            ),
            PluginNodeSpec(
                type="desktop.press_key",
                plugin="desktop",
                label="Press Desktop Key",
                category="Desktop Automation",
                description="Press a keyboard key in the active desktop session.",
                icon="keyboard",
                color="#334155",
                config_schema={**driver, "key": {"type": "string", "required": True, "supports_template": True}},
            ),
            PluginNodeSpec(
                type="desktop.hotkey",
                plugin="desktop",
                label="Desktop Hotkey",
                category="Desktop Automation",
                description="Press a keyboard shortcut in the active desktop session.",
                icon="keyboard",
                color="#334155",
                config_schema={**driver, "keys": {"type": "array", "required": True}},
            ),
            PluginNodeSpec(
                type="desktop.key_sequence",
                plugin="desktop",
                label="Desktop Key Sequence",
                category="Desktop Automation",
                description="Press a sequence of keyboard keys.",
                icon="keyboard",
                color="#334155",
                config_schema={**driver, "keys": {"type": "array", "required": True}},
            ),
            PluginNodeSpec(
                type="desktop.scroll",
                plugin="desktop",
                label="Scroll Desktop",
                category="Desktop Automation",
                description="Scroll within a desktop window or control.",
                icon="mouse",
                color="#475569",
                config_schema={**selector, "selector": {"type": "string", "supports_template": True}, "delta": {"type": "number", "default": -5}},
            ),
            PluginNodeSpec(
                type="desktop.drag_and_drop",
                plugin="desktop",
                label="Drag And Drop",
                category="Desktop Automation",
                description="Drag one desktop control onto another.",
                icon="move",
                color="#475569",
                config_schema={
                    **driver,
                    "source_selector": {"type": "string", "required": True, "supports_template": True},
                    "source_strategy": {"type": "string", "default": "accessibility id"},
                    "target_selector": {"type": "string", "required": True, "supports_template": True},
                    "target_strategy": {"type": "string", "default": "accessibility id"},
                    "timeout_ms": {"type": "number", "default": 15000},
                },
            ),
            PluginNodeSpec(
                type="desktop.handle_modal",
                plugin="desktop",
                label="Handle Modal",
                category="Desktop Automation",
                description="Accept, dismiss, or click a button in a blocking desktop dialog.",
                icon="message-square-warning",
                color="#f59e0b",
                config_schema={
                    **driver,
                    "action": {"type": "string", "enum": ["accept", "dismiss", "ok", "yes", "no", "cancel"], "default": "accept"},
                    "button_text": {"type": "string", "supports_template": True},
                    "timeout_ms": {"type": "number", "default": 10000},
                },
            ),
            PluginNodeSpec(
                type="desktop.clipboard_set",
                plugin="desktop",
                label="Set Clipboard",
                category="Desktop Automation",
                description="Place text on the system clipboard.",
                icon="clipboard",
                color="#334155",
                config_schema={**driver, "value": {"type": "string", "required": True, "supports_template": True}},
            ),
            PluginNodeSpec(
                type="desktop.clipboard_get",
                plugin="desktop",
                label="Get Clipboard",
                category="Desktop Automation",
                description="Read text from the system clipboard into a variable.",
                icon="clipboard-paste",
                color="#7c3aed",
                config_schema={**driver, "variable": {"type": "string", "required": True}},
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
                    **selector,
                    "expected": {"type": "string", "required": True, "supports_template": True},
                    "match": {"type": "string", "enum": ["contains", "equals"], "default": "contains"},
                },
            ),
            PluginNodeSpec(
                type="desktop.assert_property",
                plugin="desktop",
                label="Assert Desktop Property",
                category="Desktop Automation",
                description="Verify a Windows control property.",
                icon="check-circle",
                color="#16a34a",
                config_schema={
                    **selector,
                    "property": {"type": "string", "default": "name", "supports_template": True},
                    "expected": {"type": "string", "required": True, "supports_template": True},
                    "match": {"type": "string", "enum": ["contains", "equals"], "default": "contains"},
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
                config_schema={**selector, "variable": {"type": "string", "required": True}},
            ),
            PluginNodeSpec(
                type="desktop.extract_property",
                plugin="desktop",
                label="Extract Desktop Property",
                category="Desktop Automation",
                description="Read a Windows control property into execution context.",
                icon="copy",
                color="#7c3aed",
                config_schema={**selector, "property": {"type": "string", "default": "name"}, "variable": {"type": "string", "required": True}},
            ),
            PluginNodeSpec(
                type="desktop.source_snapshot",
                plugin="desktop",
                label="Desktop Source Snapshot",
                category="Desktop Automation",
                description="Capture the current desktop UI tree/source as an artifact.",
                icon="file-code",
                color="#0ea5e9",
                config_schema={**driver, "name": {"type": "string", "default": "desktop-source.xml"}},
            ),
            PluginNodeSpec(
                type="desktop.perceive",
                plugin="desktop",
                label="AI Desktop Perception",
                category="Desktop Automation",
                description="Inspect UIA/source, OCR, and visual signals to produce locator candidates.",
                icon="scan-search",
                color="#0ea5e9",
                config_schema={
                    **driver,
                    "hint": {"type": "string", "supports_template": True},
                    "ocr_text": {"type": "string", "supports_template": True},
                    "visual_template": {"type": "string", "supports_template": True},
                    "include_screenshot": {"type": "boolean", "default": True},
                    "max_candidates": {"type": "number", "default": 20},
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
                config_schema={
                    **driver,
                    "name": {"type": "string", "default": "desktop.png"},
                    "crop_box": {"type": "object"},
                    "crop_x": {"type": "number"},
                    "crop_y": {"type": "number"},
                    "crop_width": {"type": "number"},
                    "crop_height": {"type": "number"},
                    "object_key": {"type": "string", "supports_template": True},
                },
            ),
            PluginNodeSpec(
                type="desktop.menu_action",
                plugin="desktop",
                label="Desktop Menu Action",
                category="Desktop Automation",
                description="Click a menu item by path (e.g. File | Open or File > Open).",
                icon="menu",
                color="#334155",
                config_schema={**driver, "menu_path": {"type": "string", "required": True, "supports_template": True}},
            ),
            PluginNodeSpec(
                type="desktop.ribbon_action",
                plugin="desktop",
                label="Desktop Ribbon Action",
                category="Desktop Automation",
                description="Click a ribbon button by tab, group, and button name.",
                icon="layout-panel-top",
                color="#334155",
                config_schema={
                    **driver,
                    "tab": {"type": "string", "required": True, "supports_template": True},
                    "group": {"type": "string", "supports_template": True},
                    "button": {"type": "string", "required": True, "supports_template": True},
                },
            ),
            PluginNodeSpec(
                type="desktop.table_cell_action",
                plugin="desktop",
                label="Desktop Table Cell Action",
                category="Desktop Automation",
                description="Click, read, type, or assert a DataGrid/ListView cell by row and column.",
                icon="table",
                color="#334155",
                config_schema={
                    **selector,
                    "row": {"type": "integer", "required": True},
                    "column": {"type": "string", "required": True, "supports_template": True},
                    "action": {
                        "type": "string",
                        "enum": ["click", "read", "type", "assert"],
                        "default": "click",
                    },
                    "value": {"type": "string", "supports_template": True},
                    "variable": {"type": "string"},
                },
            ),
            PluginNodeSpec(
                type="desktop.tree_action",
                plugin="desktop",
                label="Desktop Tree Action",
                category="Desktop Automation",
                description="Expand, collapse, select, or click a tree node by path.",
                icon="git-branch",
                color="#334155",
                config_schema={
                    **selector,
                    "node_path": {"type": "string", "required": True, "supports_template": True},
                    "action": {
                        "type": "string",
                        "enum": ["expand", "collapse", "select", "click", "assert_selected"],
                        "default": "select",
                    },
                },
            ),
            # ── Assertion / Checkpoint ────────────────────────────────────────
            PluginNodeSpec(
                type="desktop.assert_visual",
                plugin="desktop",
                label="Assert Visual",
                category="Desktop Automation",
                description="Compare the current desktop screenshot to a stored baseline image.",
                icon="image",
                color="#16a34a",
                config_schema={
                    **driver,
                    "baseline_path": {"type": "string", "supports_template": True},
                    "baseline_artifact_id": {"type": "string"},
                    "tolerance": {"type": "number", "default": 0.02},
                    "name": {"type": "string", "default": "visual-check.png"},
                },
            ),
            PluginNodeSpec(
                type="desktop.assert_image",
                plugin="desktop",
                label="Assert Desktop Image",
                category="Desktop Automation",
                description="Compare a desktop element area to an expected reference image.",
                icon="image",
                color="#16a34a",
                config_schema={
                    **selector,
                    "expected_path": {"type": "string", "supports_template": True},
                    "tolerance": {"type": "number", "default": 0.02},
                },
            ),
            PluginNodeSpec(
                type="desktop.assert_table",
                plugin="desktop",
                label="Assert Desktop Table",
                category="Desktop Automation",
                description="Verify data in a Windows DataGrid or ListView control.",
                icon="table-2",
                color="#16a34a",
                config_schema={
                    **selector,
                    "expected_rows": {"type": "array", "required": True},
                    "match_mode": {
                        "type": "string",
                        "enum": ["exact", "contains", "ordered_contains"],
                        "default": "contains",
                    },
                },
            ),
            PluginNodeSpec(
                type="desktop.assert_file",
                plugin="desktop",
                label="Assert File",
                category="Desktop Automation",
                description="Verify a file exists, is absent, or contains expected content.",
                icon="file-check",
                color="#16a34a",
                config_schema={
                    **driver,
                    "file_path": {"type": "string", "required": True, "supports_template": True},
                    "condition": {
                        "type": "string",
                        "enum": ["exists", "not_exists", "contains", "not_contains"],
                        "default": "exists",
                    },
                    "content": {"type": "string", "supports_template": True},
                    "encoding": {"type": "string", "default": "utf-8"},
                },
            ),
            PluginNodeSpec(
                type="desktop.assert_database",
                plugin="desktop",
                label="Assert Database",
                category="Desktop Automation",
                description="Verify a SELECT query result against an expected value (sqlite:// supported).",
                icon="database",
                color="#16a34a",
                config_schema={
                    **driver,
                    "connection_string": {"type": "string", "required": True, "supports_template": True},
                    "query": {"type": "string", "required": True, "supports_template": True},
                    "expected": {"type": "string", "required": True, "supports_template": True},
                    "match": {"type": "string", "enum": ["contains", "equals"], "default": "equals"},
                },
            ),
            PluginNodeSpec(
                type="desktop.assert_accessibility",
                plugin="desktop",
                label="Assert Accessibility",
                category="Desktop Automation",
                description="Check the desktop UI tree for missing accessible names and basic a11y violations.",
                icon="accessibility",
                color="#16a34a",
                config_schema={
                    **driver,
                    "rules_level": {
                        "type": "string",
                        "enum": ["info", "warning", "error"],
                        "default": "error",
                    },
                    "allow_list": {"type": "array"},
                },
            ),
            PluginNodeSpec(
                type="desktop.assert_window_state",
                plugin="desktop",
                label="Assert Window State",
                category="Desktop Automation",
                description="Assert the state or title of a desktop window.",
                icon="app-window",
                color="#16a34a",
                config_schema={
                    **driver,
                    "window_title": {"type": "string", "supports_template": True},
                    "state": {
                        "type": "string",
                        "enum": ["visible", "exists", "not_exists", "focused", "minimized", "maximized"],
                        "default": "visible",
                    },
                    "match": {"type": "string", "enum": ["contains", "equals"], "default": "contains"},
                    "timeout_ms": {"type": "number", "default": 10000},
                },
            ),
            # ── Data / Extraction ─────────────────────────────────────────────
            PluginNodeSpec(
                type="desktop.extract_table",
                plugin="desktop",
                label="Extract Desktop Table",
                category="Desktop Automation",
                description="Read Windows DataGrid/ListView rows into an execution context variable.",
                icon="copy",
                color="#7c3aed",
                config_schema={**selector, "variable": {"type": "string", "required": True}},
            ),
            PluginNodeSpec(
                type="desktop.output_value",
                plugin="desktop",
                label="Desktop Output Value",
                category="Desktop Automation",
                description="Store a value (supports template interpolation) to the execution context.",
                icon="save",
                color="#7c3aed",
                config_schema={
                    **driver,
                    "variable": {"type": "string", "required": True},
                    "value": {"type": "string", "required": True, "supports_template": True},
                },
            ),
            PluginNodeSpec(
                type="desktop.data_iteration",
                plugin="desktop",
                label="Desktop Data Iteration",
                category="Desktop Automation",
                description="Load a data row from an inline list or master-sheet section into context variables.",
                icon="repeat",
                color="#7c3aed",
                config_schema={
                    **driver,
                    "data_source": {"type": "array"},
                    "data_key": {"type": "string", "supports_template": True},
                    "row_index": {"type": "integer", "default": 0},
                    "variable_prefix": {"type": "string", "default": ""},
                },
            ),
            # ── System Dialog / Utility ───────────────────────────────────────
            PluginNodeSpec(
                type="desktop.file_dialog",
                plugin="desktop",
                label="Desktop File Dialog",
                category="Desktop Automation",
                description="Handle a Windows file open, save, or folder-picker dialog.",
                icon="folder-open",
                color="#0ea5e9",
                config_schema={
                    **driver,
                    "dialog_type": {
                        "type": "string",
                        "enum": ["open", "save", "folder"],
                        "default": "open",
                    },
                    "file_path": {"type": "string", "required": True, "supports_template": True},
                    "timeout_ms": {"type": "number", "default": 15000},
                },
            ),
            PluginNodeSpec(
                type="desktop.print_dialog",
                plugin="desktop",
                label="Desktop Print Dialog",
                category="Desktop Automation",
                description="Handle a Windows print dialog.",
                icon="printer",
                color="#0ea5e9",
                config_schema={
                    **driver,
                    "action": {
                        "type": "string",
                        "enum": ["print", "cancel", "preview"],
                        "default": "print",
                    },
                    "printer": {"type": "string", "supports_template": True},
                    "timeout_ms": {"type": "number", "default": 15000},
                },
            ),
            PluginNodeSpec(
                type="desktop.download_wait",
                plugin="desktop",
                label="Wait For Download",
                category="Desktop Automation",
                description="Wait for a file download to complete in a directory.",
                icon="download",
                color="#0ea5e9",
                config_schema={
                    **driver,
                    "download_dir": {"type": "string", "required": True, "supports_template": True},
                    "filename_pattern": {"type": "string", "default": "*"},
                    "timeout_ms": {"type": "number", "default": 60000},
                    "variable": {"type": "string"},
                },
            ),
            PluginNodeSpec(
                type="desktop.upload_file",
                plugin="desktop",
                label="Desktop Upload File",
                category="Desktop Automation",
                description="Click a file-upload trigger element and enter the file path in the resulting dialog.",
                icon="upload",
                color="#0ea5e9",
                config_schema={
                    **selector,
                    "file_path": {"type": "string", "required": True, "supports_template": True},
                    "timeout_ms": {"type": "number", "default": 15000},
                },
            ),
            *extension_pack_specs(selector),
        ]

    async def on_execution_end(self, execution_id: str) -> None:
        async with self._lock:
            driver = self._sessions.pop(execution_id, None)
        if driver:
            await driver.close()

    async def validate(self, envelope: ExecutionEnvelope) -> None:
        cfg = envelope.config
        nt = envelope.node_type
        if nt in {"desktop.launch", "desktop.restart"} and cfg.get("app") in (None, ""):
            raise PluginValidationError("`app` is required")
        if nt in {"desktop.launch", "desktop.restart"} and not _is_launchable_app(cfg.get("app")):
            window_title = str(cfg.get("window_title") or "").strip()
            process_name = str(cfg.get("process_name") or "").strip()
            can_attach = (window_title and not _is_bad_window_title(window_title)) or (
                process_name and not process_name.isdigit()
            )
            if not can_attach:
                raise PluginValidationError(
                    "`app` must be an executable path or launchable command, not an application display name"
                )
        if nt == "desktop.restart" and not _is_launchable_app(cfg.get("app")):
            raise PluginValidationError(
                "`app` must be an executable path or launchable command, not an application display name"
            )
        locator_nodes = {
            "desktop.click", "desktop.double_click", "desktop.right_click", "desktop.hover",
            "desktop.type_text", "desktop.clear", "desktop.select", "desktop.check", "desktop.uncheck",
            "desktop.assert_text", "desktop.assert_property", "desktop.extract_text", "desktop.extract_property",
            # new nodes that require a locator
            "desktop.set_text", "desktop.table_cell_action", "desktop.tree_action",
            "desktop.assert_table", "desktop.assert_image", "desktop.extract_table", "desktop.upload_file",
        }
        if nt in locator_nodes and not self._locator_candidates(cfg) and self._coordinate_pair(cfg) is None:
            raise PluginValidationError("`selector`, `automation_id`, `locators`, or `x`/`y` is required")
        if nt in {"desktop.type_text", "desktop.select", "desktop.set_text"} and cfg.get("value") in (None, ""):
            raise PluginValidationError("`value` is required")
        if nt == "desktop.clipboard_set" and cfg.get("value") in (None, ""):
            raise PluginValidationError("`value` is required")
        if nt in {"desktop.assert_text", "desktop.assert_property"} and cfg.get("expected") in (None, ""):
            raise PluginValidationError("`expected` is required")
        if nt in {"desktop.extract_text", "desktop.extract_property", "desktop.extract_table", "desktop.output_value", "desktop.clipboard_get"} and cfg.get("variable") in (None, ""):
            raise PluginValidationError("`variable` is required")
        if nt == "desktop.attach" and not (cfg.get("window_title") or cfg.get("process_name")):
            raise PluginValidationError("`window_title` or `process_name` is required")
        if nt == "desktop.wait_window" and cfg.get("window_title") in (None, ""):
            raise PluginValidationError("`window_title` is required")
        if nt == "desktop.drag_and_drop" and (cfg.get("source_selector") in (None, "") or cfg.get("target_selector") in (None, "")):
            raise PluginValidationError("`source_selector` and `target_selector` are required")
        if nt == "desktop.press_key" and cfg.get("key") in (None, ""):
            raise PluginValidationError("`key` is required")
        if nt == "desktop.hotkey" and not _coerce_keys(cfg.get("keys")):
            raise PluginValidationError("`keys` is required")
        if nt == "desktop.key_sequence" and not _coerce_keys(cfg.get("keys")):
            raise PluginValidationError("`keys` is required")
        if nt == "desktop.menu_action" and cfg.get("menu_path") in (None, ""):
            raise PluginValidationError("`menu_path` is required")
        if nt == "desktop.ribbon_action" and (cfg.get("tab") in (None, "") or cfg.get("button") in (None, "")):
            raise PluginValidationError("`tab` and `button` are required")
        if nt == "desktop.table_cell_action" and cfg.get("column") in (None, ""):
            raise PluginValidationError("`column` is required")
        if nt == "desktop.tree_action" and cfg.get("node_path") in (None, ""):
            raise PluginValidationError("`node_path` is required")
        if nt == "desktop.assert_table" and not isinstance(cfg.get("expected_rows"), list):
            raise PluginValidationError("`expected_rows` must be a list")
        if nt == "desktop.assert_file" and cfg.get("file_path") in (None, ""):
            raise PluginValidationError("`file_path` is required")
        if nt == "desktop.assert_database":
            for req_field in ("connection_string", "query", "expected"):
                if cfg.get(req_field) in (None, ""):
                    raise PluginValidationError(f"`{req_field}` is required")
        if nt == "desktop.output_value" and cfg.get("value") in (None, ""):
            raise PluginValidationError("`value` is required")
        if nt == "desktop.data_iteration" and not (cfg.get("data_source") or cfg.get("data_key")):
            raise PluginValidationError("`data_source` or `data_key` is required")
        if nt == "desktop.file_dialog" and cfg.get("file_path") in (None, ""):
            raise PluginValidationError("`file_path` is required")
        if nt == "desktop.download_wait" and cfg.get("download_dir") in (None, ""):
            raise PluginValidationError("`download_dir` is required")
        if nt == "desktop.upload_file" and cfg.get("file_path") in (None, ""):
            raise PluginValidationError("`file_path` is required")
        if nt in {pack.node_type for pack in EXTENSION_PACKS.values()} and cfg.get("action") in (None, ""):
            raise PluginValidationError("`action` is required")

    async def execute(self, envelope: ExecutionEnvelope) -> PluginResult:
        ctx_vars = await envelope.context.all()
        cfg = VariableInterpolator.interpolate(envelope.config, ctx_vars)
        start = time.perf_counter()
        handler = None
        try:
            handler = self._handlers().get(envelope.node_type)
            if handler is None:
                return PluginResult(False, 0, error=f"Unsupported desktop node type: {envelope.node_type}")
            output = await handler(self, envelope, cfg)
            duration_ms = int((time.perf_counter() - start) * 1000)
            output.setdefault("duration_ms", duration_ms)
            await self._emit_action(envelope, envelope.node_type, duration_ms=duration_ms, metadata=output)
            return PluginResult(True, duration_ms, output=output)
        except asyncio.CancelledError:
            return PluginResult(False, 0, error="Cancelled")
        except Exception as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            recovery_rules = await self._load_recovery_rules(envelope, cfg)
            recovery = recovery_plan_for_error(
                str(exc),
                recovery_rules,
                node_type=envelope.node_type,
                application=str(cfg.get("app") or cfg.get("application") or ""),
            )
            await envelope.log(
                "error",
                f"[{envelope.node_type}] {exc} (recovery: {recovery.category}, outcome: {recovery.failure_outcome})",
                source="desktop",
            )
            await self._capture_failure_evidence(envelope, str(exc), recovery=recovery.as_dict())
            recovery_output = await self._execute_recovery_plan(envelope, cfg, recovery.as_dict())

            # Execute fallback node chain if defined and recovery did not succeed
            if recovery.node_chain and not recovery_output.get("recovered"):
                chain_output = await self._execute_node_chain(envelope, cfg, recovery.node_chain)
                recovery_output["node_chain"] = chain_output
                if chain_output.get("recovered"):
                    recovery_output["recovered"] = True

            if (
                handler is not None
                and recovery.retryable
                and recovery_output.get("recovered")
                and not cfg.get("_recovery_retry")
            ):
                retry_cfg = dict(cfg)
                retry_cfg["_recovery_retry"] = True
                try:
                    retry_output = await handler(self, envelope, retry_cfg)
                    duration_ms = int((time.perf_counter() - start) * 1000)
                    retry_output.setdefault("duration_ms", duration_ms)
                    retry_output["recovery"] = recovery_output
                    await self._emit_action(envelope, envelope.node_type, duration_ms=duration_ms, metadata=retry_output)
                    return PluginResult(True, duration_ms, output=retry_output)
                except Exception as retry_exc:
                    duration_ms = int((time.perf_counter() - start) * 1000)
                    recovery_output["retry_error"] = str(retry_exc)
                    return PluginResult(False, duration_ms, output={"recovery": recovery_output}, error=str(retry_exc))

            # Apply failure_outcome: continue returns success with evidence, quarantine flags for review
            failure_outcome = recovery.failure_outcome
            if failure_outcome == "continue":
                await envelope.log("warning", f"[{envelope.node_type}] Recovery outcome=continue — step skipped", source="desktop")
                return PluginResult(
                    True,
                    duration_ms,
                    output={"recovery": recovery_output, "skipped": True, "failure_outcome": "continue"},
                )
            if failure_outcome == "quarantine":
                await envelope.log("warning", f"[{envelope.node_type}] Recovery outcome=quarantine — execution paused for review", source="desktop")
                await self._notify_ai_investigation(envelope, str(exc), recovery.as_dict())
                return PluginResult(
                    False,
                    duration_ms,
                    output={"recovery": recovery_output, "failure_outcome": "quarantine"},
                    error=f"QUARANTINED: {exc}",
                )

            # Default: fail — notify AI investigation pipeline
            await self._notify_ai_investigation(envelope, str(exc), recovery.as_dict())
            return PluginResult(False, duration_ms, output={"recovery": recovery_output}, error=str(exc))

    @staticmethod
    def _handlers() -> dict[str, Any]:
        return {
            "desktop.launch": DesktopExecutionPlugin._do_launch,
            "desktop.attach": DesktopExecutionPlugin._do_attach,
            "desktop.close": DesktopExecutionPlugin._do_close,
            "desktop.restart": DesktopExecutionPlugin._do_restart,
            "desktop.activate_window": DesktopExecutionPlugin._do_activate_window,
            "desktop.switch_window": DesktopExecutionPlugin._do_switch_window,
            "desktop.wait_app": DesktopExecutionPlugin._do_wait_app,
            "desktop.wait_window": DesktopExecutionPlugin._do_wait_window,
            "desktop.click": DesktopExecutionPlugin._do_click,
            "desktop.double_click": DesktopExecutionPlugin._do_double_click,
            "desktop.right_click": DesktopExecutionPlugin._do_right_click,
            "desktop.hover": DesktopExecutionPlugin._do_hover,
            "desktop.type_text": DesktopExecutionPlugin._do_type_text,
            "desktop.clear": DesktopExecutionPlugin._do_clear,
            "desktop.select": DesktopExecutionPlugin._do_select,
            "desktop.check": DesktopExecutionPlugin._do_check,
            "desktop.uncheck": DesktopExecutionPlugin._do_uncheck,
            "desktop.press_key": DesktopExecutionPlugin._do_press_key,
            "desktop.hotkey": DesktopExecutionPlugin._do_hotkey,
            "desktop.scroll": DesktopExecutionPlugin._do_scroll,
            "desktop.drag_and_drop": DesktopExecutionPlugin._do_drag_and_drop,
            "desktop.handle_modal": DesktopExecutionPlugin._do_handle_modal,
            "desktop.clipboard_set": DesktopExecutionPlugin._do_clipboard_set,
            "desktop.clipboard_get": DesktopExecutionPlugin._do_clipboard_get,
            "desktop.assert_text": DesktopExecutionPlugin._do_assert_text,
            "desktop.assert_property": DesktopExecutionPlugin._do_assert_property,
            "desktop.extract_text": DesktopExecutionPlugin._do_extract_text,
            "desktop.extract_property": DesktopExecutionPlugin._do_extract_property,
            "desktop.screenshot": DesktopExecutionPlugin._do_screenshot,
            "desktop.source_snapshot": DesktopExecutionPlugin._do_source_snapshot,
            "desktop.perceive": DesktopExecutionPlugin._do_perceive,
            # ── new nodes ──
            "desktop.set_text": DesktopExecutionPlugin._do_set_text,
            "desktop.key_sequence": DesktopExecutionPlugin._do_key_sequence,
            "desktop.menu_action": DesktopExecutionPlugin._do_menu_action,
            "desktop.ribbon_action": DesktopExecutionPlugin._do_ribbon_action,
            "desktop.table_cell_action": DesktopExecutionPlugin._do_table_cell_action,
            "desktop.tree_action": DesktopExecutionPlugin._do_tree_action,
            "desktop.assert_visual": DesktopExecutionPlugin._do_assert_visual,
            "desktop.assert_image": DesktopExecutionPlugin._do_assert_image,
            "desktop.assert_table": DesktopExecutionPlugin._do_assert_table,
            "desktop.assert_file": DesktopExecutionPlugin._do_assert_file,
            "desktop.assert_database": DesktopExecutionPlugin._do_assert_database,
            "desktop.assert_accessibility": DesktopExecutionPlugin._do_assert_accessibility,
            "desktop.assert_window_state": DesktopExecutionPlugin._do_assert_window_state,
            "desktop.extract_table": DesktopExecutionPlugin._do_extract_table,
            "desktop.output_value": DesktopExecutionPlugin._do_output_value,
            "desktop.data_iteration": DesktopExecutionPlugin._do_data_iteration,
            "desktop.file_dialog": DesktopExecutionPlugin._do_file_dialog,
            "desktop.print_dialog": DesktopExecutionPlugin._do_print_dialog,
            "desktop.download_wait": DesktopExecutionPlugin._do_download_wait,
            "desktop.upload_file": DesktopExecutionPlugin._do_upload_file,
            **{pack.node_type: DesktopExecutionPlugin._do_extension_pack_action for pack in EXTENSION_PACKS.values()},
        }

    def _create_driver(self, cfg: dict[str, Any]) -> DesktopDriver:
        timeout = float(cfg.get("timeout_seconds") or 0)
        if timeout <= 0:
            timeout = float(cfg.get("timeout_ms") or 30000) / 1000
        return get_driver(
            str(cfg.get("driver_type") or "winappdriver"),
            server_url=str(cfg.get("server_url") or os.getenv("WINAPPDRIVER_URL") or settings.winappdriver_url),
            timeout=timeout,
        )

    async def _session(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> DesktopDriver:
        async with self._lock:
            existing = self._sessions.get(envelope.execution_id)
            if existing:
                return existing

            driver = self._create_driver(cfg)
            window_title = str(cfg.get("window_title") or "").strip()
            if _is_bad_window_title(window_title):
                window_title = ""
            process_name = str(cfg.get("process_name") or "").strip()
            stable_process_name = "" if process_name.isdigit() else process_name
            if cfg.get("attach_if_running", True) and (window_title or stable_process_name):
                attach_result = await driver.attach(
                    window_title=window_title or None,
                    process_name=stable_process_name or None,
                )
                if attach_result.success:
                    self._sessions[envelope.execution_id] = driver
                    await envelope.log("success", "Attached to running desktop session", source="desktop")
                    return driver
            if not _is_launchable_app(cfg.get("app")):
                self._raise_if_failed(
                    "attach",
                    DriverResult(
                        success=False,
                        error=(
                            "Could not attach to a running desktop session. "
                            "`app` is an application display name, so launch was skipped; "
                            "provide a real application_path or a valid window_title/process_name."
                        ),
                    ),
                )
            result = await driver.launch(
                str(cfg["app"]),
                args=_coerce_args(cfg.get("args") or cfg.get("appArguments")),
                capabilities=dict(cfg.get("capabilities") or {}),
            )
            if not result.success and (window_title or stable_process_name):
                attach_result = await self._wait_for_scoped_attach(
                    driver,
                    window_title=window_title or None,
                    process_name=stable_process_name or None,
                    timeout=min(max(self._timeout(cfg, 30000), 3.0), 30.0),
                )
                if attach_result.success:
                    self._sessions[envelope.execution_id] = driver
                    await envelope.log("success", "Attached to desktop session after launch", source="desktop")
                    return driver
                if attach_result.error:
                    result.error = f"{result.error}; attach after launch failed: {attach_result.error}"
            self._raise_if_failed("launch", result)
            self._sessions[envelope.execution_id] = driver
            await envelope.log("success", "Desktop session started", source="desktop")
            return driver

    async def _wait_for_scoped_attach(
        self,
        driver: DesktopDriver,
        *,
        window_title: str | None = None,
        process_name: str | None = None,
        timeout: float = 10.0,
    ) -> DriverResult:
        deadline = time.monotonic() + max(0.5, timeout)
        last_result = DriverResult(success=False, error="Window not found")
        while time.monotonic() <= deadline:
            last_result = await driver.attach(window_title=window_title, process_name=process_name)
            if last_result.success:
                return last_result
            await asyncio.sleep(0.5)
        return last_result

    async def _require_session(self, envelope: ExecutionEnvelope, cfg: dict[str, Any], *, apply_scope: bool = True) -> DesktopDriver:
        async with self._lock:
            driver = self._sessions.get(envelope.execution_id)
        if driver:
            if apply_scope:
                await self._apply_window_scope(driver, cfg)
            return driver
        if cfg.get("app"):
            driver = await self._session(envelope, cfg)
            if apply_scope:
                await self._apply_window_scope(driver, cfg)
            return driver
        raise RuntimeError("No desktop session exists. Add a desktop.launch node or provide `app` on this node.")

    async def _apply_window_scope(self, driver: DesktopDriver, cfg: dict[str, Any]) -> None:
        """Switch to the requested window/process before scoped desktop actions."""
        window_title = str(cfg.get("window_title") or "").strip()
        process_name = str(cfg.get("process_name") or "").strip()
        if not window_title and not process_name:
            return
        result = await driver.switch_window(
            window_title=window_title or None,
            process_name=process_name or None,
        )
        if not result.success and cfg.get("window_required", True):
            target = window_title or process_name
            raise RuntimeError(result.error or f"Window scope not found: {target}")

    def _locator_candidates(self, cfg: dict[str, Any]) -> list[LocatorCandidate]:
        candidates: list[LocatorCandidate] = []
        seen: set[tuple[str, str]] = set()

        def add(strategy: Any, value: Any, confidence: Any = 1.0) -> None:
            locator = str(value or "").strip()
            if not locator:
                return
            normalized = _normalise_strategy(str(strategy or ""))
            key = (normalized, locator)
            if key in seen:
                return
            seen.add(key)
            try:
                score = float(confidence)
            except (TypeError, ValueError):
                score = 1.0
            candidates.append(LocatorCandidate(strategy=normalized, value=locator, confidence=score))

        add(cfg.get("strategy", "accessibility id"), cfg.get("selector"))
        add("accessibility id", cfg.get("automation_id"))
        add("xpath", cfg.get("uia_path") or cfg.get("xpath"))
        add("name", cfg.get("name") or cfg.get("object_name"))
        add("class name", cfg.get("class_name"))
        for item in cfg.get("locators") or cfg.get("alternative_locators") or []:
            if isinstance(item, dict):
                add(
                    item.get("strategy"),
                    item.get("locator") or item.get("selector") or item.get("value"),
                    item.get("confidence") or item.get("score") or 1.0,
                )
            else:
                add("", item)
        for item in cfg.get("perception_candidates") or cfg.get("ai_candidates") or []:
            if isinstance(item, dict):
                add(
                    item.get("strategy"),
                    item.get("locator") or item.get("selector") or item.get("value"),
                    item.get("confidence") or item.get("score") or 0.7,
                )
        return rank_locator_candidates(
            candidates,
            min_confidence=float(cfg.get("min_confidence") or 0.55),
            review_confidence=float(cfg.get("review_confidence") or 0.8),
            object_key=str(cfg.get("object_key") or ""),
            anchor_automation_id=str(cfg.get("anchor_automation_id") or ""),
            anchor_name=str(cfg.get("anchor_name") or ""),
        )

    @staticmethod
    def _coordinate_pair(cfg: dict[str, Any]) -> tuple[float, float] | None:
        x = cfg.get("x")
        y = cfg.get("y")
        if x in (None, "") or y in (None, ""):
            return None
        try:
            return float(x), float(y)
        except (TypeError, ValueError):
            return None

    async def _coordinate_action(
        self,
        driver: DesktopDriver,
        cfg: dict[str, Any],
        method_name: str,
        *,
        button: str = "left",
    ) -> DriverResult | None:
        if cfg.get("coordinate_fallback") is False:
            return None
        coords = self._coordinate_pair(cfg)
        if coords is None:
            return None
        x, y = coords
        if method_name == "click_coordinates":
            return await driver.click_coordinates(x, y, button=button)
        method = getattr(driver, method_name)
        return await method(x, y)

    async def _locator_or_coordinate_action(
        self,
        envelope: ExecutionEnvelope,
        cfg: dict[str, Any],
        action: str,
        locator_method_name: str,
        coordinate_method_name: str,
        *,
        button: str = "left",
    ) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        result: DriverResult | None = None
        if candidates:
            method = getattr(driver, locator_method_name)
            result = await method(candidates, timeout=self._timeout(cfg))
            if result.success:
                return self._locator_payload(cfg, candidates, result)
        coordinate_result = await self._coordinate_action(driver, cfg, coordinate_method_name, button=button)
        if coordinate_result is not None:
            if not coordinate_result.success and result is not None and result.error:
                coordinate_result.error = f"{result.error}; coordinate fallback failed: {coordinate_result.error}"
            self._raise_if_failed(action, coordinate_result)
            return self._locator_payload(cfg, candidates, coordinate_result, coordinate_fallback=True)
        if result is not None:
            self._raise_if_failed(action, result)
        self._raise_if_failed(action, DriverResult(success=False, error=f"No locator or coordinate target configured for {action}"))
        return {}

    def _prefixed_locator_candidates(self, cfg: dict[str, Any], prefix: str) -> list[LocatorCandidate]:
        nested = {
            "selector": cfg.get(f"{prefix}_selector") or cfg.get(prefix),
            "strategy": cfg.get(f"{prefix}_strategy") or cfg.get("strategy") or "accessibility id",
            "automation_id": cfg.get(f"{prefix}_automation_id"),
            "uia_path": cfg.get(f"{prefix}_uia_path"),
            "xpath": cfg.get(f"{prefix}_xpath"),
            "name": cfg.get(f"{prefix}_name"),
            "object_name": cfg.get(f"{prefix}_object_name"),
            "class_name": cfg.get(f"{prefix}_class_name"),
            "locators": cfg.get(f"{prefix}_locators") or [],
            "min_confidence": cfg.get("min_confidence") or 0.55,
            "review_confidence": cfg.get("review_confidence") or 0.8,
        }
        return self._locator_candidates(nested)

    def _locator_attempts(self, cfg: dict[str, Any], candidates: list[LocatorCandidate]) -> list[dict[str, object]]:
        return locator_attempt_evidence(
            candidates,
            min_confidence=float(cfg.get("min_confidence") or 0.55),
            review_confidence=float(cfg.get("review_confidence") or 0.8),
            object_key=str(cfg.get("object_key") or ""),
            anchor_automation_id=str(cfg.get("anchor_automation_id") or ""),
            anchor_name=str(cfg.get("anchor_name") or ""),
        )

    def _successful_locator(
        self,
        candidates: list[LocatorCandidate],
        result: DriverResult,
    ) -> dict[str, object] | None:
        metadata = result.metadata or {}
        strategy = _normalise_strategy(str(metadata.get("strategy") or metadata.get("locator_strategy") or ""))
        value = str(metadata.get("value") or metadata.get("locator") or metadata.get("selector") or "").strip()
        matched: LocatorCandidate | None = None
        matched_rank = 0

        for index, candidate in enumerate(candidates, start=1):
            if strategy and candidate.strategy != strategy:
                continue
            if value and candidate.value != value:
                continue
            matched = candidate
            matched_rank = index
            break

        if matched is None and strategy:
            for index, candidate in enumerate(candidates, start=1):
                if candidate.strategy == strategy:
                    matched = candidate
                    matched_rank = index
                    value = candidate.value
                    break

        if matched is None or not value:
            return None

        healed = matched_rank > 1 or matched.strategy in {"ocr", "visual"}
        return {
            "strategy": matched.strategy,
            "locator": value,
            "confidence": matched.confidence,
            "rank": matched_rank,
            "success": True,
            "healed": healed,
        }

    def _locator_payload(
        self,
        cfg: dict[str, Any],
        candidates: list[LocatorCandidate],
        result: DriverResult,
        **extra: Any,
    ) -> dict[str, Any]:
        attempts = self._locator_attempts(cfg, candidates)
        successful = self._successful_locator(candidates, result)
        if successful:
            success_key = (successful["strategy"], successful["locator"])
            for attempt in attempts:
                attempt_key = (_normalise_strategy(str(attempt.get("strategy") or "")), str(attempt.get("value") or ""))
                if attempt_key == success_key:
                    attempt["success"] = True
                    attempt["healed"] = bool(successful.get("healed"))
            # Persist success in in-process registry for historical scoring
            object_key = str(cfg.get("object_key") or "")
            if object_key:
                record_locator_success(
                    object_key,
                    str(successful["strategy"]),
                    str(successful["locator"]),
                    succeeded=True,
                )

        payload: dict[str, Any] = {
            "selector": cfg.get("selector"),
            "locator_attempts": attempts,
            **extra,
            **(result.metadata or {}),
        }
        if successful:
            payload["successful_locator"] = successful
            if successful.get("healed"):
                payload["healing_suggestion_candidate"] = {
                    "successful_strategy": successful["strategy"],
                    "successful_locator": successful["locator"],
                    "confidence": successful["confidence"],
                    "locator_attempts": attempts,
                    "reason": "Successful fallback locator used during desktop smart identification",
                }
        return payload

    @staticmethod
    def _raise_if_failed(action: str, result: DriverResult) -> None:
        if not result.success:
            raise RuntimeError(result.error or f"Desktop {action} failed")

    @staticmethod
    def _timeout(cfg: dict[str, Any], default_ms: int = 15000) -> float:
        return float(cfg.get("timeout_ms", default_ms)) / 1000

    async def _load_recovery_rules(
        self,
        envelope: ExecutionEnvelope,
        cfg: dict[str, Any],
    ) -> list[dict[str, Any]] | None:
        rules: list[dict[str, Any]] = []
        if isinstance(cfg.get("recovery_rules"), list):
            rules.extend([rule for rule in cfg["recovery_rules"] if isinstance(rule, dict)])

        application = str(cfg.get("app") or cfg.get("application") or "")
        try:
            from sqlalchemy import or_, select

            from app.database.models import DesktopRecoveryRuleModel
            from app.database.session import AsyncSessionLocal

            async with AsyncSessionLocal() as db:
                stmt = (
                    select(DesktopRecoveryRuleModel)
                    .where(DesktopRecoveryRuleModel.enabled.is_(True))
                    .where(or_(DesktopRecoveryRuleModel.node_type == "", DesktopRecoveryRuleModel.node_type == envelope.node_type))
                )
                if application:
                    stmt = stmt.where(or_(DesktopRecoveryRuleModel.application == "", DesktopRecoveryRuleModel.application == application))
                else:
                    stmt = stmt.where(DesktopRecoveryRuleModel.application == "")
                result = await db.execute(stmt)
                for row in result.scalars().all():
                    rules.append({
                        "category": row.category,
                        "application": row.application or "",
                        "node_type": row.node_type or "",
                        "retryable": bool(row.retryable),
                        "failure_outcome": row.failure_outcome or "fail",
                        "actions": list(row.actions or []),
                        "node_chain": list(row.node_chain or []),
                        "reason": row.reason or "",
                    })
        except Exception as exc:
            await envelope.log(
                "warning",
                f"Desktop recovery rules could not be loaded from DB: {exc}",
                source="desktop",
            )

        return rules or None

    async def _execute_recovery_plan(
        self,
        envelope: ExecutionEnvelope,
        cfg: dict[str, Any],
        recovery: dict[str, Any],
    ) -> dict[str, Any]:
        if cfg.get("enable_recovery") is False:
            return {"enabled": False, "recovered": False, "plan": recovery, "actions": []}

        async with self._lock:
            driver = self._sessions.get(envelope.execution_id)

        action_results: list[dict[str, Any]] = []
        recovered = False
        for action in recovery.get("actions") or []:
            if not isinstance(action, dict):
                continue
            action_type = str(action.get("type") or "")
            result_payload: dict[str, Any] = {"type": action_type, "success": True}
            try:
                if action_type == "capture_evidence":
                    result_payload["captured"] = True
                elif action_type in {"retry_with_ranked_locators", "retry_step", "suggest_repository_update"}:
                    result_payload["deferred"] = True
                    recovered = recovered or action_type.startswith("retry")
                elif action_type == "wait_window":
                    if driver is None:
                        raise RuntimeError("No desktop session available for wait_window recovery")
                    title = str(action.get("window_title") or cfg.get("window_title") or cfg.get("window") or "")
                    if not title:
                        raise RuntimeError("wait_window recovery requires a window_title")
                    result = await driver.wait_window(title, timeout=float(action.get("timeout_seconds") or 5))
                    self._raise_if_failed("recovery.wait_window", result)
                    result_payload.update(result.metadata)
                    recovered = True
                elif action_type == "attach_window":
                    if driver is None:
                        driver = self._create_driver(cfg)
                    result = await driver.switch_window(
                        window_title=str(action.get("window_title") or cfg.get("window_title") or "") or None,
                        process_name=str(action.get("process_name") or cfg.get("process_name") or "") or None,
                    )
                    self._raise_if_failed("recovery.attach_window", result)
                    async with self._lock:
                        self._sessions[envelope.execution_id] = driver
                    result_payload.update(result.metadata)
                    recovered = True
                elif action_type == "handle_modal":
                    if driver is None:
                        raise RuntimeError("No desktop session available for handle_modal recovery")
                    result = await driver.handle_modal(
                        action=str(action.get("modal_action") or action.get("action") or "accept"),
                        button_text=str(action.get("button_text") or cfg.get("modal_button") or "") or None,
                        timeout=float(action.get("timeout_seconds") or 5),
                    )
                    self._raise_if_failed("recovery.handle_modal", result)
                    result_payload.update(result.metadata)
                    recovered = True
                elif action_type == "restart_app":
                    app = str(action.get("app") or cfg.get("app") or "")
                    if not app:
                        raise RuntimeError("restart_app recovery requires `app` in config or action")
                    if driver is None:
                        driver = self._create_driver(cfg)
                        result = await driver.launch(app, args=_coerce_args(cfg.get("args") or cfg.get("appArguments")), capabilities=dict(cfg.get("capabilities") or {}))
                    else:
                        result = await driver.restart_app(app, args=_coerce_args(cfg.get("args") or cfg.get("appArguments")), capabilities=dict(cfg.get("capabilities") or {}))
                    self._raise_if_failed("recovery.restart_app", result)
                    async with self._lock:
                        self._sessions[envelope.execution_id] = driver
                    result_payload.update(result.metadata)
                    recovered = True
                elif action_type == "click":
                    if driver is None:
                        raise RuntimeError("No desktop session available for click recovery")
                    candidates = self._locator_candidates({
                        **cfg,
                        "selector": action.get("selector") or action.get("locator"),
                        "strategy": action.get("strategy") or cfg.get("strategy") or "name",
                    })
                    result = await driver.click(candidates, timeout=float(action.get("timeout_seconds") or 5))
                    self._raise_if_failed("recovery.click", result)
                    result_payload.update(result.metadata)
                    recovered = True
                elif action_type == "press_key":
                    if driver is None:
                        raise RuntimeError("No desktop session available for press_key recovery")
                    result = await driver.press_key(str(action.get("key") or "Escape"))
                    self._raise_if_failed("recovery.press_key", result)
                    result_payload.update(result.metadata)
                    recovered = True
                elif action_type == "hotkey":
                    if driver is None:
                        raise RuntimeError("No desktop session available for hotkey recovery")
                    result = await driver.hotkey(_coerce_keys(action.get("keys") or []))
                    self._raise_if_failed("recovery.hotkey", result)
                    result_payload.update(result.metadata)
                    recovered = True
                else:
                    result_payload.update({"success": False, "error": f"Unsupported recovery action: {action_type}"})
            except Exception as exc:
                result_payload.update({"success": False, "error": str(exc)})
            action_results.append(result_payload)
            await envelope.log(
                "info" if result_payload.get("success") else "warning",
                f"[recovery:{recovery.get('category')}] {action_type}: {'ok' if result_payload.get('success') else result_payload.get('error')}",
                source="desktop",
            )

        return {
            "enabled": True,
            "recovered": recovered,
            "plan": recovery,
            "actions": action_results,
        }

    async def _do_launch(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._session(envelope, cfg)
        caps = await driver.report_capabilities()
        return {"app": cfg["app"], "driver": caps.get("driver"), "capabilities": caps}

    async def _do_attach(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = self._create_driver(cfg)
        result = await driver.attach(
            window_title=str(cfg.get("window_title") or "") or None,
            process_name=str(cfg.get("process_name") or "") or None,
        )
        self._raise_if_failed("attach", result)
        async with self._lock:
            existing = self._sessions.pop(envelope.execution_id, None)
            self._sessions[envelope.execution_id] = driver
        if existing:
            await existing.close()
        caps = await driver.report_capabilities()
        return {"driver": caps.get("driver"), "capabilities": caps, **result.metadata}

    async def _do_close(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        async with self._lock:
            driver = self._sessions.pop(envelope.execution_id, None)
        if not driver:
            return {"closed": False, "reason": "no active desktop session"}
        result = await driver.close()
        self._raise_if_failed("close", result)
        return {"closed": True, **result.metadata}

    async def _do_restart(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        app = str(cfg["app"])
        async with self._lock:
            driver = self._sessions.get(envelope.execution_id)
        if driver is None:
            driver = self._create_driver(cfg)
            result = await driver.launch(app, args=_coerce_args(cfg.get("args") or cfg.get("appArguments")), capabilities=dict(cfg.get("capabilities") or {}))
        else:
            result = await driver.restart_app(app, args=_coerce_args(cfg.get("args") or cfg.get("appArguments")), capabilities=dict(cfg.get("capabilities") or {}))
        self._raise_if_failed("restart", result)
        async with self._lock:
            self._sessions[envelope.execution_id] = driver
        caps = await driver.report_capabilities()
        return {"app": app, "driver": caps.get("driver"), "capabilities": caps, **result.metadata}

    async def _do_activate_window(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg, apply_scope=False)
        title = str(cfg.get("window_title") or "") or None
        result = await driver.activate_window(title)
        self._raise_if_failed("activate_window", result)
        return {"window_title": title or "", **result.metadata}

    async def _do_switch_window(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg, apply_scope=False)
        result = await driver.switch_window(
            window_title=str(cfg.get("window_title") or "") or None,
            process_name=str(cfg.get("process_name") or "") or None,
        )
        self._raise_if_failed("switch_window", result)
        return {"window_title": cfg.get("window_title") or "", "process_name": cfg.get("process_name") or "", **result.metadata}

    async def _do_wait_app(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg, apply_scope=False)
        process_name = str(cfg.get("process_name") or "") or None
        result = await driver.wait_app(process_name=process_name, timeout=self._timeout(cfg))
        self._raise_if_failed("wait_app", result)
        return {"process_name": process_name or "", **result.metadata}

    async def _do_wait_window(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg, apply_scope=False)
        title = str(cfg["window_title"])
        result = await driver.wait_window(title, timeout=self._timeout(cfg))
        self._raise_if_failed("wait_window", result)
        return {"window_title": title, **result.metadata}

    async def _do_click(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        return await self._locator_or_coordinate_action(
            envelope,
            cfg,
            "click",
            "click",
            "click_coordinates",
        )

    async def _do_double_click(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        return await self._locator_or_coordinate_action(
            envelope,
            cfg,
            "double_click",
            "double_click",
            "double_click_coordinates",
        )

    async def _do_right_click(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        return await self._locator_or_coordinate_action(
            envelope,
            cfg,
            "right_click",
            "right_click",
            "click_coordinates",
            button="right",
        )

    async def _do_hover(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        return await self._locator_or_coordinate_action(
            envelope,
            cfg,
            "hover",
            "hover",
            "hover_coordinates",
        )

    async def _do_type_text(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        value = str(cfg["value"])
        result = await driver.type_text(candidates, value, timeout=self._timeout(cfg))
        self._raise_if_failed("type_text", result)
        return self._locator_payload(cfg, candidates, result, chars=len(value))

    async def _do_clear(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        result = await driver.clear_text(candidates, timeout=self._timeout(cfg))
        self._raise_if_failed("clear", result)
        return self._locator_payload(cfg, candidates, result)

    async def _do_select(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        value = str(cfg["value"])
        result = await driver.select(candidates, value, timeout=self._timeout(cfg))
        self._raise_if_failed("select", result)
        return self._locator_payload(cfg, candidates, result, value=value)

    async def _do_check(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        result = await driver.set_checked(candidates, True, timeout=self._timeout(cfg))
        self._raise_if_failed("check", result)
        return self._locator_payload(cfg, candidates, result, checked=True)

    async def _do_uncheck(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        result = await driver.set_checked(candidates, False, timeout=self._timeout(cfg))
        self._raise_if_failed("uncheck", result)
        return self._locator_payload(cfg, candidates, result, checked=False)

    async def _do_press_key(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        key = str(cfg["key"])
        result = await driver.press_key(key)
        self._raise_if_failed("press_key", result)
        return {"key": key, **result.metadata}

    async def _do_hotkey(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        keys = _coerce_keys(cfg["keys"])
        result = await driver.hotkey(keys)
        self._raise_if_failed("hotkey", result)
        return {"keys": keys, **result.metadata}

    async def _do_scroll(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg) if (
            cfg.get("selector") or cfg.get("automation_id") or cfg.get("locators")
        ) else None
        delta = int(cfg.get("delta") or -5)
        result = await driver.scroll(candidates, delta=delta, timeout=self._timeout(cfg))
        self._raise_if_failed("scroll", result)
        return {"delta": delta, **result.metadata}

    async def _do_drag_and_drop(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        source_candidates = self._prefixed_locator_candidates(cfg, "source")
        target_candidates = self._prefixed_locator_candidates(cfg, "target")
        result = await driver.drag_and_drop(source_candidates, target_candidates, timeout=self._timeout(cfg))
        self._raise_if_failed("drag_and_drop", result)
        return {
            "source_selector": cfg.get("source_selector"),
            "target_selector": cfg.get("target_selector"),
            **result.metadata,
        }

    async def _do_handle_modal(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        action = str(cfg.get("action") or "accept")
        button_text = str(cfg.get("button_text") or "") or None
        result = await driver.handle_modal(action=action, button_text=button_text, timeout=self._timeout(cfg))
        self._raise_if_failed("handle_modal", result)
        return {"action": action, "button_text": button_text or "", **result.metadata}

    async def _do_clipboard_set(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        value = str(cfg["value"])
        result = await driver.clipboard_set(value)
        self._raise_if_failed("clipboard_set", result)
        return {"chars": len(value), **result.metadata}

    async def _do_clipboard_get(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        variable = str(cfg["variable"])
        result = await driver.clipboard_get()
        self._raise_if_failed("clipboard_get", result)
        value = result.value or ""
        return {"variable": variable, variable: value, "chars": len(value), **result.metadata}

    async def _do_assert_text(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        result = await driver.get_text(candidates, timeout=self._timeout(cfg))
        self._raise_if_failed("assert_text", result)
        actual = result.value or ""
        expected = str(cfg["expected"])
        match = cfg.get("match", "contains")
        ok = actual == expected if match == "equals" else expected in actual
        if not ok:
            raise AssertionError(f"expected text {match} {expected!r}, got {actual!r}")
        return self._locator_payload(cfg, candidates, result, actual=actual, match=match)

    async def _do_assert_property(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        property_name = str(cfg.get("property") or "name")
        result = await driver.get_property(candidates, property_name, timeout=self._timeout(cfg))
        self._raise_if_failed("assert_property", result)
        actual = result.value or ""
        expected = str(cfg["expected"])
        match = cfg.get("match", "contains")
        ok = actual == expected if match == "equals" else expected in actual
        if not ok:
            raise AssertionError(f"expected property {property_name} {match} {expected!r}, got {actual!r}")
        return self._locator_payload(cfg, candidates, result, property=property_name, actual=actual, match=match)

    async def _do_extract_text(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        result = await driver.get_text(candidates, timeout=self._timeout(cfg))
        self._raise_if_failed("extract_text", result)
        text = (result.value or "").strip()
        variable = str(cfg["variable"])
        return self._locator_payload(cfg, candidates, result, **{variable: text})

    async def _do_extract_property(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        property_name = str(cfg.get("property") or "name")
        result = await driver.get_property(candidates, property_name, timeout=self._timeout(cfg))
        self._raise_if_failed("extract_property", result)
        value = (result.value or "").strip()
        variable = str(cfg["variable"])
        return self._locator_payload(cfg, candidates, result, property=property_name, **{variable: value})

    async def _do_screenshot(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        result = await driver.screenshot()
        self._raise_if_failed("screenshot", result)
        raw_bytes = result.screenshot_bytes or b""
        artifact = await envelope.artifacts.record_bytes(
            ArtifactKind.SCREENSHOT,
            str(cfg.get("name") or "desktop.png"),
            raw_bytes,
            content_type="image/png",
            metadata={"source": "desktop", **result.metadata},
        )
        output = {"screenshot_artifact_id": artifact.id, "size_bytes": artifact.size_bytes, **result.metadata}
        crop_bytes, crop_box = _crop_png_bytes(raw_bytes, cfg)
        if crop_bytes:
            crop_artifact = await envelope.artifacts.record_bytes(
                ArtifactKind.SCREENSHOT,
                str(cfg.get("crop_name") or f"{Path(str(cfg.get('name') or 'desktop.png')).stem}-crop.png"),
                crop_bytes,
                content_type="image/png",
                metadata={
                    "source": "desktop",
                    "type": "screenshot_crop",
                    "crop_box": crop_box,
                    "object_key": str(cfg.get("object_key") or ""),
                    **result.metadata,
                },
            )
            output.update({
                "crop_artifact_id": crop_artifact.id,
                "crop_size_bytes": crop_artifact.size_bytes,
                "crop_box": crop_box,
            })
        return output

    async def _do_source_snapshot(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        result = await driver.get_ui_tree()
        self._raise_if_failed("source_snapshot", result)
        artifact = await envelope.artifacts.record_text(
            ArtifactKind.TEXT,
            str(cfg.get("name") or "desktop-source.xml"),
            result.ui_tree or "",
            content_type="application/xml",
            metadata={"source": "desktop", **result.metadata},
        )
        return {"source_artifact_id": artifact.id, "size_bytes": artifact.size_bytes, **result.metadata}

    async def _do_perceive(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        tree_result = await driver.get_ui_tree()
        ui_tree = tree_result.ui_tree if tree_result.success else ""
        source_artifact_id = ""
        if ui_tree:
            artifact = await envelope.artifacts.record_text(
                ArtifactKind.TEXT,
                "desktop-perception-source.xml",
                ui_tree,
                content_type="application/xml",
                metadata={"source": "desktop_perception", **tree_result.metadata},
            )
            source_artifact_id = artifact.id

        screenshot_bytes: bytes | None = None
        screenshot_artifact_id = ""
        if cfg.get("include_screenshot", True):
            shot_result = await driver.screenshot()
            if shot_result.success and shot_result.screenshot_bytes:
                screenshot_bytes = shot_result.screenshot_bytes
                shot_artifact = await envelope.artifacts.record_bytes(
                    ArtifactKind.SCREENSHOT,
                    "desktop-perception.png",
                    screenshot_bytes,
                    content_type="image/png",
                    metadata={"source": "desktop_perception", **shot_result.metadata},
                )
                screenshot_artifact_id = shot_artifact.id

        candidates = self._perception.analyze(
            ui_tree=ui_tree,
            screenshot_bytes=screenshot_bytes,
            ocr_text=str(cfg.get("ocr_text") or ""),
            hint=str(cfg.get("hint") or ""),
            visual_template=str(cfg.get("visual_template") or ""),
            max_candidates=int(cfg.get("max_candidates") or 20),
        )
        return {
            "hint": str(cfg.get("hint") or ""),
            "candidate_count": len(candidates),
            "candidates": [candidate.as_dict() for candidate in candidates],
            "source_artifact_id": source_artifact_id,
            "screenshot_artifact_id": screenshot_artifact_id,
        }

    # ── New node handlers ─────────────────────────────────────────────────────

    async def _do_set_text(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        value = str(cfg["value"])
        result = await driver.set_text(candidates, value, timeout=self._timeout(cfg))
        self._raise_if_failed("set_text", result)
        return self._locator_payload(cfg, candidates, result, chars=len(value))

    async def _do_key_sequence(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        keys = _coerce_keys(cfg.get("keys") or "")
        result = await driver.key_sequence(keys)
        self._raise_if_failed("key_sequence", result)
        return {"keys": keys, **result.metadata}

    async def _do_menu_action(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        raw = str(cfg.get("menu_path") or "")
        menu_path = [p.strip() for p in re.split(r"[|>]", raw) if p.strip()]
        result = await driver.menu_action(menu_path, timeout=self._timeout(cfg))
        self._raise_if_failed("menu_action", result)
        return {"menu_path": menu_path, **result.metadata}

    async def _do_ribbon_action(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        tab = str(cfg.get("tab") or "")
        group = str(cfg.get("group") or "")
        button = str(cfg.get("button") or "")
        result = await driver.ribbon_action(tab, group, button, timeout=self._timeout(cfg))
        self._raise_if_failed("ribbon_action", result)
        return {"tab": tab, "group": group, "button": button, **result.metadata}

    async def _do_table_cell_action(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        row = int(cfg.get("row") or 0)
        column = str(cfg.get("column") or "")
        action = str(cfg.get("action") or "click")
        value = str(cfg.get("value") or "")
        result = await driver.table_cell_action(candidates, row, column, action, value, timeout=self._timeout(cfg))
        self._raise_if_failed("table_cell_action", result)
        payload = self._locator_payload(cfg, candidates, result, row=row, column=column, action=action)
        if action == "read" and cfg.get("variable"):
            variable = str(cfg["variable"])
            payload[variable] = result.value or ""
        return payload

    async def _do_tree_action(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        node_path = str(cfg.get("node_path") or "")
        action = str(cfg.get("action") or "select")
        result = await driver.tree_action(candidates, node_path, action, timeout=self._timeout(cfg))
        self._raise_if_failed("tree_action", result)
        return self._locator_payload(cfg, candidates, result, node_path=node_path, action=action)

    async def _do_assert_visual(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        shot = await driver.screenshot()
        self._raise_if_failed("screenshot", shot)
        actual_bytes = shot.screenshot_bytes or b""
        artifact = await envelope.artifacts.record_bytes(
            ArtifactKind.SCREENSHOT,
            str(cfg.get("name") or "visual-check-actual.png"),
            actual_bytes,
            content_type="image/png",
            metadata={"source": "visual_assertion", "type": "actual"},
        )
        baseline_path = str(cfg.get("baseline_path") or "")
        tolerance = float(cfg.get("tolerance") or 0.02)
        if not baseline_path:
            return {"screenshot_artifact_id": artifact.id, "status": "baseline_recorded", "tolerance": tolerance}
        baseline = Path(baseline_path).expanduser()
        if not baseline.exists():
            raise FileNotFoundError(f"Visual baseline not found: {baseline_path}")
        diff_ratio = _compare_images(baseline.read_bytes(), actual_bytes)
        if diff_ratio > tolerance:
            raise AssertionError(
                f"Visual assertion failed: image difference {diff_ratio:.3%} exceeds tolerance {tolerance:.3%}"
            )
        return {"screenshot_artifact_id": artifact.id, "diff_ratio": diff_ratio, "tolerance": tolerance, "status": "passed"}

    async def _do_assert_image(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        shot = await driver.screenshot()
        self._raise_if_failed("screenshot", shot)
        actual_bytes = shot.screenshot_bytes or b""
        expected_path = str(cfg.get("expected_path") or "")
        tolerance = float(cfg.get("tolerance") or 0.02)
        if not expected_path:
            artifact = await envelope.artifacts.record_bytes(
                ArtifactKind.SCREENSHOT, "image-check-actual.png", actual_bytes,
                content_type="image/png", metadata={"source": "image_assertion"},
            )
            return {"screenshot_artifact_id": artifact.id, "status": "baseline_recorded"}
        expected = Path(expected_path).expanduser()
        if not expected.exists():
            raise FileNotFoundError(f"Expected image not found: {expected_path}")
        diff_ratio = _compare_images(expected.read_bytes(), actual_bytes)
        if diff_ratio > tolerance:
            raise AssertionError(f"Image assertion failed: difference {diff_ratio:.3%} exceeds tolerance {tolerance:.3%}")
        return {"diff_ratio": diff_ratio, "tolerance": tolerance, "status": "passed"}

    async def _do_assert_table(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        result = await driver.extract_table(candidates, timeout=self._timeout(cfg))
        self._raise_if_failed("assert_table", result)
        actual_rows: list[Any] = result.metadata.get("rows") or []
        expected_rows: list[Any] = list(cfg.get("expected_rows") or [])
        match_mode = str(cfg.get("match_mode") or "contains")
        if match_mode == "exact":
            if actual_rows != expected_rows:
                raise AssertionError(
                    f"Table exact match failed: expected {len(expected_rows)} rows, got {len(actual_rows)}"
                )
        elif match_mode == "contains":
            for exp_row in expected_rows:
                if exp_row not in actual_rows:
                    raise AssertionError(f"Table does not contain expected row: {exp_row}")
        elif match_mode == "ordered_contains":
            idx = 0
            for exp_row in expected_rows:
                while idx < len(actual_rows) and actual_rows[idx] != exp_row:
                    idx += 1
                if idx >= len(actual_rows):
                    raise AssertionError(f"Table ordered match failed for row: {exp_row}")
                idx += 1
        return self._locator_payload(cfg, candidates, result, actual_rows=actual_rows[:10], expected_rows=expected_rows, match_mode=match_mode)

    async def _do_assert_file(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        file_path = Path(str(cfg.get("file_path") or "")).expanduser()
        condition = str(cfg.get("condition") or "exists")
        content = str(cfg.get("content") or "")
        encoding = str(cfg.get("encoding") or "utf-8")
        if condition == "exists":
            if not file_path.exists():
                raise AssertionError(f"File does not exist: {file_path}")
        elif condition == "not_exists":
            if file_path.exists():
                raise AssertionError(f"File should not exist: {file_path}")
        elif condition in {"contains", "not_contains"}:
            if not file_path.exists():
                raise AssertionError(f"File does not exist: {file_path}")
            actual = file_path.read_text(encoding=encoding, errors="replace")
            if condition == "contains" and content not in actual:
                raise AssertionError(f"File does not contain: {content!r}")
            if condition == "not_contains" and content in actual:
                raise AssertionError(f"File should not contain: {content!r}")
        return {"file_path": str(file_path), "condition": condition, "exists": file_path.exists()}

    async def _do_assert_database(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        connection_string = str(cfg.get("connection_string") or "")
        query = str(cfg.get("query") or "").strip()
        if not query.upper().startswith("SELECT"):
            raise ValueError("Only SELECT queries are permitted in assert_database nodes")
        expected = str(cfg.get("expected") or "")
        match_mode = str(cfg.get("match") or "equals")
        actual = str(await _execute_db_query(connection_string, query) or "")
        ok = actual == expected if match_mode == "equals" else expected in actual
        if not ok:
            raise AssertionError(f"Database assertion failed: expected {match_mode} {expected!r}, got {actual!r}")
        return {"query": query, "actual": actual, "match": match_mode}

    async def _do_assert_accessibility(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        rules_level = str(cfg.get("rules_level") or "error")
        allow_list = list(cfg.get("allow_list") or [])
        tree_result = await driver.get_ui_tree()
        self._raise_if_failed("get_ui_tree", tree_result)
        violations = _check_accessibility(tree_result.ui_tree or "", rules_level=rules_level, allow_list=allow_list)
        if violations:
            artifact = await envelope.artifacts.record_text(
                ArtifactKind.TEXT, "accessibility-violations.json",
                json.dumps(violations, indent=2), content_type="application/json",
                metadata={"rules_level": rules_level},
            )
            raise AssertionError(
                f"Accessibility check found {len(violations)} violation(s). See artifact: {artifact.id}"
            )
        return {"violations": 0, "rules_level": rules_level, "ui_tree_size": len(tree_result.ui_tree or "")}

    async def _do_assert_window_state(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg, apply_scope=False)
        window_title = str(cfg.get("window_title") or "")
        state = str(cfg.get("state") or "visible")
        if state == "not_exists":
            result = await driver.activate_window(window_title)
            if result.success:
                raise AssertionError(f"Window should not exist but was found: {window_title!r}")
            return {"window_title": window_title, "state": state, "passed": True}
        result = await driver.activate_window(window_title)
        if state in {"visible", "exists", "focused"}:
            if not result.success:
                raise AssertionError(f"Window not found: {window_title!r}")
        elif state in {"minimized", "maximized"}:
            tree_result = await driver.get_ui_tree()
            state_pattern = "Minimized" if state == "minimized" else "Maximized"
            if state_pattern not in (tree_result.ui_tree or ""):
                raise AssertionError(f"Window is not {state}: {window_title!r}")
        return {"window_title": window_title, "state": state, "passed": True, **result.metadata}

    async def _do_extract_table(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        result = await driver.extract_table(candidates, timeout=self._timeout(cfg))
        self._raise_if_failed("extract_table", result)
        rows: list[Any] = result.metadata.get("rows") or []
        variable = str(cfg["variable"])
        payload = self._locator_payload(cfg, candidates, result, row_count=len(rows))
        payload[variable] = rows
        return payload

    async def _do_output_value(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        variable = str(cfg["variable"])
        value = str(cfg.get("value") or "")
        return {"variable": variable, variable: value}

    async def _do_data_iteration(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        data_source = cfg.get("data_source")
        data_key = str(cfg.get("data_key") or "")
        row_index = int(cfg.get("row_index") or 0)
        variable_prefix = str(cfg.get("variable_prefix") or "")
        rows: list[dict[str, Any]] = []
        if data_source and isinstance(data_source, list):
            rows = [r for r in data_source if isinstance(r, dict)]
        elif data_key:
            ctx_vars = await envelope.context.all()
            master = ctx_vars.get("master_sheet") or {}
            section_data = (master.get("test_data") or {}).get(data_key) or {}
            if isinstance(section_data, dict):
                rows = [section_data]
            elif isinstance(section_data, list):
                rows = [r for r in section_data if isinstance(r, dict)]
        if not rows:
            raise RuntimeError(f"No data rows found for data_iteration{': ' + data_key if data_key else ''}")
        row = rows[min(row_index, len(rows) - 1)]
        output: dict[str, Any] = {"row_count": len(rows), "row_index": row_index}
        for k, v in row.items():
            output[f"{variable_prefix}{k}" if variable_prefix else k] = v
        return output

    async def _do_file_dialog(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        dialog_type = str(cfg.get("dialog_type") or "open")
        file_path = str(cfg.get("file_path") or "")
        result = await driver.file_dialog(dialog_type=dialog_type, file_path=file_path, timeout=self._timeout(cfg))
        self._raise_if_failed("file_dialog", result)
        return {"dialog_type": dialog_type, "file_path": file_path, **result.metadata}

    async def _do_print_dialog(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        action = str(cfg.get("action") or "print")
        printer = str(cfg.get("printer") or "")
        result = await driver.print_dialog(action=action, printer=printer, timeout=self._timeout(cfg))
        self._raise_if_failed("print_dialog", result)
        return {"action": action, "printer": printer, **result.metadata}

    async def _do_download_wait(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        download_dir = Path(str(cfg.get("download_dir") or "")).expanduser()
        filename_pattern = str(cfg.get("filename_pattern") or "*")
        timeout_ms = float(cfg.get("timeout_ms") or 60000)
        variable = str(cfg.get("variable") or "")
        if not download_dir.exists():
            raise RuntimeError(f"Download directory does not exist: {download_dir}")
        timeout_s = timeout_ms / 1000
        poll = 1.0
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout_s
        found_file: Path | None = None
        _IN_PROGRESS = {".part", ".crdownload", ".tmp"}
        while loop.time() <= deadline:
            matches = [
                f for f in download_dir.iterdir()
                if f.is_file()
                and fnmatch.fnmatch(f.name, filename_pattern)
                and f.suffix not in _IN_PROGRESS
            ]
            if matches:
                found_file = max(matches, key=lambda f: f.stat().st_mtime)
                break
            await asyncio.sleep(poll)
        if not found_file:
            raise TimeoutError(f"Download did not complete within {timeout_s:.0f}s in: {download_dir}")
        output: dict[str, Any] = {
            "download_dir": str(download_dir),
            "filename": found_file.name,
            "file_path": str(found_file),
            "size_bytes": found_file.stat().st_size,
        }
        if variable:
            output[variable] = str(found_file)
        return output

    async def _do_upload_file(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        candidates = self._locator_candidates(cfg)
        file_path = str(cfg.get("file_path") or "")
        timeout = self._timeout(cfg)
        click_result = await driver.click(candidates, timeout=timeout)
        self._raise_if_failed("upload_file[click]", click_result)
        dialog_result = await driver.file_dialog(dialog_type="open", file_path=file_path, timeout=timeout)
        self._raise_if_failed("upload_file[dialog]", dialog_result)
        return self._locator_payload(cfg, candidates, click_result, file_path=file_path, **dialog_result.metadata)

    async def _do_extension_pack_action(self, envelope: ExecutionEnvelope, cfg: dict[str, Any]) -> dict[str, Any]:
        driver = await self._require_session(envelope, cfg)
        pack_key = str(cfg.get("extension_pack") or envelope.node_type.removeprefix("desktop.").removesuffix("_action"))
        pack = EXTENSION_PACKS.get(pack_key)
        if pack is None:
            raise RuntimeError(f"Unknown desktop extension pack: {pack_key}")
        action = str(cfg.get("action") or pack.actions[0])
        candidates = self._locator_candidates(cfg)
        timeout = self._timeout(cfg)
        result: DriverResult
        output: dict[str, Any] = {
            "extension_pack": pack_key,
            "object_class": str(cfg.get("object_class") or ""),
            "action": action,
        }

        if action in {"click", "ribbon_action"} and action != "ribbon_action":
            result = await driver.click(candidates, timeout=timeout)
        elif action in {"type_text", "set_text"}:
            result = await driver.set_text(candidates, str(cfg.get("value") or ""), timeout=timeout)
        elif action == "select":
            result = await driver.select(candidates, str(cfg.get("value") or ""), timeout=timeout)
        elif action == "press_key":
            result = await driver.press_key(str(cfg.get("value") or cfg.get("key") or "Enter"))
        elif action == "hotkey":
            result = await driver.hotkey(_coerce_keys(cfg.get("value") or cfg.get("keys") or ""))
        elif action == "clipboard_set":
            result = await driver.clipboard_set(str(cfg.get("value") or ""))
        elif action == "assert_text":
            result = await driver.get_text(candidates, timeout=timeout)
            self._raise_if_failed(action, result)
            actual = result.value or ""
            expected = str(cfg.get("expected") or "")
            if expected and expected not in actual:
                raise AssertionError(f"{pack.label} text assertion failed: expected {expected!r}, got {actual!r}")
            output["actual"] = actual
            return self._locator_payload(cfg, candidates, result, **output)
        elif action == "extract_text":
            result = await driver.get_text(candidates, timeout=timeout)
            self._raise_if_failed(action, result)
            variable = str(cfg.get("variable") or "value")
            output[variable] = result.value or ""
            return self._locator_payload(cfg, candidates, result, **output)
        elif action == "assert_property":
            result = await driver.get_property(candidates, str(cfg.get("checkpoint") or "name"), timeout=timeout)
            self._raise_if_failed(action, result)
            actual = result.value or ""
            expected = str(cfg.get("expected") or "")
            if expected and expected not in actual:
                raise AssertionError(f"{pack.label} property assertion failed: expected {expected!r}, got {actual!r}")
            output["actual"] = actual
            return self._locator_payload(cfg, candidates, result, **output)
        elif action == "extract_property":
            prop = str(cfg.get("checkpoint") or "name")
            result = await driver.get_property(candidates, prop, timeout=timeout)
            self._raise_if_failed(action, result)
            variable = str(cfg.get("variable") or prop or "value")
            output[variable] = result.value or ""
            return self._locator_payload(cfg, candidates, result, **output)
        elif action == "table_cell_action":
            result = await driver.table_cell_action(
                candidates,
                int(cfg.get("row") or 0),
                str(cfg.get("column") or ""),
                str(cfg.get("cell_action") or "click"),
                str(cfg.get("value") or ""),
                timeout=timeout,
            )
        elif action == "tree_action":
            result = await driver.tree_action(
                candidates,
                str(cfg.get("node_path") or ""),
                str(cfg.get("tree_action") or "select"),
                timeout=timeout,
            )
        elif action == "ribbon_action":
            result = await driver.ribbon_action(
                str(cfg.get("tab") or ""),
                str(cfg.get("group") or ""),
                str(cfg.get("button") or cfg.get("value") or ""),
                timeout=timeout,
            )
        elif action == "print_dialog":
            result = await driver.print_dialog(action=str(cfg.get("value") or "print"), printer=str(cfg.get("printer") or ""), timeout=timeout)
        elif action == "assert_file":
            return await self._do_assert_file(envelope, cfg)
        elif action == "assert_image":
            return await self._do_assert_image(envelope, cfg)
        else:
            raise RuntimeError(f"Unsupported {pack.label} action: {action}")

        self._raise_if_failed(action, result)
        return self._locator_payload(cfg, candidates, result, **output)

    async def _emit_action(
        self,
        envelope: ExecutionEnvelope,
        action: str,
        *,
        selector: str | None = None,
        duration_ms: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        await envelope.emit(DesktopAction(
            execution_id=envelope.execution_id,
            node_id=envelope.node_key,
            action=action.replace("desktop.", ""),
            selector=selector,
            duration_ms=duration_ms,
            metadata=metadata or {},
        ))

    async def _execute_node_chain(
        self,
        envelope: ExecutionEnvelope,
        cfg: dict[str, Any],
        node_chain: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Execute a sequence of desktop nodes defined in a recovery node_chain.

        Each item should have a ``node_type`` key and a ``config`` sub-dict.
        Returns a summary dict with per-node results and an overall ``recovered`` flag.
        """
        results: list[dict[str, Any]] = []
        attempted = False
        all_successful = True
        handlers = self._handlers()
        for item in node_chain:
            node_type = str(item.get("node_type") or "")
            node_cfg = dict(item.get("config") or {})
            node_cfg.setdefault("driver_type", cfg.get("driver_type", "winappdriver"))
            node_cfg.setdefault("server_url", cfg.get("server_url", ""))
            node_cfg.setdefault("app", cfg.get("app", ""))
            handler = handlers.get(node_type)
            step: dict[str, Any] = {"node_type": node_type, "success": False}
            if handler is None:
                step["error"] = f"Unknown node_type in node_chain: {node_type}"
                all_successful = False
            else:
                try:
                    from app.execution.interpolation import VariableInterpolator
                    ctx_vars = await envelope.context.all()
                    node_cfg = VariableInterpolator.interpolate(node_cfg, ctx_vars)
                    output = await handler(self, envelope, node_cfg)
                    attempted = True
                    step["success"] = True
                    step["output"] = output
                except Exception as chain_exc:
                    all_successful = False
                    step["error"] = str(chain_exc)
            results.append(step)
        return {"recovered": attempted and all_successful, "steps": results}

    async def _notify_ai_investigation(
        self,
        envelope: ExecutionEnvelope,
        error: str,
        recovery: dict[str, Any],
    ) -> None:
        """Emit an AI investigation event so the intelligence pipeline can analyse the failure."""
        try:
            from app.events.types import AIInvestigationRequest
            await envelope.emit(AIInvestigationRequest(
                execution_id=envelope.execution_id,
                node_id=envelope.node_key,
                node_type=envelope.node_type,
                error=error,
                recovery_category=str(recovery.get("category") or "unknown"),
                failure_outcome=str(recovery.get("failure_outcome") or "fail"),
            ))
        except Exception:
            pass  # Investigation notifications must not break execution flow

    async def _capture_failure_evidence(
        self,
        envelope: ExecutionEnvelope,
        error: str,
        *,
        recovery: dict[str, Any] | None = None,
    ) -> None:
        async with self._lock:
            driver = self._sessions.get(envelope.execution_id)
        if not driver:
            return
        try:
            screenshot = await driver.screenshot()
            if screenshot.success and screenshot.screenshot_bytes:
                await envelope.artifacts.record_bytes(
                    ArtifactKind.SCREENSHOT,
                    "desktop-failure.png",
                    screenshot.screenshot_bytes,
                    content_type="image/png",
                    metadata={"error": error, "recovery": recovery or {}, **screenshot.metadata},
                )
        except Exception:
            pass
        try:
            source = await driver.get_ui_tree()
            if source.success and source.ui_tree:
                await envelope.artifacts.record_text(
                    ArtifactKind.TEXT,
                    "desktop-source.xml",
                    source.ui_tree,
                    content_type="application/xml",
                    metadata={"error": error, "recovery": recovery or {}, **source.metadata},
                )
        except Exception:
            pass


# ── Module-level helpers ──────────────────────────────────────────────────────


def _compare_images(baseline: bytes, actual: bytes) -> float:
    """Return fraction of pixels that differ by more than a threshold of 10.

    Requires Pillow (already in requirements.txt). Falls back to hash
    comparison if Pillow is unavailable.
    """
    try:
        import io
        from PIL import Image, ImageChops

        img1 = Image.open(io.BytesIO(baseline)).convert("RGB")
        img2 = Image.open(io.BytesIO(actual)).convert("RGB")
        if img1.size != img2.size:
            img2 = img2.resize(img1.size, Image.LANCZOS)
        diff = ImageChops.difference(img1, img2)
        total = img1.width * img1.height
        differing = sum(1 for p in diff.getdata() if max(p) > 10)
        return differing / total if total else 0.0
    except ImportError:
        import hashlib

        return 0.0 if hashlib.md5(baseline).digest() == hashlib.md5(actual).digest() else 1.0


def _crop_png_bytes(image_bytes: bytes, cfg: dict[str, Any]) -> tuple[bytes | None, dict[str, int]]:
    """Crop screenshot bytes using crop_box or crop_x/y/width/height config."""
    crop_cfg = cfg.get("crop_box") if isinstance(cfg.get("crop_box"), dict) else {}
    x = crop_cfg.get("x", cfg.get("crop_x"))
    y = crop_cfg.get("y", cfg.get("crop_y"))
    width = crop_cfg.get("width", cfg.get("crop_width"))
    height = crop_cfg.get("height", cfg.get("crop_height"))
    if any(value in (None, "") for value in (x, y, width, height)):
        return None, {}
    try:
        import io
        from PIL import Image

        box = {
            "x": max(0, int(float(x))),
            "y": max(0, int(float(y))),
            "width": max(1, int(float(width))),
            "height": max(1, int(float(height))),
        }
        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        left = min(box["x"], image.width)
        top = min(box["y"], image.height)
        right = min(image.width, left + box["width"])
        bottom = min(image.height, top + box["height"])
        if right <= left or bottom <= top:
            return None, {}
        out = io.BytesIO()
        image.crop((left, top, right, bottom)).save(out, format="PNG")
        box.update({"width": right - left, "height": bottom - top})
        return out.getvalue(), box
    except Exception:
        return None, {}


async def _execute_db_query(connection_string: str, query: str) -> Any:
    """Execute a SELECT query and return the first cell as a string.

    Supports sqlite:// URIs via the stdlib sqlite3 module (no extra deps).
    """
    parsed = urlparse(connection_string)
    scheme = (parsed.scheme or "").split("+")[0].lower()
    if scheme == "sqlite":
        db_path = (
            connection_string
            .replace("sqlite:///", "", 1)
            .replace("sqlite://", "", 1)
        )

        def _run() -> Any:
            import sqlite3
            con = sqlite3.connect(db_path)
            try:
                cursor = con.execute(query)
                row = cursor.fetchone()
                return row[0] if row else None
            finally:
                con.close()

        return await asyncio.to_thread(_run)
    raise ValueError(
        f"assert_database supports sqlite:// connections only; got {scheme!r}"
    )


def _check_accessibility(
    ui_tree: str,
    *,
    rules_level: str = "error",
    allow_list: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Basic accessibility checks on a UIA XML tree string.

    Detects interactive controls that have an empty or missing Name attribute,
    which would be invisible to screen readers.
    """
    allow = allow_list or []
    violations: list[dict[str, Any]] = []
    interactive = {"Button", "Edit", "CheckBox", "ComboBox", "RadioButton", "Slider", "ToggleButton"}
    for match in re.finditer(r"<(\w+)([^>]*)/>", ui_tree):
        tag_name = match.group(1)
        if tag_name not in interactive:
            continue
        attrs = match.group(2)
        name_m = re.search(r'Name="([^"]*)"', attrs)
        accessible_name = name_m.group(1) if name_m else ""
        if accessible_name:
            continue
        context_snippet = match.group(0)[:120]
        if any(a in context_snippet for a in allow):
            continue
        violations.append({
            "level": rules_level,
            "rule": "missing-accessible-name",
            "element": tag_name,
            "context": context_snippet,
        })
    return violations
