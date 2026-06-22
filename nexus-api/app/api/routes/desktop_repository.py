"""Reusable desktop testcase repository.

This library stores desktop testcases and their steps for reuse. Page
Repository remains the source of truth for locators; inserted steps refresh
their page/element bindings before they are saved into the target testcase.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.routes.page_repository import _apply_element_to_test_step, _is_desktop_page
from app.api.routes.test_configuration import _to_case_response
from app.database.models import (
    DesktopRepositoryCaseModel,
    DesktopRepositoryStepModel,
    PageElementModel,
    PageRepositoryModel,
    TestCaseModel,
    TestModuleModel,
    TestProjectModel,
    TestStepModel,
)
from app.database.session import get_db
from app.domain.test_configuration.repository import TestConfigurationRepository
from app.domain.test_configuration.schemas import TestCaseResponse

router = APIRouter(prefix="/desktop-repository", tags=["desktop-repository"])


class DesktopRepositoryStepResponse(BaseModel):
    id: str
    repository_case_id: str
    source_test_step_id: Optional[str] = None
    step_order: int
    name: str
    description: str = ""
    action_type: str = ""
    page_id: Optional[str] = None
    page_element_id: Optional[str] = None
    api_endpoint_id: Optional[str] = None
    input_value: str = ""
    expected_result: str = ""
    assertion_type: str = ""
    secondary_action: str = ""
    secondary_value: str = ""
    intent: str = ""
    target: str = ""
    test_data: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    bindings: dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class DesktopRepositoryCaseResponse(BaseModel):
    id: str
    source_test_case_id: Optional[str] = None
    source_project_id: Optional[str] = None
    source_module_id: Optional[str] = None
    name: str
    description: str = ""
    status: str = "active"
    test_type: str = "functional"
    priority: str = "p2"
    execution_mode: str = "automated"
    platforms: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    default_variables: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    step_count: int = 0
    created_at: datetime
    updated_at: datetime
    steps: list[DesktopRepositoryStepResponse] = Field(default_factory=list)


class SaveDesktopRepositoryCaseRequest(BaseModel):
    test_case_id: str
    name: Optional[str] = None
    description: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class InsertDesktopRepositoryCaseRequest(BaseModel):
    target_test_case_id: str
    position: Optional[int] = None
    include_disabled: bool = True


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        text = str(value or "").strip()
        key = text.lower()
        if not text or key in seen:
            continue
        seen.add(key)
        output.append(text)
    return output


def _desktop_platforms(platforms: list[str]) -> list[str]:
    values = _unique([str(item) for item in platforms])
    lower = {item.lower() for item in values}
    if "desktop" not in lower and "windows" not in lower:
        values.append("desktop")
    return values


def _repo_step_response(step: DesktopRepositoryStepModel) -> DesktopRepositoryStepResponse:
    return DesktopRepositoryStepResponse(
        id=step.id,
        repository_case_id=step.repository_case_id,
        source_test_step_id=step.source_test_step_id,
        step_order=step.step_order,
        name=step.name,
        description=step.description or "",
        action_type=step.action_type or step.intent or "",
        page_id=step.page_id,
        page_element_id=step.page_element_id,
        api_endpoint_id=step.api_endpoint_id,
        input_value=step.input_value or "",
        expected_result=step.expected_result or "",
        assertion_type=step.assertion_type or "",
        secondary_action=step.secondary_action or "",
        secondary_value=step.secondary_value or "",
        intent=step.intent or "",
        target=step.target or "",
        test_data=step.test_data or {},
        tags=step.tags or [],
        bindings=step.bindings or {},
        is_enabled=bool(step.is_enabled),
        metadata=step.step_metadata or {},
        created_at=step.created_at,
        updated_at=step.updated_at,
    )


def _repo_case_response(case: DesktopRepositoryCaseModel) -> DesktopRepositoryCaseResponse:
    steps = sorted(case.steps or [], key=lambda step: (step.step_order, step.created_at))
    return DesktopRepositoryCaseResponse(
        id=case.id,
        source_test_case_id=case.source_test_case_id,
        source_project_id=case.source_project_id,
        source_module_id=case.source_module_id,
        name=case.name,
        description=case.description or "",
        status=case.status or "active",
        test_type=case.test_type or "functional",
        priority=case.priority or "p2",
        execution_mode=case.execution_mode or "automated",
        platforms=case.platforms or [],
        tags=case.tags or [],
        default_variables=case.default_variables or {},
        metadata=case.library_metadata or {},
        step_count=len(steps),
        created_at=case.created_at,
        updated_at=case.updated_at,
        steps=[_repo_step_response(step) for step in steps],
    )


async def _load_source_case(test_case_id: str, db: AsyncSession) -> TestCaseModel:
    result = await db.execute(
        select(TestCaseModel)
        .where(TestCaseModel.id == test_case_id)
        .options(
            selectinload(TestCaseModel.module).selectinload(TestModuleModel.project),
            selectinload(TestCaseModel.test_steps).selectinload(TestStepModel.page),
            selectinload(TestCaseModel.test_steps).selectinload(TestStepModel.page_element),
        )
    )
    case = result.scalar_one_or_none()
    if case is None:
        raise HTTPException(status_code=404, detail="Test case not found")
    return case


async def _load_repo_case(case_id: str, db: AsyncSession) -> DesktopRepositoryCaseModel:
    result = await db.execute(
        select(DesktopRepositoryCaseModel)
        .where(DesktopRepositoryCaseModel.id == case_id)
        .options(
            selectinload(DesktopRepositoryCaseModel.steps).selectinload(DesktopRepositoryStepModel.page),
            selectinload(DesktopRepositoryCaseModel.steps).selectinload(DesktopRepositoryStepModel.page_element),
        )
    )
    case = result.scalar_one_or_none()
    if case is None:
        raise HTTPException(status_code=404, detail="Desktop repository testcase not found")
    return case


def _source_step_metadata(step: TestStepModel) -> dict[str, Any]:
    page = getattr(step, "page", None)
    page_element = getattr(step, "page_element", None)
    return {
        "source": "test_configuration",
        "page_name": str(getattr(page, "name", "") or ""),
        "page_platform": str(getattr(page, "platform", "") or ""),
        "page_element_name": str(getattr(page_element, "name", "") or ""),
        "locator_snapshot": {
            "xpath": str(getattr(page_element, "xpath", "") or ""),
            "css_selector": str(getattr(page_element, "css_selector", "") or ""),
            "id_attr": str(getattr(page_element, "id_attr", "") or ""),
            "name_attr": str(getattr(page_element, "name_attr", "") or ""),
            "path_location": str(_dict(step.test_data).get("path_location") or ""),
        },
    }


def _copy_step_to_repository(case: DesktopRepositoryCaseModel, step: TestStepModel) -> DesktopRepositoryStepModel:
    return DesktopRepositoryStepModel(
        repository_case=case,
        source_test_step_id=step.id,
        step_order=step.step_order,
        name=step.name,
        description=step.description or "",
        action_type=step.action_type or step.intent or "",
        page_id=step.page_id,
        page_element_id=step.page_element_id,
        api_endpoint_id=step.api_endpoint_id,
        input_value=step.input_value or "",
        expected_result=step.expected_result or "",
        assertion_type=step.assertion_type or "",
        secondary_action=step.secondary_action or "",
        secondary_value=step.secondary_value or "",
        intent=step.intent or step.action_type or "",
        target=step.target or "",
        test_data=dict(step.test_data or {}),
        tags=list(step.tags or []),
        bindings=dict(step.bindings or {}),
        is_enabled=bool(step.is_enabled),
        step_metadata=_source_step_metadata(step),
    )


def _copy_repository_step_to_testcase(
    repo_step: DesktopRepositoryStepModel,
    *,
    target_case_id: str,
    order: int,
    repository_case_id: str,
) -> TestStepModel:
    tags = _unique([*list(repo_step.tags or []), "desktop-repository"])
    metadata = dict(repo_step.step_metadata or {})
    metadata.update({
        "desktop_repository_case_id": repository_case_id,
        "desktop_repository_step_id": repo_step.id,
    })
    test_data = dict(repo_step.test_data or {})
    test_data["desktop_repository"] = metadata
    return TestStepModel(
        test_case_id=target_case_id,
        step_order=order,
        name=repo_step.name,
        description=repo_step.description or "",
        action_type=repo_step.action_type or repo_step.intent or "",
        page_id=repo_step.page_id,
        page_element_id=repo_step.page_element_id,
        api_endpoint_id=repo_step.api_endpoint_id,
        input_value=repo_step.input_value or "",
        expected_result=repo_step.expected_result or "",
        assertion_type=repo_step.assertion_type or "",
        secondary_action=repo_step.secondary_action or "",
        secondary_value=repo_step.secondary_value or "",
        intent=repo_step.intent or repo_step.action_type or "",
        target=repo_step.target or "",
        test_data=test_data,
        tags=tags,
        bindings=dict(repo_step.bindings or {}),
        is_enabled=bool(repo_step.is_enabled),
    )


def _refresh_page_only_step(step: TestStepModel, page: PageRepositoryModel) -> None:
    test_data = dict(step.test_data or {})
    bindings = dict(step.bindings or {})
    if _is_desktop_page(page):
        desktop = dict(bindings.get("desktop") or {})
        test_data.update({
            "platform": "desktop",
            "page_id": page.id,
            "page_name": page.name,
            "application": page.name,
            "application_path": page.url_pattern or test_data.get("application_path") or "",
            "window": page.name,
            "screen": page.name,
        })
        desktop.update({
            "page": page.name,
            "page_id": page.id,
            "application": page.name,
            "application_path": page.url_pattern or desktop.get("application_path") or "",
            "window": page.name,
            "screen": page.name,
        })
        bindings["desktop"] = desktop
        bindings.pop("web", None)
    else:
        web = dict(bindings.get("web") or {})
        test_data.update({
            "page_id": page.id,
            "page_name": page.name,
            "url": page.url_pattern or test_data.get("url") or "",
        })
        web.update({
            "page": page.name,
            "page_id": page.id,
            "url": page.url_pattern or web.get("url") or "",
        })
        bindings["web"] = web
    step.page_id = page.id
    step.page_element_id = None
    step.test_data = test_data
    step.bindings = bindings


async def _refresh_step_from_page_repository(step: TestStepModel, db: AsyncSession) -> None:
    if step.page_id and step.page_element_id:
        result = await db.execute(
            select(PageRepositoryModel, PageElementModel)
            .join(PageElementModel, PageElementModel.page_id == PageRepositoryModel.id)
            .where(PageRepositoryModel.id == step.page_id)
            .where(PageElementModel.id == step.page_element_id)
        )
        row = result.first()
        if row:
            page, element = row
            _apply_element_to_test_step(step, page, element)
            return
    if step.page_id:
        page = await db.get(PageRepositoryModel, step.page_id)
        if page is not None:
            _refresh_page_only_step(step, page)


@router.get("/cases", response_model=list[DesktopRepositoryCaseResponse])
async def list_desktop_repository_cases(
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(DesktopRepositoryCaseModel)
        .options(selectinload(DesktopRepositoryCaseModel.steps))
        .order_by(DesktopRepositoryCaseModel.updated_at.desc(), DesktopRepositoryCaseModel.created_at.desc())
    )
    if status_filter:
        query = query.where(DesktopRepositoryCaseModel.status == status_filter)
    if search:
        needle = f"%{search.strip()}%"
        query = query.where(
            or_(
                DesktopRepositoryCaseModel.name.ilike(needle),
                DesktopRepositoryCaseModel.description.ilike(needle),
            )
        )
    rows = (await db.execute(query)).scalars().all()
    return [_repo_case_response(case) for case in rows]


@router.get("/cases/{case_id}", response_model=DesktopRepositoryCaseResponse)
async def get_desktop_repository_case(case_id: str, db: AsyncSession = Depends(get_db)):
    return _repo_case_response(await _load_repo_case(case_id, db))


@router.post(
    "/cases/from-test-case",
    response_model=DesktopRepositoryCaseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def save_test_case_to_desktop_repository(
    body: SaveDesktopRepositoryCaseRequest,
    db: AsyncSession = Depends(get_db),
):
    source = await _load_source_case(body.test_case_id, db)
    module = getattr(source, "module", None)
    project = getattr(module, "project", None)
    repo_case = DesktopRepositoryCaseModel(
        source_test_case_id=source.id,
        source_project_id=getattr(project, "id", None) or source.project_id,
        source_module_id=getattr(module, "id", None) or source.module_id,
        name=(body.name or source.name).strip() or "Reusable Desktop Testcase",
        description=body.description if body.description is not None else source.description or "",
        status="active",
        test_type=source.test_type or "functional",
        priority=source.priority or "p2",
        execution_mode=source.execution_mode or "automated",
        platforms=_desktop_platforms(list(source.platforms or [])),
        tags=_unique([*list(source.tags or []), *body.tags, "desktop-repository"]),
        default_variables=dict(source.default_variables or {}),
        library_metadata={
            "source": "test_configuration",
            "source_test_case_name": source.name,
            "source_module_name": str(getattr(module, "name", "") or ""),
            "source_project_name": str(getattr(project, "name", "") or ""),
        },
    )
    db.add(repo_case)
    await db.flush()
    for step in sorted(source.test_steps or [], key=lambda item: (item.step_order, item.created_at)):
        db.add(_copy_step_to_repository(repo_case, step))
    await db.commit()
    await db.refresh(repo_case)
    return _repo_case_response(await _load_repo_case(repo_case.id, db))


@router.post("/cases/{case_id}/insert", response_model=TestCaseResponse)
async def insert_desktop_repository_case(
    case_id: str,
    body: InsertDesktopRepositoryCaseRequest,
    db: AsyncSession = Depends(get_db),
):
    repo_case = await _load_repo_case(case_id, db)
    target = await db.get(TestCaseModel, body.target_test_case_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Target test case not found")
    steps = [
        step for step in sorted(repo_case.steps or [], key=lambda item: (item.step_order, item.created_at))
        if body.include_disabled or step.is_enabled
    ]
    if not steps:
        raise HTTPException(status_code=400, detail="Desktop repository testcase has no steps to insert")

    max_order = (
        await db.execute(
            select(func.max(TestStepModel.step_order)).where(TestStepModel.test_case_id == target.id)
        )
    ).scalar() or 0
    insert_at = body.position if body.position is not None else int(max_order) + 1
    insert_at = max(1, int(insert_at))
    await db.execute(
        update(TestStepModel)
        .where(TestStepModel.test_case_id == target.id)
        .where(TestStepModel.step_order >= insert_at)
        .values(step_order=TestStepModel.step_order + len(steps))
        .execution_options(synchronize_session=False)
    )

    for offset, repo_step in enumerate(steps):
        new_step = _copy_repository_step_to_testcase(
            repo_step,
            target_case_id=target.id,
            order=insert_at + offset,
            repository_case_id=repo_case.id,
        )
        db.add(new_step)
        await db.flush()
        await _refresh_step_from_page_repository(new_step, db)

    await db.commit()
    loaded = await TestConfigurationRepository(db).get_case(target.id)
    if loaded is None:
        raise HTTPException(status_code=404, detail="Target test case not found after insert")
    return _to_case_response(loaded)


@router.delete(
    "/cases/{case_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_desktop_repository_case(case_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DesktopRepositoryCaseModel)
        .where(DesktopRepositoryCaseModel.id == case_id)
        .options(selectinload(DesktopRepositoryCaseModel.steps))
    )
    repo_case = result.scalar_one_or_none()
    if repo_case is None:
        await db.rollback()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    await db.delete(repo_case)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
