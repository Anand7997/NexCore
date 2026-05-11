"""Business intent registry and platform capability contracts.

This layer stays above execution plugins and below product workflow authoring.
It describes what a user means to accomplish, then validates whether a target
platform adapter can map that intent into executable node contracts.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

PlatformKey = Literal["web", "android", "ios", "desktop"]
SupportStatus = Literal["supported", "partial", "unsupported"]

PLATFORM_KEYS: tuple[PlatformKey, ...] = ("web", "android", "ios", "desktop")


@dataclass(frozen=True)
class PlatformMapping:
    status: SupportStatus
    adapter: str
    node_type: str | None = None
    reason: str = ""
    required_params: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "adapter": self.adapter,
            "node_type": self.node_type,
            "reason": self.reason,
            "required_params": list(self.required_params),
        }


@dataclass(frozen=True)
class IntentDefinition:
    intent_id: str
    label: str
    category: str
    description: str
    mappings: dict[PlatformKey, PlatformMapping]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.intent_id,
            "label": self.label,
            "category": self.category,
            "description": self.description,
            "mappings": {platform: mapping.to_dict() for platform, mapping in self.mappings.items()},
        }


def _mappings(
    web: PlatformMapping,
    android: PlatformMapping,
    ios: PlatformMapping,
    desktop: PlatformMapping,
) -> dict[PlatformKey, PlatformMapping]:
    return {"web": web, "android": android, "ios": ios, "desktop": desktop}


INTENT_REGISTRY: dict[str, IntentDefinition] = {
    "nav.open": IntentDefinition(
        intent_id="nav.open",
        label="Open destination",
        category="navigation",
        description="Navigate to a URL, route, screen, or app view.",
        mappings=_mappings(
            PlatformMapping("supported", "playwright-web", "web.navigate", "Maps directly to browser navigation.", ("url",)),
            PlatformMapping("supported", "appium-android", "mobile.deep_link", "Opens an Android deep link through Appium.", ("url",)),
            PlatformMapping("supported", "appium-ios", "mobile.deep_link", "Opens an iOS universal link through Appium.", ("url",)),
            PlatformMapping("supported", "winappdriver", "desktop.launch", "Launches a Windows desktop app through WinAppDriver.", ("app",)),
        ),
    ),
    "ui.click": IntentDefinition(
        intent_id="ui.click",
        label="Activate element",
        category="interaction",
        description="Click, tap, or invoke a visible interactive element.",
        mappings=_mappings(
            PlatformMapping("supported", "playwright-web", "web.click", "Uses selector-based DOM interaction.", ("selector",)),
            PlatformMapping("supported", "appium-android", "mobile.tap", "Uses Appium element lookup and tap.", ("selector",)),
            PlatformMapping("supported", "appium-ios", "mobile.tap", "Uses Appium element lookup and tap.", ("selector",)),
            PlatformMapping("supported", "winappdriver", "desktop.click", "Uses WinAppDriver element lookup and click.", ("selector",)),
        ),
    ),
    "form.fill": IntentDefinition(
        intent_id="form.fill",
        label="Fill field",
        category="interaction",
        description="Enter text into a field or control.",
        mappings=_mappings(
            PlatformMapping("supported", "playwright-web", "web.fill", "Uses selector plus value.", ("selector", "value")),
            PlatformMapping("supported", "appium-android", "mobile.type_text", "Uses Appium send keys.", ("selector", "value")),
            PlatformMapping("supported", "appium-ios", "mobile.type_text", "Uses Appium send keys.", ("selector", "value")),
            PlatformMapping("supported", "winappdriver", "desktop.type_text", "Uses WinAppDriver send keys.", ("selector", "value")),
        ),
    ),
    "ui.assert_text": IntentDefinition(
        intent_id="ui.assert_text",
        label="Assert visible text",
        category="assertion",
        description="Verify that expected text appears in the active interface.",
        mappings=_mappings(
            PlatformMapping("supported", "playwright-web", "web.assert_text", "Uses selector, expected text, and match mode.", ("selector", "expected")),
            PlatformMapping("supported", "appium-android", "mobile.assert_text", "Reads Appium element text.", ("selector", "expected")),
            PlatformMapping("supported", "appium-ios", "mobile.assert_text", "Reads Appium element text.", ("selector", "expected")),
            PlatformMapping("supported", "winappdriver", "desktop.assert_text", "Reads WinAppDriver element text.", ("selector", "expected")),
        ),
    ),
    "data.extract": IntentDefinition(
        intent_id="data.extract",
        label="Extract data",
        category="data",
        description="Capture a value from the current response or interface into execution context.",
        mappings=_mappings(
            PlatformMapping("supported", "playwright-web", "web.extract_text", "Extracts DOM text into a variable.", ("selector", "variable")),
            PlatformMapping("supported", "appium-android", "mobile.extract_text", "Extracts Android element text into a variable.", ("selector", "variable")),
            PlatformMapping("supported", "appium-ios", "mobile.extract_text", "Extracts iOS element text into a variable.", ("selector", "variable")),
            PlatformMapping("supported", "winappdriver", "desktop.extract_text", "Extracts desktop control text into a variable.", ("selector", "variable")),
        ),
    ),
    "evidence.screenshot": IntentDefinition(
        intent_id="evidence.screenshot",
        label="Capture screenshot",
        category="evidence",
        description="Attach a screenshot artifact to the execution timeline.",
        mappings=_mappings(
            PlatformMapping("supported", "playwright-web", "web.screenshot", "Captures browser viewport or full page.", ()),
            PlatformMapping("supported", "appium-android", "mobile.screenshot", "Captures current Android device screen.", ()),
            PlatformMapping("supported", "appium-ios", "mobile.screenshot", "Captures current iOS device screen.", ()),
            PlatformMapping("supported", "winappdriver", "desktop.screenshot", "Captures current desktop session screen.", ()),
        ),
    ),
    "api.request": IntentDefinition(
        intent_id="api.request",
        label="Run API request",
        category="service",
        description="Execute an HTTP request as part of the business flow.",
        mappings=_mappings(
            PlatformMapping("supported", "api-httpx", "api.request", "Runs through the API execution plugin.", ("url",)),
            PlatformMapping("unsupported", "appium-android", None, "API requests are platform-independent service steps, not mobile UI actions.", ()),
            PlatformMapping("unsupported", "appium-ios", None, "API requests are platform-independent service steps, not mobile UI actions.", ()),
            PlatformMapping("unsupported", "winappdriver", None, "API requests are platform-independent service steps, not desktop UI actions.", ()),
        ),
    ),
}


def list_intents() -> list[dict[str, Any]]:
    return [intent.to_dict() for intent in INTENT_REGISTRY.values()]


def build_capability_matrix() -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for intent in INTENT_REGISTRY.values():
        row: dict[str, Any] = {
            "intent": intent.intent_id,
            "feature": intent.label,
            "category": intent.category,
            "description": intent.description,
        }
        for platform in PLATFORM_KEYS:
            mapping = intent.mappings[platform]
            row[platform] = mapping.status
            row[f"{platform}_reason"] = mapping.reason
            row[f"{platform}_adapter"] = mapping.adapter
            row[f"{platform}_node_type"] = mapping.node_type
        rows.append(row)
    return {"platforms": list(PLATFORM_KEYS), "capabilities": rows}


def _missing_required_params(mapping: PlatformMapping, params: dict[str, Any]) -> list[str]:
    return [name for name in mapping.required_params if params.get(name) in (None, "")]


def compile_intent_plan(platform: str, steps: list[dict[str, Any]]) -> dict[str, Any]:
    if platform not in PLATFORM_KEYS:
        return {
            "valid": False,
            "platform": platform,
            "compiled_nodes": [],
            "unsupported": [{"step_index": None, "intent": None, "reason": f"Unknown platform '{platform}'."}],
            "partial": [],
            "missing_params": [],
        }

    compiled_nodes: list[dict[str, Any]] = []
    unsupported: list[dict[str, Any]] = []
    partial: list[dict[str, Any]] = []
    missing_params: list[dict[str, Any]] = []

    for index, step in enumerate(steps, start=1):
        intent_id = str(step.get("intent") or "")
        params = dict(step.get("params") or {})
        intent = INTENT_REGISTRY.get(intent_id)
        if intent is None:
            unsupported.append({"step_index": index, "intent": intent_id, "reason": "Intent is not registered."})
            continue

        mapping = intent.mappings[platform]  # type: ignore[index]
        missing = _missing_required_params(mapping, params)
        if missing:
            missing_params.append({"step_index": index, "intent": intent_id, "params": missing})

        if mapping.status == "unsupported":
            unsupported.append({"step_index": index, "intent": intent_id, "reason": mapping.reason})
            continue

        if mapping.status == "partial":
            partial.append({"step_index": index, "intent": intent_id, "reason": mapping.reason})
            continue

        if mapping.node_type:
            node_config = dict(params)
            if platform in {"android", "ios"}:
                node_config.setdefault("platform", platform)
            compiled_nodes.append(
                {
                    "node_key": f"intent_{index}",
                    "type": mapping.node_type,
                    "label": step.get("label") or intent.label,
                    "description": intent.description,
                    "config": node_config,
                    "intent": intent_id,
                    "adapter": mapping.adapter,
                }
            )

    return {
        "valid": not unsupported and not partial and not missing_params,
        "platform": platform,
        "compiled_nodes": compiled_nodes,
        "unsupported": unsupported,
        "partial": partial,
        "missing_params": missing_params,
    }
