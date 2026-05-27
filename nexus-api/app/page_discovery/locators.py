"""Deterministic locator generation, verification, and scoring."""
from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from typing import Any

from app.page_discovery.schemas import DiscoveredElement, LocatorCandidate

VerifyLocator = Callable[[str, str], Awaitable[dict[str, Any]]]

_GENERATED_ID_PATTERN = re.compile(
    r"^(react-select|mui|jss|:r[a-z0-9]+:|test-selector|random|generated)"
    r"|-\d{4,}$|[a-z]{2,}-\d{2,}[a-z]?\d*|^\d+[a-z]",
    re.IGNORECASE,
)
_RANDOM_CLASS_PATTERN = re.compile(r"(^| )(css|sc|jss|mui|_)[a-z0-9]{5,}( |$)", re.IGNORECASE)


def _quote_attr(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _quote_playwright(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _xpath_literal(value: str) -> str:
    if '"' not in value:
        return f'"{value}"'
    if "'" not in value:
        return f"'{value}'"
    parts = value.split('"')
    return "concat(" + ', '.join(f'"{part}"' if part else "'\"'" for part in parts) + ")"


def _css_id(value: str) -> str:
    # Keep common CSS identifiers readable; use an attribute selector for the rest.
    if re.match(r"^[A-Za-z_][A-Za-z0-9_-]*$", value):
        return f"#{value}"
    return f'[id="{_quote_attr(value)}"]'


def _is_stable_id(id_val: str | None) -> bool:
    if not id_val or len(id_val) < 2:
        return False
    if _GENERATED_ID_PATTERN.search(id_val):
        return False
    if re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", id_val, re.IGNORECASE):
        return False
    return True


def _is_stable_class(class_list: list[str]) -> bool:
    for cls in class_list:
        if _RANDOM_CLASS_PATTERN.search(cls):
            return False
        if len(cls) > 15 and re.search(r"[a-z]{8,}", cls):
            return False
    return True


def _humanize_name(tag: str, attrs: dict[str, Any]) -> str:
    candidates: list[str] = []
    for key in ("aria-label", "text_content", "placeholder", "title", "alt", "label_text", "data-testid", "name"):
        val = str(attrs.get(key) or "").strip()
        if val and len(val) < 120:
            candidates.append(val)
    id_val = str(attrs.get("id") or "")
    if _is_stable_id(id_val):
        candidates.append(id_val)

    for candidate in candidates:
        cleaned = re.sub(r"\s+", " ", candidate).strip()[:80]
        if cleaned:
            return cleaned[0].upper() + cleaned[1:] if len(cleaned) > 1 else cleaned

    type_ = str(attrs.get("type") or "")
    if type_ and type_ != tag:
        return f"{tag}[type={type_}]".title()
    return tag.capitalize()


def _candidate(strategy: str, locator: str, priority_weight: int) -> dict[str, Any]:
    return {"strategy": strategy, "locator": locator, "priority_weight": priority_weight}


def _short_text(value: str, limit: int = 80) -> str:
    return re.sub(r"\s+", " ", value).strip()[:limit]


def _contains_xpath(tag: str, target: str, value: str) -> str:
    text = _short_text(value)
    if target == "text":
        return f"//{tag}[contains(normalize-space(.), {_xpath_literal(text)})]"
    return f"//{tag}[contains(@{target}, {_xpath_literal(text)})]"


def _is_absolute_xpath(locator: str) -> bool:
    value = locator.strip()
    return value.startswith("/html") or value.startswith("/body") or value.startswith("html/")


def _generate_locator_candidates(tag: str, attrs: dict[str, Any], roles: list[str]) -> list[dict[str, Any]]:
    """Generate candidate locators in preference order."""
    candidates: list[dict[str, Any]] = []

    for attr_name in ("data-testid", "data-test", "data-qa", "data-cy"):
        val = str(attrs.get(attr_name) or "")
        if val:
            candidates.append(_candidate("testid", f'[{attr_name}="{_quote_attr(val)}"]', 100))

    aria_role = str(attrs.get("role") or (roles[0] if roles else ""))
    accessible_name = str(attrs.get("aria-label") or attrs.get("text_content") or "").strip()[:80]
    if aria_role and accessible_name:
        candidates.append(
            _candidate("role", f'role={aria_role}[name="{_quote_playwright(accessible_name)}"]', 95)
        )

    placeholder = str(attrs.get("placeholder") or "")
    if placeholder and tag in ("input", "textarea"):
        candidates.append(_candidate("css", f'{tag}[placeholder="{_quote_attr(placeholder)}"]', 88))
        candidates.append(_candidate("xpath", _contains_xpath(tag, "placeholder", placeholder), 86))

    id_val = str(attrs.get("id") or "")
    if _is_stable_id(id_val):
        candidates.append(_candidate("id", _css_id(id_val), 82))
        candidates.append(_candidate("xpath", f"//{tag}[@id={_xpath_literal(id_val)}]", 76))

    name_val = str(attrs.get("name") or "")
    if name_val and len(name_val) > 1:
        candidates.append(_candidate("name", f'[name="{_quote_attr(name_val)}"]', 78))
        candidates.append(_candidate("xpath", f"//{tag}[@name={_xpath_literal(name_val)}]", 74))

    text_content = str(attrs.get("text_content") or "").strip()
    text_tags = {"button", "a", "span", "label", "p", "h1", "h2", "h3", "h4", "h5", "h6"}
    if text_content and tag in text_tags and len(text_content) < 80:
        candidates.append(_candidate("text", f'{tag}:has-text("{_quote_playwright(text_content)}")', 66))
        candidates.append(_candidate("xpath", _contains_xpath(tag, "text", text_content), 64))
        candidates.append(_candidate("xpath", f"//{tag}[contains(text(), {_xpath_literal(_short_text(text_content))})]", 62))

    classes = attrs.get("class_list") or []
    if isinstance(classes, list) and classes and _is_stable_class([str(c) for c in classes]):
        stable_classes = [str(c) for c in classes if c and not str(c).startswith("_") and len(str(c)) < 40]
        if stable_classes:
            cls_sel = ".".join(stable_classes[:2])
            candidates.append(_candidate("css", f"{tag}.{cls_sel}" if tag != "*" else f".{cls_sel}", 55))

    type_val = str(attrs.get("type") or "")
    if type_val and type_val != tag:
        candidates.append(_candidate("css", f'{tag}[type="{_quote_attr(type_val)}"]', 50))

    for attr_name in ("aria-label", "title", "alt"):
        val = str(attrs.get(attr_name) or "")
        if val and len(val) < 60:
            candidates.append(_candidate("css", f'{tag}[{attr_name}="{_quote_attr(val)}"]', 45))
            candidates.append(_candidate("xpath", _contains_xpath(tag, attr_name, val), 60))

    label_text = str(attrs.get("label_text") or "").strip()
    if label_text and tag in ("input", "textarea", "select"):
        candidates.append(_candidate("xpath", f"//label[contains(normalize-space(.), {_xpath_literal(label_text)})]/following::{tag}[1]", 90))
        if id_val:
            candidates.append(_candidate("xpath", f"//label[@for={_xpath_literal(id_val)}]/following::{tag}[1]", 84))

    if text_content and tag in ("button", "a", "span"):
        candidates.append(_candidate("xpath", f"//{tag}[normalize-space()={_xpath_literal(text_content)}]", 32))

    original_xpath = str(attrs.get("xpath") or "")
    if original_xpath:
        weight = 12 if _is_absolute_xpath(original_xpath) else 28
        candidates.append(_candidate("xpath", original_xpath, weight))

    seen: set[tuple[str, str]] = set()
    unique: list[dict[str, Any]] = []
    for cand in candidates:
        key = (cand["strategy"], cand["locator"])
        if key not in seen:
            seen.add(key)
            unique.append(cand)
    return unique


def _score_locator(
    strategy: str,
    locator: str,
    priority_weight: int,
    visible: bool,
    enabled: bool,
    element_count: int,
    verified: bool,
) -> tuple[float, str]:
    """Score a locator candidate from 0.0 to 1.0."""
    if element_count == 0:
        return 0.0, "does not match any element"

    base = priority_weight / 100.0
    uniqueness = 1.0 if element_count == 1 else max(0.05, 0.65 - (element_count - 2) * 0.12)
    visibility = 1.0 if visible else 0.25
    enable_bonus = 1.0 if enabled else 0.45
    verification = 1.0 if verified else 0.2
    length = len(locator)
    length_score = 1.0 if length < 60 else (0.75 if length < 140 else 0.45)
    xpath_penalty = 0.85 if strategy == "xpath" and len(locator) > 120 else 1.0
    if strategy == "xpath" and _is_absolute_xpath(locator):
        xpath_penalty *= 0.45

    score = (
        base * 0.24
        + uniqueness * 0.24
        + verification * 0.20
        + visibility * 0.14
        + enable_bonus * 0.08
        + length_score * 0.10
    ) * xpath_penalty
    final = max(0.0, min(1.0, score))

    parts = ["verified" if verified else "unverified"]
    parts.append("unique" if element_count == 1 else f"matches {element_count} elements")
    if not visible:
        parts.append("hidden")
    if not enabled:
        parts.append("disabled")
    return final, "; ".join(parts)


def _infer_date_format_from_text(text: str) -> tuple[str, str] | None:
    normalized = text.lower()
    patterns = [
        ("dd/mm/yyyy", "10/02/2000", ("dd/mm/yyyy", "d/m/yyyy", "dd-mm-yyyy")),
        ("mm/dd/yyyy", "02/10/2000", ("mm/dd/yyyy", "m/d/yyyy", "mm-dd-yyyy")),
        ("yyyy-mm-dd", "2000-02-10", ("yyyy-mm-dd", "yyyy/mm/dd")),
        ("dd mmm yyyy", "10 Feb 2000", ("dd mmm yyyy", "d mmm yyyy", "dd mon yyyy")),
        ("dd ddd yyyy", "10 Thu 2000", ("dd ddd yyyy", "d ddd yyyy", "dd day yyyy")),
    ]
    compact = normalized.replace(" ", "")
    for fmt, example, markers in patterns:
        if any(marker in normalized or marker.replace(" ", "") in compact for marker in markers):
            return fmt, example
    return None


def _infer_test_data_hints(tag: str, attrs: dict[str, Any], element_type: str) -> dict[str, Any]:
    input_type = str(attrs.get("type") or "").lower()
    placeholder = str(attrs.get("placeholder") or "")
    label = str(attrs.get("label_text") or attrs.get("aria-label") or attrs.get("title") or "")
    name = str(attrs.get("name") or attrs.get("id") or "")
    text = " ".join(part for part in (placeholder, label, name, element_type, input_type) if part)
    lowered = text.lower()

    hints: dict[str, Any] = {
        "input_type": input_type,
        "placeholder": placeholder,
        "label": label,
    }

    if input_type == "date":
        hints.update({"data_type": "date", "date_format": "yyyy-mm-dd", "sample_value": "2000-02-10"})
    elif "date" in lowered or "dob" in lowered or "birth" in lowered:
        inferred = _infer_date_format_from_text(text)
        if inferred:
            date_format, sample_value = inferred
        else:
            date_format, sample_value = "dd/mm/yyyy", "10/02/2000"
        hints.update({"data_type": "date", "date_format": date_format, "sample_value": sample_value})
    elif input_type in {"email"} or "email" in lowered:
        hints.update({"data_type": "email", "sample_value": "qa.user@example.com"})
    elif input_type in {"password"} or "password" in lowered:
        hints.update({"data_type": "password", "sample_value": "Nexus@12345"})
    elif input_type in {"number"} or any(token in lowered for token in ("amount", "count", "quantity", "age")):
        hints.update({"data_type": "number", "sample_value": "10"})
    elif input_type in {"tel"} or any(token in lowered for token in ("phone", "mobile", "telephone")):
        hints.update({"data_type": "phone", "sample_value": "9876543210"})
    elif tag in {"select", "option"} or element_type in {"select", "combobox", "dropdown"}:
        hints.update({"data_type": "option", "sample_value": ""})
    elif tag in {"input", "textarea"}:
        hints.update({"data_type": "text", "sample_value": "test data"})

    return {key: value for key, value in hints.items() if value not in (None, "")}


class ElementDiscoveryAgent:
    """Generate, verify, and score testable UI locators."""

    ACTIONABLE_TAGS = frozenset({"button", "a", "input", "textarea", "select", "option", "dialog"})
    INTERACTIVE_ROLES = frozenset({
        "button", "link", "textbox", "combobox", "checkbox", "radio",
        "tab", "menuitem", "dialog", "alertdialog", "switch", "slider",
        "listbox", "menu", "option", "gridcell",
    })
    TAG_TYPE_MAP = {
        "button": "button",
        "a": "link",
        "input": "input",
        "textarea": "textarea",
        "select": "select",
        "option": "dropdown",
        "dialog": "dialog",
    }

    def __init__(self, min_confidence: float = 0.75, include_hidden: bool = False) -> None:
        self.min_confidence = min_confidence
        self.include_hidden = include_hidden

    def process_elements(self, raw_elements: list[dict[str, Any]]) -> list[DiscoveredElement]:
        """Synchronous fallback used by simple unit checks."""
        results: list[DiscoveredElement] = []
        for raw in raw_elements:
            if not self._include_raw(raw):
                continue
            tag = str(raw.get("tag") or "div").lower()
            attrs: dict[str, Any] = raw.get("attributes") or {}
            roles: list[str] = raw.get("roles") or []
            visible = bool(raw.get("visible", True))
            enabled = bool(raw.get("enabled", True))
            scored = []
            for cand in _generate_locator_candidates(tag, attrs, roles):
                element_count = int(raw.get(f"match_count_{cand['strategy']}", 0))
                verified = element_count == 1
                score_val, reason = _score_locator(
                    cand["strategy"], cand["locator"], cand["priority_weight"],
                    visible, enabled, element_count, verified,
                )
                scored.append(LocatorCandidate(
                    strategy=cand["strategy"],
                    locator=cand["locator"],
                    verified=verified,
                    element_count=element_count,
                    score=round(score_val, 4),
                    reason=reason,
                ))
            results.append(self._make_element(raw, scored))
        return sorted(results, key=lambda e: e.confidence_score, reverse=True)

    async def process_elements_verified(
        self,
        raw_elements: list[dict[str, Any]],
        verify_locator: VerifyLocator,
    ) -> list[DiscoveredElement]:
        """Verify each candidate against Playwright before scoring."""
        results: list[DiscoveredElement] = []
        for raw in raw_elements:
            if not self._include_raw(raw):
                continue
            tag = str(raw.get("tag") or "div").lower()
            attrs: dict[str, Any] = raw.get("attributes") or {}
            roles: list[str] = raw.get("roles") or []
            scored = []
            for cand in _generate_locator_candidates(tag, attrs, roles):
                metrics = await verify_locator(cand["strategy"], cand["locator"])
                element_count = int(metrics.get("element_count") or 0)
                visible = bool(metrics.get("visible"))
                enabled = bool(metrics.get("enabled"))
                verified = bool(metrics.get("verified"))
                score_val, reason = _score_locator(
                    cand["strategy"], cand["locator"], cand["priority_weight"],
                    visible, enabled, element_count, verified,
                )
                scored.append(LocatorCandidate(
                    strategy=cand["strategy"],
                    locator=cand["locator"],
                    verified=verified,
                    element_count=element_count,
                    score=round(score_val, 4),
                    reason=reason,
                ))
            if scored:
                results.append(self._make_element(raw, scored))
        return sorted(results, key=lambda e: e.confidence_score, reverse=True)

    def _include_raw(self, raw: dict[str, Any]) -> bool:
        tag = str(raw.get("tag") or "div").lower()
        attrs: dict[str, Any] = raw.get("attributes") or {}
        roles: list[str] = raw.get("roles") or []
        visible = bool(raw.get("visible", True))
        if not visible and not self.include_hidden:
            return False
        has_interactive = any(r in self.INTERACTIVE_ROLES for r in roles)
        has_testid = any(attrs.get(a) for a in ("data-testid", "data-test", "data-qa", "data-cy"))
        has_aria = bool(attrs.get("aria-label"))
        has_label = bool(attrs.get("label_text"))
        is_form = tag in ("input", "textarea", "select") and bool(
            attrs.get("name") or attrs.get("placeholder") or attrs.get("type")
        )
        if tag in self.ACTIONABLE_TAGS or has_interactive or has_testid or has_aria or has_label or is_form:
            return True
        return tag not in {"div", "span", "section", "article", "header", "footer", "nav", "main", "aside"}

    def _make_element(self, raw: dict[str, Any], scored: list[LocatorCandidate]) -> DiscoveredElement:
        tag = str(raw.get("tag") or "div").lower()
        attrs: dict[str, Any] = raw.get("attributes") or {}
        roles: list[str] = raw.get("roles") or []
        scored.sort(key=lambda c: c.score, reverse=True)
        best = scored[0] if scored else None
        confidence = best.score if best else 0.0
        xpath = str(attrs.get("xpath") or "")
        css_selector = str(attrs.get("css_path") or "")
        locator_strategy = "xpath"
        best_locator = ""

        if best:
            best_locator = best.locator
            locator_strategy = best.strategy
            if best.strategy == "xpath":
                xpath = best.locator
            else:
                css_selector = best.locator

        tags = ["auto-discovered", "playwright"]
        tags.append("high-confidence" if confidence >= self.min_confidence else "needs-review")

        return DiscoveredElement(
            name=_humanize_name(tag, attrs),
            element_type=self._determine_type(tag, attrs, roles),
            description=self._make_description(tag, attrs, roles),
            best_locator=best_locator,
            locator_strategy=locator_strategy,
            xpath=xpath,
            css_selector=css_selector,
            id_attr=str(attrs.get("id") or ""),
            name_attr=str(attrs.get("name") or ""),
            input_type=str(attrs.get("type") or ""),
            placeholder=str(attrs.get("placeholder") or ""),
            label=str(attrs.get("label_text") or attrs.get("aria-label") or attrs.get("title") or ""),
            test_data_hints=_infer_test_data_hints(
                tag,
                attrs,
                self._determine_type(tag, attrs, roles),
            ),
            confidence_score=round(confidence, 4),
            alternative_locators=scored,
            tags=tags,
        )

    def _determine_type(self, tag: str, attrs: dict[str, Any], roles: list[str]) -> str:
        explicit_role = str(attrs.get("role") or "")
        if explicit_role in self.INTERACTIVE_ROLES:
            return explicit_role
        input_type = str(attrs.get("type") or "").lower()
        if tag == "input" and input_type in {
            "checkbox", "radio", "button", "submit", "email", "password",
            "number", "tel", "url", "search", "file",
        }:
            return input_type
        for role in roles:
            if role in self.INTERACTIVE_ROLES:
                return role
        return self.TAG_TYPE_MAP.get(tag, tag)

    @staticmethod
    def _make_description(tag: str, attrs: dict[str, Any], roles: list[str]) -> str:
        parts = []
        for key, label in (
            ("aria-label", "aria-label"),
            ("text_content", "text"),
            ("placeholder", "placeholder"),
            ("data-testid", "testid"),
            ("name", "name"),
            ("type", "type"),
        ):
            val = str(attrs.get(key) or "").strip()
            if val and len(val) < 80:
                parts.append(f'{label}="{val}"')
        if roles:
            parts.append(f"role={','.join(roles[:2])}")
        return f"<{tag}> {' | '.join(parts)}" if parts else f"<{tag}> element"
