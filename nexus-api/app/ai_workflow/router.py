"""AI Workflow API router."""
from __future__ import annotations

import importlib.util
from io import BytesIO
from xml.etree import ElementTree
import zipfile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_workflow.schemas import (
    BrdExtractResponse,
    GenerateScenariosRequest,
    ModelInfo,
    ModelsResponse,
    ReviewResponse,
    ScenarioConfirmRequest,
    WorkflowCreateRequest,
    WorkflowStateResponse,
)
from app.ai_workflow.service import AIWorkflowService
from app.config import settings
from app.database.session import get_db

router = APIRouter(prefix="/ai-workflows", tags=["ai-workflow"])

_WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_MAX_BRD_FILE_BYTES = 5 * 1024 * 1024


def _package_installed(package_name: str) -> bool:
    return importlib.util.find_spec(package_name) is not None


def _setup_hint(provider_name: str, key_name: str, has_key: bool, has_package: bool) -> str | None:
    if not has_key:
        return f"Set {key_name} in nexus-api/.env, then restart npm start."
    if not has_package:
        return f"Install the {provider_name} backend package with pip install -r requirements.txt."
    return None


def _available_models() -> list[ModelInfo]:
    has_openai_key = bool(settings.openai_api_key)
    has_anthropic_key = bool(settings.anthropic_api_key)
    has_openai_package = _package_installed("openai")
    has_anthropic_package = _package_installed("anthropic")
    openai_ready = has_openai_key and has_openai_package
    anthropic_ready = has_anthropic_key and has_anthropic_package
    openai_hint = _setup_hint("OpenAI", "OPENAI_API_KEY", has_openai_key, has_openai_package)
    anthropic_hint = _setup_hint(
        "Anthropic", "ANTHROPIC_API_KEY", has_anthropic_key, has_anthropic_package
    )
    catalog = [
        # OpenAI frontier and compatibility models.
        ("openai", "gpt-5.5", "GPT-5.5", "best", "Flagship reasoning for complex enterprise QA workflows"),
        ("openai", "gpt-5.4", "GPT-5.4", "best", "Advanced reasoning with lower cost than flagship"),
        ("openai", "gpt-5.4-mini", "GPT-5.4 Mini", "balanced", "Strong everyday model for scenario and test generation"),
        ("openai", "gpt-5.4-nano", "GPT-5.4 Nano", "fast", "Fastest low-cost option for quick BRD iterations"),
        ("openai", "gpt-5", "GPT-5", "best", "Previous frontier reasoning model for broad QA planning"),
        ("openai", "gpt-5-mini", "GPT-5 Mini", "balanced", "Efficient GPT-5 family model for normal test suites"),
        ("openai", "gpt-5-nano", "GPT-5 Nano", "fast", "Very fast draft generation and smoke coverage"),
        ("openai", "gpt-4.1", "GPT-4.1", "best", "Strong non-reasoning model for structured JSON output"),
        ("openai", "gpt-4.1-mini", "GPT-4.1 Mini", "balanced", "Lower-latency structured generation"),
        ("openai", "gpt-4.1-nano", "GPT-4.1 Nano", "fast", "Cheapest quick generation path"),
        ("openai", "gpt-4o", "GPT-4o", "balanced", "Reliable multimodal-compatible general model"),
        ("openai", "gpt-4o-mini", "GPT-4o Mini", "fast", "Small BRDs and quick iterations"),
        # Anthropic stable snapshot model IDs.
        ("anthropic", "claude-opus-4-1-20250805", "Claude Opus 4.1", "best", "Highest-reasoning Claude option for large BRDs"),
        ("anthropic", "claude-opus-4-20250514", "Claude Opus 4", "best", "Complex BRDs and large applications"),
        ("anthropic", "claude-sonnet-4-20250514", "Claude Sonnet 4", "balanced", "High reasoning with better speed and cost"),
        ("anthropic", "claude-3-7-sonnet-20250219", "Claude Sonnet 3.7", "balanced", "Extended-thinking style model for deeper test design"),
        ("anthropic", "claude-3-5-haiku-20241022", "Claude Haiku 3.5", "fast", "Fast Claude option for small BRDs"),
        ("anthropic", "claude-3-haiku-20240307", "Claude Haiku 3", "fast", "Compact Claude option for quick smoke scenarios"),
    ]

    models: list[ModelInfo] = []
    for provider, model_id, display_name, tier, best_for in catalog:
        is_openai = provider == "openai"
        models.append(
            ModelInfo(
                provider=provider,
                model_id=model_id,
                display_name=display_name,
                tier=tier,  # type: ignore[arg-type]
                best_for=best_for,
                configured=openai_ready if is_openai else anthropic_ready,
                setup_hint=openai_hint if is_openai else anthropic_hint,
            )
        )
    return models


@router.get("/models", response_model=ModelsResponse)
async def list_models() -> ModelsResponse:
    return ModelsResponse(models=_available_models())


def _extract_docx_text(content: bytes) -> str:
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            document_xml = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile) as exc:
        raise ValueError("The uploaded DOCX file could not be read.") from exc

    root = ElementTree.fromstring(document_xml)
    paragraphs: list[str] = []
    for paragraph in root.iter(f"{_WORD_NS}p"):
        chunks: list[str] = []
        for node in paragraph.iter():
            if node.tag == f"{_WORD_NS}t" and node.text:
                chunks.append(node.text)
            elif node.tag == f"{_WORD_NS}tab":
                chunks.append("\t")
            elif node.tag == f"{_WORD_NS}br":
                chunks.append("\n")
        line = "".join(chunks).strip()
        if line:
            paragraphs.append(line)
    return "\n".join(paragraphs)


def _extract_text_file(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("The uploaded text file is not valid UTF-8 text.")


def _extract_brd_text(filename: str, content: bytes) -> str:
    lower = filename.lower()
    if len(content) > _MAX_BRD_FILE_BYTES:
        raise ValueError("BRD file is too large. Maximum size is 5 MB.")
    if lower.endswith(".docx"):
        text = _extract_docx_text(content)
    elif lower.endswith((".txt", ".md", ".markdown", ".text")):
        text = _extract_text_file(content)
    elif lower.endswith(".pdf"):
        raise ValueError("PDF upload is not supported yet. Paste extracted PDF text instead.")
    else:
        raise ValueError("Unsupported BRD file type. Upload .docx, .txt, or .md.")

    text = text.replace("\x00", "").strip()
    if not text:
        raise ValueError("No readable BRD text was found in the uploaded file.")
    return text


@router.post("/brd/extract", response_model=BrdExtractResponse)
async def extract_brd_file(file: UploadFile = File(...)) -> BrdExtractResponse:
    filename = file.filename or "brd"
    content = await file.read()
    try:
        text = _extract_brd_text(filename, content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return BrdExtractResponse(filename=filename, text=text, characters=len(text))


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
