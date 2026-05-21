"""TestStepBindingAgent — maps generated steps to page elements from the Page Repository."""
from __future__ import annotations

import logging
from difflib import SequenceMatcher

from app.ai_workflow.schemas import GeneratedTestCase, GeneratedTestStep

logger = logging.getLogger(__name__)

_SIMILARITY_THRESHOLD = 0.6


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


class TestStepBindingAgent:
    def bind(
        self,
        test_case: GeneratedTestCase,
        page_id: str,
        elements: list[dict],
    ) -> GeneratedTestCase:
        """Binds each step to a page element if a close name match exists."""
        bound_steps: list[GeneratedTestStep] = []
        for step in test_case.steps:
            matched_id: str | None = None
            best_score = 0.0

            for el in elements:
                el_name: str = el.get("name", "")
                score = _similarity(step.description, el_name)
                if score > best_score:
                    best_score = score
                    matched_id = el.get("id")

            if matched_id and best_score >= _SIMILARITY_THRESHOLD:
                bound = step.model_copy(update={
                    "page_id": page_id,
                    "page_element_id": matched_id,
                })
                bound_steps.append(bound)
            else:
                bound = step.model_copy(update={
                    "page_id": page_id,
                    "needs_review": True,
                    "review_reason": "element not found in page repository",
                })
                bound_steps.append(bound)
                logger.debug(
                    "TestStepBindingAgent: step '%s' not bound (best_score=%.2f)",
                    step.description,
                    best_score,
                )

        return test_case.model_copy(update={"steps": bound_steps})
