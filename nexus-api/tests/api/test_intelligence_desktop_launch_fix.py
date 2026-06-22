from __future__ import annotations

import json

import pytest
from httpx import AsyncClient

from app.api.routes import intelligence as intelligence_routes
from app.database.models import ExecutionModel, ExecutionNodeModel, WorkflowModel, WorkflowNodeModel
from app.database.session import AsyncSessionLocal


@pytest.mark.asyncio
async def test_ai_inspector_suggests_and_applies_desktop_launch_attach_fix(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    async with AsyncSessionLocal() as db:
        workflow = WorkflowModel(
            name="Generic desktop workflow",
            description="",
            platforms=["desktop"],
            variables={},
        )
        db.add(workflow)
        await db.flush()
        workflow_node = WorkflowNodeModel(
            workflow_id=workflow.id,
            node_key="desktop_launch",
            type="desktop.launch",
            label="Launch Generic Editor",
            config={
                "app": r"C:\Tools\generic-editor.exe",
                "driver_type": "uia3",
                "window_title": "Snap Assist",
                "process_name": "17880",
                "timeout_ms": 30000,
            },
        )
        execution = ExecutionModel(
            workflow_id=workflow.id,
            status="failed",
            platform="desktop",
            variables={},
            error="One or more nodes failed",
        )
        db.add_all([workflow_node, execution])
        await db.flush()
        execution_node = ExecutionNodeModel(
            execution_id=execution.id,
            node_key="desktop_launch",
            node_label="Launch Generic Editor",
            node_type="desktop.launch",
            status="cancelled",
            attempt_count=3,
            output={},
            error="Cancelled after 3 attempts",
        )
        db.add(execution_node)
        await db.commit()
        execution_id = execution.id

    response = await client.get(f"/api/intelligence/executions/{execution_id}/fix-suggestions")
    assert response.status_code == 200
    suggestions = response.json()
    assert len(suggestions) == 1
    suggestion = suggestions[0]
    assert suggestion["category"] == "desktop_launch_config"
    assert suggestion["target_type"] == "workflow_node"
    new_config = json.loads(suggestion["new_value"])
    assert new_config["attach_if_running"] is True
    assert new_config["window_title"] == "Generic Editor"
    assert new_config["process_name"] == "generic-editor.exe"

    async def no_llm_answer(**_kwargs):
        return None, None, None, "No provider in test", []

    monkeypatch.setattr(intelligence_routes, "_assistant_llm_answer", no_llm_answer)
    assistant_response = await client.post(
        f"/api/intelligence/executions/{execution_id}/assistant-query",
        json={"question": "what was the wrror actually"},
    )
    assert assistant_response.status_code == 200
    assistant = assistant_response.json()
    assert assistant["intent"] == "root_cause"
    assert "desktop.launch" in assistant["answer"]
    assert assistant["answer_source"] == "fallback"
    assert assistant["sources"]
    assert assistant["fixes"][0]["category"] == "desktop_launch_config"
    assert assistant["recommended_fix_id"] == assistant["fixes"][0]["id"]

    async def fake_llm_answer(**kwargs):
        fix = kwargs["fixes"][0]
        return (
            intelligence_routes.AssistantLLMAnswer(
                answer="LLM answer: desktop.launch was cancelled before app interactions, so use the attach-first patch.",
                confidence=0.93,
                recommended_fix_id=fix.id,
            ),
            "openai",
            "gpt-5.5",
            None,
            [],
        )

    monkeypatch.setattr(intelligence_routes, "_assistant_llm_answer", fake_llm_answer)
    llm_response = await client.post(
        f"/api/intelligence/executions/{execution_id}/assistant-query",
        json={"question": "show fixes"},
    )
    assert llm_response.status_code == 200
    llm_assistant = llm_response.json()
    assert llm_assistant["answer_source"] == "llm"
    assert llm_assistant["provider"] == "openai"
    assert llm_assistant["model"] == "gpt-5.5"
    assert llm_assistant["answer"].startswith("LLM answer")

    apply_response = await client.post(
        f"/api/intelligence/executions/{execution_id}/fix-suggestions/desktop_launch/implement",
        json={},
    )
    assert apply_response.status_code == 200
    assert apply_response.json()["applied"] is True

    async with AsyncSessionLocal() as db:
        node = await db.get(WorkflowNodeModel, workflow_node.id)
        assert node is not None
        assert node.config["attach_if_running"] is True
        assert node.config["window_title"] == "Generic Editor"
        assert node.config["process_name"] == "generic-editor.exe"


@pytest.mark.asyncio
async def test_ai_inspector_suggests_visible_desktop_window_fix(client: AsyncClient):
    async with AsyncSessionLocal() as db:
        workflow = WorkflowModel(
            name="Generic desktop workflow visible window",
            description="",
            platforms=["desktop"],
            variables={},
        )
        db.add(workflow)
        await db.flush()
        workflow_node = WorkflowNodeModel(
            workflow_id=workflow.id,
            node_key="desktop_launch",
            type="desktop.launch",
            label="Launch Desktop Application",
            config={
                "app": r'"C:\Tools\generic-editor.exe"',
                "attach_if_running": True,
                "driver_type": "uia3",
                "process_name": "generic-editor.exe",
                "timeout_ms": 90000,
                "window_title": "Generic Editor",
            },
            timeout_seconds=120,
        )
        execution = ExecutionModel(
            workflow_id=workflow.id,
            status="failed",
            platform="desktop",
            variables={},
            error="One or more nodes failed",
        )
        db.add_all([workflow_node, execution])
        await db.flush()
        execution_node = ExecutionNodeModel(
            execution_id=execution.id,
            node_key="desktop_launch",
            node_label="Launch Desktop Application",
            node_type="desktop.launch",
            status="failed",
            attempt_count=3,
            output={},
            error="No windows for that process could be found",
        )
        db.add(execution_node)
        await db.commit()
        execution_id = execution.id

    response = await client.get(f"/api/intelligence/executions/{execution_id}/fix-suggestions")
    assert response.status_code == 200
    suggestions = response.json()
    assert len(suggestions) == 1
    suggestion = suggestions[0]
    assert suggestion["title"] == "Attach desktop app by stable window title"
    new_config = json.loads(suggestion["new_value"])
    assert new_config["attach_if_running"] is True
    assert new_config["window_title"] == "Generic Editor"
    assert "process_name" not in new_config
    assert "args" not in new_config

    apply_response = await client.post(
        f"/api/intelligence/executions/{execution_id}/fix-suggestions/desktop_launch/implement",
        json={},
    )
    assert apply_response.status_code == 200
    assert apply_response.json()["applied"] is True

    async with AsyncSessionLocal() as db:
        node = await db.get(WorkflowNodeModel, workflow_node.id)
        assert node is not None
        assert node.config["window_title"] == "Generic Editor"
        assert "process_name" not in node.config
        assert "args" not in node.config
