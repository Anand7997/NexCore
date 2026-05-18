"""Execution result routes: per-test-case and per-step result storage."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models import (
    ExecutionModel,
    ExecutionStepResultModel,
    ExecutionTestCaseResultModel,
)
from app.database.session import get_db

router = APIRouter(tags=["execution-results"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class StepResultCreate(BaseModel):
    test_step_id: str
    step_order: int = 1
    action_type: str = ""
    page_id: str | None = None
    page_element_id: str | None = None
    api_endpoint_id: str | None = None
    locator_used: str = ""
    input_value: str = ""
    expected_result: str = ""
    actual_result: str = ""
    status: str = "pending"
    error_message: str | None = None
    screenshot_url: str | None = None
    log_output: str = ""
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None


class StepResultUpdate(BaseModel):
    actual_result: str | None = None
    status: str | None = None
    error_message: str | None = None
    screenshot_url: str | None = None
    log_output: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None


class StepResultResponse(BaseModel):
    id: str
    execution_id: str
    test_case_result_id: str
    test_case_id: str
    test_step_id: str
    step_order: int
    action_type: str
    page_id: str | None
    page_element_id: str | None
    api_endpoint_id: str | None
    locator_used: str
    input_value: str
    expected_result: str
    actual_result: str
    status: str
    error_message: str | None
    screenshot_url: str | None
    log_output: str
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TestCaseResultCreate(BaseModel):
    test_case_id: str
    project_id: str | None = None
    module_id: str | None = None
    workflow_id: str | None = None
    testing_type_id: str | None = None
    status: str = "pending"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    error_message: str | None = None


class TestCaseResultUpdate(BaseModel):
    status: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    error_message: str | None = None


class TestCaseResultResponse(BaseModel):
    id: str
    execution_id: str
    project_id: str | None
    module_id: str | None
    workflow_id: str | None
    test_case_id: str
    testing_type_id: str | None
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None
    error_message: str | None
    created_at: datetime
    step_results: list[StepResultResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ── Test-case result routes ───────────────────────────────────────────────────

@router.get(
    "/executions/{execution_id}/test-case-results",
    response_model=list[TestCaseResultResponse],
)
async def list_test_case_results(
    execution_id: str,
    db: AsyncSession = Depends(get_db),
):
    await _require_execution(execution_id, db)
    result = await db.execute(
        select(ExecutionTestCaseResultModel)
        .options(selectinload(ExecutionTestCaseResultModel.step_results))
        .where(ExecutionTestCaseResultModel.execution_id == execution_id)
        .order_by(ExecutionTestCaseResultModel.created_at)
    )
    return list(result.scalars().all())


@router.post(
    "/executions/{execution_id}/test-case-results",
    response_model=TestCaseResultResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_test_case_result(
    execution_id: str,
    payload: TestCaseResultCreate,
    db: AsyncSession = Depends(get_db),
):
    await _require_execution(execution_id, db)
    row = ExecutionTestCaseResultModel(
        execution_id=execution_id,
        test_case_id=payload.test_case_id,
        project_id=payload.project_id,
        module_id=payload.module_id,
        workflow_id=payload.workflow_id,
        testing_type_id=payload.testing_type_id,
        status=payload.status,
        started_at=payload.started_at,
        completed_at=payload.completed_at,
        duration_ms=payload.duration_ms,
        error_message=payload.error_message,
    )
    db.add(row)
    await db.commit()
    return await _get_tc_result(row.id, db)


@router.get(
    "/executions/{execution_id}/test-case-results/{result_id}",
    response_model=TestCaseResultResponse,
)
async def get_test_case_result(
    execution_id: str,
    result_id: str,
    db: AsyncSession = Depends(get_db),
):
    row = await _get_tc_result(result_id, db)
    if not row or row.execution_id != execution_id:
        raise HTTPException(status_code=404, detail="Test case result not found")
    return row


@router.patch(
    "/executions/{execution_id}/test-case-results/{result_id}",
    response_model=TestCaseResultResponse,
)
async def update_test_case_result(
    execution_id: str,
    result_id: str,
    payload: TestCaseResultUpdate,
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(ExecutionTestCaseResultModel, result_id)
    if not row or row.execution_id != execution_id:
        raise HTTPException(status_code=404, detail="Test case result not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(row, field, value)
    await db.commit()
    return await _get_tc_result(result_id, db)


# ── Step result routes ────────────────────────────────────────────────────────

@router.post(
    "/execution-results/{tc_result_id}/step-results",
    response_model=StepResultResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_step_result(
    tc_result_id: str,
    payload: StepResultCreate,
    db: AsyncSession = Depends(get_db),
):
    tc_row = await db.get(ExecutionTestCaseResultModel, tc_result_id)
    if not tc_row:
        raise HTTPException(status_code=404, detail="Test case result not found")
    row = ExecutionStepResultModel(
        execution_id=tc_row.execution_id,
        test_case_result_id=tc_result_id,
        test_case_id=tc_row.test_case_id,
        test_step_id=payload.test_step_id,
        step_order=payload.step_order,
        action_type=payload.action_type,
        page_id=payload.page_id,
        page_element_id=payload.page_element_id,
        api_endpoint_id=payload.api_endpoint_id,
        locator_used=payload.locator_used,
        input_value=payload.input_value,
        expected_result=payload.expected_result,
        actual_result=payload.actual_result,
        status=payload.status,
        error_message=payload.error_message,
        screenshot_url=payload.screenshot_url,
        log_output=payload.log_output,
        started_at=payload.started_at,
        completed_at=payload.completed_at,
        duration_ms=payload.duration_ms,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch(
    "/execution-results/step-results/{step_result_id}",
    response_model=StepResultResponse,
)
async def update_step_result(
    step_result_id: str,
    payload: StepResultUpdate,
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(ExecutionStepResultModel, step_result_id)
    if not row:
        raise HTTPException(status_code=404, detail="Step result not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.get(
    "/executions/{execution_id}/step-results",
    response_model=list[StepResultResponse],
)
async def list_step_results(
    execution_id: str,
    test_case_id: str | None = None,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Flat list of all step results for an execution, optionally filtered."""
    await _require_execution(execution_id, db)
    stmt = (
        select(ExecutionStepResultModel)
        .where(ExecutionStepResultModel.execution_id == execution_id)
        .order_by(ExecutionStepResultModel.step_order)
    )
    if test_case_id:
        stmt = stmt.where(ExecutionStepResultModel.test_case_id == test_case_id)
    if status_filter:
        stmt = stmt.where(ExecutionStepResultModel.status == status_filter)
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/executions/{execution_id}/results-summary")
async def results_summary(execution_id: str, db: AsyncSession = Depends(get_db)):
    """Aggregate pass/fail/pending counts across all test-case results."""
    await _require_execution(execution_id, db)
    tc_rows = await db.execute(
        select(ExecutionTestCaseResultModel)
        .where(ExecutionTestCaseResultModel.execution_id == execution_id)
    )
    tc_list = list(tc_rows.scalars().all())

    step_rows = await db.execute(
        select(ExecutionStepResultModel)
        .where(ExecutionStepResultModel.execution_id == execution_id)
    )
    step_list = list(step_rows.scalars().all())

    def _count(items: list, s: str) -> int:
        return sum(1 for i in items if i.status == s)

    return {
        "execution_id": execution_id,
        "test_cases": {
            "total":   len(tc_list),
            "passed":  _count(tc_list, "passed"),
            "failed":  _count(tc_list, "failed"),
            "pending": _count(tc_list, "pending"),
            "skipped": _count(tc_list, "skipped"),
        },
        "steps": {
            "total":   len(step_list),
            "passed":  _count(step_list, "passed"),
            "failed":  _count(step_list, "failed"),
            "pending": _count(step_list, "pending"),
            "skipped": _count(step_list, "skipped"),
        },
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _require_execution(execution_id: str, db: AsyncSession) -> ExecutionModel:
    execution = await db.get(ExecutionModel, execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


async def _get_tc_result(
    result_id: str, db: AsyncSession
) -> ExecutionTestCaseResultModel | None:
    r = await db.execute(
        select(ExecutionTestCaseResultModel)
        .options(selectinload(ExecutionTestCaseResultModel.step_results))
        .where(ExecutionTestCaseResultModel.id == result_id)
    )
    return r.scalar_one_or_none()
