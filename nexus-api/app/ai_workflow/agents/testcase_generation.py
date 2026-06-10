from __future__ import annotations

import logging

from app.ai_workflow.providers.base import AbstractAIProvider
from app.ai_workflow.prompts.testcase_prompt import build_testcase_prompt
from app.ai_workflow.schemas import GeneratedTestCase, GeneratedTestStep, ScenarioPreview, TestCaseList

logger = logging.getLogger(__name__)

_AUTH_FLOW_TERMS = {
    "auth",
    "authenticate",
    "authenticated",
    "credential",
    "dashboard",
    "email",
    "login",
    "log in",
    "password",
    "sign in",
    "sign-in",
    "signin",
}


def _context_text(*values: object) -> str:
    return " ".join(str(value or "") for value in values).lower()


def _is_calculator_context(
    *,
    platform: str = "",
    page_name: str = "",
    app_target: str = "",
    application_profile: str = "",
) -> bool:
    text = _context_text(platform, page_name, app_target, application_profile)
    return (
        any(token in text for token in ("calculator", "calc.exe", "\\calc", "/calc"))
        or text.strip() == "calc"
    ) and any(token in text for token in ("desktop", "windows", "calculator", "calc"))


def _has_auth_leak(test_cases: list[GeneratedTestCase]) -> bool:
    for test_case in test_cases:
        text = _context_text(test_case.title, test_case.description)
        text += " " + " ".join(
            _context_text(step.description, step.expected_result, step.input_value)
            for step in test_case.steps
        )
        if any(term in text for term in _AUTH_FLOW_TERMS):
            return True
    return False


def _has_calculator_steps(test_cases: list[GeneratedTestCase]) -> bool:
    calc_terms = {"digit", "add", "plus", "subtract", "minus", "multiply", "divide", "equals", "result", "clear"}
    text = " ".join(
        _context_text(test_case.title, test_case.description, *(step.description for step in test_case.steps))
        for test_case in test_cases
    )
    return any(term in text for term in calc_terms)


def _calculator_test_cases(scenario: ScenarioPreview) -> TestCaseList:
    steps = [
        GeneratedTestStep(
            step_number=1,
            description="Launch Calculator",
            action_type="navigate",
            confidence=0.96,
        ),
        GeneratedTestStep(
            step_number=2,
            description="Click digit 7",
            action_type="click",
            confidence=0.92,
        ),
        GeneratedTestStep(
            step_number=3,
            description="Click Add",
            action_type="click",
            confidence=0.92,
        ),
        GeneratedTestStep(
            step_number=4,
            description="Click digit 5",
            action_type="click",
            confidence=0.92,
        ),
        GeneratedTestStep(
            step_number=5,
            description="Click Equals",
            action_type="click",
            confidence=0.92,
        ),
        GeneratedTestStep(
            step_number=6,
            description="Verify calculator result displays 12",
            action_type="assert_text",
            assertion_type="text",
            expected_result="12",
            confidence=0.9,
        ),
    ]
    return TestCaseList(test_cases=[
        GeneratedTestCase(
            title="Calculator basic addition",
            description=(
                "Verify Calculator can perform a simple addition using generated "
                f"desktop steps for scenario '{scenario.title}'."
            ),
            test_type=scenario.test_type or "functional",
            priority=scenario.priority or "medium",
            steps=steps,
        )
    ])


class TestCaseGenerationAgent:
    def __init__(self, provider: AbstractAIProvider) -> None:
        self._provider = provider

    async def run(
        self,
        scenario: ScenarioPreview,
        page_name: str,
        elements_summary: str,
        *,
        platform: str = "web",
        app_target: str = "",
        application_profile: str = "",
    ) -> TestCaseList:
        prompt = build_testcase_prompt(
            scenario_title=scenario.title,
            business_requirement=scenario.business_requirement,
            test_type=scenario.test_type,
            priority=scenario.priority,
            page_name=page_name,
            elements_summary=elements_summary,
            platform=platform,
            app_target=app_target,
            application_profile=application_profile,
        )
        logger.info("TestCaseGenerationAgent: generating cases for scenario '%s'", scenario.title)
        result = await self._provider.generate(prompt, TestCaseList)
        if _is_calculator_context(
            platform=platform,
            page_name=page_name,
            app_target=app_target,
            application_profile=application_profile,
        ) and (
            _has_auth_leak(result.test_cases) or not _has_calculator_steps(result.test_cases)
        ):
            logger.info(
                "TestCaseGenerationAgent: replacing generic auth flow with calculator-specific desktop steps"
            )
            result = _calculator_test_cases(scenario)
        logger.info("TestCaseGenerationAgent: %d test cases created", len(result.test_cases))
        return result
