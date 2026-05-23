"""Tests for AI provider implementations."""
import asyncio
from types import SimpleNamespace

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


def test_openai_json_loader_repairs_unquoted_keys():
    from app.ai_workflow.providers.openai_provider import _load_model_json

    raw = """
    ```json
    {
      scenarios: [
        {
          scenario_id: "11111111-1111-1111-1111-111111111111",
          title: "Login works",
          business_requirement: "Users can sign in",
          priority: "high",
          test_type: "smoke",
          classification: "positive",
          pages_involved: ["Login"],
          estimated_test_cases: 1,
          confidence: 0.91,
        }
      ],
    }
    ```
    """

    data = _load_model_json(raw)

    assert data["scenarios"][0]["scenario_id"] == "11111111-1111-1111-1111-111111111111"
    assert data["scenarios"][0]["title"] == "Login works"


def test_openai_response_schema_disallows_additional_properties():
    from app.ai_workflow.providers.openai_provider import _to_openai_response_schema

    schema = _to_openai_response_schema(BRDAnalysis)

    assert schema["additionalProperties"] is False


def test_openai_response_schema_requires_every_object_property():
    from app.ai_workflow.providers.openai_provider import _to_openai_response_schema

    schema = _to_openai_response_schema(ScenarioList)
    scenario = schema["$defs"]["ScenarioPreview"]

    assert set(schema["required"]) == set(schema["properties"])
    assert set(scenario["required"]) == set(scenario["properties"])
    assert "selected" in scenario["required"]


def test_openai_response_schema_removes_defaults_recursively():
    from app.ai_workflow.providers.openai_provider import _to_openai_response_schema

    def assert_no_defaults(node):
        if isinstance(node, dict):
            assert "default" not in node
            for value in node.values():
                assert_no_defaults(value)
        elif isinstance(node, list):
            for item in node:
                assert_no_defaults(item)

    schema = _to_openai_response_schema(TestCaseList)
    test_case = schema["$defs"]["GeneratedTestCase"]
    test_step = schema["$defs"]["GeneratedTestStep"]

    assert set(test_case["required"]) == set(test_case["properties"])
    assert set(test_step["required"]) == set(test_step["properties"])
    assert_no_defaults(schema)


def test_openai_response_text_extracts_responses_output_content():
    from app.ai_workflow.providers.openai_provider import _extract_response_text

    response = SimpleNamespace(
        status="completed",
        error=None,
        incomplete_details=None,
        output=[
            SimpleNamespace(
                content=[
                    SimpleNamespace(
                        type="output_text",
                        text='{"scenarios":[]}',
                    )
                ],
            )
        ],
    )

    assert _extract_response_text(response) == '{"scenarios":[]}'


def test_openai_response_text_missing_output_raises_instead_of_empty_object():
    from app.ai_workflow.providers.openai_provider import _extract_response_text

    response = SimpleNamespace(
        status="completed",
        error=None,
        incomplete_details=None,
        output=[],
    )

    with pytest.raises(ValueError, match="did not include output text"):
        _extract_response_text(response)


def test_openai_response_text_incomplete_max_output_tokens_raises_typed_error():
    from app.ai_workflow.providers.openai_provider import (
        OpenAIIncompleteResponseError,
        _extract_response_text,
    )

    response = SimpleNamespace(
        status="incomplete",
        error=None,
        incomplete_details=SimpleNamespace(reason="max_output_tokens"),
        output=[],
    )

    with pytest.raises(OpenAIIncompleteResponseError) as exc_info:
        _extract_response_text(response)
    assert exc_info.value.reason == "max_output_tokens"


def test_openai_initial_output_budget_is_larger_for_scenarios():
    from app.ai_workflow.providers.openai_provider import _initial_max_output_tokens

    assert _initial_max_output_tokens(ScenarioList) > _initial_max_output_tokens(BRDAnalysis)


def test_openai_output_budget_depends_on_model_tier():
    from app.ai_workflow.providers.openai_provider import _initial_max_output_tokens

    fast = _initial_max_output_tokens(ScenarioList, "gpt-5-nano")
    balanced = _initial_max_output_tokens(ScenarioList, "gpt-5-mini")
    best = _initial_max_output_tokens(ScenarioList, "gpt-5.5")

    assert fast < balanced < best


def test_claude_provider_missing_key_raises():
    from app.ai_workflow.providers.claude_provider import ClaudeProvider

    provider = ClaudeProvider(api_key="", model="claude-sonnet-4-20250514")
    with pytest.raises(Exception):
        run(provider.generate("test", BRDAnalysis))
