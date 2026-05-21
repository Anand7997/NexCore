"""LocatorRankingAgent — scores locator candidates according to strategy priority rules."""
from __future__ import annotations

import logging

from app.ai_workflow.schemas import DiscoveredElement, LocatorCandidate

logger = logging.getLogger(__name__)

_STRATEGY_BASE_SCORE: dict[str, float] = {
    "testid": 1.00,
    "role": 0.90,
    "label": 0.80,
    "placeholder": 0.80,
    "id": 0.75,
    "name": 0.65,
    "css": 0.55,
    "text": 0.45,
    "xpath": 0.30,
}


def _score_candidate(candidate: LocatorCandidate) -> float:
    base = _STRATEGY_BASE_SCORE.get(candidate.strategy, 0.20)
    verified_bonus = 0.10 if candidate.verified else 0.0
    unique_bonus = 0.05 if candidate.element_count == 1 else 0.0
    return min(base + verified_bonus + unique_bonus, 1.0)


class LocatorRankingAgent:
    def rank(self, elements: list[DiscoveredElement]) -> list[DiscoveredElement]:
        ranked: list[DiscoveredElement] = []
        for elem in elements:
            scored: list[LocatorCandidate] = []
            for cand in elem.locator_candidates:
                updated = cand.model_copy(update={"score": _score_candidate(cand)})
                scored.append(updated)
            scored.sort(key=lambda c: c.score, reverse=True)

            best: LocatorCandidate | None = None
            for cand in scored:
                if cand.verified and cand.element_count == 1:
                    best = cand
                    break

            ranked.append(elem.model_copy(update={"locator_candidates": scored, "best_locator": best}))
            if best:
                logger.debug(
                    "LocatorRankingAgent: element '%s' best=%s score=%.2f",
                    elem.ai_suggested_name or elem.tag,
                    best.strategy,
                    best.score,
                )
        return ranked
