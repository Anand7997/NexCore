"""Smart locator ranking for desktop automation.

This is the deterministic foundation for UFT-style Smart Identification. It ranks
known locator candidates before the driver sees them and records why each
candidate was trusted, reviewed, or filtered.

Enhanced with:
- Historical success boosting: locators used successfully in past executions receive
  a confidence boost proportional to their hit-rate.
- Relative anchor scoring: when an anchor element is provided, locators that include
  a path relative to the anchor score higher than absolute locators.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.execution.plugins.desktop.drivers.base import LocatorCandidate


STRATEGY_WEIGHTS = {
    "accessibility_id": 1.0,
    "name": 0.86,
    "xpath": 0.74,
    "class_name": 0.56,
    "ocr": 0.42,
    "visual": 0.38,
}

AI_STRATEGIES = {"ocr", "visual"}

# ── Historical success registry ────────────────────────────────────────────────
# Maps (object_key, strategy, locator_value) → success_count.  Populated at
# runtime via ``record_locator_success`` and optionally pre-seeded from the DB
# by the desktop execution plugin.
_SUCCESS_REGISTRY: dict[tuple[str, str, str], int] = {}
_TOTAL_REGISTRY: dict[tuple[str, str, str], int] = {}


def record_locator_success(
    object_key: str,
    strategy: str,
    locator_value: str,
    *,
    succeeded: bool = True,
) -> None:
    """Record a locator attempt outcome in the in-process registry."""
    key = (object_key, strategy.lower(), locator_value)
    _TOTAL_REGISTRY[key] = _TOTAL_REGISTRY.get(key, 0) + 1
    if succeeded:
        _SUCCESS_REGISTRY[key] = _SUCCESS_REGISTRY.get(key, 0) + 1


def historical_success_boost(
    object_key: str,
    strategy: str,
    locator_value: str,
    *,
    max_boost: float = 0.12,
) -> float:
    """Return a [0, max_boost] confidence boost based on historical hit-rate."""
    if not object_key:
        return 0.0
    key = (object_key, strategy.lower(), locator_value)
    total = _TOTAL_REGISTRY.get(key, 0)
    success = _SUCCESS_REGISTRY.get(key, 0)
    if total == 0:
        return 0.0
    hit_rate = success / total
    return round(hit_rate * max_boost, 4)


def seed_success_registry(records: list[dict[str, Any]]) -> None:
    """Seed the in-process registry from DB-loaded history records.

    Each record should have keys: object_key, strategy, locator_value,
    success_count, total_count (or just count if only successes are stored).
    """
    for rec in records:
        object_key = str(rec.get("object_key") or "")
        strategy = str(rec.get("strategy") or "").lower()
        locator_value = str(rec.get("locator_value") or rec.get("locator") or rec.get("value") or "")
        if not (object_key and strategy and locator_value):
            continue
        success_count = int(rec.get("success_count") or rec.get("count") or 1)
        total_count = int(rec.get("total_count") or rec.get("count") or success_count)
        key = (
            object_key,
            strategy,
            locator_value,
        )
        _SUCCESS_REGISTRY[key] = success_count
        _TOTAL_REGISTRY[key] = total_count


def _coerce_candidate(candidate: LocatorCandidate | dict[str, Any]) -> LocatorCandidate:
    if isinstance(candidate, LocatorCandidate):
        return candidate
    strategy = str(candidate.get("strategy") or "accessibility_id")
    value = str(
        candidate.get("value")
        or candidate.get("locator")
        or candidate.get("selector")
        or candidate.get("automation_id")
        or ""
    )
    try:
        confidence = float(candidate.get("confidence") or candidate.get("score") or 1.0)
    except (TypeError, ValueError):
        confidence = 1.0
    return LocatorCandidate(strategy=strategy, value=value, confidence=confidence)


# ── Relative anchor scoring ────────────────────────────────────────────────────

def anchor_relative_boost(
    candidate: LocatorCandidate | dict[str, Any],
    anchor_automation_id: str = "",
    anchor_name: str = "",
) -> float:
    """Return a small boost if the locator references the anchor element.

    XPath/UIA candidates that contain the anchor's automation_id or name in
    their path score higher because they are scoped to a stable parent.
    """
    if not (anchor_automation_id or anchor_name):
        return 0.0
    raw = candidate if isinstance(candidate, dict) else {}
    candidate = _coerce_candidate(candidate)
    val = " ".join([
        candidate.value,
        str(raw.get("automation_id") or ""),
        str(raw.get("name") or ""),
    ]).lower()
    if anchor_automation_id and anchor_automation_id.lower() in val:
        return 0.06
    if anchor_name and anchor_name.lower() in val:
        return 0.04
    return 0.0


@dataclass(frozen=True)
class RankedLocator:
    candidate: LocatorCandidate
    rank: int
    score: float
    deterministic: bool
    requires_review: bool
    reason: str

    def evidence(self) -> dict[str, object]:
        return {
            "rank": self.rank,
            "strategy": self.candidate.strategy,
            "value": self.candidate.value,
            "confidence": self.candidate.confidence,
            "score": self.score,
            "deterministic": self.deterministic,
            "requires_review": self.requires_review,
            "reason": self.reason,
        }

    def __contains__(self, key: str) -> bool:
        return key in self.evidence()

    def __getitem__(self, key: str) -> object:
        return self.evidence()[key]

    def get(self, key: str, default: object = None) -> object:
        return self.evidence().get(key, default)


def _weight(strategy: str) -> float:
    return STRATEGY_WEIGHTS.get(strategy, 0.5)


def _score(
    candidate: LocatorCandidate,
    original_index: int,
    *,
    object_key: str = "",
    anchor_automation_id: str = "",
    anchor_name: str = "",
) -> float:
    confidence = max(0.0, min(float(candidate.confidence), 1.0))
    order_bonus = max(0.0, 0.03 - (original_index * 0.002))
    hist_boost = historical_success_boost(object_key, candidate.strategy, candidate.value)
    anchor_boost = anchor_relative_boost(candidate, anchor_automation_id, anchor_name)
    return round(
        (_weight(candidate.strategy) * 0.72)
        + (confidence * 0.25)
        + order_bonus
        + hist_boost
        + anchor_boost,
        4,
    )


def explain_locator_candidates(
    candidates: list[LocatorCandidate | dict[str, Any]],
    *,
    min_confidence: float = 0.55,
    review_confidence: float = 0.8,
    object_key: str = "",
    anchor_automation_id: str = "",
    anchor_name: str = "",
) -> list[RankedLocator]:
    ranked: list[tuple[float, int, LocatorCandidate]] = []
    for index, raw_candidate in enumerate(candidates):
        candidate = _coerce_candidate(raw_candidate)
        confidence = max(0.0, min(float(candidate.confidence), 1.0))
        if candidate.strategy in AI_STRATEGIES and confidence < min_confidence:
            continue
        ranked.append((
            _score(
                candidate,
                index,
                object_key=object_key,
                anchor_automation_id=anchor_automation_id,
                anchor_name=anchor_name,
            ),
            index,
            candidate,
        ))

    ranked.sort(key=lambda item: (-item[0], item[1]))
    explained: list[RankedLocator] = []
    for rank, (score, _index, candidate) in enumerate(ranked, start=1):
        deterministic = candidate.strategy not in AI_STRATEGIES
        requires_review = not deterministic and candidate.confidence < review_confidence
        hist = historical_success_boost(object_key, candidate.strategy, candidate.value)
        anchor = anchor_relative_boost(candidate, anchor_automation_id, anchor_name)
        parts: list[str] = []
        if deterministic:
            parts.append("Deterministic desktop property match")
        else:
            parts.append("AI/OCR/visual fallback candidate")
        if hist > 0:
            parts.append(f"hist_boost +{hist:.3f} historical success")
        if anchor > 0:
            parts.append("relative-anchor path bonus")
        reason = "; ".join(parts)
        explained.append(
            RankedLocator(
                candidate=candidate,
                rank=rank,
                score=score,
                deterministic=deterministic,
                requires_review=requires_review,
                reason=reason,
            )
        )
    return explained


def rank_locator_candidates(
    candidates: list[LocatorCandidate | dict[str, Any]],
    *,
    min_confidence: float = 0.55,
    review_confidence: float = 0.8,
    object_key: str = "",
    anchor_automation_id: str = "",
    anchor_name: str = "",
) -> list[LocatorCandidate]:
    return [
        item.candidate
        for item in explain_locator_candidates(
            candidates,
            min_confidence=min_confidence,
            review_confidence=review_confidence,
            object_key=object_key,
            anchor_automation_id=anchor_automation_id,
            anchor_name=anchor_name,
        )
    ]


def locator_attempt_evidence(
    candidates: list[LocatorCandidate | dict[str, Any]],
    *,
    min_confidence: float = 0.55,
    review_confidence: float = 0.8,
    object_key: str = "",
    anchor_automation_id: str = "",
    anchor_name: str = "",
) -> list[dict[str, object]]:
    return [
        item.evidence()
        for item in explain_locator_candidates(
            candidates,
            min_confidence=min_confidence,
            review_confidence=review_confidence,
            object_key=object_key,
            anchor_automation_id=anchor_automation_id,
            anchor_name=anchor_name,
        )
    ]
