from __future__ import annotations

import logging

from app.ai_workflow.providers.base import AbstractAIProvider
from app.ai_workflow.prompts.brd_analysis_prompt import build_brd_analysis_prompt
from app.ai_workflow.schemas import BRDAnalysis

logger = logging.getLogger(__name__)


class BRDAnalysisAgent:
    def __init__(self, provider: AbstractAIProvider) -> None:
        self._provider = provider

    async def run(self, brd_text: str, webpage_url: str, project_name: str) -> BRDAnalysis:
        prompt = build_brd_analysis_prompt(brd_text, webpage_url, project_name)
        logger.info("BRDAnalysisAgent: analysing BRD (%d chars)", len(brd_text))
        result = await self._provider.generate(prompt, BRDAnalysis)
        logger.info("BRDAnalysisAgent: extracted %d features", len(result.key_features))
        return result
