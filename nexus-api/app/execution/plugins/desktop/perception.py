"""AI-assisted desktop perception candidate extraction.

The service is deliberately local-first: it can work from UIA/source text alone,
adds OCR when pytesseract/Pillow are available, and exposes visual template
fallbacks without requiring a remote AI service.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from difflib import SequenceMatcher
import io
import re
from typing import Any

from app.execution.plugins.desktop.drivers.base import LocatorCandidate
from app.execution.plugins.desktop.smart_identification import rank_locator_candidates


@dataclass(frozen=True)
class PerceptionCandidate:
    strategy: str
    value: str
    confidence: float
    source: str
    reason: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "locator": self.value,
            "confidence": self.confidence,
            "source": self.source,
            "reason": self.reason,
            "metadata": self.metadata,
        }

    def as_locator(self) -> LocatorCandidate:
        return LocatorCandidate(strategy=self.strategy, value=self.value, confidence=self.confidence)


def _tokens(value: str) -> set[str]:
    return {part for part in re.split(r"[^a-z0-9]+", value.lower()) if part}


def _similarity(value: str, hint: str) -> float:
    if not hint:
        return 0.0
    value_text = str(value or "").strip().lower()
    hint_text = str(hint or "").strip().lower()
    if not value_text or not hint_text:
        return 0.0
    if value_text == hint_text:
        return 1.0
    if hint_text in value_text or value_text in hint_text:
        return 0.88
    value_tokens = _tokens(value_text)
    hint_tokens = _tokens(hint_text)
    overlap = len(value_tokens & hint_tokens) / max(1, len(value_tokens | hint_tokens))
    sequence = SequenceMatcher(None, value_text, hint_text).ratio()
    return max(overlap, sequence * 0.82)


def _score(base: float, value: str, hint: str) -> float:
    hint_score = _similarity(value, hint)
    if not hint:
        return round(base, 4)
    return round(max(base * 0.72, (base * 0.55) + (hint_score * 0.45)), 4)


def _xml_attributes(line: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for key, value in re.findall(r"([A-Za-z_:-]+)=['\"]([^'\"]*)['\"]", line):
        attrs[key.lower().replace("-", "_")] = value
    return attrs


class DesktopPerceptionService:
    """Extracts desktop locator candidates from UIA, OCR, and visual signals."""

    def analyze(
        self,
        *,
        ui_tree: str = "",
        screenshot_bytes: bytes | None = None,
        ocr_text: str = "",
        hint: str = "",
        visual_template: str = "",
        max_candidates: int = 20,
    ) -> list[PerceptionCandidate]:
        candidates: list[PerceptionCandidate] = []
        candidates.extend(self._from_ui_tree(ui_tree, hint=hint))
        candidates.extend(self._from_ocr_text(ocr_text, hint=hint))
        if screenshot_bytes:
            candidates.extend(self._from_screenshot_ocr(screenshot_bytes, hint=hint))
        if visual_template:
            candidates.append(PerceptionCandidate(
                strategy="visual",
                value=visual_template,
                confidence=0.72,
                source="visual_template",
                reason="Visual template supplied for image matching fallback",
            ))

        deduped: dict[tuple[str, str], PerceptionCandidate] = {}
        for candidate in candidates:
            key = (candidate.strategy, candidate.value)
            existing = deduped.get(key)
            if existing is None or candidate.confidence > existing.confidence:
                deduped[key] = candidate

        ranked = rank_locator_candidates([
            item.as_locator() for item in deduped.values()
        ], min_confidence=0.0, review_confidence=0.8)
        by_key = {(item.strategy, item.value): item for item in deduped.values()}
        return [by_key[(item.strategy, item.value)] for item in ranked[:max_candidates]]

    def _from_ui_tree(self, ui_tree: str, *, hint: str = "") -> list[PerceptionCandidate]:
        candidates: list[PerceptionCandidate] = []
        for index, line in enumerate(str(ui_tree or "").splitlines()):
            attrs = _xml_attributes(line)
            auto_id = attrs.get("auto_id") or attrs.get("automationid") or attrs.get("automation_id")
            name = attrs.get("name") or attrs.get("title") or attrs.get("value")
            class_name = attrs.get("class") or attrs.get("class_name") or attrs.get("classname")
            control_type = attrs.get("type") or attrs.get("control_type") or attrs.get("controltype")
            metadata = {"line": index, "control_type": control_type or ""}
            if auto_id:
                candidates.append(PerceptionCandidate(
                    strategy="accessibility_id",
                    value=auto_id,
                    confidence=_score(0.96, auto_id, hint),
                    source="uia_tree",
                    reason="UIA automation id candidate",
                    metadata=metadata,
                ))
            if name:
                candidates.append(PerceptionCandidate(
                    strategy="name",
                    value=name,
                    confidence=_score(0.82, name, hint),
                    source="uia_tree",
                    reason="UIA name/text candidate",
                    metadata=metadata,
                ))
            if class_name:
                candidates.append(PerceptionCandidate(
                    strategy="class_name",
                    value=class_name,
                    confidence=_score(0.56, class_name, hint),
                    source="uia_tree",
                    reason="UIA class name candidate",
                    metadata=metadata,
                ))
        return candidates

    def _from_ocr_text(self, ocr_text: str, *, hint: str = "") -> list[PerceptionCandidate]:
        candidates: list[PerceptionCandidate] = []
        seen: set[str] = set()
        for part in re.split(r"[\r\n]+", str(ocr_text or "")):
            value = part.strip()
            if not value or value.lower() in seen:
                continue
            seen.add(value.lower())
            confidence = _score(0.62, value, hint)
            if hint and _similarity(value, hint) < 0.35:
                confidence = min(confidence, 0.45)
            candidates.append(PerceptionCandidate(
                strategy="ocr",
                value=value,
                confidence=confidence,
                source="ocr_text",
                reason="OCR text candidate",
            ))
        return candidates

    def _from_screenshot_ocr(self, screenshot_bytes: bytes, *, hint: str = "") -> list[PerceptionCandidate]:
        try:
            from PIL import Image
            import pytesseract
            image = Image.open(io.BytesIO(screenshot_bytes))
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        except Exception:
            return []

        candidates: list[PerceptionCandidate] = []
        seen: set[str] = set()
        for i, text in enumerate(data.get("text", [])):
            value = str(text or "").strip()
            if not value or value.lower() in seen:
                continue
            seen.add(value.lower())
            try:
                raw_conf = float(data.get("conf", [0])[i])
            except (TypeError, ValueError, IndexError):
                raw_conf = 0.0
            base = max(0.2, min(raw_conf / 100.0, 0.78))
            candidates.append(PerceptionCandidate(
                strategy="ocr",
                value=value,
                confidence=_score(base, value, hint),
                source="screenshot_ocr",
                reason="OCR candidate extracted from screenshot",
                metadata={
                    "x": data.get("left", [None])[i],
                    "y": data.get("top", [None])[i],
                    "width": data.get("width", [None])[i],
                    "height": data.get("height", [None])[i],
                },
            ))
        return candidates
