"""ReviewAndValidationAgent — assembles the final review summary."""
from __future__ import annotations

import logging
from typing import Any

from app.ai_workflow.schemas import (
    GeneratedTestCase,
    LowConfidenceLocator,
    ReviewItem,
    ReviewResponse,
)

logger = logging.getLogger(__name__)

_LOW_CONFIDENCE_THRESHOLD = 0.50


class ReviewAndValidationAgent:
    def build_review(
        self,
        workflow_id: str,
        project_id: str | None,
        module_id: str | None,
        page_id: str | None,
        elements_saved: int,
        scenarios_generated: int,
        scenarios_selected: int,
        test_cases: list[GeneratedTestCase],
        page_elements: list[dict[str, Any]],
    ) -> ReviewResponse:
        needs_review: list[ReviewItem] = []
        low_conf: list[LowConfidenceLocator] = []

        for tc in test_cases:
            for step in tc.steps:
                if step.needs_review:
                    needs_review.append(ReviewItem(
                        testcase_name=tc.title,
                        step_number=step.step_number,
                        description=step.description,
                        reason=step.review_reason or "unspecified",
                    ))

        for el in page_elements:
            score: float = el.get("confidence_score") or 0.0
            if score < _LOW_CONFIDENCE_THRESHOLD:
                alts: list = el.get("alternative_locators") or []
                best_strategy = alts[0].get("strategy", "unknown") if alts else "unknown"
                best_locator = alts[0].get("locator", el.get("xpath", "")) if alts else el.get("xpath", "")
                low_conf.append(LowConfidenceLocator(
                    element_name=el.get("name", "unknown"),
                    current_locator=best_locator,
                    confidence=score,
                    strategy=best_strategy,
                    element_id=el.get("id", ""),
                ))

        total_steps = sum(len(tc.steps) for tc in test_cases)
        logger.info(
            "ReviewAndValidationAgent: %d review items, %d low-confidence locators",
            len(needs_review),
            len(low_conf),
        )
        return ReviewResponse(
            workflow_id=workflow_id,
            project_id=project_id,
            module_id=module_id,
            page_id=page_id,
            elements_saved=elements_saved,
            scenarios_generated=scenarios_generated,
            scenarios_selected=scenarios_selected,
            testcases_created=len(test_cases),
            teststeps_created=total_steps,
            needs_review_items=needs_review,
            low_confidence_locators=low_conf,
        )
