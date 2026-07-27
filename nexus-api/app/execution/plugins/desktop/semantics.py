"""Deterministic semantic analysis for desktop recorder actions.

The recorder uses this module before any AI provider is involved. It turns raw
recorded actions into stable business-intent hints that can be tested, rendered
in the UI, and safely used by the compile endpoint.
"""
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

FORM_OPERATIONS = {"type_text", "select", "check", "uncheck", "clear"}
VERIFY_OPERATIONS = {"assert_text", "assert_property", "extract_text", "extract_property"}
CLICK_OPERATIONS = {"click", "double_click", "right_click"}

USERNAME_TOKENS = {"email", "login", "user", "username"}
PASSWORD_TOKENS = {"pass", "password", "pwd"}
SUBMIT_TOKENS = {"add", "apply", "continue", "create", "finish", "login", "next", "ok", "save", "search", "sign_in", "signin", "submit", "update"}
SEARCH_TOKENS = {"search", "find", "filter", "lookup"}
EXPORT_TOKENS = {"export", "download", "print"}
DELETE_TOKENS = {"delete", "remove", "discard"}
NAVIGATION_TOKENS = {"next", "continue", "finish", "back", "previous"}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PATH_RE = re.compile(r"^([A-Za-z]:\\|\\\\|/)[^\n]+$")
DATE_RE = re.compile(r"^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$")
AMOUNT_RE = re.compile(r"^[$]?\s?\d[\d,]*(\.\d+)?$")
PHONE_RE = re.compile(r"^\+?[\d][\d\s().-]{6,}$")
ID_RE = re.compile(r"^[A-Za-z]*\d{3,}[A-Za-z0-9_-]*$")


def _get(action: Any, key: str, default: Any = "") -> Any:
    if isinstance(action, dict):
        return action.get(key, default)
    return getattr(action, key, default)


