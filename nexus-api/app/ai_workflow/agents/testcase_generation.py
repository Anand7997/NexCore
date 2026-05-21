from __future__ import annotations

import logging

from app.ai_workflow.providers.base import AbstractAIProvider
from app.ai_workflow.prompts.testcase_prompt import build_testcase_prompt
from app.ai_workflow.schemas import ScenarioPreview, TestCaseList

logger = logging.getLogger(__name__)


class TestCaseGenerationAgent:
    def __init__(self, provider: AbstractAIProvider) -> None:
        self._provider = provider

    async def run(
        self,
        scenario: ScenarioPreview,
        page_name: str,
        elements_summary: str,
    ) -> TestCaseList:
        prompt = build_testcase_prompt(
            scenario_title=scenario.title,
            business_requirement=scenario.business_requirement,
            test_type=scenario.test_type,
            priority=scenario.priority,
            page_name=page_name,
            elements_summary=elements_summary,
        )
        logger.info("TestCaseGenerationAgent: generating cases for scenario '%s'", scenario.title)
        result = await self._provider.generate(prompt, TestCaseList)
        logger.info("TestCaseGenerationAgent: %d test cases created", len(result.test_cases))
        return result
