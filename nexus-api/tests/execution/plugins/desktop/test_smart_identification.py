from __future__ import annotations

from app.execution.plugins.desktop.drivers.base import LocatorCandidate
from app.execution.plugins.desktop.smart_identification import (
    locator_attempt_evidence,
    rank_locator_candidates,
    record_locator_success,
)


def test_rank_locator_candidates_prefers_deterministic_desktop_properties():
    candidates = [
        LocatorCandidate(strategy="visual", value="submit-icon", confidence=0.92),
        LocatorCandidate(strategy="name", value="Submit", confidence=0.8),
        LocatorCandidate(strategy="accessibility_id", value="btnSubmit", confidence=1.0),
    ]

    ranked = rank_locator_candidates(candidates)

    assert [candidate.strategy for candidate in ranked] == ["accessibility_id", "name", "visual"]


def test_low_confidence_ai_candidates_are_filtered():
    candidates = [
        LocatorCandidate(strategy="visual", value="submit-icon", confidence=0.2),
        LocatorCandidate(strategy="ocr", value="Submit", confidence=0.54),
        LocatorCandidate(strategy="name", value="Submit", confidence=0.6),
    ]

    ranked = rank_locator_candidates(candidates, min_confidence=0.55)

    assert ranked == [LocatorCandidate(strategy="name", value="Submit", confidence=0.6)]


def test_locator_attempt_evidence_flags_ai_review_candidates():
    candidates = [
        LocatorCandidate(strategy="ocr", value="Submit", confidence=0.65),
    ]

    evidence = locator_attempt_evidence(candidates, min_confidence=0.55, review_confidence=0.8)

    assert evidence == [
        {
            "rank": 1,
            "strategy": "ocr",
            "value": "Submit",
            "confidence": 0.65,
            "score": 0.4949,
            "deterministic": False,
            "requires_review": True,
            "reason": "AI/OCR/visual fallback candidate",
        }
    ]


def test_healing_ranking_survives_name_position_and_hierarchy_changes():
    record_locator_success("customer_name_input", "name", "Customer", succeeded=True)
    record_locator_success("customer_name_input", "name", "Customer", succeeded=True)
    candidates = [
        {"strategy": "xpath", "locator": "/Window[1]/Pane[2]/Edit[5]", "confidence": 0.9},
        {"strategy": "visual", "locator": "old-position-420-180", "confidence": 0.62},
        {"strategy": "name", "locator": "Customer", "confidence": 0.82},
        {"strategy": "ocr", "locator": "Client", "confidence": 0.7},
    ]

    ranked = rank_locator_candidates(
        candidates,
        object_key="customer_name_input",
        anchor_name="Customer Details",
        min_confidence=0.55,
    )

    assert ranked[0].strategy == "name"
    assert ranked[0].value == "Customer"
    assert all(candidate.value != "old-position-420-180" for candidate in ranked[:2])
