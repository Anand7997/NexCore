"""Deterministic NullProvider for tests and CI — no real AI calls."""
from __future__ import annotations

import uuid
from typing import TypeVar

from pydantic import BaseModel

from app.ai_workflow.providers.base import AbstractAIProvider

T = TypeVar("T", bound=BaseModel)


class NullProvider(AbstractAIProvider):
    async def generate(self, prompt: str, schema: type[T]) -> T:
        name = schema.__name__

        if name == "BRDAnalysis":
            return schema(  # type: ignore[return-value]
                summary="Auto-generated summary from BRD.",
                key_features=["Login", "Dashboard", "Settings"],
                modules_suggested=["Authentication", "Navigation"],
                test_objectives=["Verify core user flows", "Validate form inputs"],
            )

        if name == "ScenarioList":
            from app.ai_workflow.schemas import ScenarioPreview
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
            ]
            return schema(scenarios=scenarios)  # type: ignore[return-value]

        if name == "TestCaseList":
            from app.ai_workflow.schemas import GeneratedTestCase, GeneratedTestStep
            steps = [
                GeneratedTestStep(
                    step_number=1,
                    description="Navigate to the application URL",
                    action_type="navigate",
                    confidence=0.95,
                ),
                GeneratedTestStep(
                    step_number=2,
                    description="Assert page title is visible",
                    action_type="assert_visible",
                    assertion_type="visible",
                    confidence=0.9,
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

        return schema.model_validate({})

    async def generate_stream(self, prompt: str, schema: type[T]):
        result = await self.generate(prompt, schema)
        yield result.model_dump_json()
