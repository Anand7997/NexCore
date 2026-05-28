"""Desktop recorder compilation utilities."""
from __future__ import annotations

import re
from typing import Any


ACTION_ALIASES = {
    "click": "click",
    "left_click": "click",
    "doubleclick": "double_click",
    "double_click": "double_click",
    "rightclick": "right_click",
    "right_click": "right_click",
    "context_click": "right_click",
    "hover": "hover",
    "type": "type_text",
    "input": "type_text",
    "type_text": "type_text",
    "set_text": "type_text",
    "clear": "clear",
    "select": "select",
    "check": "check",
    "uncheck": "uncheck",
    "press": "press_key",
    "press_key": "press_key",
    "hotkey": "hotkey",
    "shortcut": "hotkey",
    "assert_text": "assert_text",
    "verify_text": "assert_text",
    "assert_property": "assert_property",
    "verify_property": "assert_property",
    "extract_text": "extract_text",
    "extract_property": "extract_property",
}

NODE_TYPES = {
    "click": "desktop.click",
    "double_click": "desktop.double_click",
    "right_click": "desktop.right_click",
    "hover": "desktop.hover",
    "type_text": "desktop.type_text",
    "clear": "desktop.clear",
    "select": "desktop.select",
    "check": "desktop.check",
    "uncheck": "desktop.uncheck",
    "press_key": "desktop.press_key",
    "hotkey": "desktop.hotkey",
    "assert_text": "desktop.assert_text",
    "assert_property": "desktop.assert_property",
    "extract_text": "desktop.extract_text",
    "extract_property": "desktop.extract_property",
}

FORM_OPERATIONS = {"type_text", "select", "check", "uncheck", "clear"}
VERIFY_OPERATIONS = {"assert_text", "assert_property", "extract_text", "extract_property"}
SUBMIT_TOKENS = {
    "add",
    "apply",
    "continue",
    "create",
    "finish",
    "login",
    "next",
    "ok",
    "save",
    "search",
    "sign_in",
    "signin",
    "submit",
    "update",
}
USERNAME_TOKENS = {"email", "login", "user", "username"}
PASSWORD_TOKENS = {"pass", "password", "pwd"}


