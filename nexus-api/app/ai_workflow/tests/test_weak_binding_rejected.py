"""A step with no genuine element match must not be bound to an unrelated element.

Regression cover for the Ixigo_Flights project, where the flights page repository
held only SEO footer links and promo banners, and every unmatched step was still
bound to the nearest scoring candidate.
"""
from app.ai_workflow.schemas import (
    GeneratedTestCase,
    GeneratedTestStep,
    StepElementBindingDecision,
)
from app.ai_workflow.service import (
    _best_saved_element_for_step,
    _bind_cases_to_saved_elements,
    _bind_cases_with_ai_decisions,
    _is_acceptable_element_match,
)


def _step(description: str, **overrides) -> GeneratedTestStep:
    defaults = {
        "step_number": 1,
        "description": description,
        "action_type": "click",
        "confidence": 0.9,
    }
    defaults.update(overrides)
    return GeneratedTestStep(**defaults)


# The real Flights_page repository contents that produced the bad bindings.
FLIGHTS_PAGE_ELEMENTS = [
    {"id": "el-search", "name": "Search", "element_type": "button"},
    {"id": "el-oneway", "name": "One Way", "element_type": "tab"},
    {"id": "el-kolkata", "name": "Kolkata to Agartala Flights", "element_type": "link"},
    {"id": "el-chandigarh", "name": "Mumbai to Chandigarh Flights", "element_type": "link"},
    {"id": "el-gorakhpur", "name": "New Delhi to Gorakhpur Flights", "element_type": "link"},
    {"id": "el-promo-jk", "name": "Flat 15% Off on Domestic Flights with J&K Bank Cards", "element_type": "div"},
]


def test_travel_class_step_is_not_bound_to_an_seo_footer_link():
    step = _step("Select Economy as the travel class")

    element, score = _best_saved_element_for_step(step, FLIGHTS_PAGE_ELEMENTS)

    assert not _is_acceptable_element_match(step, element, score), (
        f"step was bound to {element and element.get('name')!r} at score {score:.3f}"
    )


def test_destination_field_step_is_not_bound_to_a_promo_banner():
    step = _step("Fill the destination city field with Mumbai", action_type="fill", input_value="Mumbai")

    element, score = _best_saved_element_for_step(step, FLIGHTS_PAGE_ELEMENTS)

    assert not _is_acceptable_element_match(step, element, score), (
        f"step was bound to {element and element.get('name')!r} at score {score:.3f}"
    )


def test_results_visibility_step_is_not_bound_to_an_unrelated_route_link():
    step = _step("Verify that flight results are visible for the selected one-way route")

    element, score = _best_saved_element_for_step(step, FLIGHTS_PAGE_ELEMENTS)

    assert not _is_acceptable_element_match(step, element, score), (
        f"step was bound to {element and element.get('name')!r} at score {score:.3f}"
    )


def test_genuine_match_is_still_accepted():
    step = _step("Click the Search button")

    element, score = _best_saved_element_for_step(step, FLIGHTS_PAGE_ELEMENTS)

    assert _is_acceptable_element_match(step, element, score)
    assert element["id"] == "el-search"


def test_one_way_tab_step_is_still_accepted():
    step = _step("Select the one-way trip option")

    element, score = _best_saved_element_for_step(step, FLIGHTS_PAGE_ELEMENTS)

    assert _is_acceptable_element_match(step, element, score)
    assert element["id"] == "el-oneway"


def test_no_candidates_is_never_an_acceptable_match():
    step = _step("Click the Search button")

    element, score = _best_saved_element_for_step(step, [])

    assert not _is_acceptable_element_match(step, element, score)


def _case(steps):
    return GeneratedTestCase(
        title="Search one-way economy flight",
        description="Ixigo one-way search",
        test_type="smoke",
        priority="medium",
        steps=steps,
    )


def test_bind_to_saved_elements_leaves_unmatched_step_for_review():
    case = _case([_step("Select Economy as the travel class")])
    elements = [{**e, "element_id": e["id"]} for e in FLIGHTS_PAGE_ELEMENTS]

    bound = _bind_cases_to_saved_elements([case], "page-1", elements)
    bound_step = bound[0].steps[0]

    assert bound_step.page_element_id is None
    assert bound_step.needs_review is True


def test_bind_to_saved_elements_still_binds_a_genuine_match():
    case = _case([_step("Click the Search button")])
    elements = [{**e, "element_id": e["id"]} for e in FLIGHTS_PAGE_ELEMENTS]

    bound = _bind_cases_to_saved_elements([case], "page-1", elements)
    bound_step = bound[0].steps[0]

    assert bound_step.page_element_id == "el-search"
    assert bound_step.needs_review is False


def test_ai_fallback_does_not_clear_review_flag_on_unmatched_step():
    case = _case([_step("Select Economy as the travel class")])
    elements = [{**e, "element_id": e["id"]} for e in FLIGHTS_PAGE_ELEMENTS]
    decision = StepElementBindingDecision(
        test_case_title=case.title,
        step_number=1,
        candidate_id=None,
        action_type="click",
        needs_review=True,
        reason="AI could not match this step",
        confidence=0.2,
    )

    bound = _bind_cases_with_ai_decisions([case], "page-1", elements, [decision])
    bound_step = bound[0].steps[0]

    assert bound_step.page_element_id is None
    assert bound_step.needs_review is True
