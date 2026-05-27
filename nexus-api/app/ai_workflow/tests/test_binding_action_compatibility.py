import unittest

from app.ai_workflow.schemas import GeneratedTestStep
from app.ai_workflow.service import _score_candidate


class BindingActionCompatibilityTests(unittest.TestCase):
    def test_fill_step_scores_input_above_high_quality_link(self) -> None:
        step = GeneratedTestStep(
            step_number=2,
            description="Enter origin city in the From field",
            action_type="fill",
            input_value="Lucknow",
        )
        from_input = {
            "name": "From",
            "description": "Origin city input",
            "element_type": "input",
            "input_type": "text",
            "placeholder": "From",
            "locator_strategy": "id",
            "best_locator": "#from",
            "confidence_score": 0.9,
            "locator_quality": 0.9,
        }
        flight_link = {
            "name": "Lucknow to Bengaluru Flights",
            "description": "Popular route link",
            "element_type": "link",
            "locator_strategy": "xpath",
            "best_locator": "//a[normalize-space()='Lucknow to Bengaluru Flights']",
            "confidence_score": 1.0,
            "locator_quality": 1.0,
        }

        input_score = _score_candidate(step, from_input)
        link_score = _score_candidate(step, flight_link)

        self.assertGreater(input_score, link_score)
        self.assertLess(link_score, 0.34)


if __name__ == "__main__":
    unittest.main()