def normalize_action(action_type: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", str(action_type or "").strip().lower()).strip("_")
    return ACTION_ALIASES.get(key, key or "click")


def _slug(value: str, fallback: str = "value") -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")
    return slug or fallback


def _tokens(*values: Any) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        slug = _slug(str(value or ""), "")
        if not slug:
            continue
        tokens.add(slug)
        tokens.update(part for part in slug.split("_") if part)
    return tokens


def _object_name(action: Any, fallback: str = "Desktop object") -> str:
    for key in ("object_name", "name_text", "object_key", "control_type", "class_name"):
        text = str(_get(action, key, "") or "").strip()
        if text:
            return text
    return fallback


def _looks_sensitive(tokens: set[str]) -> bool:
    return bool(tokens & PASSWORD_TOKENS)


def classify_value(value: str, *, sensitive: bool = False) -> str:
    text = str(value or "").strip()
    if sensitive:
        return "credential"
    if not text:
        return "text"
    if EMAIL_RE.match(text):
        return "email"
    if PATH_RE.match(text):
        return "file_path"
    if DATE_RE.match(text):
        return "date"
    if AMOUNT_RE.match(text) and any(ch.isdigit() for ch in text):
        return "amount"
    if PHONE_RE.match(text) and sum(ch.isdigit() for ch in text) >= 7:
        return "phone"
    if ID_RE.match(text):
        return "id"
    return "text"


def _checkpoint_hint(step: int, object_name: str, intent: str) -> dict[str, Any] | None:
    hints = {
        "submit_login": ("desktop.assert_text", "Verify login success, dashboard, or error status.", 0.86),
        "submit_form": ("desktop.assert_text", "Verify a success/status message after submit.", 0.82),
        "run_search": ("desktop.assert_visible", "Verify search results are visible.", 0.8),
        "export_output": ("desktop.file_exists", "Verify the exported file exists.", 0.78),
        "delete_record": ("desktop.assert_text", "Verify delete confirmation or object absence.", 0.76),
        "navigate_forward": ("desktop.wait_window", "Verify the next window or screen is active.", 0.74),
    }
    if intent not in hints:
        return None
    node_type, reason, confidence = hints[intent]
    return {
        "after_step": step,
        "object": object_name,
        "semantic_intent": intent,
        "node_type": node_type,
        "reason": reason,
        "confidence": confidence,
    }


def analyze_recorded_action(
    action: Any,
    index: int = 1,
    *,
    operation: str | None = None,
    object_name: str | None = None,
    value: str | None = None,
) -> dict[str, Any]:
    """Return deterministic business semantics for one recorded action."""
    op = operation or normalize_action(str(_get(action, "action_type", "click") or "click"))
    obj = object_name or _object_name(action)
    raw_value = str(value if value is not None else _get(action, "value", "") or "")
    tokens = _tokens(
        obj,
        _get(action, "object_key", ""),
        _get(action, "name_text", ""),
        _get(action, "control_type", ""),
        _get(action, "window_title", ""),
        _get(action, "screen", ""),
    )
    sensitive = _looks_sensitive(tokens)
    category = "interaction"
    intent = "perform_action"
    business_action = op.replace("_", " ").title()
    confidence = 0.62
    signals: list[str] = []

    if op in FORM_OPERATIONS:
        category = "data_entry"
        intent = f"enter_{_slug(obj)}"
        business_action = f"Enter {obj}"
        confidence = 0.74
        signals.append("form_operation")
        if tokens & USERNAME_TOKENS:
            category = "authentication"
            intent = "enter_username"
            business_action = "Enter username"
            confidence = 0.9
            signals.append("username_field")
        if tokens & PASSWORD_TOKENS:
            category = "authentication"
            intent = "enter_password"
            business_action = "Enter password"
            confidence = 0.92
            signals.append("password_field")
        if tokens & SEARCH_TOKENS:
            category = "search"
            intent = "enter_search_criteria"
            business_action = "Enter search criteria"
            confidence = max(confidence, 0.86)
            signals.append("search_field")
    elif op in CLICK_OPERATIONS:
        category = "interaction"
        intent = f"click_{_slug(obj)}"
        business_action = f"Click {obj}"
        confidence = 0.7
        signals.append("click_operation")
        if tokens & {"login", "sign_in", "signin"}:
            category = "authentication"
            intent = "submit_login"
            business_action = "Submit login"
            confidence = 0.92
            signals.append("login_submit")
        elif tokens & SEARCH_TOKENS:
            category = "search"
            intent = "run_search"
            business_action = "Run search"
            confidence = 0.88
            signals.append("search_submit")
        elif tokens & EXPORT_TOKENS:
            category = "output"
            intent = "export_output"
            business_action = "Export output"
            confidence = 0.84
            signals.append("export_action")
        elif tokens & DELETE_TOKENS:
            category = "destructive_action"
            intent = "delete_record"
            business_action = "Delete record"
            confidence = 0.83
            signals.append("delete_action")
        elif tokens & NAVIGATION_TOKENS:
            category = "navigation"
            intent = "navigate_forward"
            business_action = "Navigate forward"
            confidence = 0.78
            signals.append("navigation_action")
        elif tokens & SUBMIT_TOKENS:
            category = "transaction"
            intent = "submit_form"
            business_action = "Submit form"
            confidence = 0.86
            signals.append("submit_action")
    elif op in VERIFY_OPERATIONS:
        category = "verification"
        if op.startswith("extract"):
            intent = f"extract_{_slug(obj)}"
            business_action = f"Extract {obj}"
            confidence = 0.82
            signals.append("extraction")
        else:
            intent = f"verify_{_slug(obj)}"
            business_action = f"Verify {obj}"
            confidence = 0.84
            signals.append("assertion")
    elif op in {"press_key", "hotkey"}:
        category = "keyboard"
        intent = "keyboard_shortcut" if op == "hotkey" else "press_key"
        business_action = "Keyboard shortcut" if op == "hotkey" else "Press key"
        confidence = 0.68
        signals.append("keyboard_operation")

    variable = _slug(obj, f"value_{index}")
    parameter = None
    if op in {"type_text", "select"} and raw_value.strip():
        data_type = classify_value(raw_value, sensitive=sensitive)
        parameter = {
            "step": index,
            "object": obj,
            "semantic_intent": intent,
            "suggested_variable": variable,
            "data_type": data_type,
            "sensitive": sensitive,
            "master_sheet_key": variable,
            "secret_key": f"secret.{variable}" if sensitive else "",
        }

    checkpoint = _checkpoint_hint(index, obj, intent)
    return {
        "step": index,
        "object": obj,
        "operation": op,
        "semantic_intent": intent,
        "business_action": business_action,
        "category": category,
        "confidence": round(confidence, 4),
        "signals": signals,
        "tokens": sorted(tokens),
        "value_type": classify_value(raw_value, sensitive=sensitive),
        "sensitive": sensitive,
        "parameter_suggestion": parameter,
        "checkpoint_suggestion": checkpoint,
    }


def summarize_semantics(semantic_steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate deterministic semantic steps into a recorder analysis report."""
    categories: dict[str, int] = {}
    intents: dict[str, int] = {}
    high_confidence = 0
    review_needed = 0
    business_flow: list[str] = []
    checkpoint_suggestions: list[dict[str, Any]] = []
    parameter_suggestions: list[dict[str, Any]] = []

    for step in semantic_steps:
        category = str(step.get("category") or "interaction")
        intent = str(step.get("semantic_intent") or "perform_action")
        categories[category] = categories.get(category, 0) + 1
        intents[intent] = intents.get(intent, 0) + 1
        confidence = float(step.get("confidence") or 0.0)
        if confidence >= 0.8:
            high_confidence += 1
        else:
            review_needed += 1
        action = str(step.get("business_action") or "").strip()
        if action:
            business_flow.append(action)
        checkpoint = step.get("checkpoint_suggestion")
        if isinstance(checkpoint, dict):
            checkpoint_suggestions.append(checkpoint)
        parameter = step.get("parameter_suggestion")
        if isinstance(parameter, dict):
            parameter_suggestions.append(parameter)

    dominant_category = ""
    if categories:
        dominant_category = sorted(categories.items(), key=lambda item: item[1], reverse=True)[0][0]
    return {
        "total_steps": len(semantic_steps),
        "dominant_category": dominant_category,
        "categories": dict(sorted(categories.items(), key=lambda item: item[0])),
        "intents": dict(sorted(intents.items(), key=lambda item: item[0])),
        "high_confidence_steps": high_confidence,
        "review_needed_steps": review_needed,
        "business_flow": business_flow,
        "checkpoint_suggestions": checkpoint_suggestions,
        "parameter_suggestions": parameter_suggestions,
    }

