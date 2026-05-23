"""Tests for model-tier-aware generation settings."""

from app.ai_workflow.prompts.scenario_prompt import build_scenario_prompt
from app.ai_workflow.service import _model_generation_profile, _model_generation_tier


def test_model_generation_tier_detects_fast_balanced_best_models():
    assert _model_generation_tier("gpt-5-nano") == "fast"
    assert _model_generation_tier("gpt-5-mini") == "balanced"
    assert _model_generation_tier("gpt-5.5") == "best"


def test_scenario_prompt_uses_model_generation_profile():
    profile = _model_generation_profile("gpt-5-nano")

    prompt = build_scenario_prompt(
        brd_text="Users can search and book flights.",
        project_name="Travel",
        page_name="Search",
        elements_summary="No elements yet.",
        brd_analysis_summary="Search and booking workflow.",
        scenario_count=profile["scenario_count"],
        analysis_depth=profile["analysis_depth"],
    )

    assert "Generate 4 to 6 high-value test scenarios" in prompt
    assert "average-depth coverage" in prompt
