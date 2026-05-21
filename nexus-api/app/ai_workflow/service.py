"""AIWorkflowService — orchestrates the complete AI Workflow pipeline."""
from __future__ import annotations

import asyncio
import json
import logging
import re as _re
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_workflow.agents.app_discovery import AppDiscoveryAgent
from app.ai_workflow.agents.brd_analysis import BRDAnalysisAgent
from app.ai_workflow.agents.locator_ranking import LocatorRankingAgent
from app.ai_workflow.agents.page_configuration import PageConfigurationAgent
from app.ai_workflow.agents.review_validation import ReviewAndValidationAgent
from app.ai_workflow.agents.scenario_generation import ScenarioGenerationAgent
from app.ai_workflow.agents.testcase_generation import TestCaseGenerationAgent
from app.ai_workflow.agents.teststep_binding import TestStepBindingAgent
from app.ai_workflow.discovery.adapter import BrowserDiscoveryAdapter
from app.ai_workflow.models import AIWorkflowModel
from app.ai_workflow.prompts.scenario_prompt import build_scenario_prompt
from app.ai_workflow.providers.base import AbstractAIProvider
from app.ai_workflow.providers.claude_provider import ClaudeProvider
from app.ai_workflow.providers.null_provider import NullProvider
from app.ai_workflow.providers.openai_provider import OpenAIProvider
from app.ai_workflow.schemas import (
    GeneratedTestCase,
    ReviewResponse,
    ScenarioList,
    ScenarioPreview,
    WorkflowCreateRequest,
    WorkflowStateResponse,
)
from app.ai_workflow.state import STATE_PROGRESS, WorkflowState
from app.config import settings
from app.database.models import PageElementModel, TestCaseModel, TestStepModel
from app.database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_JSON_FENCE_RE = _re.compile(r"```(?:json)?\s*(.*?)\s*```", _re.DOTALL)


def _parse_streamed_json(raw: str, schema: type[T]) -> T:
    match = _JSON_FENCE_RE.search(raw)
    cleaned = match.group(1) if match else raw.strip()
    return schema.model_validate(json.loads(cleaned))


def _build_provider(ai_provider: str, ai_model: str) -> AbstractAIProvider:
    provider = ai_provider.lower()
    if provider in ("null", "test", "ci"):
        return NullProvider()
    if provider == "openai":
        key = settings.openai_api_key
        if not key:
            logger.warning("OPENAI_API_KEY not set; using NullProvider")
            return NullProvider()
        return OpenAIProvider(api_key=key, model=ai_model)
    if provider in ("claude", "anthropic"):
        key = settings.anthropic_api_key
        if not key:
            logger.warning("ANTHROPIC_API_KEY not set; using NullProvider")
            return NullProvider()
        return ClaudeProvider(api_key=key, model=ai_model)
    logger.warning("Unknown provider '%s'; using NullProvider", ai_provider)
    return NullProvider()


def _workflow_to_response(wf: AIWorkflowModel) -> WorkflowStateResponse:
    scenarios = [ScenarioPreview(**s) for s in (wf.scenarios or [])]
    return WorkflowStateResponse(
        workflow_id=wf.id,
        state=WorkflowState(wf.state),
        progress_percent=wf.progress_percent,
        current_message=wf.current_message,
        project_id=wf.project_id,
        module_id=wf.module_id,
        page_id=wf.page_id,
        elements_saved=wf.elements_saved,
        scenarios=scenarios,
        testcases_created=wf.testcases_created,
        teststeps_created=wf.teststeps_created,
        unmapped_steps=wf.unmapped_steps,
        low_confidence_locators=wf.low_confidence_locators,
        errors=wf.errors or [],
    )


async def _update_state(
    db: AsyncSession,
    workflow_id: str,
    state: WorkflowState,
    message: str,
    **kwargs: Any,
) -> None:
    result = await db.execute(
        select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
    )
    wf = result.scalar_one()
    wf.state = state.value
    wf.progress_percent = STATE_PROGRESS.get(state, wf.progress_percent)
    wf.current_message = message
    for k, v in kwargs.items():
        setattr(wf, k, v)
    await db.commit()


async def _append_error(db: AsyncSession, workflow_id: str, error: str) -> None:
    result = await db.execute(
        select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
    )
    wf = result.scalar_one()
    errors: list = list(wf.errors or [])
    errors.append(error)
    wf.errors = errors
    await db.commit()


