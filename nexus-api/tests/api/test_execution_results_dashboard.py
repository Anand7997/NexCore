"""Execution dashboard result identity regression tests."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.database.models import (
    ExecutionModel,
    ExecutionTestCaseResultModel,
    TestCaseModel as CaseModel,
    TestModuleModel as ModuleModel,
    TestProjectModel as ProjectModel,
    WorkflowModel,
)
from app.database.session import AsyncSessionLocal


@pytest.mark.asyncio
async def test_execution_list_and_detail_include_result_identity(client: AsyncClient):
    project_id = str(uuid.uuid4())
    module_id = str(uuid.uuid4())
    test_case_id = str(uuid.uuid4())
    workflow_id = str(uuid.uuid4())
    execution_id = str(uuid.uuid4())
    result_id = str(uuid.uuid4())

    async with AsyncSessionLocal() as db:
        db.add_all([
            ProjectModel(id=project_id, name="Payments"),
            ModuleModel(id=module_id, project_id=project_id, name="Checkout"),
            CaseModel(
                id=test_case_id,
                project_id=project_id,
                module_id=module_id,
                name="Authorize card payment",
                platforms=["web"],
            ),
            WorkflowModel(
                id=workflow_id,
                project_id=project_id,
                module_id=module_id,
                name="Execution - Authorize card payment",
                platforms=["web"],
            ),
            ExecutionModel(
                id=execution_id,
                workflow_id=workflow_id,
                project_id=project_id,
                module_id=module_id,
                status="completed",
                trigger="manual",
                environment="qa",
                platform="web",
                variables={"test_case_ids": [test_case_id]},
            ),
            ExecutionTestCaseResultModel(
                id=result_id,
                execution_id=execution_id,
                project_id=project_id,
                module_id=module_id,
                workflow_id=workflow_id,
                test_case_id=test_case_id,
                status="passed",
            ),
        ])
        await db.commit()

    list_response = await client.get("/api/executions/")
    assert list_response.status_code == 200
    item = next(row for row in list_response.json() if row["id"] == execution_id)
    assert item["result_id"] == result_id
    assert item["result_count"] == 1
    assert item["test_case_name"] == "Authorize card payment"
    assert item["module_name"] == "Checkout"
    assert item["project_name"] == "Payments"
    assert item["platform"] == "web"

    detail_response = await client.get(f"/api/executions/{execution_id}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["result_id"] == result_id
    assert detail["result_count"] == 1
    assert detail["node_count"] == 0
    assert detail["completed_nodes"] == 0