def normalize_recorded_action(action_type: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", str(action_type or "").strip().lower()).strip("_")
    return ACTION_ALIASES.get(key, key or "click")


def _get(action: Any, key: str, default: Any = "") -> Any:
    if isinstance(action, dict):
        return action.get(key, default)
    return getattr(action, key, default)


def _slug(value: str, fallback: str = "component") -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")
    return slug or fallback


def _tokens(value: str) -> set[str]:
    normalized = _slug(value)
    parts = set(normalized.split("_")) if normalized else set()
    parts.add(normalized)
    return {part for part in parts if part}


def _keyword_object(compiled_item: dict[str, Any]) -> str:
    return str(compiled_item.get("keyword", {}).get("object") or "")


def _keyword_operation(compiled_item: dict[str, Any]) -> str:
    return str(compiled_item.get("keyword", {}).get("operation") or "")


def _step_number(compiled_item: dict[str, Any]) -> int:
    return int(compiled_item.get("keyword", {}).get("step") or 0)


def _locator(action: Any) -> tuple[str, str]:
    strategy = str(_get(action, "locator_strategy", "") or "").strip().lower()
    automation_id = str(_get(action, "automation_id", "") or "").strip()
    name_text = str(_get(action, "name_text", "") or _get(action, "object_name", "") or "").strip()
    uia_path = str(_get(action, "uia_path", "") or "").strip()
    class_name = str(_get(action, "class_name", "") or "").strip()
    if automation_id:
        return "accessibility id", automation_id
    if strategy and str(_get(action, "value", "") or "").strip() and strategy in {"ocr", "visual"}:
        return strategy, str(_get(action, "value", "") or "").strip()
    if name_text:
        return "name", name_text
    if uia_path:
        return "xpath", uia_path
    if class_name:
        return "class name", class_name
    return strategy or "name", str(_get(action, "object_key", "") or _get(action, "object_name", "") or "").strip()


def _locator_candidates(action: Any) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add(strategy: str, locator: str, reason: str, score: float = 1.0) -> None:
        value = str(locator or "").strip()
        if not value:
            return
        key = (strategy.lower(), value)
        if key in seen:
            return
        seen.add(key)
        candidates.append({
            "strategy": strategy,
            "locator": value,
            "verified": False,
            "element_count": 0,
            "score": score,
            "reason": reason,
        })

    for item in _get(action, "locators", []) or []:
        if isinstance(item, dict):
            add(
                str(item.get("strategy") or ""),
                str(item.get("locator") or item.get("selector") or item.get("value") or ""),
                str(item.get("reason") or "Recorded locator candidate"),
                float(item.get("score") or item.get("confidence") or 1.0),
            )
    add("accessibility id", _get(action, "automation_id", ""), "Recorded Automation ID", 1.0)
    add("name", _get(action, "name_text", "") or _get(action, "object_name", ""), "Recorded name/text", 0.86)
    add("xpath", _get(action, "uia_path", ""), "Recorded UIA path", 0.74)
    add("class name", _get(action, "class_name", ""), "Recorded class name", 0.56)
    return candidates


def compile_recorded_action(action: Any, index: int) -> dict[str, Any]:
    operation = normalize_recorded_action(_get(action, "action_type", "click"))
    node_type = NODE_TYPES.get(operation, "desktop.click")
    strategy, selector = _locator(action)
    value = str(_get(action, "value", "") or "")
    expected = str(_get(action, "expected", "") or value)
    property_name = str(_get(action, "property_name", "") or _get(action, "property", "") or "")
    variable = str(_get(action, "variable", "") or "")
    object_name = str(_get(action, "object_name", "") or _get(action, "object_key", "") or selector or "Desktop Object")

    config: dict[str, Any] = {
        "selector": selector,
        "strategy": strategy,
        "timeout_ms": 15000,
        "locators": _locator_candidates(action),
        "object_key": str(_get(action, "object_key", "") or ""),
    }
    if operation in {"type_text", "select"}:
        config["value"] = value
    if operation == "press_key":
        config = {"key": value or str(_get(action, "key", "") or "")}
    if operation == "hotkey":
        keys = value or str(_get(action, "keys", "") or "")
        config = {"keys": [part.strip() for part in keys.replace("+", ",").split(",") if part.strip()]}
    if operation == "assert_text":
        config.update({"expected": expected, "match": "contains"})
    if operation == "assert_property":
        config.update({"property": property_name or "name", "expected": expected, "match": "contains"})
    if operation == "extract_text":
        config["variable"] = variable or f"recorded_text_{index}"
    if operation == "extract_property":
        config.update({"property": property_name or "name", "variable": variable or f"recorded_property_{index}"})

    keyword = {
        "step": index,
        "object": object_name,
        "operation": operation,
        "value": value,
        "assignment": variable,
        "checkpoint": expected if operation.startswith("assert_") else "",
        "comment": str(_get(action, "window_title", "") or _get(action, "screen", "") or ""),
        "node_type": node_type,
    }
    node = {
        "node_key": f"recorded_step_{index}",
        "type": node_type,
        "label": f"{operation.replace('_', ' ').title()} - {object_name}",
        "description": "Generated from desktop recorder action.",
        "config": config,
        "position": {"x": 120 + ((index - 1) * 220), "y": 120},
    }
    repository_suggestion = {
        "object_key": str(_get(action, "object_key", "") or re.sub(r"[^a-z0-9]+", "_", object_name.lower()).strip("_")),
        "name": object_name,
        "control_type": str(_get(action, "control_type", "") or "element"),
        "automation_id": str(_get(action, "automation_id", "") or ""),
        "name_text": str(_get(action, "name_text", "") or object_name),
        "class_name": str(_get(action, "class_name", "") or ""),
        "uia_path": str(_get(action, "uia_path", "") or ""),
        "locator_strategy": strategy,
        "primary_locator": selector,
        "alternative_locators": config.get("locators", []),
        "window": str(_get(action, "window_title", "") or ""),
        "screen": str(_get(action, "screen", "") or ""),
    }
    return {"keyword": keyword, "node": node, "repository_suggestion": repository_suggestion}


def _component_edges(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "source_key": nodes[index]["node_key"],
            "target_key": nodes[index + 1]["node_key"],
            "execution_order": index + 1,
        }
        for index in range(len(nodes) - 1)
    ]