# ---------------------------------------------------------------------------
# Background task: discovery phase (CREATED → PAGE_SAVED)
# ---------------------------------------------------------------------------

async def _run_discovery_phase(workflow_id: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
            )
            wf = result.scalar_one()

            # 1. Create/reuse project
            await _update_state(db, workflow_id, WorkflowState.CREATED, "Creating project...")
            page_cfg = PageConfigurationAgent()
            project = await page_cfg.ensure_project(db, wf.project_name)
            await _update_state(
                db, workflow_id, WorkflowState.PROJECT_READY,
                f"Project '{project.name}' ready",
                project_id=project.id,
            )

            # 2. Create/reuse module
            module_name = wf.module_name or wf.project_name
            module = await page_cfg.ensure_module(db, project.id, module_name)
            await _update_state(
                db, workflow_id, WorkflowState.MODULE_READY,
                f"Module '{module.name}' ready",
                module_id=module.id,
            )

            # 3. Create/reuse page record
            page_name = _extract_page_name(wf.webpage_url, wf.project_name)
            page = await page_cfg.ensure_page(
                db, project.id, module.id, page_name, wf.webpage_url, wf.platform
            )
            await _update_state(
                db, workflow_id, WorkflowState.PAGE_CREATED,
                f"Page '{page_name}' created",
                page_id=page.id,
            )

            # 4. Discovery
            await _update_state(
                db, workflow_id, WorkflowState.DISCOVERY_RUNNING,
                "Discovering page elements...",
            )
            adapter = BrowserDiscoveryAdapter(
                mcp_url=settings.mcp_playwright_url or None,
                playwright_fallback=settings.playwright_fallback,
            )
            discovery_agent = AppDiscoveryAgent(adapter)
            discovery_result = await discovery_agent.run(
                url=wf.webpage_url,
                page_name=page_name,
                platform=wf.platform,
                save_mode=wf.save_mode,
                page_id=page.id,
                db=db,
            )

            await _update_state(
                db, workflow_id, WorkflowState.DISCOVERY_DONE,
                f"Discovered {discovery_result.summary.elements_found} elements",
            )

            # 5. Locator ranking (ranking already-discovered elements — conceptual pass)
            await _update_state(
                db, workflow_id, WorkflowState.LOCATORS_RANKED,
                f"Ranked locators for {discovery_result.summary.elements_saved} elements",
            )

            # 6. Record saved elements count
            low_conf = discovery_result.summary.low_confidence
            await _update_state(
                db, workflow_id, WorkflowState.PAGE_SAVED,
                f"Page saved with {discovery_result.summary.elements_saved} verified elements",
                elements_saved=discovery_result.summary.elements_saved,
                low_confidence_locators=low_conf,
            )

        except Exception as exc:
            logger.exception("Discovery phase failed for workflow %s", workflow_id)
            await _append_error(db, workflow_id, str(exc))
            await _update_state(
                db, workflow_id, WorkflowState.FAILED,
                f"Discovery failed: {exc}",
            )


def _extract_page_name(url: str, fallback: str) -> str:
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path = parsed.path.strip("/")
        last = path.split("/")[-1] if path else ""
        if last:
            return last.replace("-", " ").replace("_", " ").title()
        return parsed.netloc.split(".")[0].title() or fallback
    except Exception:
        return fallback


# ---------------------------------------------------------------------------
# Background task: scenario generation phase
# ---------------------------------------------------------------------------

