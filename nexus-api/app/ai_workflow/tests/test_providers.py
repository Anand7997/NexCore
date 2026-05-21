"""Tests for AI provider implementations."""
import asyncio

import pytest

from app.ai_workflow.providers.null_provider import NullProvider
from app.ai_workflow.schemas import BRDAnalysis, ElementClassification, ScenarioList, TestCaseList


@pytest.fixture
def null_provider():
    return NullProvider()


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_null_provider_brd_analysis(null_provider):
    result = run(null_provider.generate("any prompt", BRDAnalysis))
    assert isinstance(result, BRDAnalysis)
    assert result.summary
    assert isinstance(result.key_features, list)


def test_null_provider_scenario_list(null_provider):
    result = run(null_provider.generate("any prompt", ScenarioList))
    assert isinstance(result, ScenarioList)
    assert len(result.scenarios) > 0
    for s in result.scenarios:
        assert s.scenario_id
        assert s.title
        assert s.priority in ("high", "medium", "low")
        assert s.test_type in ("functional", "regression", "smoke", "e2e")
        assert s.classification in ("positive", "negative", "edge")


def test_null_provider_testcase_list(null_provider):
    result = run(null_provider.generate("any prompt", TestCaseList))
    assert isinstance(result, TestCaseList)
    assert len(result.test_cases) > 0
    for tc in result.test_cases:
        assert tc.title
        assert isinstance(tc.steps, list)


def test_null_provider_element_classification(null_provider):
    result = run(null_provider.generate("any prompt", ElementClassification))
    assert isinstance(result, ElementClassification)
    assert 0.0 <= result.confidence <= 1.0
    assert isinstance(result.locator_order, list)


def test_openai_provider_missing_key_raises():
    from app.ai_workflow.providers.openai_provider import OpenAIProvider

    provider = OpenAIProvider(api_key="", model="gpt-4o-mini")
    with pytest.raises(Exception):
        run(provider.generate("test", BRDAnalysis))


def test_claude_provider_missing_key_raises():
    from app.ai_workflow.providers.claude_provider import ClaudeProvider

    provider = ClaudeProvider(api_key="", model="claude-sonnet-4-20250514")
    with pytest.raises(Exception):
        run(provider.generate("test", BRDAnalysis))
