"""Desktop recorder compilation utilities."""
from __future__ import annotations

import re
from pathlib import PureWindowsPath
from typing import Any

from app.execution.plugins.desktop.semantics import analyze_recorded_action, summarize_semantics


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

CUSTOM_CONTROL_ACTIONS = {
    "click": "click",
    "set_text": "set_text",
    "type_text": "set_text",
    "select": "select",
    "assert_property": "assert_property",
    "extract_property": "extract_property",
    "table_cell_action": "table_cell_action",
    "tree_action": "tree_action",
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
SEARCH_TOKENS = {"search", "find", "filter", "lookup"}
EXPORT_TOKENS = {"export", "download", "print"}
DELETE_TOKENS = {"delete", "remove", "discard"}
NAVIGATION_TOKENS = {"next", "continue", "finish"}
BAD_LAUNCH_WINDOW_TITLES = {
    "snap assist",
    "task switching",
    "program manager",
    "windows powershell",
    "powershell",
    "command prompt",
    "administrator: windows powershell",
    "administrator: command prompt",
}
PLACEHOLDER_APPLICATIONS = {"desktop app", "desktop application", "app", "application"}
LAUNCHABLE_EXTENSIONS = (".exe", ".bat", ".cmd", ".com", ".lnk", ".msc", ".ps1")

# Locator quality model (see plans/nexcore-recorder-beyond-uft.md "Locator Quality Model").
# Weights are tuned so a strong deterministic object (Automation ID + name + UIA
# hierarchy + class + window scope) clears the production-ready threshold of 0.85.
QUALITY_WEIGHTS = {
    "automation_id": 0.35,
    "stable_name": 0.20,
    "uia_hierarchy": 0.15,
    "class_control": 0.08,
    "window_scope": 0.08,
    "relative_anchor": 0.07,
    "evidence": 0.05,
    "historical": 0.05,
    "coordinate_only": -0.35,
    "placeholder_name": -0.15,
    "window_fallback": -0.20,
    "sensitive_value": -0.30,
    "duplicate_name": -0.20,
}
PRODUCTION_READY_THRESHOLD = 0.85
REVIEW_NEEDED_THRESHOLD = 0.60
# Flags that block a production_ready grade even when the numeric score is high.
BLOCKING_RISK_FLAGS = {
    "coordinate_only",
    "sensitive_value",
    "weak_virtual_object",
    "unverified_ai_locator",
}
REDACTION_MARKERS = {"[redacted]", "***", "****", "********", "redacted", "•••••"}

# Test-data classification patterns (see "Test Data Parameterization" in the plan).
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PATH_RE = re.compile(r"^([A-Za-z]:\\|\\\\|/)[^\n]+$")
DATE_RE = re.compile(r"^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$")
AMOUNT_RE = re.compile(r"^[$₹€£]?\s?\d[\d,]*(\.\d+)?$")
PHONE_RE = re.compile(r"^\+?[\d][\d\s().-]{6,}$")
ID_RE = re.compile(r"^[A-Za-z]*\d{3,}[A-Za-z0-9_-]*$")
RISK_FIXES = {
    "missing_automation_id": "Add Automation ID if the application is owned by the team.",
    "coordinate_only": "Create a virtual object with screenshot/OCR evidence or capture a stable locator.",
    "window_fallback": "Re-capture this action on the real control instead of the window shell.",
    "placeholder_name": "Rename this object; the captured name is a placeholder.",
    "missing_window_scope": "Add window/process scope so the object can be located reliably.",
    "sensitive_value": "Redact this value and map it to a secret or parameter.",
    "weak_virtual_object": "Review the virtual object and confirm its anchor/evidence.",
}
DEFAULT_LOCATOR_REASONS = {
    "accessibility id": "Automation ID is unique and stable",
    "name": "Visible control text",
    "xpath": "UIA hierarchy path",
    "class name": "Class name fallback",
    "coordinate": "Coordinate fallback — no stable locator captured",
    "ocr": "OCR text near the control",
    "visual": "Visual template match",
    "relative": "Relative anchor to a stable neighbour",
}


def normalize_recorded_action(action_type: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", str(action_type or "").strip().lower()).strip("_")
    return ACTION_ALIASES.get(key, key or "click")


def _get(action: Any, key: str, default: Any = "") -> Any:
    if isinstance(action, dict):
        return action.get(key, default)
    return getattr(action, key, default)


def _app_name(value: str) -> str:
    cleaned = str(value or "").strip().strip('"')
    if not cleaned:
        return ""
    return PureWindowsPath(cleaned).name or cleaned


def _is_bad_window_title(value: Any) -> bool:
    title = str(value or "").strip().lower()
    return not title or title in BAD_LAUNCH_WINDOW_TITLES


def _is_placeholder_name(value: Any) -> bool:
    return re.fullmatch(r"untitled\d*", str(value or "").strip().lower()) is not None


def _coordinate_locator(action: Any) -> str:
    x = _get(action, "x", None)
    y = _get(action, "y", None)
    if x is None or y is None:
        return ""
    try:
        return f"x={round(float(x))},y={round(float(y))}"
    except (TypeError, ValueError):
        return ""


def _is_launchable_app(value: Any) -> bool:
    app = str(value or "").strip().strip('"')
    if not app or app.lower() in PLACEHOLDER_APPLICATIONS:
        return False
    app_name = _app_name(app).lower()
    if app_name.endswith(LAUNCHABLE_EXTENSIONS):
        return True
    if any(separator in app for separator in ("\\", "/", ":")):
        return True
    return not any(char.isspace() for char in app)


def _launch_app(session: Any) -> str:
    for key in ("application_path", "application"):
        candidate = str(_get(session, key, "") or "").strip()
        if _is_launchable_app(candidate):
            return candidate
    return ""


def _stable_process_name(value: Any, app: Any = "") -> str:
    process_name = str(value or "").strip()
    if process_name:
        return "" if process_name.isdigit() else process_name
    app_name = _app_name(str(app or "")).strip()
    if app_name.lower().endswith(".exe"):
        return app_name
    return ""


def _launch_window_title(app: str, recorded_title: Any, application_name: Any = "") -> str:
    title = str(recorded_title or "").strip()
    if title and not _is_bad_window_title(title):
        return title
    display_name = str(application_name or "").strip()
    if (
        display_name
        and display_name.lower() not in PLACEHOLDER_APPLICATIONS
        and not _is_bad_window_title(display_name)
        and not _is_launchable_app(display_name)
    ):
        return display_name
    app_name = _app_name(app).lower()
    if app_name and _is_launchable_app(app):
        return re.sub(r"[_-]+", " ", app_name.rsplit(".", 1)[0]).title()
    return ""


def _launch_args(app: str, existing_args: Any = None) -> list[str]:
    if isinstance(existing_args, list):
        args = [str(item) for item in existing_args if str(item).strip()]
    elif isinstance(existing_args, str) and existing_args.strip():
        args = [part for part in existing_args.split() if part]
    else:
        args = []
    return args


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
    coordinate = _coordinate_locator(action)
    if automation_id:
        return "accessibility id", automation_id
    if strategy and str(_get(action, "value", "") or "").strip() and strategy in {"ocr", "visual"}:
        return strategy, str(_get(action, "value", "") or "").strip()
    if strategy == "coordinate" and coordinate:
        return "coordinate", coordinate
    if name_text and not _is_placeholder_name(name_text):
        return "name", name_text
    if uia_path:
        return "xpath", uia_path
    if class_name:
        return "class name", class_name
    if coordinate:
        return "coordinate", coordinate
    if name_text:
        return "name", name_text
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
    add("coordinate", _coordinate_locator(action), "Recorded screen coordinate fallback", 0.34)
    return candidates


def _recording_metadata(action: Any) -> dict[str, Any]:
    metadata = _get(action, "metadata", {}) or {}
    return metadata if isinstance(metadata, dict) else {}


def _analog_payload(action: Any, metadata: dict[str, Any]) -> dict[str, Any] | None:
    analog = metadata.get("analog")
    if isinstance(analog, dict) and analog:
        return analog
    coordinate = _coordinate_locator(action)
    if not coordinate:
        return None
    x = _get(action, "x", None)
    y = _get(action, "y", None)
    point = None
    try:
        if x is not None and y is not None:
            point = {"x": float(x), "y": float(y)}
    except (TypeError, ValueError):
        point = None
    return {
        "point": point,
        "relative_locator": next(
            (
                str(item.get("locator") or "")
                for item in _locator_candidates(action)
                if str(item.get("strategy") or "").lower() == "relative"
            ),
            "",
        ),
        "low_level": True,
    }


def _virtual_object_payload(
    action: Any,
    metadata: dict[str, Any],
    *,
    object_name: str,
    control_type: str,
    class_name: str,
    strategy: str,
    selector: str,
    locators: list[dict[str, Any]],
) -> dict[str, Any] | None:
    existing = metadata.get("virtual_object")
    if isinstance(existing, dict) and existing:
        virtual_object = dict(existing)
        virtual_object.setdefault("locators", locators)
        virtual_object.setdefault("primary_locator", selector)
        return virtual_object

    needs_virtual_object = (
        str(metadata.get("capture_scope") or "") == "window_fallback"
        or strategy in {"coordinate", "relative", "ocr", "visual"}
        or any(str(item.get("strategy") or "").lower() in {"coordinate", "relative", "ocr", "visual"} for item in locators)
    )
    if not needs_virtual_object:
        return None
    return {
        "name": object_name,
        "object_class": class_name or control_type or "OwnerDrawnControl",
        "control_type": control_type or "CustomControl",
        "class_name": class_name,
        "locator_strategy": strategy or "coordinate",
        "primary_locator": selector,
        "locators": locators,
        "capture_scope": metadata.get("capture_scope") or "",
    }


def _is_redacted_value(value: Any, metadata: dict[str, Any]) -> bool:
    text = str(value or "").strip().lower()
    if not text:
        return False
    if text in REDACTION_MARKERS or text.startswith("[redacted") or text.startswith("${"):
        return True
    return bool(metadata.get("redacted"))


def _looks_sensitive(*labels: str) -> bool:
    tokens: set[str] = set()
    for label in labels:
        tokens |= _tokens(label)
    return bool(tokens & PASSWORD_TOKENS)


def _grade_from_score(score: float, risk_flags: list[str], *, coordinate_only: bool, verified_fallback: bool) -> str:
    score = max(0.0, min(1.0, score))
    if coordinate_only and not verified_fallback:
        return "unstable"
    if score >= PRODUCTION_READY_THRESHOLD and not (set(risk_flags) & BLOCKING_RISK_FLAGS):
        return "production_ready"
    if score >= REVIEW_NEEDED_THRESHOLD:
        return "review_needed"
    return "unstable"


def assess_action_quality(
    action: Any,
    *,
    strategy: str,
    selector: str,
    object_name: str,
    raw_object_name: str,
    name_text: str,
    object_key: str,
    class_name: str,
    control_type: str,
    window_title: str,
    coordinate: str,
    locators: list[dict[str, Any]],
    metadata: dict[str, Any],
    virtual_object: dict[str, Any] | None,
    value: str,
) -> dict[str, Any]:
    """Score a single recorded action and return its quality diagnostics."""
    automation_id = str(_get(action, "automation_id", "") or "").strip()
    has_automation_id = bool(automation_id)
    stable_name = (bool(name_text) and not _is_placeholder_name(name_text)) or (
        bool(raw_object_name) and not _is_placeholder_name(raw_object_name)
    )
    has_uia = bool(str(_get(action, "uia_path", "") or "").strip())
    has_class_control = bool(class_name or control_type)
    has_window_scope = bool(window_title or str(_get(action, "screen", "") or "").strip())
    candidate_strategies = {str(item.get("strategy") or "").lower() for item in locators}
    has_relative_anchor = "relative" in candidate_strategies
    has_evidence = bool(
        str(_get(action, "screenshot_artifact_id", "") or "").strip()
        or str(_get(action, "ui_tree_artifact_id", "") or "").strip()
        or metadata.get("evidence")
    )
    has_history = bool(metadata.get("historical_success") or metadata.get("history"))

    coordinate_only = strategy == "coordinate" or (
        not has_automation_id and not stable_name and not has_uia and not has_class_control and bool(coordinate)
    )
    placeholder = _is_placeholder_name(raw_object_name) or _is_placeholder_name(name_text)
    window_fallback = str(metadata.get("capture_scope") or "") == "window_fallback"
    sensitive = _looks_sensitive(object_name, raw_object_name, name_text, object_key) and bool(str(value or "").strip())
    redacted = _is_redacted_value(value, metadata)
    sensitive_unredacted = sensitive and not redacted
    # A virtual/analog object with no deterministic fallback is a weak capture.
    weak_virtual_object = bool(virtual_object) and not (has_automation_id or stable_name or has_uia)
    verified_fallback = any(
        bool(item.get("verified")) and str(item.get("strategy") or "").lower() in {"visual", "ocr", "relative"}
        for item in locators
    )

    score = 0.0
    if has_automation_id:
        score += QUALITY_WEIGHTS["automation_id"]
    if stable_name:
        score += QUALITY_WEIGHTS["stable_name"]
    if has_uia:
        score += QUALITY_WEIGHTS["uia_hierarchy"]
    if has_class_control:
        score += QUALITY_WEIGHTS["class_control"]
    if has_window_scope:
        score += QUALITY_WEIGHTS["window_scope"]
    if has_relative_anchor:
        score += QUALITY_WEIGHTS["relative_anchor"]
    if has_evidence:
        score += QUALITY_WEIGHTS["evidence"]
    if has_history:
        score += QUALITY_WEIGHTS["historical"]
    if coordinate_only:
        score += QUALITY_WEIGHTS["coordinate_only"]
    if placeholder:
        score += QUALITY_WEIGHTS["placeholder_name"]
    if window_fallback:
        score += QUALITY_WEIGHTS["window_fallback"]
    if sensitive_unredacted:
        score += QUALITY_WEIGHTS["sensitive_value"]

    risk_flags: list[str] = []
    if coordinate_only:
        risk_flags.append("coordinate_only")
    if window_fallback:
        risk_flags.append("window_fallback")
    if placeholder:
        risk_flags.append("placeholder_name")
    if not has_automation_id:
        risk_flags.append("missing_automation_id")
    if not has_window_scope:
        risk_flags.append("missing_window_scope")
    if sensitive_unredacted:
        risk_flags.append("sensitive_value")
    if weak_virtual_object:
        risk_flags.append("weak_virtual_object")

    fixes = [RISK_FIXES[flag] for flag in risk_flags if flag in RISK_FIXES]
    grade = _grade_from_score(
        score,
        risk_flags,
        coordinate_only=coordinate_only,
        verified_fallback=verified_fallback,
    )
    return {
        "score": round(max(0.0, min(1.0, score)), 4),
        "grade": grade,
        "risk_flags": risk_flags,
        "fixes": fixes,
    }


def _selected_locator_reason(strategy: str, selector: str, locators: list[dict[str, Any]]) -> str:
    strategy_norm = str(strategy or "").strip().lower()
    for item in locators:
        if str(item.get("strategy") or "").strip().lower() == strategy_norm and str(item.get("locator") or "") == selector:
            reason = str(item.get("reason") or "").strip()
            if reason:
                return reason
    return DEFAULT_LOCATOR_REASONS.get(strategy_norm, "Recorded locator")


def _evidence_payload(
    action: Any,
    metadata: dict[str, Any],
    *,
    strategy: str,
    selector: str,
    locators: list[dict[str, Any]],
    window_title: str,
    virtual_object: dict[str, Any] | None,
) -> dict[str, Any]:
    screenshot_id = str(_get(action, "screenshot_artifact_id", "") or "").strip()
    ui_tree_id = str(_get(action, "ui_tree_artifact_id", "") or "").strip()
    crop_id = str(metadata.get("crop_artifact_id") or (virtual_object or {}).get("crop_artifact_id") or "").strip()
    duration = _get(action, "duration_ms", None)
    return {
        "screenshot_artifact_id": screenshot_id,
        "ui_tree_artifact_id": ui_tree_id,
        "virtual_crop_artifact_id": crop_id,
        "selected_locator_reason": _selected_locator_reason(strategy, selector, locators),
        "selected_locator": selector,
        "selected_strategy": strategy,
        "has_screenshot": bool(screenshot_id),
        "has_ui_tree": bool(ui_tree_id),
        "has_evidence": bool(screenshot_id or ui_tree_id or crop_id),
        "window_title": window_title,
        "process_name": str(metadata.get("process_name") or metadata.get("process") or "").strip(),
        "duration_ms": duration if isinstance(duration, (int, float)) else None,
        "locator_candidate_count": len(locators),
        "locators": locators,
    }


def compile_recorded_action(action: Any, index: int) -> dict[str, Any]:
    operation = normalize_recorded_action(_get(action, "action_type", "click"))
    strategy, selector = _locator(action)
    value = str(_get(action, "value", "") or "")
    expected = str(_get(action, "expected", "") or value)
    property_name = str(_get(action, "property_name", "") or _get(action, "property", "") or "")
    variable = str(_get(action, "variable", "") or "")
    raw_object_name = str(_get(action, "object_name", "") or "").strip()
    name_text = str(_get(action, "name_text", "") or "").strip()
    object_key = str(_get(action, "object_key", "") or "").strip()
    control_type = str(_get(action, "control_type", "") or "").strip()
    class_name = str(_get(action, "class_name", "") or "").strip()
    coordinate = _coordinate_locator(action)
    if raw_object_name and not _is_placeholder_name(raw_object_name):
        object_name = raw_object_name
    elif name_text and not _is_placeholder_name(name_text):
        object_name = name_text
    elif object_key and not _is_placeholder_name(object_key):
        object_name = object_key
    elif control_type and class_name:
        object_name = f"{control_type} / {class_name}"
    else:
        object_name = (
            control_type
            or class_name
            or (f"Desktop Object @ {coordinate}" if coordinate else "")
            or raw_object_name
            or object_key
            or selector
            or "Desktop Object"
        )

    window_title = str(_get(action, "window_title", "") or "").strip()
    metadata = _recording_metadata(action)
    locators = _locator_candidates(action)
    analog = _analog_payload(action, metadata)
    virtual_object = _virtual_object_payload(
        action,
        metadata,
        object_name=object_name,
        control_type=control_type,
        class_name=class_name,
        strategy=strategy,
        selector=selector,
        locators=locators,
    )
    quality = assess_action_quality(
        action,
        strategy=strategy,
        selector=selector,
        object_name=object_name,
        raw_object_name=raw_object_name,
        name_text=name_text,
        object_key=object_key,
        class_name=class_name,
        control_type=control_type,
        window_title=window_title,
        coordinate=coordinate,
        locators=locators,
        metadata=metadata,
        virtual_object=virtual_object,
        value=value,
    )
    evidence = _evidence_payload(
        action,
        metadata,
        strategy=strategy,
        selector=selector,
        locators=locators,
        window_title=window_title,
        virtual_object=virtual_object,
    )

    semantic = analyze_recorded_action(
        action,
        index,
        operation=operation,
        object_name=object_name,
        value=value,
    )

    node_type = NODE_TYPES.get(operation, "desktop.click")
    config: dict[str, Any] = {
        "selector": selector,
        "strategy": strategy,
        "timeout_ms": 15000,
        "locators": locators,
        "object_key": object_key,
    }
    x = _get(action, "x", None)
    y = _get(action, "y", None)
    if x is not None and y is not None:
        config["x"] = x
        config["y"] = y
        config["coordinate_fallback"] = True
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
    if metadata.get("recording_mode"):
        config["recording_mode"] = str(metadata.get("recording_mode") or "")
    if analog:
        config["analog"] = analog
    if virtual_object:
        config["virtual_object"] = virtual_object
        custom_action = CUSTOM_CONTROL_ACTIONS.get(operation)
        if custom_action:
            node_type = "desktop.custom_control_action"
            config["extension_pack"] = "custom_control"
            config["object_class"] = str(
                virtual_object.get("object_class")
                or control_type
                or class_name
                or "OwnerDrawnControl"
            )
            config["action"] = custom_action

    keyword = {
        "step": index,
        "object": object_name,
        "operation": operation,
        "value": value,
        "assignment": variable,
        "checkpoint": expected if operation.startswith("assert_") else "",
        "comment": str(_get(action, "window_title", "") or _get(action, "screen", "") or ""),
        "node_type": node_type,
        "quality_grade": quality["grade"],
        "quality_score": quality["score"],
        "screenshot_artifact_id": evidence["screenshot_artifact_id"],
        "ui_tree_artifact_id": evidence["ui_tree_artifact_id"],
        "selected_locator_reason": evidence["selected_locator_reason"],
        "semantic_intent": semantic["semantic_intent"],
        "business_action": semantic["business_action"],
        "semantic_category": semantic["category"],
        "semantic_confidence": semantic["confidence"],
    }
    node = {
        "node_key": f"recorded_step_{index}",
        "type": node_type,
        "label": f"{operation.replace('_', ' ').title()} - {object_name}",
        "description": "Generated from desktop recorder action.",
        "config": config,
        "position": {"x": 120 + ((index - 1) * 220), "y": 120},
        "quality": quality,
        "evidence": evidence,
        "semantic": semantic,
    }
    repository_suggestion = {
        "object_key": object_key or re.sub(r"[^a-z0-9]+", "_", object_name.lower()).strip("_"),
        "name": object_name,
        "control_type": control_type or "element",
        "automation_id": str(_get(action, "automation_id", "") or ""),
        "name_text": "" if _is_placeholder_name(name_text) else (name_text or object_name),
        "class_name": class_name,
        "uia_path": str(_get(action, "uia_path", "") or ""),
        "locator_strategy": strategy,
        "primary_locator": selector,
        "alternative_locators": locators,
        "window": str(_get(action, "window_title", "") or ""),
        "screen": str(_get(action, "screen", "") or ""),
        "metadata": {
            "recording_mode": metadata.get("recording_mode") or "",
            "analog": analog or {},
            "virtual_object": virtual_object or {},
            "semantic": semantic,
        },
        "quality": quality,
    }
    return {
        "keyword": keyword,
        "node": node,
        "repository_suggestion": repository_suggestion,
        "quality": quality,
        "evidence": evidence,
        "semantic": semantic,
    }


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


def build_quality_report(compiled: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate per-step quality into a compile-level recorder quality report."""
    qualities = [item["quality"] for item in compiled if isinstance(item.get("quality"), dict)]
    grade_counts = {"production_ready": 0, "review_needed": 0, "unstable": 0}
    risk_summary: dict[str, int] = {}
    fix_counts: dict[str, int] = {}
    total_score = 0.0
    for quality in qualities:
        grade = str(quality.get("grade") or "unstable")
        grade_counts[grade] = grade_counts.get(grade, 0) + 1
        total_score += float(quality.get("score") or 0.0)
        for flag in quality.get("risk_flags") or []:
            risk_summary[flag] = risk_summary.get(flag, 0) + 1
        for fix in quality.get("fixes") or []:
            fix_counts[fix] = fix_counts.get(fix, 0) + 1

    score = round(total_score / len(qualities), 4) if qualities else 0.0
    unstable = grade_counts["unstable"]
    if not qualities:
        grade = "unstable"
    elif unstable > 0:
        grade = "unstable"
    elif score >= PRODUCTION_READY_THRESHOLD:
        grade = "production_ready"
    elif score >= REVIEW_NEEDED_THRESHOLD:
        grade = "review_needed"
    else:
        grade = "unstable"

    top_fixes = [fix for fix, _ in sorted(fix_counts.items(), key=lambda item: item[1], reverse=True)][:5]
    return {
        "score": score,
        "grade": grade,
        "production_ready_steps": grade_counts["production_ready"],
        "review_needed_steps": grade_counts["review_needed"],
        "unstable_steps": grade_counts["unstable"],
        "risk_summary": dict(sorted(risk_summary.items(), key=lambda item: item[1], reverse=True)),
        "top_fixes": top_fixes,
    }


def _checkpoint_suggestion(
    *,
    after_step: int,
    object_name: str,
    operation: str,
    node_type: str,
    reason: str,
    confidence: float,
    expected: str = "",
) -> dict[str, Any]:
    return {
        "after_step": after_step,
        "object": object_name,
        "operation": operation,
        "node_type": node_type,
        "reason": reason,
        "confidence": round(confidence, 4),
        "checkpoint": {
            "object": object_name,
            "operation": operation,
            "node_type": node_type,
            "expected": expected,
        },
    }


def suggest_checkpoints(compiled: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Recommend assertions after submit/search/export/delete/extraction steps."""
    suggestions: list[dict[str, Any]] = []
    for index, item in enumerate(compiled):
        operation = _keyword_operation(item)
        object_name = _keyword_object(item)
        tokens = _tokens(object_name)
        step = _step_number(item)
        next_item = compiled[index + 1] if index + 1 < len(compiled) else None
        next_is_check = bool(next_item and _keyword_operation(next_item) in VERIFY_OPERATIONS)

        if operation in {"click", "double_click"} and not next_is_check:
            if tokens & SEARCH_TOKENS:
                suggestions.append(_checkpoint_suggestion(
                    after_step=step, object_name=object_name, operation="assert_visible",
                    node_type="desktop.assert_visible",
                    reason="Verify search results are visible after searching.", confidence=0.8,
                ))
            elif tokens & EXPORT_TOKENS:
                suggestions.append(_checkpoint_suggestion(
                    after_step=step, object_name=object_name, operation="file_exists",
                    node_type="desktop.file_exists",
                    reason="Verify the exported/printed file exists.", confidence=0.78,
                ))
            elif tokens & DELETE_TOKENS:
                suggestions.append(_checkpoint_suggestion(
                    after_step=step, object_name=object_name, operation="assert_text",
                    node_type="desktop.assert_text",
                    reason="Verify a delete confirmation or that the item is gone.", confidence=0.75,
                ))
            elif tokens & NAVIGATION_TOKENS:
                suggestions.append(_checkpoint_suggestion(
                    after_step=step, object_name=object_name, operation="wait_window",
                    node_type="desktop.wait_window",
                    reason="Verify the expected window/screen is active after navigation.", confidence=0.74,
                ))
            elif tokens & SUBMIT_TOKENS:
                label = " ".join(sorted(tokens & SUBMIT_TOKENS)).replace("_", " ")
                suggestions.append(_checkpoint_suggestion(
                    after_step=step, object_name=object_name, operation="assert_text",
                    node_type="desktop.assert_text",
                    reason=f"Verify a success or status message after {label}.", confidence=0.82,
                ))
        elif operation in {"extract_text", "extract_property"}:
            suggestions.append(_checkpoint_suggestion(
                after_step=step, object_name=object_name, operation="assert_property",
                node_type="desktop.assert_property",
                reason="Verify the extracted value is not empty.", confidence=0.68,
            ))
    return suggestions


def _classify_value(value: str, sensitive: bool) -> str:
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


def suggest_parameters(compiled: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Detect typed/selected values that should become reusable test-data parameters."""
    suggestions: list[dict[str, Any]] = []
    for item in compiled:
        operation = _keyword_operation(item)
        if operation not in {"type_text", "select"}:
            continue
        value = str(item["keyword"].get("value") or "")
        if not value.strip():
            continue
        object_name = _keyword_object(item)
        step = _step_number(item)
        risk_flags = (item.get("quality") or {}).get("risk_flags") or []
        sensitive = "sensitive_value" in risk_flags or _looks_sensitive(object_name)
        data_type = _classify_value(value, sensitive)
        variable = _slug(object_name, f"value_{step}")
        suggestion: dict[str, Any] = {
            "step": step,
            "object": object_name,
            "operation": operation,
            "data_type": data_type,
            "sensitive": sensitive,
            "suggested_variable": variable,
            "master_sheet_key": variable,
            "value": "" if sensitive else value,
            "default_value": "" if sensitive else value,
            "example": "" if sensitive else value,
        }
        if sensitive:
            suggestion["secret_key"] = f"secret.{variable}"
        suggestions.append(suggestion)
    return suggestions


def assess_execution_readiness(
    compiled: list[dict[str, Any]],
    *,
    has_app_scope: bool,
    checkpoint_suggestions: list[dict[str, Any]],
) -> dict[str, Any]:
    """Decide whether a compiled recording is safe to run unattended."""
    blocking: list[str] = []
    warnings: list[str] = []
    if not compiled:
        blocking.append("No recorded steps to execute.")
    if compiled and not has_app_scope:
        blocking.append("No launch or attach scope for the application.")
    for item in compiled:
        step = _step_number(item)
        quality = item.get("quality") or {}
        flags = quality.get("risk_flags") or []
        config = item["node"].get("config") or {}
        selector = str(config.get("selector") or "")
        object_key = str(config.get("object_key") or "")
        if quality.get("grade") == "unstable":
            blocking.append(f"Step {step} is unstable and needs a reliable locator.")
        elif quality.get("grade") == "review_needed":
            warnings.append(f"Step {step} needs review before unattended runs.")
        if "sensitive_value" in flags:
            blocking.append(f"Step {step} has an unredacted sensitive value.")
        if not selector and not object_key and item["node"].get("type") != "desktop.custom_control_action":
            blocking.append(f"Step {step} has no selector or object key.")
    if checkpoint_suggestions:
        warnings.append(f"{len(checkpoint_suggestions)} checkpoint(s) suggested but not yet added.")
    return {
        "can_run_unattended": not blocking,
        "blocking_issues": blocking,
        "warnings": warnings,
    }


def build_evidence_summary(compiled: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate per-step evidence coverage for the recorder evidence trace."""
    total = len(compiled)
    with_screenshot = 0
    with_ui_tree = 0
    without_evidence = 0
    for item in compiled:
        evidence = item.get("evidence") or {}
        if evidence.get("has_screenshot"):
            with_screenshot += 1
        if evidence.get("has_ui_tree"):
            with_ui_tree += 1
        if not evidence.get("has_evidence"):
            without_evidence += 1
    return {
        "total_steps": total,
        "steps_with_screenshot": with_screenshot,
        "steps_with_ui_tree": with_ui_tree,
        "steps_without_evidence": without_evidence,
    }



def build_evidence_steps(compiled: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return drawer-ready evidence rows for compiled recorder steps."""
    steps: list[dict[str, Any]] = []
    for item in compiled:
        keyword = item.get("keyword") or {}
        evidence = item.get("evidence") or {}
        quality = item.get("quality") or {}
        semantic = item.get("semantic") or {}
        node = item.get("node") or {}
        config = node.get("config") or {}
        steps.append({
            "step": int(keyword.get("step") or 0),
            "object": str(keyword.get("object") or ""),
            "operation": str(keyword.get("operation") or ""),
            "node_type": str(keyword.get("node_type") or node.get("type") or ""),
            "quality_grade": str(quality.get("grade") or ""),
            "quality_score": quality.get("score"),
            "semantic_intent": str(semantic.get("semantic_intent") or ""),
            "business_action": str(semantic.get("business_action") or ""),
            "semantic_category": str(semantic.get("category") or ""),
            "screenshot_artifact_id": str(evidence.get("screenshot_artifact_id") or ""),
            "ui_tree_artifact_id": str(evidence.get("ui_tree_artifact_id") or ""),
            "virtual_crop_artifact_id": str(evidence.get("virtual_crop_artifact_id") or ""),
            "has_evidence": bool(evidence.get("has_evidence")),
            "selected_locator_reason": str(evidence.get("selected_locator_reason") or ""),
            "selected_locator": str(evidence.get("selected_locator") or config.get("selector") or ""),
            "selected_strategy": str(evidence.get("selected_strategy") or config.get("strategy") or ""),
            "locator_candidate_count": int(evidence.get("locator_candidate_count") or 0),
            "locators": evidence.get("locators") or config.get("locators") or [],
            "window_title": str(evidence.get("window_title") or ""),
            "process_name": str(evidence.get("process_name") or ""),
            "duration_ms": evidence.get("duration_ms"),
            "x": config.get("x"),
            "y": config.get("y"),
        })
    return steps

def _norm(value: Any) -> str:
    return str(value or "").strip().lower()


def _best_repo_match(suggestion: dict[str, Any], existing_objects: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, float]:
    s_key = _norm(suggestion.get("object_key"))
    s_aid = _norm(suggestion.get("automation_id"))
    s_name = _norm(suggestion.get("name"))
    s_class = _norm(suggestion.get("class_name"))
    s_uia = _norm(suggestion.get("uia_path"))
    s_loc = _norm(suggestion.get("primary_locator"))
    best: dict[str, Any] | None = None
    best_score = 0.0
    for obj in existing_objects:
        score = 0.0
        if s_aid and s_aid == _norm(obj.get("automation_id")):
            score += 0.6
        if s_key and s_key == _norm(obj.get("object_key")):
            score += 0.5
        if s_name and s_name == _norm(obj.get("name")):
            score += 0.2
        if s_uia and s_uia == _norm(obj.get("uia_path")):
            score += 0.15
        if s_class and s_class == _norm(obj.get("class_name")):
            score += 0.1
        if s_loc and s_loc == _norm(obj.get("primary_locator")):
            score += 0.2
        if score > best_score:
            best_score = score
            best = obj
    return best, min(best_score, 1.0)


def _repo_match_level(score: float) -> str:
    if score >= 0.7:
        return "exact"
    if score >= 0.4:
        return "strong"
    if score >= 0.2:
        return "weak"
    return "none"


def build_object_repository_diff(
    repository_suggestions: list[dict[str, Any]],
    existing_objects: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compare recorder object suggestions against existing repository objects.

    Returns new/matched/changed/duplicate/stale buckets plus a count summary so the
    UI can show an approval-friendly repository diff (see plan section "Object
    Repository Autopilot").
    """
    existing = list(existing_objects or [])
    aid_counts: dict[str, int] = {}
    for obj in existing:
        aid = _norm(obj.get("automation_id"))
        if aid:
            aid_counts[aid] = aid_counts.get(aid, 0) + 1

    new_items: list[dict[str, Any]] = []
    matched_items: list[dict[str, Any]] = []
    changed_items: list[dict[str, Any]] = []
    duplicate_items: list[dict[str, Any]] = []
    matched_keys: set[str] = set()

    for suggestion in repository_suggestions or []:
        best, score = _best_repo_match(suggestion, existing)
        level = _repo_match_level(score)
        s_strategy = str(suggestion.get("locator_strategy") or "")
        s_locator = str(suggestion.get("primary_locator") or suggestion.get("automation_id") or "")
        entry: dict[str, Any] = {
            "object_key": str(suggestion.get("object_key") or ""),
            "name": str(suggestion.get("name") or ""),
            "match": level,
            "confidence": round(score, 4),
            "matched_object_key": str(best.get("object_key") or "") if best else "",
            "before": {},
            "after": {"strategy": s_strategy, "locator": s_locator},
            "locator_changed": False,
            "recommendation": "create",
        }
        if best is None or level == "none":
            new_items.append(entry)
            continue

        matched_keys.add(_norm(best.get("object_key")))
        before_locator = str(best.get("primary_locator") or best.get("automation_id") or "")
        entry["before"] = {
            "strategy": str(best.get("locator_strategy") or ""),
            "locator": before_locator,
        }
        locator_changed = (
            _norm(s_locator) != _norm(before_locator)
            or _norm(s_strategy) != _norm(best.get("locator_strategy"))
        )
        entry["locator_changed"] = locator_changed
        s_aid = _norm(suggestion.get("automation_id"))

        if s_aid and aid_counts.get(s_aid, 0) > 1:
            entry["recommendation"] = "duplicate"
            duplicate_items.append(entry)
        elif level == "weak":
            entry["recommendation"] = "review"
            changed_items.append(entry)
        elif locator_changed:
            entry["recommendation"] = "update"
            changed_items.append(entry)
        else:
            entry["recommendation"] = "noop"
            matched_items.append(entry)

    stale_items = [
        {
            "object_key": str(obj.get("object_key") or ""),
            "name": str(obj.get("name") or ""),
            "recommendation": "review",
            "reason": "Existing repository object not seen in this recording.",
        }
        for obj in existing
        if _norm(obj.get("object_key")) and _norm(obj.get("object_key")) not in matched_keys
    ]

    return {
        "new": new_items,
        "matched": matched_items,
        "changed": changed_items,
        "duplicate": duplicate_items,
        "stale": stale_items,
        "summary": {
            "new": len(new_items),
            "matched": len(matched_items),
            "changed": len(changed_items),
            "duplicate": len(duplicate_items),
            "stale": len(stale_items),
        },
    }


def compile_recording(session: Any, actions: list[Any]) -> dict[str, Any]:
    sorted_actions = sorted(actions, key=lambda action: int(_get(action, "action_order", 0) or 0))
    compiled = [compile_recorded_action(action, index) for index, action in enumerate(sorted_actions, start=1)]
    driver_type = str(_get(session, "driver_type", "uia3") or "uia3")
    launch_app = _launch_app(session)
    window_title = _launch_window_title(launch_app, _get(session, "window_title", ""), _get(session, "application", ""))
    process_name = _stable_process_name(_get(session, "process_name", ""), launch_app)
    nodes: list[dict[str, Any]] = []
    if launch_app:
        launch_config = {
            "app": launch_app,
            "driver_type": driver_type,
            "window_title": window_title,
            "process_name": process_name,
            "attach_if_running": True,
            "timeout_ms": 30000,
        }
        args = _launch_args(launch_app, _get(session, "args", None) or _get(session, "app_args", None))
        if args:
            launch_config["args"] = args
        nodes.append(
            {
                "node_key": "desktop_launch",
                "type": "desktop.launch",
                "label": "Launch Desktop Application",
                "description": "Generated by desktop recorder.",
                "config": launch_config,
                "position": {"x": 0, "y": 120},
                "retry_policy": {"max_attempts": 1, "backoff_base": 1.5, "max_delay": 30.0, "jitter": True},
            }
        )
    elif window_title or process_name:
        nodes.append(
            {
                "node_key": "desktop_attach",
                "type": "desktop.attach",
                "label": "Attach Desktop Application",
                "description": "Generated by desktop recorder from an existing application window.",
                "config": {
                    "driver_type": driver_type,
                    "window_title": window_title,
                    "process_name": process_name,
                    "timeout_ms": 30000,
                },
                "position": {"x": 0, "y": 120},
                "retry_policy": {"max_attempts": 1, "backoff_base": 1.5, "max_delay": 30.0, "jitter": True},
            }
        )
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
    quality_report = build_quality_report(compiled)
    evidence_summary = build_evidence_summary(compiled)
    evidence_steps = build_evidence_steps(compiled)
    semantic_steps = [item["semantic"] for item in compiled]
    semantic_analysis = summarize_semantics(semantic_steps)
    checkpoint_suggestions = suggest_checkpoints(compiled)
    parameter_suggestions = suggest_parameters(compiled)
    has_app_scope = bool(nodes) and nodes[0].get("type") in {"desktop.launch", "desktop.attach"}
    execution_readiness = assess_execution_readiness(
        compiled,
        has_app_scope=has_app_scope,
        checkpoint_suggestions=checkpoint_suggestions,
    )
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
        "checkpoint_suggestions": checkpoint_suggestions,
        "parameter_suggestions": parameter_suggestions,
        "evidence_summary": evidence_summary,
        "evidence_steps": evidence_steps,
        "semantic_steps": semantic_steps,
        "semantic_analysis": semantic_analysis,
        "quality_report": quality_report,
        "execution_readiness": execution_readiness,
        "summary": {
            "action_count": len(sorted_actions),
            "keyword_count": len(compiled),
            "node_count": len(nodes),
            "repository_suggestion_count": len(suggestions),
            "component_suggestion_count": len(component_suggestions),
            "checkpoint_suggestion_count": len(checkpoint_suggestions),
            "parameter_suggestion_count": len(parameter_suggestions),
            "evidence_step_count": len(evidence_steps),
            "semantic_step_count": len(semantic_steps),
            "semantic_dominant_category": semantic_analysis["dominant_category"],
            "quality_score": quality_report["score"],
            "quality_grade": quality_report["grade"],
            "can_run_unattended": execution_readiness["can_run_unattended"],
        },
    }
