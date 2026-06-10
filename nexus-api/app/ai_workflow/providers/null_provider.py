"""Deterministic NullProvider for tests and CI — no real AI calls."""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator, AsyncIterator
from typing import TypeVar

from pydantic import BaseModel

from app.ai_workflow.providers.base import AbstractAIProvider

T = TypeVar("T", bound=BaseModel)


class NullProvider(AbstractAIProvider):
    async def generate(self, prompt: str, schema: type[T]) -> T:
        name = schema.__name__

        if name == "BRDAnalysis":
            return schema(  # type: ignore[return-value]
                summary=(
                    "Auto-generated BRD summary with inferred core flows when the source "
                    "document is sparse."
                ),
                key_features=["Login", "Dashboard", "Settings", "Inferred critical workflow"],
                modules_suggested=["Authentication", "Navigation", "Core Workflow"],
                test_objectives=[
                    "Verify core user flows",
                    "Validate form inputs",
                    "Create actionable test steps before scraping important elements",
                ],
            )

        if name == "ScenarioList":
            from app.ai_workflow.schemas import ScenarioPreview
            prompt_text = prompt.lower()
            context_lines = [
                line
                for line in prompt_text.splitlines()
                if line.startswith((
                    "platform:",
                    "application or url target:",
                    "application learning profile:",
                    "observed platform:",
                    "observed target:",
                    "observed screen/page:",
                    "inferred application type:",
                    "core capabilities:",
                    "likely controls:",
                    "generation guidance:",
                    "scraping guidance:",
                    "discovered page:",
                ))
            ]
            context_text = " ".join(context_lines)
            if (
                any(token in context_text for token in ("calculator", "calc.exe", "\\calc", "/calc"))
                and any(token in context_text for token in ("platform: desktop", "observed platform: desktop", "windows", "calc"))
            ):
                scenarios = [
                    ScenarioPreview(
                        scenario_id=str(uuid.uuid4()),
                        title="Calculator basic addition",
                        business_requirement="Calculator must add two whole numbers and display the correct result.",
                        priority="high",
                        test_type="smoke",
                        classification="positive",
                        pages_involved=["Calculator"],
                        estimated_test_cases=1,
                        confidence=0.96,
                    ),
                    ScenarioPreview(
                        scenario_id=str(uuid.uuid4()),
                        title="Calculator clear entry resets input",
                        business_requirement="Calculator must clear the current entry before a new calculation.",
                        priority="medium",
                        test_type="regression",
                        classification="edge",
                        pages_involved=["Calculator"],
                        estimated_test_cases=1,
                        confidence=0.88,
                    ),
                ]
                return schema(scenarios=scenarios)  # type: ignore[return-value]
            scenarios = [
                ScenarioPreview(
                    scenario_id=str(uuid.uuid4()),
                    title="Happy Path Login",
                    business_requirement="Users must be able to log in with valid credentials",
                    priority="high",
                    test_type="functional",
                    classification="positive",
                    pages_involved=["Login Page"],
                    estimated_test_cases=2,
                    confidence=0.9,
                ),
                ScenarioPreview(
                    scenario_id=str(uuid.uuid4()),
                    title="Invalid Credentials",
                    business_requirement="System must reject invalid credentials",
                    priority="high",
                    test_type="functional",
                    classification="negative",
                    pages_involved=["Login Page"],
                    estimated_test_cases=2,
                    confidence=0.85,
                ),
                ScenarioPreview(
                    scenario_id=str(uuid.uuid4()),
                    title="Inferred Core Workflow Smoke Coverage",
                    business_requirement=(
                        "Inferred from sparse BRD: the main user workflow should be reachable "
                        "and confirm completion with an observable result"
                    ),
                    priority="medium",
                    test_type="smoke",
                    classification="positive",
                    pages_involved=["Primary Page"],
                    estimated_test_cases=1,
                    confidence=0.68,
                ),
            ]
            return schema(scenarios=scenarios)  # type: ignore[return-value]

        if name == "TestCaseList":
            from app.ai_workflow.schemas import GeneratedTestCase, GeneratedTestStep
            prompt_text = prompt.lower()
            context_lines = [
                line
                for line in prompt_text.splitlines()
                if line.startswith((
                    "platform:",
                    "application or url target:",
                    "application learning profile:",
                    "observed platform:",
                    "observed target:",
                    "observed screen/page:",
                    "inferred application type:",
                    "core capabilities:",
                    "likely controls:",
                    "generation guidance:",
                    "scraping guidance:",
                    "available page:",
                ))
            ]
            context_text = " ".join(context_lines)
            if (
                any(token in context_text for token in ("calculator", "calc.exe", "\\calc", "/calc"))
                and any(token in context_text for token in ("platform: desktop", "platform: windows", "calc"))
            ):
                steps = [
                    GeneratedTestStep(step_number=1, description="Launch Calculator", action_type="navigate", confidence=0.96),
                    GeneratedTestStep(step_number=2, description="Click digit 7", action_type="click", confidence=0.92),
                    GeneratedTestStep(step_number=3, description="Click Add", action_type="click", confidence=0.92),
                    GeneratedTestStep(step_number=4, description="Click digit 5", action_type="click", confidence=0.92),
                    GeneratedTestStep(step_number=5, description="Click Equals", action_type="click", confidence=0.92),
                    GeneratedTestStep(
                        step_number=6,
                        description="Verify calculator result displays 12",
                        action_type="assert_text",
                        assertion_type="text",
                        expected_result="12",
                        confidence=0.9,
                    ),
                ]
                return schema(test_cases=[GeneratedTestCase(
                    title="Calculator basic addition",
                    description="Verify Calculator can perform simple addition and display the result.",
                    test_type="functional",
                    priority="medium",
                    steps=steps,
                )])  # type: ignore[return-value]
            steps = [
                GeneratedTestStep(
                    step_number=1,
                    description="Navigate to the application URL",
                    action_type="navigate",
                    confidence=0.95,
                ),
                GeneratedTestStep(
                    step_number=2,
                    description="Enter username or email",
                    action_type="fill",
                    input_value="test.user@example.com",
                    confidence=0.82,
                ),
                GeneratedTestStep(
                    step_number=3,
                    description="Enter password",
                    action_type="fill",
                    input_value="Password123!",
                    confidence=0.82,
                ),
                GeneratedTestStep(
                    step_number=4,
                    description="Click the primary submit button",
                    action_type="click",
                    confidence=0.86,
                ),
                GeneratedTestStep(
                    step_number=5,
                    description="Assert the expected result is visible",
                    action_type="assert_visible",
                    assertion_type="visible",
                    expected_result="The user reaches the expected page or sees a completion message",
                    confidence=0.78,
                ),
            ]
            case = GeneratedTestCase(
                title="Null Provider Test Case",
                description="Auto-generated test case",
                test_type="functional",
                priority="medium",
                steps=steps,
            )
            return schema(test_cases=[case])  # type: ignore[return-value]

        if name == "ElementClassification":
            return schema(  # type: ignore[return-value]
                ai_suggested_name="auto_element",
                ai_suggested_action="click",
                confidence=0.7,
                locator_order=["testid", "role", "css", "xpath"],
            )

        if name == "LocatorEnhancementList":
            return schema(items=[])  # type: ignore[return-value]

        if name == "StepElementBindingDecisionList":
            return schema(items=[])  # type: ignore[return-value]

        return schema.model_validate({})

    async def generate_stream(self, prompt: str, schema: type[T]) -> AsyncIterator[str]:
        result = await self.generate(prompt, schema)
        yield result.model_dump_json()