async def _run_scenario_generation(workflow_id: str, ai_provider: str, ai_model: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
            )
            wf = result.scalar_one()

            await _update_state(
                db, workflow_id, WorkflowState.SCENARIOS_GENERATING,
                "Analysing BRD and generating scenarios...",
            )

            provider = _build_provider(ai_provider, ai_model)

            # BRD analysis — uses standard generate() (fast, no streaming needed)
            brd_agent = BRDAnalysisAgent(provider)
            brd_analysis = await brd_agent.run(wf.brd_text, wf.webpage_url, wf.project_name)

            await _update_state(
                db, workflow_id, WorkflowState.SCENARIOS_GENERATING,
                "BRD analysed — generating test scenarios...",
            )

            elements_summary = await _build_elements_summary(db, wf.page_id)
            page_name = _extract_page_name(wf.webpage_url, wf.project_name)

            # Build the scenario prompt (same as ScenarioGenerationAgent does internally)
            scenario_prompt = build_scenario_prompt(
                brd_text=wf.brd_text,
                project_name=wf.project_name,
                page_name=page_name,
                elements_summary=elements_summary,
                brd_analysis_summary=brd_analysis.summary,
            )

            # Stream scenario generation — update current_message every ~50 chars
            chunks: list[str] = []
            char_count = 0
            async for chunk in provider.generate_stream(scenario_prompt, ScenarioList):
                chunks.append(chunk)
                char_count += len(chunk)
                if char_count % 50 < len(chunk):
                    preview = "".join(chunks).replace("\n", " ").strip()[:120]
                    await _update_state(
                        db, workflow_id, WorkflowState.SCENARIOS_GENERATING,
                        f"Generating scenarios... {preview}",
                    )

            scenario_list = _parse_streamed_json("".join(chunks), ScenarioList)

            scenarios_data = [s.model_dump() for s in scenario_list.scenarios]
            await _update_state(
                db, workflow_id, WorkflowState.SCENARIOS_READY,
                f"Generated {len(scenarios_data)} scenarios",
                scenarios=scenarios_data,
                ai_provider=ai_provider,
                ai_model=ai_model,
            )

        except Exception as exc:
            logger.exception("Scenario generation failed for workflow %s", workflow_id)
            await _append_error(db, workflow_id, str(exc))
            await _update_state(
                db, workflow_id, WorkflowState.FAILED,
                f"Scenario generation failed: {exc}",
            )


async def _build_elements_summary(db: AsyncSession, page_id: str | None) -> str:
    if not page_id:
        return "(no elements available)"
    result = await db.execute(
        select(PageElementModel).where(PageElementModel.page_id == page_id).limit(50)
    )
    elements = result.scalars().all()
    if not elements:
        return "(no elements discovered)"
    lines = [f"- {el.name} ({el.element_type}, {el.locator_strategy})" for el in elements]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Background task: test case generation phase
# ---------------------------------------------------------------------------

async def _run_testcase_generation(workflow_id: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
            )
            wf = result.scalar_one()

            await _update_state(
                db, workflow_id, WorkflowState.TESTCASES_GENERATING,
                "Generating test cases and binding steps...",
            )

            provider = _build_provider(wf.ai_provider, wf.ai_model)
            selected = [
                ScenarioPreview(**s)
                for s in (wf.scenarios or [])
                if s.get("selected")
            ]

            if not selected:
                await _update_state(
                    db, workflow_id, WorkflowState.FAILED,
                    "No scenarios selected for test case generation",
                )
                return

            elements_summary = await _build_elements_summary(db, wf.page_id)
            page_name = _extract_page_name(wf.webpage_url, wf.project_name)

            # Load page elements for binding
            page_elements: list[dict] = []
            if wf.page_id:
                el_result = await db.execute(
                    select(PageElementModel).where(PageElementModel.page_id == wf.page_id)
                )
                page_elements = [
                    {"id": el.id, "name": el.name, "confidence_score": el.confidence_score}
                    for el in el_result.scalars().all()
                ]

            tc_agent = TestCaseGenerationAgent(provider)
            binder = TestStepBindingAgent()
            all_test_cases: list[GeneratedTestCase] = []
            total_steps = 0
            unmapped = 0

            for scenario in selected:
                tc_list = await tc_agent.run(scenario, page_name, elements_summary)
                for tc in tc_list.test_cases:
                    bound = binder.bind(tc, wf.page_id or "", page_elements)
                    all_test_cases.append(bound)
                    total_steps += len(bound.steps)
                    unmapped += sum(1 for s in bound.steps if s.needs_review)

                    # Persist to test configuration
                    await _persist_test_case(db, bound, wf.module_id or "", wf.project_id or "")

            # Build review data
            reviewer = ReviewAndValidationAgent()
            review = reviewer.build_review(
                workflow_id=workflow_id,
                project_id=wf.project_id,
                module_id=wf.module_id,
                page_id=wf.page_id,
                elements_saved=wf.elements_saved,
                scenarios_generated=len(wf.scenarios or []),
                scenarios_selected=len(selected),
                test_cases=all_test_cases,
                page_elements=page_elements,
            )

            await _update_state(
                db, workflow_id, WorkflowState.COMPLETED,
                f"Completed: {len(all_test_cases)} test cases, {total_steps} steps",
                testcases_created=len(all_test_cases),
                teststeps_created=total_steps,
                unmapped_steps=unmapped,
                low_confidence_locators=len(review.low_confidence_locators),
                review_data=review.model_dump(),
            )

        except Exception as exc:
            logger.exception("Test case generation failed for workflow %s", workflow_id)
            await _append_error(db, workflow_id, str(exc))
            await _update_state(
                db, workflow_id, WorkflowState.FAILED,
                f"Test case generation failed: {exc}",
            )


