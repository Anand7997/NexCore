"""Desktop Object Spy parsing utilities."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any

_CONTAINER_TAGS = {"uitree", "ocrtree", "appiumaut", "application", "root"}


@dataclass
class SpyObject:
    object_key: str
    name: str
    control_type: str = "element"
    automation_id: str = ""
    name_text: str = ""
    class_name: str = ""
    uia_path: str = ""
    locator_strategy: str = "name"
    primary_locator: str = ""
    alternative_locators: list[dict[str, Any]] = field(default_factory=list)
    bounding_box: dict[str, Any] | None = None
    ocr_text: str = ""
    confidence_score: float = 0.5
    metadata: dict[str, Any] = field(default_factory=dict)

    def locator_strength(self) -> dict[str, Any]:
        risks: list[str] = []
        if not self.automation_id:
            risks.append("missing_automation_id")
        if self.locator_strategy in {"ocr", "visual", "class name"}:
            risks.append("fallback_locator")
        if self.confidence_score < 0.75:
            risks.append("low_confidence")
        if len(self.alternative_locators) < 2:
            risks.append("few_alternatives")
        strength = "strong" if self.confidence_score >= 0.9 and not risks else "medium" if self.confidence_score >= 0.7 else "weak"
        if self.automation_id:
            reason = "Strong: Automation ID is present and should be stable across desktop runs."
        elif self.name_text:
            reason = "Medium: Name/text locator is usable but can break when labels change."
        elif self.uia_path:
            reason = "Medium: UIA path is deterministic but can break if hierarchy changes."
        else:
            reason = "Weak: Locator depends on visual/OCR/class fallback and should be reviewed."
        return {"strength": strength, "risk_flags": risks, "explanation": reason}

    def as_dict(self) -> dict[str, Any]:
        return {
            "object_key": self.object_key,
            "name": self.name,
            "control_type": self.control_type,
            "automation_id": self.automation_id,
            "name_text": self.name_text,
            "class_name": self.class_name,
            "uia_path": self.uia_path,
            "locator_strategy": self.locator_strategy,
            "primary_locator": self.primary_locator,
            "alternative_locators": self.alternative_locators,
            "bounding_box": self.bounding_box,
            "ocr_text": self.ocr_text,
            "confidence_score": self.confidence_score,
            **self.locator_strength(),
            "metadata": self.metadata,
        }


def _slug(value: str, fallback: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "_", value or "").strip("_").lower()
    return base or fallback


def _float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _attrs_from_match(raw: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for match in re.finditer(r"([a-zA-Z_:-]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)')", raw):
        key = _normalize_attr_key(match.group(1))
        attrs[key] = match.group(2) if match.group(2) is not None else match.group(3)
    return attrs


def _normalize_attr_key(key: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", str(key or "")).strip("_").lower()
    aliases = {
        "automationid": "automation_id",
        "automation_id": "automation_id",
        "autoid": "auto_id",
        "auto_id": "auto_id",
        "classname": "class_name",
        "class_name": "class_name",
        "controltype": "control_type",
        "control_type": "control_type",
        "localizedcontroltype": "localized_control_type",
        "localized_control_type": "localized_control_type",
        "boundingrectangle": "bounding_rectangle",
        "bounding_rectangle": "bounding_rectangle",
        "frameworkid": "framework_id",
        "framework_id": "framework_id",
        "processid": "process_id",
        "process_id": "process_id",
        "runtimeid": "runtime_id",
        "runtime_id": "runtime_id",
    }
    return aliases.get(normalized, normalized)


def _local_tag(tag: str) -> str:
    text = str(tag or "")
    if "}" in text:
        text = text.rsplit("}", 1)[-1]
    if ":" in text:
        text = text.rsplit(":", 1)[-1]
    return text.lower()


def _clean_control_type(value: str) -> str:
    text = str(value or "").strip()
    if "." in text:
        text = text.split(".")[-1]
    return text


def _path_literal(value: str, limit: int = 80) -> str:
    text = str(value or "").replace("'", "\\'")[:limit]
    return text


def _uia_path_token(attrs: dict[str, str], index: int) -> str:
    control_type = _clean_control_type(
        attrs.get("type")
        or attrs.get("control_type")
        or attrs.get("localized_control_type")
        or attrs.get("tag")
        or "Control"
    )
    token = re.sub(r"[^A-Za-z0-9_]+", "", control_type) or "Control"
    automation_id = (
        attrs.get("auto_id")
        or attrs.get("automation_id")
        or attrs.get("accessibility_id")
        or attrs.get("id")
        or ""
    ).strip()
    name_text = (attrs.get("name") or attrs.get("title") or attrs.get("value") or "").strip()
    class_name = (attrs.get("class_name") or attrs.get("class") or "").strip()
    if automation_id:
        token += f"[@AutomationId='{_path_literal(automation_id)}']"
    elif name_text:
        token += f"[@Name='{_path_literal(name_text)}']"
    elif class_name:
        token += f"[@ClassName='{_path_literal(class_name)}']"
    else:
        token += f"[{index}]"
    return token


def _box_from_attrs(attrs: dict[str, str]) -> dict[str, float] | None:
    if all(key in attrs for key in ("x", "y", "width", "height")):
        return {
            "x": _float(attrs.get("x")),
            "y": _float(attrs.get("y")),
            "width": _float(attrs.get("width")),
            "height": _float(attrs.get("height")),
        }
    raw = attrs.get("bounding_rectangle") or attrs.get("bounds") or attrs.get("bounding_box") or ""
    numbers = [_float(value) for value in re.findall(r"-?\d+(?:\.\d+)?", raw)]
    if len(numbers) >= 4:
        left, top, third, fourth = numbers[:4]
        width = third - left if third > left else third
        height = fourth - top if fourth > top else fourth
        return {"x": left, "y": top, "width": width, "height": height}
    return None


def _candidate(strategy: str, locator: str, reason: str, score: float = 1.0) -> dict[str, Any]:
    if not locator:
        return {}
    return {
        "strategy": strategy,
        "locator": locator,
        "verified": False,
        "element_count": 0,
        "score": score,
        "reason": reason,
    }


def _unique_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for candidate in candidates:
        strategy = str(candidate.get("strategy") or "")
        locator = str(candidate.get("locator") or "")
        if not locator:
            continue
        key = (strategy.lower(), locator)
        if key in seen:
            continue
        seen.add(key)
        result.append(candidate)
    return result


def _object_from_attrs(attrs: dict[str, str], index: int, *, source: str) -> SpyObject | None:
    if source == "ocr":
        text = (attrs.get("value") or attrs.get("text") or "").strip()
        if not text:
            return None
        conf = max(0.0, min(_float(attrs.get("conf"), 50.0) / 100.0, 1.0))
        x = _float(attrs.get("x"))
        y = _float(attrs.get("y"))
        box = {"x": x, "y": y} if x or y else None
        return SpyObject(
            object_key=_slug(text, f"ocr_text_{index}"),
            name=text,
            control_type="text",
            name_text=text,
            locator_strategy="ocr",
            primary_locator=text,
            alternative_locators=[_candidate("ocr", text, "OCR text from Desktop Object Spy", conf)],
            bounding_box=box,
            ocr_text=text,
            confidence_score=conf,
            metadata={"source": "desktop_spy", "spy_source": "ocr"},
        )

    control_type = _clean_control_type(
        attrs.get("type")
        or attrs.get("control_type")
        or attrs.get("localized_control_type")
        or attrs.get("tag")
        or "element"
    )
    name = (attrs.get("name") or attrs.get("title") or attrs.get("value") or control_type).strip()
    automation_id = (attrs.get("auto_id") or attrs.get("automation_id") or attrs.get("accessibility_id") or attrs.get("id") or "").strip()
    class_name = (attrs.get("class_name") or attrs.get("class") or "").strip()
    uia_path = (attrs.get("uia_path") or attrs.get("path") or "").strip()
    name_text = name if name != control_type else ""
    bounding_box = _box_from_attrs(attrs)

    locator_strategy = "accessibility id" if automation_id else "name" if name_text else "xpath" if uia_path else "class name"
    primary_locator = automation_id or name_text or uia_path or class_name
    if not primary_locator:
        return None

    confidence = 1.0 if automation_id else 0.86 if name_text else 0.74 if uia_path else 0.56
    candidates = _unique_candidates([
        _candidate("accessibility id", automation_id, "Automation ID from UIA tree", 1.0),
        _candidate("name", name_text, "Name/text from UIA tree", 0.86),
        _candidate("xpath", uia_path, "UIA hierarchy path from spy", 0.74),
        _candidate("class name", class_name, "Class name from UIA tree", 0.56),
    ])
    return SpyObject(
        object_key=_slug(automation_id or name_text or control_type, f"desktop_object_{index}"),
        name=name,
        control_type=control_type.lower() or "element",
        automation_id=automation_id,
        name_text=name_text,
        class_name=class_name,
        uia_path=uia_path,
        locator_strategy=locator_strategy,
        primary_locator=primary_locator,
        alternative_locators=candidates,
        bounding_box=bounding_box,
        confidence_score=confidence,
        metadata={
            "source": "desktop_spy",
            "spy_source": "uia",
            "framework_id": attrs.get("framework_id", ""),
            "process_id": attrs.get("process_id", ""),
            "runtime_id": attrs.get("runtime_id", ""),
            "raw_attributes": attrs,
        },
    )


def _parse_with_elementtree(ui_tree: str) -> list[dict[str, str]]:
    root = ET.fromstring(ui_tree)
    parsed: list[dict[str, str]] = []

    def walk(element: ET.Element, parent_path: str = "", index: int = 1) -> None:
        tag = _local_tag(element.tag)
        attrs = {_normalize_attr_key(str(k)): str(v) for k, v in element.attrib.items()}
        attrs.setdefault("tag", tag)
        path_token = _uia_path_token(attrs, index)
        current_path = f"{parent_path}/{path_token}" if parent_path else f"/{path_token}"
        attrs.setdefault("uia_path", current_path)
        if tag not in _CONTAINER_TAGS:
            parsed.append(attrs)
        for child_index, child in enumerate(list(element), start=1):
            walk(child, current_path, child_index)

    walk(root)
    return parsed


def _parse_with_regex(ui_tree: str) -> list[dict[str, str]]:
    parsed: list[dict[str, str]] = []
    pattern = r"<([A-Za-z_][\w:.-]*)\b([^<>]*?)(?:/?>)"
    for match in re.finditer(pattern, ui_tree or "", flags=re.IGNORECASE):
        tag = _local_tag(match.group(1))
        if tag.startswith("/") or tag in _CONTAINER_TAGS:
            continue
        attrs = _attrs_from_match(match.group(2))
        attrs.setdefault("tag", tag)
        attrs.setdefault("uia_path", "/" + _uia_path_token(attrs, len(parsed) + 1))
        parsed.append(attrs)
    return parsed


def parse_desktop_ui_tree(ui_tree: str, *, max_objects: int = 250) -> list[SpyObject]:
    """Parse UIA/OCR tree XML into object-spy candidates."""
    if not (ui_tree or "").strip():
        return []
    try:
        attrs_list = _parse_with_elementtree(ui_tree)
    except ET.ParseError:
        attrs_list = _parse_with_regex(ui_tree)

    objects: list[SpyObject] = []
    seen: set[tuple[str, str]] = set()
    for index, attrs in enumerate(attrs_list, start=1):
        source = "ocr" if attrs.get("tag", "").lower() == "text" else "uia"
        obj = _object_from_attrs(attrs, index, source=source)
        if obj is None:
            continue
        key = (obj.locator_strategy.lower(), obj.primary_locator)
        if key in seen:
            continue
        seen.add(key)
        objects.append(obj)
        if len(objects) >= max_objects:
            break
    return objects
