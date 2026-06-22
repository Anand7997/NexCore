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
            is_desktop = any(
                token in context_text
                for token in ("platform: desktop", "observed platform: desktop")
            )
            page_name = "Primary Screen" if is_desktop else "Primary Page"
            if is_desktop:
                scenarios = [
                    ScenarioPreview(
                        scenario_id=str(uuid.uuid4()),
                        title="Primary desktop workflow",
                        business_requirement=(
                            "The target desktop application must complete the main workflow "
                            "described by the BRD and expose an observable result."
                        ),
                        priority="high",
                        test_type="smoke",
                        classification="positive",
                        pages_involved=[page_name],
                        estimated_test_cases=1,
                        confidence=0.76,
                    ),
                    ScenarioPreview(
                        scenario_id=str(uuid.uuid4()),
                        title="Desktop workflow validation",
                        business_requirement=(
                            "The target desktop application must handle required inputs, "
                            "choices, or state changes without assuming a web authentication flow."
                        ),
                        priority="medium",
                        test_type="regression",
                        classification="edge",
                        pages_involved=[page_name],
                        estimated_test_cases=1,
                        confidence=0.68,
                    ),
                ]
                return schema(scenarios=scenarios)  # type: ignore[return-value]
            scenarios = [
                ScenarioPreview(
                    scenario_id=str(uuid.uuid4()),
                    title="Primary workflow completion",
                    business_requirement=(
                        "The application must let the user complete the main workflow "
                        "described by the BRD and show an observable result."
                    ),
                    priority="high",
                    test_type="functional",
                    classification="positive",
                    pages_involved=[page_name],
                    estimated_test_cases=2,
                    confidence=0.74,
                ),
                ScenarioPreview(
                    scenario_id=str(uuid.uuid4()),
                    title="Required input validation",
                    business_requirement=(
                        "The application must validate required user input and show clear feedback "
                        "when the workflow cannot continue."
                    ),
                    priority="high",
                    test_type="functional",
                    classification="negative",
                    pages_involved=[page_name],
                    estimated_test_cases=2,
                    confidence=0.7,
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
                    pages_involved=[page_name],
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
            is_desktop = any(
                token in context_text
                for token in ("platform: desktop", "observed platform: desktop")
            )
            if is_desktop:
                steps = [
                    GeneratedTestStep(
                        step_number=1,
                        description="Launch the target desktop application",
                        action_type="navigate",
                        confidence=0.82,
                    ),
                    GeneratedTestStep(
                        step_number=2,
                        description="Focus the primary control needed for the requested workflow",
                        action_type="click",
                        confidence=0.68,
                    ),
                    GeneratedTestStep(
                        step_number=3,
                        description="Enter the required value for the workflow when a text input is present",
                        action_type="fill",
                        input_value="sample value",
                        confidence=0.58,
                    ),
                    GeneratedTestStep(
                        step_number=4,
                        description="Confirm or execute the requested workflow action",
                        action_type="click",
                        confidence=0.66,
                    ),
                    GeneratedTestStep(
                        step_number=5,
                        description="Assert the expected desktop result or status is visible",
                        action_type="assert_visible",
                        assertion_type="visible",
                        expected_result="The requested workflow shows an observable completion state",
                        confidence=0.62,
                    ),
                ]
                return schema(test_cases=[GeneratedTestCase(
                    title="Primary desktop workflow",
                    description="Verify the target desktop application can complete the requested workflow.",
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
                    description="Enter the required user-provided value",
                    action_type="fill",
                    input_value="sample value",
                    confidence=0.72,
                ),
                GeneratedTestStep(
                    step_number=3,
                    description="Click the primary submit button",
                    action_type="click",
                    confidence=0.86,
                ),
                GeneratedTestStep(
                    step_number=4,
                    description="Wait for the requested workflow result to finish loading",
                    action_type="wait",
                    confidence=0.66,
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
