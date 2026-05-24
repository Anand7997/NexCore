import asyncio
import importlib.util

import pytest

from app.intelligence.langgraph_rca import build_rca_graph, run_rca


def test_rca_graph_compilation():
    if importlib.util.find_spec("langgraph") is None:
        pytest.skip("langgraph optional dependency is not installed")
    graph = build_rca_graph()
    assert graph is not None


def test_rca_heuristic_fallback(monkeypatch):
    monkeypatch.setattr(
        "app.intelligence.langgraph_rca._get_ai_provider",
        lambda: None,
    )

    # Evidence representing a selector failure
    evidence = {
        "executionId": "exec-abc-123",
        "timeline": [
            {
                "nodeId": "node-1",
                "status": "failed",
                "error": "Error: Timeout waiting for locator('button.submit-btn') to be visible",
                "message": "Click action failed"
            }
        ],
        "artifacts": []
    }

    result = asyncio.run(
        run_rca(
            job_id="job-1",
            job_type="root_cause_analysis",
            tenant_id="tenant-1",
            evidence=evidence,
        )
    )

    # Verify state keys are present and populated correctly by fallback heuristics
    assert result["execution_id"] == "exec-abc-123"
    assert result["failure_class"] == "selector_failure"
    assert len(result["findings"]) > 0
    assert result["findings"][0]["class"] == "selector_failure"
    assert result["findings"][0]["severity"] == "critical"

    assert len(result["recommendations"]) > 0
    assert any("selector" in r["action"].lower() for r in result["recommendations"])
    assert result["confidence"] > 0.0
    assert "selector failure" in result["summary"].lower()
