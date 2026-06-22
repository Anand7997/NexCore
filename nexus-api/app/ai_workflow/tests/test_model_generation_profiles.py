"""Tests for model-tier-aware generation settings."""

import asyncio

from app.ai_workflow.providers.null_provider import NullProvider
from app.ai_workflow.prompts.brd_analysis_prompt import build_brd_analysis_prompt
from app.ai_workflow.prompts.scenario_prompt import build_scenario_prompt
from app.ai_workflow.prompts.testcase_prompt import build_testcase_prompt
from app.ai_workflow.schemas import ScenarioList
from app.ai_workflow.service import (
    _application_learning_profile,
    _model_generation_profile,
    _model_generation_tier,
)


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


def test_sparse_brd_prompts_infer_flows_before_scraping():
    brd_prompt = build_brd_analysis_prompt(
        brd_text="Customer portal for account management.",
        webpage_url="https://example.test",
        project_name="Customer Portal",
    )
    scenario_prompt = build_scenario_prompt(
        brd_text="Customer portal for account management.",
        project_name="Customer Portal",
        page_name="Account Home",
        elements_summary="No elements yet.",
        brd_analysis_summary="Sparse BRD for a customer portal.",
    )
    testcase_prompt = build_testcase_prompt(
        scenario_title="Inferred profile update",
        business_requirement="Inferred: customers can update profile details",
        test_type="functional",
        priority="medium",
        page_name="Account Home",
        elements_summary="No elements yet.",
    )

    assert "Infer likely business-critical user journeys" in brd_prompt
    assert "Sparse BRD reasoning mode" in scenario_prompt
    assert "scraping may run after these scenarios" in scenario_prompt
    assert "step-driven scraping guidance" in testcase_prompt
    assert "without inventing locator syntax" in testcase_prompt


def test_testcase_prompt_uses_generic_desktop_profile_without_app_hardcoding():
    app_profile = _application_learning_profile(
        platform="desktop",
        app_target="sample-desktop.exe",
        page_name="Main Screen",
        project_name="Desktop Tool",
        brd_text="Automate the requested desktop workflow.",
    )
    prompt = build_testcase_prompt(
        scenario_title="Desktop workflow smoke",
        business_requirement="Automate the requested desktop workflow",
        test_type="functional",
        priority="medium",
        page_name="Main Screen",
        elements_summary="No elements yet.",
        platform="desktop",
        app_target="sample-desktop.exe",
        application_profile=app_profile,
    )

    assert "Inferred application type: desktop application" in app_profile
    assert "Application learning profile" in prompt
    assert "Do not invent sign-in, email, password" in prompt
    assert "exact visible control name or business action" in prompt
    assert "Calculator/calc.exe" not in prompt
    assert "Click digit 7" not in prompt


def test_scenario_prompt_learns_application_before_generating_cases():
    app_profile = _application_learning_profile(
        platform="desktop",
        app_target=r"C:\Apps\sample-desktop.exe",
        page_name="Main Screen",
        project_name="Desktop Tool",
        brd_text="Validate the requested desktop workflow.",
    )
    prompt = build_scenario_prompt(
        brd_text="Validate the requested desktop workflow.",
        project_name="Desktop Tool",
        page_name="Main Screen",
        elements_summary="Scraping has not run yet.",
        brd_analysis_summary="Desktop workflow validation.",
        platform="desktop",
        app_target=r"C:\Apps\sample-desktop.exe",
        application_profile=app_profile,
    )

    assert "Application learning profile" in prompt
    assert "Application-first generation rules" in prompt
    assert "Inferred application type: desktop application" in prompt
    assert "Do not create sign-in, email, password" in prompt
    assert "direct native application operations" in prompt
    assert "Calculator/calc.exe" not in prompt
    assert "IntelliJ IDEA" not in prompt


def test_desktop_scenario_generation_does_not_start_with_login():
    app_profile = _application_learning_profile(
        platform="desktop",
        app_target="sample-desktop.exe",
        page_name="Main Screen",
        project_name="Desktop Tool",
        brd_text="Validate the requested desktop workflow.",
    )
    prompt = build_scenario_prompt(
        brd_text="Validate the requested desktop workflow.",
        project_name="Desktop Tool",
        page_name="Main Screen",
        elements_summary="Scraping has not run yet.",
        brd_analysis_summary="Desktop workflow validation.",
        platform="desktop",
        app_target="sample-desktop.exe",
        application_profile=app_profile,
    )

    result = asyncio.run(NullProvider().generate(prompt, ScenarioList))
    scenario_text = " ".join(
        f"{scenario.title} {scenario.business_requirement}".lower()
        for scenario in result.scenarios
    )

    assert "desktop application" in scenario_text
    assert "login" not in scenario_text
    assert "email" not in scenario_text
    assert "password" not in scenario_text