def _component_suggestion(
    *,
    name: str,
    reason: str,
    component_type: str,
    confidence: float,
    items: list[dict[str, Any]],
    tags: list[str],
) -> dict[str, Any]:
    keyword_steps = [item["keyword"] for item in items]
    nodes = [item["node"] for item in items]
    objects = []
    seen_objects: set[str] = set()
    for item in items:
        object_name = _keyword_object(item)
        if object_name and object_name not in seen_objects:
            seen_objects.add(object_name)
            objects.append(object_name)
    operations = [_keyword_operation(item) for item in items]
    parameter_steps = [
        {
            "name": _slug(_keyword_object(item), f"value_{_step_number(item)}"),
            "step": _step_number(item),
            "object": _keyword_object(item),
            "operation": _keyword_operation(item),
        }
        for item in items
        if _keyword_operation(item) in {"type_text", "select"}
    ]
    output_steps = [
        {
            "name": str(item["keyword"].get("assignment") or f"output_{_step_number(item)}"),
            "step": _step_number(item),
            "object": _keyword_object(item),
            "operation": _keyword_operation(item),
        }
        for item in items
        if _keyword_operation(item) in {"extract_text", "extract_property"}
    ]
    start_step = _step_number(items[0])
    end_step = _step_number(items[-1])
    return {
        "component_key": _slug(name, "desktop_component"),
        "name": name,
        "description": reason,
        "component_type": component_type,
        "confidence": round(confidence, 4),
        "reason": reason,
        "start_step": start_step,
        "end_step": end_step,
        "action_count": len(items),
        "objects": objects,
        "operations": operations,
        "suggested_parameters": parameter_steps,
        "suggested_outputs": output_steps,
        "tags": ["desktop", "recorded", *tags],
        "definition": {
            "platform": "desktop",
            "keyword_steps": keyword_steps,
            "nodes": nodes,
            "edges": _component_edges(nodes),
        },
    }


