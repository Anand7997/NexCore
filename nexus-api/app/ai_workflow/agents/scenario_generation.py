from __future__ import annotations

import logging

from app.ai_workflow.providers.base import AbstractAIProvider
from app.ai_workflow.prompts.scenario_prompt import build_scenario_prompt
from app.ai_workflow.schemas import BRDAnalysis, ScenarioList

logger = logging.getLogger(__name__)


class ScenarioGenerationAgent:
    def __init__(self, provider: AbstractAIProvider) -> None:
        self._provider = provider

    async def run(
        self,
        brd_text: str,
        project_name: str,
        page_name: str,
        elements_summary: str,
        brd_analysis: BRDAnalysis,
    ) -> ScenarioList:
        prompt = build_scenario_prompt(
            brd_text=brd_text,
            project_name=project_name,
            page_name=page_name,
            elements_summary=elements_summary,
            brd_analysis_summary=brd_analysis.summary,
        )
        logger.info("ScenarioGenerationAgent: generating scenarios for '%s'", project_name)
        result = await self._provider.generate(prompt, ScenarioList)
        logger.info("ScenarioGenerationAgent: generated %d scenarios", len(result.scenarios))
        return result
