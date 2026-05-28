"""Test Configuration CRUD routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.domain.test_configuration.repository import (
    TestConfigurationError,
    TestConfigurationRepository,
)
from app.domain.test_configuration.schemas import (
    TAG_CATALOG,
    TagCatalogDimensionResponse,
    TestCaseCreateSchema,
    TestCaseResponse,
    TestCaseUpdateSchema,
    TestConfigurationTreeResponse,
    TestModuleCreateSchema,
    TestModuleResponse,
    TestModuleUpdateSchema,
    TestProjectCreateSchema,
    TestProjectListItem,
    TestProjectResponse,
    TestProjectUpdateSchema,
    TestStepCreateSchema,
    TestStepResponse,
    TestStepUpdateSchema,
)

router = APIRouter(prefix="/test-configuration", tags=["test-configuration"])


def _step_path_location(step) -> tuple[str, str]:
    bindings = step.bindings or {}
    web = bindings.get("web") or {}
    desktop = bindings.get("desktop") or {}
    test_data = step.test_data or {}
    page_element = step.__dict__.get("page_element")
    page = step.__dict__.get("page")
    page_platform = str(getattr(page, "platform", "") or "").strip().lower()
    is_desktop = (
        isinstance(bindings.get("desktop"), dict)
        or str(test_data.get("platform") or "").strip().lower() in {"desktop", "windows"}
        or page_platform in {"desktop", "windows"}
    )
    element_xpath = getattr(page_element, "xpath", "") if page_element is not None else ""
    element_css = getattr(page_element, "css_selector", "") if page_element is not None else ""
    element_id = getattr(page_element, "id_attr", "") if page_element is not None else ""
    element_name = getattr(page_element, "name_attr", "") if page_element is not None else ""
    automation_id = desktop.get("automation_id") or test_data.get("automation_id") or ""
    uia_path = desktop.get("uia_path") or test_data.get("uia_path") or ""
    if is_desktop:
        automation_id = automation_id or element_id
        uia_path = uia_path or element_xpath
    xpath = (
        automation_id
        or uia_path
        or element_xpath
        or web.get("xpath")
        or test_data.get("xpath")
        or ""
    )
    location = (
        automation_id
        or uia_path
        or xpath
        or element_css
        or element_name
        or desktop.get("selector")
        or desktop.get("locator")
        or web.get("selector")
        or test_data.get("locator")
        or ""
    )
    return str(xpath or ""), str(location or "")


def _to_step_response(step) -> TestStepResponse:
    xpath, path_location = _step_path_location(step)
    return TestStepResponse(
        id=step.id,
        step_order=step.step_order,
        name=step.name,
        description=step.description or "",
        # Normalized fields
        action_type=step.action_type or step.intent or "",
        page_id=step.page_id,
        page_element_id=step.page_element_id,
        xpath=xpath,
        path_location=path_location,
        api_endpoint_id=step.api_endpoint_id,
        input_value=step.input_value or "",
        assertion_type=step.assertion_type or "",
        secondary_action=step.secondary_action or "",
        secondary_value=step.secondary_value or "",
        # Legacy fields
        intent=step.intent or "",
        target=step.target or "",
        expected_result=step.expected_result or "",
        test_data=step.test_data or {},
        tags=step.tags or [],
        bindings=step.bindings or {},
        is_enabled=bool(step.is_enabled),
        created_at=step.created_at,
        updated_at=step.updated_at,
    )


def _to_case_response(test_case) -> TestCaseResponse:
    steps = sorted(test_case.test_steps or [], key=lambda step: (step.step_order, step.created_at))
    return TestCaseResponse(
        id=test_case.id,
        module_id=test_case.module_id,
        project_id=test_case.project_id,
        testing_type_id=test_case.testing_type_id,
        name=test_case.name,
        description=test_case.description or "",
        status=test_case.status,
        test_type=test_case.test_type,
        priority=test_case.priority,
        execution_mode=test_case.execution_mode,
        platforms=test_case.platforms or [],
        tags=test_case.tags or [],
        default_variables=test_case.default_variables or {},
        created_at=test_case.created_at,
        updated_at=test_case.updated_at,
        test_steps=[_to_step_response(step) for step in steps],
    )


def _to_module_response(module) -> TestModuleResponse:
    return TestModuleResponse(
        id=module.id,
        project_id=module.project_id,
        name=module.name,
        description=module.description or "",
        status=module.status,
        tags=module.tags or [],
        created_at=module.created_at,
        updated_at=module.updated_at,
        test_cases=[_to_case_response(test_case) for test_case in (module.test_cases or [])],
    )


def _to_project_response(project) -> TestProjectResponse:
    return TestProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description or "",
        status=project.status,
        tags=project.tags or [],
        created_at=project.created_at,
        updated_at=project.updated_at,
        modules=[_to_module_response(module) for module in (project.modules or [])],
    )


@router.get("/tree", response_model=TestConfigurationTreeResponse)
async def get_test_configuration_tree(db: AsyncSession = Depends(get_db)):
    repo = TestConfigurationRepository(db)
    projects = await repo.list_projects()
    return TestConfigurationTreeResponse(
        projects=[_to_project_response(project) for project in projects],
        tag_catalog=[TagCatalogDimensionResponse(**dimension) for dimension in TAG_CATALOG],
    )


@router.get("/tag-catalog", response_model=list[TagCatalogDimensionResponse])
async def get_tag_catalog():
    return [TagCatalogDimensionResponse(**dimension) for dimension in TAG_CATALOG]


@router.get("/projects/", response_model=list[TestProjectListItem])
async def list_projects(status: str | None = None, db: AsyncSession = Depends(get_db)):
    repo = TestConfigurationRepository(db)
    projects = await repo.list_projects(status=status)
    items: list[TestProjectListItem] = []
    for project in projects:
        case_count = sum(len(module.test_cases or []) for module in (project.modules or []))
        step_count = sum(
            len(test_case.test_steps or [])
            for module in (project.modules or [])
            for test_case in (module.test_cases or [])
        )
        items.append(
            TestProjectListItem(
                id=project.id,
                name=project.name,
                description=project.description or "",
                status=project.status,
                tags=project.tags or [],
                module_count=len(project.modules or []),
                case_count=case_count,
                step_count=step_count,
                created_at=project.created_at,
                updated_at=project.updated_at,
            )
        )
    return items


@router.post("/projects/", response_model=TestProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(schema: TestProjectCreateSchema, db: AsyncSession = Depends(get_db)):
    repo = TestConfigurationRepository(db)
    project = await repo.create_project(schema)
    return _to_project_response(project)


@router.get("/projects/{project_id}", response_model=TestProjectResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    repo = TestConfigurationRepository(db)
    project = await repo.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _to_project_response(project)


@router.put("/projects/{project_id}", response_model=TestProjectResponse)
async def update_project(
    project_id: str,
    schema: TestProjectUpdateSchema,
    db: AsyncSession = Depends(get_db),
):
    repo = TestConfigurationRepository(db)
    project = await repo.update_project(project_id, schema)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _to_project_response(project)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    repo = TestConfigurationRepository(db)
    deleted = await repo.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post(
    "/projects/{project_id}/modules/",
    response_model=TestModuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_module(
    project_id: str,
    schema: TestModuleCreateSchema,
    db: AsyncSession = Depends(get_db),
):
    repo = TestConfigurationRepository(db)
    try:
        module = await repo.create_module(project_id, schema)
    except TestConfigurationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return TestModuleResponse(
        id=module.id,
        project_id=module.project_id,
        name=module.name,
        description=module.description or "",
        status=module.status,
        tags=module.tags or [],
        created_at=module.created_at,
        updated_at=module.updated_at,
        test_cases=[],
    )


@router.put("/modules/{module_id}", response_model=TestModuleResponse)
async def update_module(
    module_id: str,
    schema: TestModuleUpdateSchema,
    db: AsyncSession = Depends(get_db),
):
    repo = TestConfigurationRepository(db)
    module = await repo.update_module(module_id, schema)
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")
    return TestModuleResponse(
        id=module.id,
        project_id=module.project_id,
        name=module.name,
        description=module.description or "",
        status=module.status,
        tags=module.tags or [],
        created_at=module.created_at,
        updated_at=module.updated_at,
        test_cases=[],
    )


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_module(module_id: str, db: AsyncSession = Depends(get_db)):
    repo = TestConfigurationRepository(db)
    deleted = await repo.delete_module(module_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Module not found")


@router.post(
    "/modules/{module_id}/cases/",
    response_model=TestCaseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_test_case(
    module_id: str,
    schema: TestCaseCreateSchema,
    db: AsyncSession = Depends(get_db),
):
    repo = TestConfigurationRepository(db)
    try:
        test_case = await repo.create_test_case(module_id, schema)
    except TestConfigurationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    loaded = await repo.get_case(test_case.id)
    return _to_case_response(loaded or test_case)


@router.put("/cases/{case_id}", response_model=TestCaseResponse)
async def update_test_case(
    case_id: str,
    schema: TestCaseUpdateSchema,
    db: AsyncSession = Depends(get_db),
):
    repo = TestConfigurationRepository(db)
    test_case = await repo.update_test_case(case_id, schema)
    if test_case is None:
        raise HTTPException(status_code=404, detail="Test case not found")
    return _to_case_response(test_case)


@router.delete("/cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_case(case_id: str, db: AsyncSession = Depends(get_db)):
    repo = TestConfigurationRepository(db)
    deleted = await repo.delete_test_case(case_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Test case not found")


@router.post(
    "/cases/{case_id}/steps/",
    response_model=TestStepResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_test_step(
    case_id: str,
    schema: TestStepCreateSchema,
    db: AsyncSession = Depends(get_db),
):
    repo = TestConfigurationRepository(db)
    try:
        step = await repo.create_test_step(case_id, schema)
    except TestConfigurationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _to_step_response(step)


@router.put("/steps/{step_id}", response_model=TestStepResponse)
async def update_test_step(
    step_id: str,
    schema: TestStepUpdateSchema,
    db: AsyncSession = Depends(get_db),
):
    repo = TestConfigurationRepository(db)
    step = await repo.update_test_step(step_id, schema)
    if step is None:
        raise HTTPException(status_code=404, detail="Test step not found")
    return _to_step_response(step)


@router.delete("/steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_step(step_id: str, db: AsyncSession = Depends(get_db)):
    repo = TestConfigurationRepository(db)
    deleted = await repo.delete_test_step(step_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Test step not found")