def suggest_reusable_components(session: Any, compiled: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find business-step-sized reusable components in a recorded desktop flow."""
    suggestions: list[dict[str, Any]] = []
    seen_spans: set[tuple[int, int, str]] = set()

    def add(kind: str, name: str, reason: str, confidence: float, items: list[dict[str, Any]], tags: list[str]) -> None:
        if len(items) < 2:
            return
        span = (_step_number(items[0]), _step_number(items[-1]), kind)
        if span in seen_spans:
            return
        seen_spans.add(span)
        suggestions.append(_component_suggestion(
            name=name,
            reason=reason,
            component_type=kind,
            confidence=confidence,
            items=items,
            tags=tags,
        ))

    if len(compiled) >= 3:
        flow_name = str(_get(session, "name", "") or "Recorded Desktop Flow").strip()
        add(
            "workflow",
            f"Reusable {flow_name}",
            "The full recording has enough stable steps to be reused as a business workflow component.",
            0.72,
            compiled,
            ["workflow"],
        )

    for index, item in enumerate(compiled):
        operation = _keyword_operation(item)
        object_tokens = _tokens(_keyword_object(item))
        if operation not in FORM_OPERATIONS or not (object_tokens & (USERNAME_TOKENS | PASSWORD_TOKENS)):
            continue
        window = compiled[index:index + 5]
        has_user = any(_tokens(_keyword_object(candidate)) & USERNAME_TOKENS for candidate in window)
        has_pass = any(_tokens(_keyword_object(candidate)) & PASSWORD_TOKENS for candidate in window)
        login_end = next(
            (
                offset
                for offset, candidate in enumerate(window)
                if _keyword_operation(candidate) in {"click", "double_click"}
                and _tokens(_keyword_object(candidate)) & {"login", "sign_in", "signin", "submit"}
            ),
            None,
        )
        if has_user and has_pass and login_end is not None:
            add(
                "action_group",
                "Login Component",
                "Detected username/password input followed by a login or submit action.",
                0.92,
                window[:login_end + 1],
                ["login", "authentication"],
            )

    index = 0
    while index < len(compiled):
        if _keyword_operation(compiled[index]) not in FORM_OPERATIONS:
            index += 1
            continue
        group: list[dict[str, Any]] = []
        cursor = index
        while cursor < len(compiled) and _keyword_operation(compiled[cursor]) in FORM_OPERATIONS:
            group.append(compiled[cursor])
            cursor += 1
        if cursor < len(compiled):
            terminator = compiled[cursor]
            terminal_tokens = _tokens(_keyword_object(terminator))
            if _keyword_operation(terminator) in {"click", "double_click"} and terminal_tokens & SUBMIT_TOKENS:
                action_name = " ".join(sorted(terminal_tokens & SUBMIT_TOKENS)).replace("_", " ").title()
                add(
                    "action_group",
                    f"{action_name or 'Submit'} Form Component",
                    "Detected data-entry steps followed by a submit/save/search style action.",
                    min(0.88, 0.68 + (len(group) * 0.05)),
                    [*group, terminator],
                    ["form", "data_entry"],
                )
                index = cursor + 1
                continue
        index += 1

    verify_group: list[dict[str, Any]] = []
    for item in compiled:
        if _keyword_operation(item) in VERIFY_OPERATIONS:
            verify_group.append(item)
            continue
        if len(verify_group) >= 2:
            add(
                "checkpoint_group",
                "Verification Component",
                "Detected adjacent assertion/extraction steps that can be reused as a checkpoint component.",
                0.82,
                verify_group,
                ["checkpoint", "verification"],
            )
        verify_group = []
    if len(verify_group) >= 2:
        add(
            "checkpoint_group",
            "Verification Component",
            "Detected adjacent assertion/extraction steps that can be reused as a checkpoint component.",
            0.82,
            verify_group,
            ["checkpoint", "verification"],
        )

    return sorted(suggestions, key=lambda item: (float(item["confidence"]), int(item["action_count"])), reverse=True)


def compile_recording(session: Any, actions: list[Any]) -> dict[str, Any]:
    sorted_actions = sorted(actions, key=lambda action: int(_get(action, "action_order", 0) or 0))
    compiled = [compile_recorded_action(action, index) for index, action in enumerate(sorted_actions, start=1)]
    nodes = [
        {
            "node_key": "desktop_launch",
            "type": "desktop.launch",
            "label": "Launch Desktop Application",
            "description": "Generated by desktop recorder.",
            "config": {
                "app": str(_get(session, "application_path", "") or _get(session, "application", "")),
                "driver_type": str(_get(session, "driver_type", "uia3") or "uia3"),
                "timeout_ms": 30000,
            },
            "position": {"x": 0, "y": 120},
        }
    ] if (_get(session, "application_path", "") or _get(session, "application", "")) else []
    nodes.extend(item["node"] for item in compiled)
    edges = [
        {
            "source_key": nodes[index]["node_key"],
            "target_key": nodes[index + 1]["node_key"],
            "execution_order": index + 1,
        }
        for index in range(len(nodes) - 1)
    ]
    suggestions: list[dict[str, Any]] = []
    seen_objects: set[str] = set()
    for item in compiled:
        suggestion = item["repository_suggestion"]
        key = str(suggestion.get("object_key") or suggestion.get("name") or "")
        if key and key not in seen_objects:
            seen_objects.add(key)
            suggestions.append(suggestion)
    component_suggestions = suggest_reusable_components(session, compiled)
    return {
        "session_id": str(_get(session, "id", "") or ""),
        "name": str(_get(session, "name", "Desktop Recording") or "Desktop Recording"),
        "platform": "desktop",
        "keyword_steps": [item["keyword"] for item in compiled],
        "workflow": {
            "name": f"{_get(session, 'name', 'Desktop Recording')} Workflow",
            "description": "Compiled from a desktop recorder session.",
            "platforms": ["desktop"],
            "nodes": nodes,
            "edges": edges,
        },
        "repository_suggestions": suggestions,
        "component_suggestions": component_suggestions,
        "summary": {
            "action_count": len(sorted_actions),
            "keyword_count": len(compiled),
            "node_count": len(nodes),
            "repository_suggestion_count": len(suggestions),
            "component_suggestion_count": len(component_suggestions),
        },
    }