async def _persist_test_case(
    db: AsyncSession, tc: GeneratedTestCase, module_id: str, project_id: str
) -> None:
    if not module_id:
        return
    case_model = TestCaseModel(
        module_id=module_id,
        project_id=project_id,
        name=tc.title,
        description=tc.description,
        test_type=tc.test_type,
        priority=tc.priority,
    )
    db.add(case_model)
    await db.flush()

    for i, step in enumerate(tc.steps, 1):
        step_model = TestStepModel(
            test_case_id=case_model.id,
            step_order=i,
            name=step.description[:255],
            description=step.description,
            action_type=step.action_type,
            page_id=step.page_id,
            page_element_id=step.page_element_id,
            input_value=step.input_value or "",
            assertion_type=step.assertion_type or "",
            expected_result=step.expected_result or "",
            test_data=step.test_data or {},
            tags=step.tags,
        )
        db.add(step_model)
    await db.commit()


# ---------------------------------------------------------------------------
# Public service API
# ---------------------------------------------------------------------------

class AIWorkflowService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create_workflow(self, req: WorkflowCreateRequest) -> WorkflowStateResponse:
        wf = AIWorkflowModel(
            state=WorkflowState.CREATED.value,
            progress_percent=STATE_PROGRESS[WorkflowState.CREATED],
            current_message="Workflow created",
            brd_text=req.brd_text,
            webpage_url=req.webpage_url,
            project_name=req.project_name,
            module_name=req.module_name or req.project_name,
            platform=req.platform,
            save_mode=req.save_mode,
            ai_provider=req.ai_provider,
            ai_model=req.ai_model,
            scenarios=[],
            errors=[],
        )
        self._db.add(wf)
        await self._db.commit()
        await self._db.refresh(wf)

        asyncio.create_task(_run_discovery_phase(wf.id))
        return _workflow_to_response(wf)

    async def get_workflow(self, workflow_id: str) -> WorkflowStateResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")
        return _workflow_to_response(wf)

    async def generate_scenarios(
        self, workflow_id: str, ai_provider: str | None, ai_model: str | None
    ) -> WorkflowStateResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")

        provider = ai_provider or wf.ai_provider
        model = ai_model or wf.ai_model

        asyncio.create_task(_run_scenario_generation(workflow_id, provider, model))
        return _workflow_to_response(wf)

    async def confirm_scenarios(
        self, workflow_id: str, scenario_ids: list[str]
    ) -> WorkflowStateResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")
        if not scenario_ids:
            raise ValueError("At least one scenario must be selected")

        id_set = set(scenario_ids)
        updated = []
        for s in (wf.scenarios or []):
            updated.append({**s, "selected": s.get("scenario_id") in id_set})
        wf.scenarios = updated
        wf.state = WorkflowState.AWAITING_CONFIRMATION.value
        wf.current_message = f"{len(scenario_ids)} scenario(s) confirmed"
        await self._db.commit()
        await self._db.refresh(wf)
        return _workflow_to_response(wf)

    async def generate_testcases(self, workflow_id: str) -> WorkflowStateResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")

        asyncio.create_task(_run_testcase_generation(workflow_id))
        return _workflow_to_response(wf)

    async def get_review(self, workflow_id: str) -> ReviewResponse:
        result = await self._db.execute(
            select(AIWorkflowModel).where(AIWorkflowModel.id == workflow_id)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found")

        if wf.review_data:
            return ReviewResponse(**wf.review_data)

        return ReviewResponse(
            workflow_id=workflow_id,
            project_id=wf.project_id,
            module_id=wf.module_id,
            page_id=wf.page_id,
            elements_saved=wf.elements_saved,
            testcases_created=wf.testcases_created,
            teststeps_created=wf.teststeps_created,
        )
