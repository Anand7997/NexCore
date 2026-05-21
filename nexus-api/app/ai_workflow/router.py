"""AI Workflow API router."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_workflow.schemas import (
    GenerateScenariosRequest,
    ModelInfo,
    ModelsResponse,
    ReviewResponse,
    ScenarioConfirmRequest,
    WorkflowCreateRequest,
    WorkflowStateResponse,
)
from app.ai_workflow.service import AIWorkflowService
from app.database.session import get_db

router = APIRouter(prefix="/ai-workflows", tags=["ai-workflow"])

_AVAILABLE_MODELS: list[ModelInfo] = [
    ModelInfo(
        provider="openai",
        model_id="gpt-4o-mini",
        display_name="GPT-4o Mini",
        tier="fast",
        best_for="Small BRDs and quick iterations",
    ),
    ModelInfo(
        provider="claude",
        model_id="claude-sonnet-4-20250514",
        display_name="Claude Sonnet 4",
        tier="balanced",
        best_for="Good reasoning and moderate cost",
    ),
    ModelInfo(
        provider="claude",
        model_id="claude-opus-4-7",
        display_name="Claude Opus 4",
        tier="best",
        best_for="Complex BRDs and large applications",
    ),
    ModelInfo(
        provider="openai",
        model_id="gpt-4o",
        display_name="GPT-4o",
        tier="best",
        best_for="Complex BRDs when using OpenAI",
    ),
]


@router.get("/models", response_model=ModelsResponse)
async def list_models() -> ModelsResponse:
    return ModelsResponse(models=_AVAILABLE_MODELS)


@router.post("", response_model=WorkflowStateResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    body: WorkflowCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> WorkflowStateResponse:
    svc = AIWorkflowService(db)
    try:
        return await svc.create_workflow(body)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{workflow_id}", response_model=WorkflowStateResponse)
async def get_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
) -> WorkflowStateResponse:
    svc = AIWorkflowService(db)
    try:
        return await svc.get_workflow(workflow_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/{workflow_id}/scenarios/generate",
    response_model=WorkflowStateResponse,
)
async def generate_scenarios(
    workflow_id: str,
    body: GenerateScenariosRequest = GenerateScenariosRequest(),
    db: AsyncSession = Depends(get_db),
) -> WorkflowStateResponse:
    svc = AIWorkflowService(db)
    try:
        return await svc.generate_scenarios(workflow_id, body.ai_provider, body.ai_model)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/{workflow_id}/scenarios/confirm",
    response_model=WorkflowStateResponse,
)
async def confirm_scenarios(
    workflow_id: str,
    body: ScenarioConfirmRequest,
    db: AsyncSession = Depends(get_db),
) -> WorkflowStateResponse:
    svc = AIWorkflowService(db)
    try:
        return await svc.confirm_scenarios(workflow_id, body.scenario_ids)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/{workflow_id}/testcases/generate",
    response_model=WorkflowStateResponse,
)
async def generate_testcases(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
) -> WorkflowStateResponse:
    svc = AIWorkflowService(db)
    try:
        return await svc.generate_testcases(workflow_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{workflow_id}/review", response_model=ReviewResponse)
async def get_review(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
) -> ReviewResponse:
    svc = AIWorkflowService(db)
    try:
        return await svc.get_review(workflow_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
