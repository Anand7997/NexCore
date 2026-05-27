"""Execution trigger, monitoring, and control routes."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.domain.executions.repository import ExecutionRepository
from app.domain.executions.schemas import (
    ExecutionTriggerSchema, ExecutionResponse,
    ExecutionListItem, ExecutionNodeResponse, TimelineEntryResponse,
    TestCaseExecutionTriggerSchema,
)
from app.domain.test_configuration.repository import TestConfigurationRepository
from app.domain.workflows.schemas import WorkflowCreateSchema, WorkflowEdgeSchema, WorkflowNodePositionSchema, WorkflowNodeSchema
from app.domain.workflows.repository import WorkflowRepository
from app.database.models import TestCaseModel, TestModuleModel, TestProjectModel, TestStepModel, WorkflowModel, WorkflowNodeModel
from app.distributed.scheduler import DistributedScheduler
from app.enterprise.audit import record_audit
from app.enterprise.auth import AuthContext, get_auth_context
from app.orchestration.engine import launch_execution, cancel_execution

router = APIRouter(prefix="/executions", tags=["executions"])


def _slug(value: str, fallback: str) -> str:
    text = "".join(ch.lower() if ch.isalnum() else "_" for ch in (value or fallback))
    text = "_".join(part for part in text.split("_") if part)
    return (text or fallback)[:48]


def _display_slug(value: str) -> str:
    text = "".join(ch.lower() if ch.isalnum() else "_" for ch in value)
    return "_".join(part for part in text.split("_") if part)


async def _execution_display_context(db: AsyncSession, execution) -> dict[str, str]:
    workflow_name = ""
    project_name = ""
    module_name = ""
    test_case_name = ""

    workflow = await db.scalar(select(WorkflowModel).where(WorkflowModel.id == execution.workflow_id))
    if workflow:
        workflow_name = workflow.name or ""

    if execution.project_id:
        project_name = await db.scalar(
            select(TestProjectModel.name).where(TestProjectModel.id == execution.project_id)
        ) or ""
    if execution.module_id:
        module_name = await db.scalar(
            select(TestModuleModel.name).where(TestModuleModel.id == execution.module_id)
        ) or ""

    variables = execution.variables or {}
    raw_case_ids = variables.get("test_case_ids", []) if isinstance(variables, dict) else []
    if isinstance(raw_case_ids, str):
        test_case_ids = [raw_case_ids]
    elif isinstance(raw_case_ids, list):
        test_case_ids = [str(item) for item in raw_case_ids if item]
    else:
        test_case_ids = []
    if not test_case_ids:
        node_result = await db.execute(
            select(WorkflowNodeModel.test_case_id)
            .where(WorkflowNodeModel.workflow_id == execution.workflow_id, WorkflowNodeModel.test_case_id.is_not(None))
            .distinct()
        )
        test_case_ids = [str(item) for item in node_result.scalars().all() if item]

    if test_case_ids:
        result = await db.execute(
            select(TestCaseModel.name, TestModuleModel.name, TestProjectModel.name)
            .join(TestModuleModel, TestCaseModel.module_id == TestModuleModel.id)
            .join(TestProjectModel, TestModuleModel.project_id == TestProjectModel.id)
            .where(TestCaseModel.id.in_(test_case_ids))
        )
        rows = result.all()
        if rows:
            case_names = [row[0] for row in rows if row[0]]
            test_case_name = case_names[0] if len(case_names) <= 1 else f"{case_names[0]} + {len(case_names) - 1} more"
            module_name = module_name or str(rows[0][1] or "")
            project_name = project_name or str(rows[0][2] or "")

    display_parts = [_display_slug(part) for part in (project_name, module_name, test_case_name) if part]
    display_name = "_".join(part for part in display_parts if part)
    if not display_name:
        clean_workflow = workflow_name.removeprefix("Execution - ").strip()
        display_name = _display_slug(clean_workflow or "execution")

    return {
        "workflow_name": workflow_name,
        "project_name": project_name,
        "module_name": module_name,
        "test_case_name": test_case_name,
        "display_name": display_name,
    }


def _xpath_selector(xpath: str) -> str:
    value = xpath.strip()
    if not value:
        return ""
    if value.startswith("xpath="):
        return value
    if value.startswith("/") or value.startswith("("):
        return f"xpath={value}"
    return value


def _locator_entry(strategy: str, locator: str, source: str = "") -> dict[str, str]:
    strategy = (strategy or "").strip().lower()
    locator = str(locator or "").strip()
    if not locator:
        return {}
    if not strategy:
        if locator.startswith("role="):
            strategy = "role"
        elif locator.startswith(("xpath=", "/", "(")):
            strategy = "xpath"
        else:
            strategy = "css"
    return {"strategy": strategy, "locator": locator, "source": source}


def _step_locator_candidates(step) -> list[dict[str, str]]:
    locators: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    def add(strategy: str, locator: str, source: str = "") -> None:
        entry = _locator_entry(strategy, locator, source)
        if not entry:
            return
        key = (entry["strategy"], entry["locator"])
        if key not in seen:
            seen.add(key)
            locators.append(entry)

    element = getattr(step, "page_element", None)
    if element is not None:
        for locator in getattr(element, "alternative_locators", None) or []:
            if isinstance(locator, dict):
                add(str(locator.get("strategy") or ""), str(locator.get("locator") or ""), "page_element")
        add("css", getattr(element, "css_selector", "") or "", "page_element")
        add("xpath", getattr(element, "xpath", "") or "", "page_element")
        if getattr(element, "id_attr", ""):
            add("css", f"#{getattr(element, 'id_attr')}", "page_element")
        if getattr(element, "name_attr", ""):
            add("css", f"[name='{getattr(element, 'name_attr')}']", "page_element")

    bindings = step.bindings or {}
    web_binding = bindings.get("web") if isinstance(bindings, dict) else None
    if isinstance(web_binding, dict):
        for locator in web_binding.get("alternative_locators") or web_binding.get("locators") or []:
            if isinstance(locator, dict):
                add(str(locator.get("strategy") or ""), str(locator.get("locator") or locator.get("selector") or ""), "binding")
        for key, strategy in (
            ("selector", ""),
            ("best_locator", ""),
            ("css_selector", "css"),
            ("xpath", "xpath"),
        ):
            add(strategy, str(web_binding.get(key) or ""), "binding")

    data = step.test_data or {}
    if isinstance(data, dict):
        for locator in data.get("alternative_locators") or data.get("locators") or []:
            if isinstance(locator, dict):
                add(str(locator.get("strategy") or ""), str(locator.get("locator") or locator.get("selector") or ""), "test_data")
        for key, strategy in (("selector", ""), ("css_selector", "css"), ("xpath", "xpath"), ("locator", "")):
            add(strategy, str(data.get(key) or ""), "test_data")

    add("", step.target or "", "target")
    return locators


def _step_selector(step) -> str:
    for locator in _step_locator_candidates(step):
        selector = _xpath_selector(locator["locator"])
        if selector:
            return selector
    return ""


def _step_value(step) -> str:
    if step.input_value:
        return step.input_value
    bindings = step.bindings or {}
    web_binding = bindings.get("web") if isinstance(bindings, dict) else None
    if isinstance(web_binding, dict):
        for key in ("value", "input_value", "sample_value", "option", "test_data"):
            value = web_binding.get(key)
            if value not in (None, ""):
                return str(value)
    data = step.test_data or {}
    if isinstance(data, dict):
        for key in ("value", "input_value", "sample_value", "example", "test_data"):
            value = data.get(key)
            if value not in (None, ""):
                return str(value)
    return ""


def _normalized_action(action: str) -> str:
    return action.lower().replace("_", " ").replace("-", " ").strip()


def _is_navigate_action(action: str) -> bool:
    normalized = _normalized_action(action)
    return any(
        token in normalized
        for token in ("navigate", "open browser", "open page", "open webpage", "go to", "goto", "visit", "launch", "load url")
    )


def _step_page_url(step) -> str:
    page = getattr(step, "page", None)
    if page is None:
        return ""
    return str(getattr(page, "url_pattern", "") or getattr(page, "source_url", "") or "")


def _step_navigate_url(step) -> str:
    value = _step_value(step)
    if value:
        return value
    selector = _step_selector(step)
    if selector.startswith(("http://", "https://")):
        return selector
    return _step_page_url(step)


def _step_element_type(step) -> str:
    element = getattr(step, "page_element", None)
    if element is not None:
        value = str(getattr(element, "element_type", "") or "").lower()
        if value:
            return value

    bindings = step.bindings or {}
    web_binding = bindings.get("web") if isinstance(bindings, dict) else None
    if isinstance(web_binding, dict):
        value = str(web_binding.get("element_type") or "").lower()
        if value:
            return value

    data = step.test_data or {}
    if isinstance(data, dict):
        return str(data.get("element_type") or data.get("input_type") or "").lower()
    return ""


def _is_dropdown_select_action(action: str, element_type: str, value: str) -> bool:
    normalized = _normalized_action(action)
    if element_type in {"select", "option", "combobox", "listbox"}:
        return bool(value)
    if any(token in normalized for token in ("dropdown", "pick option", "choose option", "select option")):
        return bool(value)
    return False


def _step_target_locator(step) -> str:
    data = step.test_data or {}
    if isinstance(data, dict):
        for key in ("target_selector", "target_xpath", "drop_target", "target_locator"):
            value = data.get(key)
            if value not in (None, ""):
                return _xpath_selector(str(value))
    bindings = step.bindings or {}
    web_binding = bindings.get("web") if isinstance(bindings, dict) else None
    if isinstance(web_binding, dict):
        for key in ("target_selector", "target_xpath", "drop_target", "target_locator"):
            value = web_binding.get(key)
            if value not in (None, ""):
                return _xpath_selector(str(value))
    if step.secondary_value:
        return _xpath_selector(step.secondary_value)
    return ""


def _step_target_locators(step) -> list[dict[str, str]]:
    locators: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    def add(strategy: str, locator: str, source: str = "") -> None:
        entry = _locator_entry(strategy, locator, source)
        if not entry:
            return
        key = (entry["strategy"], entry["locator"])
        if key not in seen:
            seen.add(key)
            locators.append(entry)

    data = step.test_data or {}
    if isinstance(data, dict):
        for locator in data.get("target_locators") or []:
            if isinstance(locator, dict):
                add(str(locator.get("strategy") or ""), str(locator.get("locator") or locator.get("selector") or ""), "test_data")
        for key, strategy in (("target_selector", ""), ("target_xpath", "xpath"), ("drop_target", ""), ("target_locator", "")):
            add(strategy, str(data.get(key) or ""), "test_data")

    bindings = step.bindings or {}
    web_binding = bindings.get("web") if isinstance(bindings, dict) else None
    if isinstance(web_binding, dict):
        for locator in web_binding.get("target_locators") or []:
            if isinstance(locator, dict):
                add(str(locator.get("strategy") or ""), str(locator.get("locator") or locator.get("selector") or ""), "binding")
        for key, strategy in (("target_selector", ""), ("target_xpath", "xpath"), ("drop_target", ""), ("target_locator", "")):
            add(strategy, str(web_binding.get(key) or ""), "binding")

    add("", step.secondary_value or "", "secondary_value")
    return locators


def _normalise_key_value(value: str) -> str:
    aliases = {
        "CTRL": "Control",
        "CONTROL": "Control",
        "CMD": "Meta",
        "COMMAND": "Meta",
        "META": "Meta",
        "ALT": "Alt",
        "OPTION": "Alt",
        "SHIFT": "Shift",
        "TAB": "Tab",
        "ENTER": "Enter",
        "RETURN": "Enter",
        "ESC": "Escape",
        "ESCAPE": "Escape",
        "SPACE": "Space",
    }
    parts = [part.strip() for part in str(value or "").split("+") if part.strip()]
    if not parts:
        return ""
    normalized = []
    for part in parts:
        upper = part.upper()
        normalized.append(aliases.get(upper, upper if len(part) == 1 else part))
    return "+".join(normalized)


def _node_type_and_config(step) -> tuple[str, dict]:
    action = (step.action_type or step.intent or step.name or "").lower()
    normalized_action = _normalized_action(action)
    selector = _step_selector(step)
    locators = _step_locator_candidates(step)
    value = _step_value(step)
    expected = step.expected_result or step.secondary_value or value
    element_type = _step_element_type(step)

    def with_locators(config: dict) -> dict:
        if locators:
            config["locators"] = locators
        return config

    if _is_navigate_action(action):
        url = _step_navigate_url(step)
        if url:
            return "web.navigate", {"url": url, "wait_until": "load", "timeout_ms": 30000}

    if "press key" in normalized_action or normalized_action == "press key":
        key = _normalise_key_value(value or step.secondary_value or expected)
        focus_locators = [locator for locator in locators if locator.get("source") != "target"]
        config = {"key": key, "timeout_ms": 15000}
        if focus_locators:
            config["selector"] = _xpath_selector(focus_locators[0]["locator"])
            config["locators"] = focus_locators
        return "web.press_key", config
    if "drag" in normalized_action and "drop" in normalized_action and selector:
        target_selector = _step_target_locator(step)
        target_locators = _step_target_locators(step)
        config = {"selector": selector, "target_selector": target_selector, "timeout_ms": 15000}
        if target_locators:
            config["target_locators"] = target_locators
        return "web.drag_and_drop", with_locators(config)
    if "double click" in normalized_action and selector:
        return "web.double_click", with_locators({"selector": selector, "timeout_ms": 15000})
    if any(token in normalized_action for token in ("right click", "context click")) and selector:
        return "web.right_click", with_locators({"selector": selector, "timeout_ms": 15000})
    if any(token in normalized_action for token in ("mouse over", "hover")) and selector:
        return "web.hover", with_locators({"selector": selector, "timeout_ms": 15000})
    if any(token in normalized_action for token in ("radio button", "checkbox", "check box")) and selector:
        return "web.check", with_locators({"selector": selector, "checked": str(value).lower() not in {"false", "0", "no", "unchecked"}, "timeout_ms": 15000})

    if _is_dropdown_select_action(action, element_type, value) and selector:
        return "web.select", with_locators({"selector": selector, "value": value, "timeout_ms": 15000})
    if "select" in action and selector:
        if _is_dropdown_select_action(action, element_type, value):
            return "web.select", with_locators({"selector": selector, "value": value, "timeout_ms": 15000})
        return "web.click", with_locators({"selector": selector, "timeout_ms": 15000})
    if any(token in action for token in ("fill", "type", "input", "enter")) and selector:
        if not value:
            return "web.click", with_locators({
                "selector": selector,
                "timeout_ms": 15000,
                "needs_review": True,
                "review_reason": "Input step is missing a value; clicked the target for manual review.",
            })
        return "web.fill", with_locators({"selector": selector, "value": value, "timeout_ms": 15000})
    if any(token in action for token in ("assert", "verify", "validate", "expect", "check")) and selector:
        return "web.assert_text", with_locators({"selector": selector, "expected": expected, "match": "contains", "timeout_ms": 15000})
    if "upload" in action and selector:
        return "web.upload", with_locators({"selector": selector, "file_path": value, "timeout_ms": 15000})
    if any(token in action for token in ("wait", "pause")):
        return "web.wait", with_locators({"selector": selector, "state": "visible", "delay_ms": 1000, "timeout_ms": 15000})
    if selector:
        return "web.click", with_locators({"selector": selector, "timeout_ms": 15000})
    return "web.wait", {"delay_ms": 750, "timeout_ms": 15000}


def _first_page_url(test_cases: list) -> str:
    for test_case in test_cases:
        for step in sorted(test_case.test_steps or [], key=lambda item: item.step_order):
            action = (step.action_type or step.intent or step.name or "").lower()
            url = _step_navigate_url(step) if _is_navigate_action(action) else _step_page_url(step)
            if url:
                return url
    return ""


def _has_explicit_navigate_step(test_cases: list) -> bool:
    for test_case in test_cases:
        for step in test_case.test_steps or []:
            if step.is_enabled and _is_navigate_action((step.action_type or step.intent or step.name or "").lower()):
                return True
    return False


def _workflow_from_test_cases(test_cases: list, schema: TestCaseExecutionTriggerSchema) -> WorkflowCreateSchema:
    first_case = test_cases[0]
    nodes: list[WorkflowNodeSchema] = []
    edges: list[WorkflowEdgeSchema] = []
    previous_key: str | None = None
    x = 0

    start_url = str(schema.variables.get("base_url") or schema.variables.get("url") or _first_page_url(test_cases))
    if start_url and not _has_explicit_navigate_step(test_cases):
        previous_key = "start_navigate"
        nodes.append(
            WorkflowNodeSchema(
                node_key=previous_key,
                type="web.navigate",
                label="Open application",
                description="Navigate to the configured page URL before executing test steps.",
                config={"url": start_url, "wait_until": "load", "timeout_ms": 30000},
                position=WorkflowNodePositionSchema(x=x, y=0),
                timeout_seconds=45,
            )
        )
        x += 220

    for case_index, test_case in enumerate(test_cases, start=1):
        steps = sorted(
            [step for step in (test_case.test_steps or []) if step.is_enabled],
            key=lambda item: item.step_order,
        )
        for step_index, step in enumerate(steps, start=1):
            node_type, config = _node_type_and_config(step)
            config = {
                **config,
                "test_step_id": step.id,
                "page_id": step.page_id,
                "page_element_id": step.page_element_id,
            }
            key = f"tc{case_index}_s{step_index}_{_slug(step.name, 'step')}"
            nodes.append(
                WorkflowNodeSchema(
                    node_key=key,
                    type=node_type,
                    label=step.name or f"Step {step.step_order}",
                    description=step.description or step.expected_result or "",
                    test_case_id=test_case.id,
                    config=config,
                    position=WorkflowNodePositionSchema(x=x, y=0),
                    timeout_seconds=60,
                )
            )
            if previous_key:
                edges.append(WorkflowEdgeSchema(source_key=previous_key, target_key=key))
            previous_key = key
            x += 220

    if not nodes:
        raise HTTPException(status_code=400, detail="Selected test case has no enabled test steps to execute")

    name = first_case.name if len(test_cases) == 1 else f"{first_case.name} + {len(test_cases) - 1} more"
    module_id = schema.module_id or getattr(first_case, "module_id", None)
    project_id = schema.project_id or getattr(first_case, "project_id", None)
    return WorkflowCreateSchema(
        name=f"Execution - {name}",
        description="Auto-generated from Test Configuration for execution.",
        project_id=project_id,
        module_id=module_id,
        tags=["test-configuration", "auto-execution"],
        platforms=[schema.platform],
        variables=schema.variables,
        nodes=nodes,
        edges=edges,
    )


async def _refresh_workflow_nodes_from_test_steps(db: AsyncSession, workflow_id: str) -> int:
    """Refresh persisted workflow nodes that were generated from Test Configuration.

    Older generated workflows can outlive action-mapping fixes. Before launching an
    existing workflow, rebuild node type/config from the linked TestStep rows so
    current page-element locators and action mappings are used.
    """
    nodes = (
        await db.scalars(
            select(WorkflowNodeModel)
            .where(WorkflowNodeModel.workflow_id == workflow_id)
            .order_by(WorkflowNodeModel.position_x)
        )
    ).all()
    refreshed = 0
    for node in nodes:
        step_id = (node.config or {}).get("test_step_id")
        if not step_id:
            continue
        step = await db.scalar(
            select(TestStepModel)
            .where(TestStepModel.id == step_id)
            .options(
                selectinload(TestStepModel.page),
                selectinload(TestStepModel.page_element),
            )
        )
        if step is None or not step.is_enabled:
            continue
        node_type, config = _node_type_and_config(step)
        config = {
            **config,
            "test_step_id": step.id,
            "page_id": step.page_id,
            "page_element_id": step.page_element_id,
        }
        if node.type != node_type or node.config != config or node.label != step.name:
            node.type = node_type
            node.label = step.name or node.label
            node.description = step.description or step.expected_result or ""
            node.test_case_id = step.test_case_id
            node.config = config
            refreshed += 1
    if refreshed:
        await db.flush()
    return refreshed


def _node_to_response(n) -> ExecutionNodeResponse:
    return ExecutionNodeResponse(
        id=n.id,
        node_key=n.node_key,
        node_label=n.node_label,
        node_type=n.node_type,
        status=n.status,
        attempt_count=n.attempt_count or 0,
        started_at=n.started_at,
        completed_at=n.completed_at,
        duration_ms=n.duration_ms,
        output=n.output or {},
        error=n.error,
    )


@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def trigger_execution(
    schema: ExecutionTriggerSchema,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(get_auth_context),
):
    wf_repo = WorkflowRepository(db)
    workflow = await wf_repo.get(schema.workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await _refresh_workflow_nodes_from_test_steps(db, workflow.id)

    repo = ExecutionRepository(db)
    execution = await repo.create(schema)
    scheduler = DistributedScheduler(db)
    await scheduler.enqueue_execution(
        execution.id,
        platform=schema.platform,
        priority=int(schema.variables.get("_priority", 100)),
        required_capabilities=schema.variables.get("_required_capabilities", []),
    )
    await record_audit(
        db,
        ctx,
        action="execution.trigger",
        resource_type="execution",
        resource_id=execution.id,
        metadata={"workflow_id": schema.workflow_id, "platform": schema.platform},
    )

    # Launch orchestration engine as background task
    background_tasks.add_task(launch_execution, execution.id)

    return {"execution_id": execution.id, "status": "queued"}


@router.post("/test-cases", status_code=status.HTTP_202_ACCEPTED)
async def trigger_test_case_execution(
    schema: TestCaseExecutionTriggerSchema,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(get_auth_context),
):
    case_ids = [case_id for case_id in schema.test_case_ids if case_id]
    if not case_ids:
        raise HTTPException(status_code=400, detail="Select at least one test case to execute")

    config_repo = TestConfigurationRepository(db)
    test_cases = []
    for case_id in case_ids:
        test_case = await config_repo.get_case(case_id)
        if not test_case:
            raise HTTPException(status_code=404, detail=f"Test case not found: {case_id}")
        test_cases.append(test_case)

    wf_repo = WorkflowRepository(db)
    workflow = await wf_repo.create(_workflow_from_test_cases(test_cases, schema))

    execution_schema = ExecutionTriggerSchema(
        workflow_id=workflow.id,
        project_id=schema.project_id or getattr(test_cases[0], "project_id", None),
        module_id=schema.module_id or getattr(test_cases[0], "module_id", None),
        testing_type_id=getattr(test_cases[0], "testing_type_id", None),
        trigger=schema.trigger,
        triggered_by=schema.triggered_by,
        environment=schema.environment,
        platform=schema.platform,
        variables={
            **schema.variables,
            "test_case_ids": case_ids,
            "source": "test_configuration",
        },
    )

    repo = ExecutionRepository(db)
    execution = await repo.create(execution_schema)
    scheduler = DistributedScheduler(db)
    await scheduler.enqueue_execution(
        execution.id,
        platform=schema.platform,
        priority=int(schema.variables.get("_priority", 100)),
        required_capabilities=schema.variables.get("_required_capabilities", []),
    )
    await record_audit(
        db,
        ctx,
        action="execution.trigger_test_case",
        resource_type="execution",
        resource_id=execution.id,
        metadata={"workflow_id": workflow.id, "test_case_ids": case_ids, "platform": schema.platform},
    )

    background_tasks.add_task(launch_execution, execution.id)
    return {"execution_id": execution.id, "workflow_id": workflow.id, "status": "queued"}


@router.get("/", response_model=list[ExecutionListItem])
async def list_executions(
    workflow_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    repo = ExecutionRepository(db)
    executions = await repo.list_all(workflow_id=workflow_id, status=status, limit=limit)
    items = []
    for e in executions:
        total, completed = await repo.node_counts(e.id)
        context = await _execution_display_context(db, e)
        items.append(ExecutionListItem(
            id=e.id,
            workflow_id=e.workflow_id,
            **context,
            status=e.status,
            trigger=e.trigger,
            environment=e.environment,
            platform=e.platform,
            error=e.error,
            started_at=e.started_at,
            completed_at=e.completed_at,
            created_at=e.created_at,
            node_count=total,
            completed_nodes=completed,
        ))
    return items


@router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(execution_id: str, db: AsyncSession = Depends(get_db)):
    repo = ExecutionRepository(db)
    execution = await repo.get(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    nodes = await repo.get_nodes(execution_id)
    timeline = await repo.get_timeline(execution_id)
    context = await _execution_display_context(db, execution)

    return ExecutionResponse(
        id=execution.id,
        workflow_id=execution.workflow_id,
        **context,
        status=execution.status,
        trigger=execution.trigger,
        environment=execution.environment,
        platform=execution.platform,
        variables=execution.variables or {},
        error=execution.error,
        started_at=execution.started_at,
        completed_at=execution.completed_at,
        created_at=execution.created_at,
        nodes=[_node_to_response(n) for n in nodes],
        timeline=[
            TimelineEntryResponse(
                id=t.id,
                node_key=t.node_key,
                phase=t.phase,
                metadata_=t.metadata_ or {},
                timestamp=t.timestamp,
            )
            for t in timeline
        ],
    )


@router.post("/{execution_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
async def cancel_execution_route(
    execution_id: str,
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(get_auth_context),
):
    cancelled = cancel_execution(execution_id)
    repo = ExecutionRepository(db)
    execution = await repo.cancel(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    if not cancelled:
        scheduler = DistributedScheduler(db)
        await scheduler.finish_execution(execution_id, "cancelled")
    await record_audit(
        db,
        ctx,
        action="execution.cancel",
        resource_type="execution",
        resource_id=execution_id,
    )
    return {"execution_id": execution_id, "status": "cancelling"}


@router.delete("/{execution_id}", status_code=status.HTTP_200_OK)
async def delete_execution_route(
    execution_id: str,
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(get_auth_context),
):
    cancel_execution(execution_id)
    repo = ExecutionRepository(db)
    deleted = await repo.delete(execution_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Execution not found")
    await record_audit(
        db,
        ctx,
        action="execution.delete",
        resource_type="execution",
        resource_id=execution_id,
    )
    return {"execution_id": execution_id, "deleted": True}


@router.get("/{execution_id}/nodes", response_model=list[ExecutionNodeResponse])
async def get_execution_nodes(execution_id: str, db: AsyncSession = Depends(get_db)):
    repo = ExecutionRepository(db)
    nodes = await repo.get_nodes(execution_id)
    return [_node_to_response(n) for n in nodes]


@router.get("/{execution_id}/timeline", response_model=list[TimelineEntryResponse])
async def get_execution_timeline(execution_id: str, db: AsyncSession = Depends(get_db)):
    repo = ExecutionRepository(db)
    timeline = await repo.get_timeline(execution_id)
    return [
        TimelineEntryResponse(
            id=t.id,
            node_key=t.node_key,
            phase=t.phase,
            metadata_=t.metadata_ or {},
            timestamp=t.timestamp,
        )
        for t in timeline
    ]
