"""Unbound steps must carry their review flag into the persisted test step."""
from app.ai_workflow.schemas import GeneratedTestStep
from app.ai_workflow.service import _binding_review_metadata


def _step(**overrides) -> GeneratedTestStep:
    defaults = {
        "step_number": 1,
        "description": "Select Economy as the travel class",
        "action_type": "click",
        "confidence": 0.6,
    }
    defaults.update(overrides)
    return GeneratedTestStep(**defaults)


def test_unbound_step_records_review_flag_and_reason():
    metadata = _binding_review_metadata(_step(
        needs_review=True,
        review_reason="No saved page element matched this step",
    ))

    assert metadata["needs_review"] is True
    assert metadata["review_reason"] == "No saved page element matched this step"


def test_bound_step_records_no_review_flag():
    metadata = _binding_review_metadata(_step(needs_review=False))

    assert metadata["needs_review"] is False
    assert metadata["review_reason"] == ""


def test_review_reason_defaults_when_flag_set_without_reason():
    metadata = _binding_review_metadata(_step(needs_review=True, review_reason=None))

    assert metadata["needs_review"] is True
    assert metadata["review_reason"]
