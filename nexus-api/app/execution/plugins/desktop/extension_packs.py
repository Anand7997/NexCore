"""Declarative desktop enterprise extension packs.

These packs expose UFT-style domain controls while compiling to the generic
desktop driver primitives.  Dedicated native integrations can replace the
handlers later without changing workflow node contracts.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.execution.plugin import PluginNodeSpec


@dataclass(frozen=True)
class DesktopExtensionPack:
    key: str
    label: str
    description: str
    icon: str
    color: str
    object_classes: list[str]
    actions: list[str]
    locator_strategies: list[str]
    checkpoint_helpers: list[str] = field(default_factory=list)

    @property
    def node_type(self) -> str:
        return f"desktop.{self.key}_action"

    def node_spec(self, base_schema: dict[str, Any]) -> PluginNodeSpec:
        return PluginNodeSpec(
            type=self.node_type,
            plugin="desktop",
            label=f"{self.label} Action",
            category="Desktop Automation",
            description=self.description,
            icon=self.icon,
            color=self.color,
            config_schema={
                **base_schema,
                "extension_pack": {"type": "string", "default": self.key},
                "object_class": {"type": "string", "enum": self.object_classes, "default": self.object_classes[0]},
                "action": {"type": "string", "enum": self.actions, "default": self.actions[0]},
                "value": {"type": "string", "supports_template": True},
                "expected": {"type": "string", "supports_template": True},
                "variable": {"type": "string"},
                "checkpoint": {"type": "string", "enum": self.checkpoint_helpers or ["property"], "default": (self.checkpoint_helpers or ["property"])[0]},
            },
        )


EXTENSION_PACKS: dict[str, DesktopExtensionPack] = {
    "sap": DesktopExtensionPack(
        key="sap",
        label="SAP GUI",
        description="Operate SAP GUI for Windows controls through object repository locators.",
        icon="briefcase-business",
        color="#1d4ed8",
        object_classes=["GuiButton", "GuiTextField", "GuiComboBox", "GuiGridView", "GuiTree", "GuiMenu"],
        actions=["click", "set_text", "select", "press_key", "assert_text", "extract_text", "table_cell_action"],
        locator_strategies=["automation id", "name", "xpath", "class name"],
        checkpoint_helpers=["text", "property", "table"],
    ),
    "java": DesktopExtensionPack(
        key="java",
        label="Java Desktop",
        description="Operate Java Swing and JavaFX controls exposed through UIA/accessibility bridges.",
        icon="coffee",
        color="#b45309",
        object_classes=["JButton", "JTextField", "JComboBox", "JTable", "JTree", "JavaFXNode"],
        actions=["click", "set_text", "select", "assert_text", "extract_text", "table_cell_action", "tree_action"],
        locator_strategies=["name", "xpath", "class name", "automation id"],
        checkpoint_helpers=["text", "property", "table", "tree"],
    ),
    "citrix": DesktopExtensionPack(
        key="citrix",
        label="Citrix/RDP",
        description="Operate remote desktop screens with OCR, image, and coordinate-safe fallback locators.",
        icon="screen-share",
        color="#0f766e",
        object_classes=["RemoteButton", "RemoteText", "RemoteField", "RemoteImage", "RemoteRegion"],
        actions=["click", "type_text", "hotkey", "assert_text", "assert_image", "extract_text"],
        locator_strategies=["ocr", "visual", "image", "name"],
        checkpoint_helpers=["ocr", "image", "visual"],
    ),
    "terminal": DesktopExtensionPack(
        key="terminal",
        label="Terminal Emulator",
        description="Operate terminal emulator sessions through keyboard, clipboard, and text checkpoints.",
        icon="terminal",
        color="#16a34a",
        object_classes=["TerminalWindow", "ScreenField", "CommandLine", "StatusLine"],
        actions=["type_text", "press_key", "hotkey", "clipboard_set", "assert_text", "extract_text"],
        locator_strategies=["name", "ocr", "visual"],
        checkpoint_helpers=["screen_text", "status_line"],
    ),
    "office": DesktopExtensionPack(
        key="office",
        label="Office/PDF",
        description="Operate Office, PDF, print-preview, and document viewer workflows.",
        icon="file-text",
        color="#7c3aed",
        object_classes=["Document", "RibbonButton", "Cell", "PdfPage", "PrintDialog"],
        actions=["ribbon_action", "click", "set_text", "assert_file", "assert_text", "extract_text", "print_dialog"],
        locator_strategies=["automation id", "name", "xpath", "ocr", "visual"],
        checkpoint_helpers=["document_text", "file", "visual"],
    ),
    "custom_control": DesktopExtensionPack(
        key="custom_control",
        label="Custom Control",
        description="Operate custom enterprise controls through named extensibility metadata.",
        icon="puzzle",
        color="#db2777",
        object_classes=["CustomButton", "CustomField", "CustomGrid", "CustomTree", "OwnerDrawnControl"],
        actions=["click", "set_text", "select", "assert_property", "extract_property", "table_cell_action", "tree_action"],
        locator_strategies=["automation id", "name", "xpath", "class name", "ocr", "visual"],
        checkpoint_helpers=["property", "text", "custom"],
    ),
}


def extension_pack_specs(base_schema: dict[str, Any]) -> list[PluginNodeSpec]:
    return [pack.node_spec(base_schema) for pack in EXTENSION_PACKS.values()]


def extension_pack_capabilities() -> dict[str, Any]:
    return {
        key: {
            "label": pack.label,
            "node_type": pack.node_type,
            "object_classes": pack.object_classes,
            "actions": pack.actions,
            "locator_strategies": pack.locator_strategies,
            "checkpoint_helpers": pack.checkpoint_helpers,
        }
        for key, pack in EXTENSION_PACKS.items()
    }
