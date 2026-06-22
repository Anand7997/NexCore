"""Page Object Repository — CRUD for application pages and their UI elements."""
from __future__ import annotations

import re
from typing import Any, Optional
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.ai_workflow.models import AIWorkflowModel
from app.database.models import (
    DesktopObjectHealingSuggestionModel,
    DesktopObjectHistoryModel,
    DesktopRepositoryStepModel,
    DesktopRecordedActionModel,
    DesktopRecordingSessionModel,
    ExecutionStepResultModel,
    PageElementModel,
    PageRepositoryModel,
    TestCaseModel,
    TestModuleModel,
    TestProjectModel,
    TestStepModel,
    WorkflowModel,
    WorkflowNodeModel,
)
from app.page_discovery.schemas import DiscoveryRequest, DiscoveryResponse
from app.page_discovery.service import discover_elements

router = APIRouter(prefix="/page-repository", tags=["page-repository"])


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class PageElementResponse(BaseModel):
    id: str
    page_id: str
    name: str
    element_type: str
    description: str
    xpath: str
    css_selector: str
    id_attr: str
    name_attr: str
    locator_strategy: str
    tags: list[str]
    confidence_score: Optional[float] = None
    alternative_locators: Optional[list[dict[str, Any]]] = None
    discovery_metadata: Optional[dict[str, Any]] = None
    source_url: str = ""
    last_verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DesktopObjectImpactStep(BaseModel):
    step_id: str
    step_order: int
    step_name: str
    action_type: str = ""
    target: str = ""
    is_enabled: bool = True
    test_case_id: str = ""
    test_case_name: str = ""
    module_id: str = ""
    module_name: str = ""
    project_id: str = ""
    project_name: str = ""
    match_reasons: list[str]
    risk: str
    current_locator: str = ""


class DesktopObjectImpactWorkflowNode(BaseModel):
    workflow_id: str
    workflow_name: str
    node_key: str
    node_type: str
    node_label: str
    test_step_id: str = ""


class DesktopObjectImpactResponse(BaseModel):
    object_key: str
    object_name: str
    application: str
    page_id: str
    element_id: str
    impacted_step_count: int
    workflow_node_count: int
    risk_summary: dict[str, int]
    steps: list[DesktopObjectImpactStep]
    workflow_nodes: list[DesktopObjectImpactWorkflowNode]


class DesktopObjectHistoryResponse(BaseModel):
    id: str
    page_id: str = ""
    element_id: str = ""
    object_key: str
    action: str
    source: str = ""
    actor: str = ""
    changed_fields: list[str]
    before_snapshot: dict[str, Any]
    after_snapshot: dict[str, Any]
    impact_summary: dict[str, Any]
    created_at: datetime


class DesktopObjectLocatorCandidateProfile(BaseModel):
    strategy: str
    locator: str
    score: float
    strength: str
    reason: str
    risk_flags: list[str]


class DesktopObjectLocatorProfileResponse(BaseModel):
    object_key: str
    object_name: str
    application: str
    page_id: str
    element_id: str
    stability_score: float
    stale: bool
    stale_reasons: list[str]
    suggestions: list[str]
    primary_locator: str
    best_strategy: str
    history_count: int
    locator_change_count: int
    last_changed_at: Optional[datetime] = None
    candidates: list[DesktopObjectLocatorCandidateProfile]


class DesktopObjectHealingSuggestionCreateSchema(BaseModel):
    locator_attempts: list[dict[str, Any]] = Field(default_factory=list)
    attempts: list[dict[str, Any]] = Field(default_factory=list)
    successful_strategy: str = ""
    successful_locator: str = ""
    confidence: Optional[float] = None
    source: str = "smart_identification"
    reason: str = ""
    actor: str = ""
    min_confidence: float = 0.65


class DesktopObjectHealingSuggestionDecisionSchema(BaseModel):
    approved: bool = True
    actor: str = ""
    note: str = ""


class DesktopObjectHealingSuggestionResponse(BaseModel):
    id: str
    page_id: str = ""
    element_id: str = ""
    object_key: str
    object_name: str = ""
    application: str = ""
    status: str
    source: str = ""
    suggested_strategy: str = ""
    suggested_locator: str = ""
    suggested_field: str = ""
    confidence: Optional[float] = None
    reason: str = ""
    evidence: list[dict[str, Any]]
    preview_update: dict[str, Any]
    created_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: str = ""
    resolution_note: str = ""


class PageListItem(BaseModel):
    id: str
    name: str
    url_pattern: str
    description: str
    platform: str
    tags: list[str]
    element_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PageDetailResponse(PageListItem):
    elements: list[PageElementResponse]


class PageCreateSchema(BaseModel):
    name: str
    url_pattern: str = ""
    description: str = ""
    platform: str = "web"
    tags: list[str] = []


class PageUpdateSchema(BaseModel):
    name: Optional[str] = None
    url_pattern: Optional[str] = None
    description: Optional[str] = None
    platform: Optional[str] = None
    tags: Optional[list[str]] = None


class ElementCreateSchema(BaseModel):
    name: str
    element_type: str = "element"
    description: str = ""
    xpath: str = ""
    css_selector: str = ""
    id_attr: str = ""
    name_attr: str = ""
    locator_strategy: str = "xpath"
    tags: list[str] = []
    confidence_score: Optional[float] = None
    alternative_locators: Optional[list[dict[str, Any]]] = None
    discovery_metadata: Optional[dict[str, Any]] = None


class ElementUpdateSchema(BaseModel):
    name: Optional[str] = None
    element_type: Optional[str] = None
    description: Optional[str] = None
    xpath: Optional[str] = None
    css_selector: Optional[str] = None
    id_attr: Optional[str] = None
    name_attr: Optional[str] = None
    locator_strategy: Optional[str] = None
    tags: Optional[list[str]] = None
    confidence_score: Optional[float] = None
    alternative_locators: Optional[list[dict[str, Any]]] = None
    discovery_metadata: Optional[dict[str, Any]] = None


class DesktopObjectCreateSchema(BaseModel):
    page_id: Optional[str] = None
    application: str = ""
    application_path: str = ""
    repository_scope: str = "shared"
    object_key: str
    name: str
    control_type: str = "element"
    automation_id: str = ""
    name_text: str = ""
    class_name: str = ""
    uia_path: str = ""
    locator_strategy: str = "accessibility id"
    primary_locator: str = ""
    alternative_locators: list[dict[str, Any]] = []
    window: str = ""
    screen: str = ""
    ui_framework: str = ""
    process_name: str = ""
    hierarchy_path: str = ""
    bounding_box: Optional[dict[str, Any]] = None
    screenshot_url: str = ""
    ocr_text: str = ""
    ai_label: str = ""
    confidence_score: Optional[float] = None
    tags: list[str] = []
    metadata: dict[str, Any] = {}


class DesktopObjectUpdateSchema(BaseModel):
    application: Optional[str] = None
    application_path: Optional[str] = None
    repository_scope: Optional[str] = None
    object_key: Optional[str] = None
    name: Optional[str] = None
    control_type: Optional[str] = None
    automation_id: Optional[str] = None
    name_text: Optional[str] = None
    class_name: Optional[str] = None
    uia_path: Optional[str] = None
    locator_strategy: Optional[str] = None
    primary_locator: Optional[str] = None
    alternative_locators: Optional[list[dict[str, Any]]] = None
    window: Optional[str] = None
    screen: Optional[str] = None
    ui_framework: Optional[str] = None
    process_name: Optional[str] = None
    hierarchy_path: Optional[str] = None
    bounding_box: Optional[dict[str, Any]] = None
    screenshot_url: Optional[str] = None
    ocr_text: Optional[str] = None
    ai_label: Optional[str] = None
    confidence_score: Optional[float] = None
    tags: Optional[list[str]] = None
    metadata: Optional[dict[str, Any]] = None


class DesktopObjectResponse(BaseModel):
    id: str
    page_id: str
    object_key: str
    name: str
    application: str
    application_path: str = ""
    repository_scope: str = "shared"
    control_type: str
    automation_id: str = ""
    name_text: str = ""
    class_name: str = ""
    uia_path: str = ""
    locator_strategy: str
    primary_locator: str = ""
    alternative_locators: list[dict[str, Any]] = []
    window: str = ""
    screen: str = ""
    ui_framework: str = ""
    process_name: str = ""
    hierarchy_path: str = ""
    bounding_box: Optional[dict[str, Any]] = None
    screenshot_url: str = ""
    ocr_text: str = ""
    ai_label: str = ""
    confidence_score: Optional[float] = None
    tags: list[str] = []
    metadata: dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime


# ── Converters ────────────────────────────────────────────────────────────────

class DesktopWorkflowSyncRequest(BaseModel):
    workflow_id: Optional[str] = None
    session_id: Optional[str] = None
    include_archived: bool = False
    include_recording_sessions: bool = True
    update_existing: bool = True


class DesktopWorkflowSyncItem(BaseModel):
    object_key: str
    name: str
    application: str
    action: str
    reason: str = ""
    source: str = ""
    workflow_id: str = ""
    workflow_name: str = ""
    node_key: str = ""
    session_id: str = ""
    object: Optional[DesktopObjectResponse] = None


class DesktopWorkflowSyncResponse(BaseModel):
    source: str = "desktop_workflow_sync"
    scanned_workflows: int = 0
    scanned_recording_sessions: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    pages_created: int = 0
    objects: list[DesktopWorkflowSyncItem] = []


def _elem(e: PageElementModel) -> PageElementResponse:
    return PageElementResponse(
        id=e.id, page_id=e.page_id, name=e.name,
        element_type=e.element_type or "element",
        description=e.description or "",
        xpath=e.xpath or "", css_selector=e.css_selector or "",
        id_attr=e.id_attr or "", name_attr=e.name_attr or "",
        locator_strategy=e.locator_strategy or "xpath",
        tags=e.tags or [],
        confidence_score=e.confidence_score if e.confidence_score is not None else None,
        alternative_locators=e.alternative_locators if e.alternative_locators is not None else None,
        discovery_metadata=e.discovery_metadata if e.discovery_metadata is not None else None,
        source_url=e.source_url or "",
        last_verified_at=e.last_verified_at,
        created_at=e.created_at, updated_at=e.updated_at,
    )


def _page_list(p: PageRepositoryModel) -> PageListItem:
    return PageListItem(
        id=p.id, name=p.name, url_pattern=p.url_pattern or "",
        description=p.description or "", platform=p.platform,
        tags=p.tags or [], element_count=len(p.elements or []),
        created_at=p.created_at, updated_at=p.updated_at,
    )


def _page_detail(p: PageRepositoryModel) -> PageDetailResponse:
    return PageDetailResponse(
        id=p.id, name=p.name, url_pattern=p.url_pattern or "",
        description=p.description or "", platform=p.platform,
        tags=p.tags or [], element_count=len(p.elements or []),
        created_at=p.created_at, updated_at=p.updated_at,
        elements=sorted([_elem(e) for e in (p.elements or [])], key=lambda e: e.name),
    )


async def _load(page_id: str, db: AsyncSession) -> PageRepositoryModel:
    result = await db.execute(
        select(PageRepositoryModel).where(PageRepositoryModel.id == page_id)
        .options(selectinload(PageRepositoryModel.elements))
    )
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


async def _detach_page_references(page_id: str, db: AsyncSession) -> list[str]:
    element_ids = list(
        (
            await db.execute(
                select(PageElementModel.id).where(PageElementModel.page_id == page_id)
            )
        )
        .scalars()
        .all()
    )

    await db.execute(
        update(TestStepModel)
        .where(TestStepModel.page_id == page_id)
        .values(page_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(ExecutionStepResultModel)
        .where(ExecutionStepResultModel.page_id == page_id)
        .values(page_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(AIWorkflowModel)
        .where(AIWorkflowModel.page_id == page_id)
        .values(page_id=None)
        .execution_options(synchronize_session=False)
    )

    if element_ids:
        await db.execute(
            update(DesktopObjectHistoryModel)
            .where(DesktopObjectHistoryModel.element_id.in_(element_ids))
            .values(element_id=None)
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            update(DesktopObjectHealingSuggestionModel)
            .where(DesktopObjectHealingSuggestionModel.element_id.in_(element_ids))
            .values(element_id=None)
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            update(TestStepModel)
            .where(TestStepModel.page_element_id.in_(element_ids))
            .values(page_element_id=None)
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            update(DesktopRepositoryStepModel)
            .where(DesktopRepositoryStepModel.page_element_id.in_(element_ids))
            .values(page_element_id=None)
            .execution_options(synchronize_session=False)
        )
        await db.execute(
            update(ExecutionStepResultModel)
            .where(ExecutionStepResultModel.page_element_id.in_(element_ids))
            .values(page_element_id=None)
            .execution_options(synchronize_session=False)
        )
    await db.execute(
        update(DesktopObjectHistoryModel)
        .where(DesktopObjectHistoryModel.page_id == page_id)
        .values(page_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(DesktopObjectHealingSuggestionModel)
        .where(DesktopObjectHealingSuggestionModel.page_id == page_id)
        .values(page_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(DesktopRepositoryStepModel)
        .where(DesktopRepositoryStepModel.page_id == page_id)
        .values(page_id=None)
        .execution_options(synchronize_session=False)
    )

    return element_ids


DESKTOP_PLATFORMS = {"desktop", "windows"}


def _is_desktop_platform(platform: str | None) -> bool:
    return str(platform or "").strip().lower() in DESKTOP_PLATFORMS


def _is_desktop_page(page: PageRepositoryModel | None) -> bool:
    return page is not None and _is_desktop_platform(getattr(page, "platform", ""))


def _element_metadata(element: PageElementModel) -> dict[str, Any]:
    metadata = getattr(element, "discovery_metadata", None)
    return metadata if isinstance(metadata, dict) else {}


def _desktop_object_key(element: PageElementModel) -> str:
    metadata = _element_metadata(element)
    return str(
        metadata.get("object_key")
        or metadata.get("repository_key")
        or metadata.get("element_key")
        or getattr(element, "id", "")
        or getattr(element, "name", "")
        or ""
    )


def _element_primary_locator(element: PageElementModel, *, desktop: bool = False) -> str:
    if desktop:
        strategy = (element.locator_strategy or "").lower().replace("_", " ")
        if strategy in {"accessibility id", "automation id", "id"} and element.id_attr:
            return element.id_attr
        if strategy in {"name", "text"} and (element.name_attr or element.name):
            return element.name_attr or element.name
        if strategy in {"xpath", "uia path", "path"} and element.xpath:
            return element.xpath
        if strategy in {"class", "class name"} and element.css_selector:
            return element.css_selector
        return element.id_attr or element.name_attr or element.xpath or element.css_selector or element.name

    strategy = (element.locator_strategy or "").lower()
    if strategy == "css" and element.css_selector:
        return element.css_selector
    if strategy == "id" and element.id_attr:
        return f"#{element.id_attr}"
    if strategy == "name" and element.name_attr:
        return f"[name='{element.name_attr}']"
    if strategy == "xpath" and element.xpath:
        return element.xpath
    return element.xpath or element.css_selector or (
        f"#{element.id_attr}" if element.id_attr else ""
    ) or (
        f"[name='{element.name_attr}']" if element.name_attr else ""
    ) or element.name


def _element_locator_candidates(element: PageElementModel, *, desktop: bool = False) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add(strategy: str, locator: str, reason: str) -> None:
        value = str(locator or "").strip()
        if not value:
            return
        normalized_strategy = (strategy or "").strip().lower()
        if not normalized_strategy:
            normalized_strategy = "xpath" if value.startswith(("/", "(", "xpath=")) else "css"
        key = (normalized_strategy, value)
        if key in seen:
            return
        seen.add(key)
        candidates.append({
            "strategy": normalized_strategy,
            "locator": value,
            "verified": False,
            "element_count": 0,
            "score": 1.0,
            "reason": reason,
        })

    if desktop:
        add(
            element.locator_strategy or "accessibility id",
            _element_primary_locator(element, desktop=True),
            "Current desktop object repository locator",
        )
        add("accessibility id", element.id_attr or "", "Desktop object Automation ID")
        add("name", element.name_attr or element.name or "", "Desktop object name/text")
        add("xpath", element.xpath or "", "Desktop object UIA path")
        add("class name", element.css_selector or "", "Desktop object class name")
    else:
        add(element.locator_strategy or "", _element_primary_locator(element), "Current page repository locator")
        add("xpath", element.xpath or "", "Current page repository XPath")
        add("css", element.css_selector or "", "Current page repository CSS selector")
        if element.id_attr:
            add("css", f"#{element.id_attr}", "Current page repository id selector")
        if element.name_attr:
            add("css", f"[name='{element.name_attr}']", "Current page repository name selector")
    for locator in element.alternative_locators or []:
        if isinstance(locator, dict):
            add(
                str(locator.get("strategy") or ""),
                str(locator.get("locator") or locator.get("selector") or ""),
                str(locator.get("reason") or "Alternative page repository locator"),
            )
    return candidates


def _desktop_object_response(page: PageRepositoryModel, element: PageElementModel) -> DesktopObjectResponse:
    metadata = _element_metadata(element)
    return DesktopObjectResponse(
        id=element.id,
        page_id=page.id,
        object_key=_desktop_object_key(element),
        name=element.name,
        application=str(metadata.get("application") or page.name or ""),
        application_path=str(metadata.get("application_path") or page.url_pattern or ""),
        repository_scope=str(metadata.get("repository_scope") or "shared"),
        control_type=element.element_type or "element",
        automation_id=element.id_attr or "",
        name_text=element.name_attr or "",
        class_name=element.css_selector or "",
        uia_path=element.xpath or "",
        locator_strategy=element.locator_strategy or "accessibility id",
        primary_locator=str(metadata.get("primary_locator") or _element_primary_locator(element, desktop=True) or ""),
        alternative_locators=_element_locator_candidates(element, desktop=True),
        window=str(metadata.get("window") or ""),
        screen=str(metadata.get("screen") or metadata.get("window") or ""),
        ui_framework=str(metadata.get("ui_framework") or ""),
        process_name=str(metadata.get("process_name") or ""),
        hierarchy_path=str(metadata.get("hierarchy_path") or metadata.get("uia_path") or element.xpath or ""),
        bounding_box=metadata.get("bounding_box") if isinstance(metadata.get("bounding_box"), dict) else None,
        screenshot_url=str(metadata.get("screenshot_url") or element.source_url or ""),
        ocr_text=str(metadata.get("ocr_text") or ""),
        ai_label=str(metadata.get("ai_label") or ""),
        confidence_score=element.confidence_score if element.confidence_score is not None else None,
        tags=element.tags or [],
        metadata=metadata,
        created_at=element.created_at,
        updated_at=element.updated_at,
    )


def _desktop_object_snapshot(page: PageRepositoryModel, element: PageElementModel) -> dict[str, Any]:
    metadata = _element_metadata(element)
    return {
        "object_key": _desktop_object_key(element),
        "name": element.name or "",
        "application": str(metadata.get("application") or page.name or ""),
        "application_path": str(metadata.get("application_path") or page.url_pattern or ""),
        "repository_scope": str(metadata.get("repository_scope") or "shared"),
        "control_type": element.element_type or "element",
        "automation_id": element.id_attr or "",
        "name_text": element.name_attr or "",
        "class_name": element.css_selector or "",
        "uia_path": element.xpath or "",
        "locator_strategy": element.locator_strategy or "accessibility id",
        "primary_locator": str(metadata.get("primary_locator") or _element_primary_locator(element, desktop=True) or ""),
        "alternative_locators": element.alternative_locators or [],
        "window": str(metadata.get("window") or ""),
        "screen": str(metadata.get("screen") or metadata.get("window") or ""),
        "ui_framework": str(metadata.get("ui_framework") or ""),
        "process_name": str(metadata.get("process_name") or ""),
        "hierarchy_path": str(metadata.get("hierarchy_path") or metadata.get("uia_path") or element.xpath or ""),
        "bounding_box": metadata.get("bounding_box") if isinstance(metadata.get("bounding_box"), dict) else None,
        "screenshot_url": str(metadata.get("screenshot_url") or element.source_url or ""),
        "ocr_text": str(metadata.get("ocr_text") or ""),
        "ai_label": str(metadata.get("ai_label") or ""),
        "confidence_score": element.confidence_score,
        "tags": element.tags or [],
        "metadata": metadata,
    }


def _changed_fields(before: dict[str, Any] | None, after: dict[str, Any] | None) -> list[str]:
    before = before or {}
    after = after or {}
    fields = sorted(set(before) | set(after))
    return [field for field in fields if before.get(field) != after.get(field)]


def _history_response(history: DesktopObjectHistoryModel) -> DesktopObjectHistoryResponse:
    return DesktopObjectHistoryResponse(
        id=history.id,
        page_id=history.page_id or "",
        element_id=history.element_id or "",
        object_key=history.object_key,
        action=history.action or "",
        source=history.source or "",
        actor=history.actor or "",
        changed_fields=history.changed_fields or [],
        before_snapshot=history.before_snapshot or {},
        after_snapshot=history.after_snapshot or {},
        impact_summary=history.impact_summary or {},
        created_at=history.created_at,
    )


def _record_desktop_object_history(
    db: AsyncSession,
    page: PageRepositoryModel,
    element: PageElementModel,
    *,
    action: str,
    source: str,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    impact_summary: dict[str, Any] | None = None,
    actor: str = "",
) -> DesktopObjectHistoryModel | None:
    changed = _changed_fields(before, after)
    if action == "updated" and not changed:
        return None
    history = DesktopObjectHistoryModel(
        page_id=page.id,
        element_id=element.id,
        object_key=str((after or before or {}).get("object_key") or _desktop_object_key(element)),
        action=action,
        source=source,
        actor=actor,
        changed_fields=changed,
        before_snapshot=before or {},
        after_snapshot=after or {},
        impact_summary=impact_summary or {},
    )
    db.add(history)
    return history


def _healing_suggestion_response(
    suggestion: DesktopObjectHealingSuggestionModel,
) -> DesktopObjectHealingSuggestionResponse:
    return DesktopObjectHealingSuggestionResponse(
        id=suggestion.id,
        page_id=suggestion.page_id or "",
        element_id=suggestion.element_id or "",
        object_key=suggestion.object_key,
        object_name=suggestion.object_name or "",
        application=suggestion.application or "",
        status=suggestion.status or "pending",
        source=suggestion.source or "",
        suggested_strategy=suggestion.suggested_strategy or "",
        suggested_locator=suggestion.suggested_locator or "",
        suggested_field=suggestion.suggested_field or "",
        confidence=suggestion.confidence,
        reason=suggestion.reason or "",
        evidence=suggestion.evidence or [],
        preview_update=suggestion.preview_update or {},
        created_at=suggestion.created_at,
        resolved_at=suggestion.resolved_at,
        resolved_by=suggestion.resolved_by or "",
        resolution_note=suggestion.resolution_note or "",
    )


def _canonical_desktop_strategy(value: Any) -> str:
    strategy = str(value or "").strip().lower().replace("-", " ").replace("_", " ")
    aliases = {
        "accessibility": "accessibility id",
        "accessibility id": "accessibility id",
        "automation id": "accessibility id",
        "id": "accessibility id",
        "name": "name",
        "text": "name",
        "xpath": "xpath",
        "uia path": "xpath",
        "path": "xpath",
        "class": "class name",
        "class name": "class name",
        "ocr": "ocr",
        "visual": "visual",
        "image": "visual",
    }
    return aliases.get(strategy, strategy or "accessibility id")


def _locator_identity(strategy: Any, locator: Any) -> tuple[str, str]:
    return (_canonical_desktop_strategy(strategy), str(locator or "").strip().lower())


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "matched", "success", "successful"}


def _attempt_confidence(attempt: dict[str, Any], default: float = 1.0) -> float:
    for key in ("confidence", "match_confidence", "score"):
        if attempt.get(key) is None:
            continue
        try:
            return max(0.0, min(float(attempt.get(key)), 1.0))
        except (TypeError, ValueError):
            continue
    return default


def _attempt_candidate(attempt: dict[str, Any]) -> tuple[str, str] | None:
    nested = attempt.get("candidate") if isinstance(attempt.get("candidate"), dict) else {}
    strategy = (
        attempt.get("strategy")
        or attempt.get("locator_strategy")
        or nested.get("strategy")
        or nested.get("locator_strategy")
    )
    locator = (
        attempt.get("locator")
        or attempt.get("selector")
        or attempt.get("value")
        or nested.get("locator")
        or nested.get("selector")
        or nested.get("value")
    )
    locator_value = str(locator or "").strip()
    if not locator_value:
        return None
    return _canonical_desktop_strategy(strategy), locator_value


def _attempt_is_successful(attempt: dict[str, Any]) -> bool:
    success_keys = ("success", "successful", "matched", "used", "selected", "healed")
    return any(key in attempt and _truthy(attempt.get(key)) for key in success_keys)


def _desktop_healing_suggestion_preview(
    page: PageRepositoryModel,
    element: PageElementModel,
    locator_attempts: list[dict[str, Any]],
    *,
    successful_strategy: str = "",
    successful_locator: str = "",
    confidence: float | None = None,
    source: str = "smart_identification",
    reason: str = "",
    min_confidence: float = 0.65,
) -> dict[str, Any] | None:
    evidence = [dict(item) for item in locator_attempts if isinstance(item, dict)]
    candidates: list[tuple[int, str, str, float, dict[str, Any]]] = []

    if str(successful_locator or "").strip():
        explicit = {
            "strategy": successful_strategy or "accessibility id",
            "locator": successful_locator,
            "confidence": confidence if confidence is not None else 1.0,
            "success": True,
            "source": source,
        }
        evidence.insert(0, explicit)

    for index, attempt in enumerate(evidence):
        if not _attempt_is_successful(attempt):
            continue
        parsed = _attempt_candidate(attempt)
        if parsed is None:
            continue
        strategy, locator = parsed
        score = _attempt_confidence(attempt, default=confidence if confidence is not None else 1.0)
        candidates.append((index, strategy, locator, score, attempt))

    if not candidates:
        return None

    existing = {
        _locator_identity(item.get("strategy"), item.get("locator") or item.get("selector") or item.get("value"))
        for item in _element_locator_candidates(element, desktop=True)
    }
    field_by_strategy = {
        "accessibility id": "automation_id",
        "name": "name_text",
        "xpath": "uia_path",
        "class name": "class_name",
    }
    deterministic = set(field_by_strategy)
    candidates.sort(key=lambda item: (-item[3], item[0]))

    for _index, strategy, locator, score, attempt in candidates:
        if score < min_confidence:
            continue
        if _locator_identity(strategy, locator) in existing:
            continue

        alternate_locators = [
            dict(item)
            for item in (element.alternative_locators or [])
            if isinstance(item, dict)
        ]
        alternate_locators.append({
            "strategy": strategy,
            "locator": locator,
            "confidence": round(score, 4),
            "verified": True,
            "source": source,
            "reason": reason or "Successful healed desktop match",
        })

        preview_update: dict[str, Any] = {
            "alternative_locators": alternate_locators,
            "confidence_score": max(float(element.confidence_score or 0), round(score, 4)),
        }
        suggested_field = "alternative_locators"
        if strategy in deterministic:
            suggested_field = field_by_strategy[strategy]
            preview_update[suggested_field] = locator
            if score >= 0.85:
                preview_update["locator_strategy"] = strategy
                preview_update["primary_locator"] = locator

        metadata = dict(_element_metadata(element))
        healing_metadata = metadata.get("healing")
        if not isinstance(healing_metadata, dict):
            healing_metadata = {}
        healing_metadata["latest_suggestion"] = {
            "strategy": strategy,
            "locator": locator,
            "confidence": round(score, 4),
            "source": source,
            "created_at": datetime.now(UTC).isoformat(),
        }
        preview_update["metadata"] = {"healing": healing_metadata}

        return {
            "object_key": _desktop_object_key(element),
            "object_name": element.name or "",
            "application": str(_element_metadata(element).get("application") or page.name or ""),
            "suggested_strategy": strategy,
            "suggested_locator": locator,
            "suggested_field": suggested_field,
            "confidence": round(score, 4),
            "reason": reason or str(attempt.get("reason") or "Successful healed desktop match"),
            "evidence": evidence,
            "preview_update": preview_update,
        }

    return None


LOCATOR_PROFILE_FIELDS = {
    "automation_id",
    "name_text",
    "class_name",
    "uia_path",
    "locator_strategy",
    "primary_locator",
    "alternative_locators",
}


def _locator_base_score(strategy: str, locator: str) -> tuple[float, list[str]]:
    normalized = (strategy or "").strip().lower().replace("_", " ")
    flags: list[str] = []
    scores = {
        "accessibility id": 0.98,
        "automation id": 0.98,
        "name": 0.82,
        "xpath": 0.78,
        "uia path": 0.78,
        "class name": 0.52,
        "ocr": 0.45,
        "visual": 0.40,
        "image": 0.40,
    }
    score = scores.get(normalized, 0.58)
    value = str(locator or "").strip()
    if not value:
        return 0.0, ["empty_locator"]
    if len(value) < 3:
        flags.append("short_locator")
        score -= 0.12
    if normalized in {"class name"}:
        flags.append("class_locator_may_not_be_unique")
    if normalized in {"ocr", "visual", "image"}:
        flags.append("ai_or_visual_fallback")
    if normalized in {"xpath", "uia path"} and len(value.split("/")) > 8:
        flags.append("deep_hierarchy_locator")
        score -= 0.08
    return max(0.0, min(1.0, score)), flags


def _locator_strength(score: float) -> str:
    if score >= 0.85:
        return "strong"
    if score >= 0.65:
        return "moderate"
    return "weak"


def _history_changed_fields(history: Any) -> list[str]:
    if isinstance(history, dict):
        value = history.get("changed_fields") or []
    else:
        value = getattr(history, "changed_fields", []) or []
    return [str(item) for item in value]


def _history_created_at(history: Any) -> datetime | None:
    if isinstance(history, dict):
        value = history.get("created_at")
    else:
        value = getattr(history, "created_at", None)
    return value if isinstance(value, datetime) else None


def _desktop_object_locator_profile(
    page: PageRepositoryModel,
    element: PageElementModel,
    history_rows: list[Any] | None = None,
) -> DesktopObjectLocatorProfileResponse:
    history_rows = history_rows or []
    candidates: list[DesktopObjectLocatorCandidateProfile] = []
    for candidate in _element_locator_candidates(element, desktop=True):
        strategy = str(candidate.get("strategy") or "")
        locator = str(candidate.get("locator") or "")
        score, flags = _locator_base_score(strategy, locator)
        candidates.append(DesktopObjectLocatorCandidateProfile(
            strategy=strategy,
            locator=locator,
            score=round(score, 2),
            strength=_locator_strength(score),
            reason=str(candidate.get("reason") or ""),
            risk_flags=flags,
        ))

    candidates.sort(key=lambda item: item.score, reverse=True)
    locator_change_count = sum(
        1 for history in history_rows
        if set(_history_changed_fields(history)) & LOCATOR_PROFILE_FIELDS
    )
    last_changed_at = next((_history_created_at(history) for history in history_rows if _history_created_at(history)), None)
    best = candidates[0] if candidates else None
    base_score = best.score if best else 0.0
    confidence = element.confidence_score if element.confidence_score is not None else 1.0
    score = base_score
    score -= min(locator_change_count * 0.08, 0.32)
    if confidence < 0.75:
        score -= 0.15
    if not element.id_attr:
        score -= 0.08
    if not element.xpath and not element.name_attr:
        score -= 0.06
    score = round(max(0.0, min(1.0, score)), 2)

    stale_reasons: list[str] = []
    suggestions: list[str] = []
    if not candidates:
        stale_reasons.append("No locator candidates are stored for this object.")
        suggestions.append("Capture the object with Desktop Spy or sync a master-sheet row with at least one locator.")
    if not element.id_attr:
        stale_reasons.append("Automation ID is missing.")
        suggestions.append("Prefer a stable Automation ID/accessibility id as the primary desktop locator.")
    if best and best.strength == "weak":
        stale_reasons.append(f"Best locator is weak ({best.strategy}).")
        suggestions.append("Add a deterministic locator such as Automation ID, UIA path, or stable name/text.")
    if locator_change_count >= 2:
        stale_reasons.append("Locator fields changed multiple times in object history.")
        suggestions.append("Review recent locator changes before approving another repository update.")
    if confidence < 0.75:
        stale_reasons.append("Object confidence score is below 75%.")
        suggestions.append("Re-spy the object or add verified locator candidates.")
    if any("ai_or_visual_fallback" in candidate.risk_flags for candidate in candidates):
        suggestions.append("Keep OCR/visual locators as fallback only; add deterministic candidates for primary execution.")
    if not element.name_attr:
        suggestions.append("Add name/text as a secondary locator candidate for Smart Identification.")
    if not element.xpath:
        suggestions.append("Capture UIA path to improve fallback matching when Automation ID changes.")

    stale = score < 0.68 or locator_change_count >= 3 or not candidates
    metadata = _element_metadata(element)
    deduped_suggestions = list(dict.fromkeys(suggestions))
    return DesktopObjectLocatorProfileResponse(
        object_key=_desktop_object_key(element),
        object_name=element.name,
        application=str(metadata.get("application") or page.name or ""),
        page_id=page.id,
        element_id=element.id,
        stability_score=score,
        stale=stale,
        stale_reasons=list(dict.fromkeys(stale_reasons)),
        suggestions=deduped_suggestions,
        primary_locator=_element_primary_locator(element, desktop=True),
        best_strategy=best.strategy if best else "",
        history_count=len(history_rows),
        locator_change_count=locator_change_count,
        last_changed_at=last_changed_at,
        candidates=candidates,
    )


def _apply_element_to_test_step(step: TestStepModel, page: PageRepositoryModel, element: PageElementModel) -> None:
    is_desktop = _is_desktop_page(page)
    locator = _element_primary_locator(element, desktop=is_desktop)
    locators = _element_locator_candidates(element, desktop=is_desktop)
    xpath = element.xpath or locator
    test_data = dict(step.test_data or {})
    bindings = dict(step.bindings or {})
    metadata = _element_metadata(element)

    if is_desktop:
        desktop = dict(bindings.get("desktop") or {})
        object_key = _desktop_object_key(element)
        automation_id = element.id_attr or ""
        uia_path = element.xpath or ""
        name_text = element.name_attr or element.name or ""

        test_data.update({
            "platform": "desktop",
            "page_id": page.id,
            "page_name": page.name,
            "application": metadata.get("application") or page.name,
            "application_path": metadata.get("application_path") or page.url_pattern or test_data.get("application_path") or "",
            "page_element_id": element.id,
            "element_name": element.name,
            "object_key": object_key,
            "control_type": element.element_type or "element",
            "automation_id": automation_id,
            "uia_path": uia_path,
            "class_name": element.css_selector or "",
            "name_text": name_text,
            "path_location": locator,
            "locator": locator,
            "locators": locators,
            "window": metadata.get("window") or "",
            "screen": metadata.get("screen") or metadata.get("window") or "",
        })
        desktop.update({
            "page": page.name,
            "page_id": page.id,
            "application": metadata.get("application") or page.name,
            "application_path": metadata.get("application_path") or page.url_pattern or desktop.get("application_path") or "",
            "object_name": element.name,
            "object_key": object_key,
            "page_element_id": element.id,
            "selector": locator,
            "strategy": element.locator_strategy or "accessibility id",
            "automation_id": automation_id,
            "uia_path": uia_path,
            "class_name": element.css_selector or "",
            "name": name_text,
            "control_type": element.element_type or "element",
            "locators": locators,
            "window": metadata.get("window") or "",
            "screen": metadata.get("screen") or metadata.get("window") or "",
        })
        bindings["desktop"] = desktop
        bindings.pop("web", None)

        step.page_id = page.id
        step.page_element_id = element.id
        step.target = element.name
        step.test_data = test_data
        step.bindings = bindings
        return

    web = dict(bindings.get("web") or {})

    test_data.update({
        "page_id": page.id,
        "page_name": page.name,
        "page_element_id": element.id,
        "element_name": element.name,
        "xpath": xpath,
        "path_location": locator,
        "locator": locator,
        "css_selector": element.css_selector or "",
        "locators": locators,
    })
    web.update({
        "page": page.name,
        "page_id": page.id,
        "element_name": element.name,
        "page_element_id": element.id,
        "selector": locator,
        "xpath": xpath,
        "css_selector": element.css_selector or "",
        "locators": locators,
    })
    bindings["web"] = web

    step.page_id = page.id
    step.page_element_id = element.id
    step.target = element.name
    step.test_data = test_data
    step.bindings = bindings


async def _sync_test_steps_for_element(
    element: PageElementModel,
    db: AsyncSession,
    previous_name: str | None = None,
) -> int:
    page = await db.get(PageRepositoryModel, element.page_id)
    if page is None:
        return 0
    target_names = [element.name]
    if previous_name and previous_name not in target_names:
        target_names.append(previous_name)
    result = await db.execute(
        select(TestStepModel).where(
            or_(
                TestStepModel.page_element_id == element.id,
                (
                    (TestStepModel.page_id == element.page_id)
                    & (TestStepModel.target.in_(target_names))
                ),
            )
        )
    )
    steps = list(result.scalars().all())
    for step in steps:
        _apply_element_to_test_step(step, page, element)
    return len(steps)


def _dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _string_set(*values: Any) -> set[str]:
    return {str(value or "").strip().lower() for value in values if str(value or "").strip()}


def _desktop_object_impact_reasons(step: Any, page: PageRepositoryModel, element: PageElementModel) -> list[str]:
    metadata = _element_metadata(element)
    object_key = _desktop_object_key(element)
    primary_locator = _element_primary_locator(element, desktop=True)
    locator_values = _string_set(
        primary_locator,
        element.id_attr,
        element.name_attr,
        element.xpath,
        element.css_selector,
        element.name,
        object_key,
    )
    reasons: list[str] = []

    def add(reason: str) -> None:
        if reason not in reasons:
            reasons.append(reason)

    if getattr(step, "page_element_id", None) == element.id:
        add("linked_page_element")
    if getattr(step, "page_id", None) == page.id:
        add("linked_repository_page")
    if str(getattr(step, "target", "") or "").strip().lower() in _string_set(element.name, element.name_attr, object_key):
        add("target_matches_object")

    bindings = _dict_value(getattr(step, "bindings", None))
    desktop = _dict_value(bindings.get("desktop"))
    test_data = _dict_value(getattr(step, "test_data", None))
    for source_name, source in (("desktop_binding", desktop), ("test_data", test_data)):
        if not source:
            continue
        if str(source.get("object_key") or "").strip().lower() == object_key.strip().lower():
            add(f"{source_name}_object_key")
        if str(source.get("page_element_id") or "").strip() == str(element.id):
            add(f"{source_name}_page_element")
        if str(source.get("page_id") or "").strip() == str(page.id):
            add(f"{source_name}_page")
        for key in ("automation_id", "selector", "locator", "path_location", "uia_path", "xpath", "name", "element_name", "object_name", "class_name"):
            if str(source.get(key) or "").strip().lower() in locator_values:
                add(f"{source_name}_{key}")
        for locator in source.get("locators") or source.get("alternative_locators") or []:
            if not isinstance(locator, dict):
                continue
            locator_value = str(locator.get("locator") or locator.get("selector") or locator.get("value") or "").strip().lower()
            if locator_value in locator_values:
                add(f"{source_name}_locator_candidate")

    for key in ("automation_id", "object_key", "uia_path", "locator", "path_location"):
        if str(test_data.get(key) or "").strip().lower() in locator_values:
            add(f"test_data_{key}")

    if str(metadata.get("source") or "") == "master_sheet_sync" and desktop.get("object_key") == object_key:
        add("master_sheet_synced_object")
    return reasons


def _impact_risk(reasons: list[str]) -> str:
    if any(reason in reasons for reason in ("linked_page_element", "desktop_binding_object_key", "test_data_object_key")):
        return "high"
    if any("automation_id" in reason or "locator" in reason or "uia_path" in reason for reason in reasons):
        return "medium"
    return "low"


def _step_current_locator(step: Any, element: PageElementModel) -> str:
    bindings = _dict_value(getattr(step, "bindings", None))
    desktop = _dict_value(bindings.get("desktop"))
    test_data = _dict_value(getattr(step, "test_data", None))
    for source in (desktop, test_data):
        for key in ("selector", "locator", "path_location", "automation_id", "uia_path", "xpath"):
            value = source.get(key)
            if value not in (None, ""):
                return str(value)
    return _element_primary_locator(element, desktop=True)


def _impact_step_response(step: TestStepModel, page: PageRepositoryModel, element: PageElementModel) -> DesktopObjectImpactStep:
    reasons = _desktop_object_impact_reasons(step, page, element)
    test_case = getattr(step, "test_case", None)
    module = getattr(test_case, "module", None)
    project = getattr(module, "project", None)
    return DesktopObjectImpactStep(
        step_id=str(getattr(step, "id", "") or ""),
        step_order=int(getattr(step, "step_order", 0) or 0),
        step_name=str(getattr(step, "name", "") or ""),
        action_type=str(getattr(step, "action_type", "") or getattr(step, "intent", "") or ""),
        target=str(getattr(step, "target", "") or ""),
        is_enabled=bool(getattr(step, "is_enabled", True)),
        test_case_id=str(getattr(test_case, "id", "") or getattr(step, "test_case_id", "") or ""),
        test_case_name=str(getattr(test_case, "name", "") or ""),
        module_id=str(getattr(module, "id", "") or ""),
        module_name=str(getattr(module, "name", "") or ""),
        project_id=str(getattr(project, "id", "") or getattr(test_case, "project_id", "") or ""),
        project_name=str(getattr(project, "name", "") or ""),
        match_reasons=reasons,
        risk=_impact_risk(reasons),
        current_locator=_step_current_locator(step, element),
    )


def _workflow_node_matches_desktop_object(node: WorkflowNodeModel, step_ids: set[str], element: PageElementModel) -> bool:
    config = _dict_value(getattr(node, "config", None))
    if str(config.get("test_step_id") or "") in step_ids:
        return True
    object_key = _desktop_object_key(element)
    primary_locator = _element_primary_locator(element, desktop=True)
    locator_values = _string_set(object_key, primary_locator, element.id_attr, element.name_attr, element.xpath, element.css_selector)
    for key in ("object_key", "selector", "locator", "automation_id", "uia_path", "xpath"):
        if str(config.get(key) or "").strip().lower() in locator_values:
            return True
    for locator in config.get("locators") or []:
        if isinstance(locator, dict):
            value = str(locator.get("locator") or locator.get("selector") or locator.get("value") or "").strip().lower()
            if value in locator_values:
                return True
    return False


async def _load_desktop_object_ref(
    object_key: str,
    db: AsyncSession,
) -> tuple[PageRepositoryModel, PageElementModel] | None:
    result = await db.execute(
        select(PageRepositoryModel)
        .where(PageRepositoryModel.platform.in_(["desktop", "windows"]))
        .options(selectinload(PageRepositoryModel.elements))
        .order_by(PageRepositoryModel.name)
    )
    needle = str(object_key or "").strip().lower()
    for page in result.scalars().all():
        for element in page.elements or []:
            keys = {
                str(element.id or "").strip().lower(),
                str(element.name or "").strip().lower(),
                _desktop_object_key(element).strip().lower(),
            }
            if needle in keys:
                return page, element
    return None


async def _desktop_page_for_body(
    body: DesktopObjectCreateSchema,
    db: AsyncSession,
) -> PageRepositoryModel:
    if body.page_id:
        page = await _load(body.page_id, db)
        if not _is_desktop_page(page):
            raise HTTPException(status_code=400, detail="Selected repository page is not a desktop repository")
        return page

    application = body.application.strip() or "Desktop Application"
    result = await db.execute(
        select(PageRepositoryModel)
        .where(PageRepositoryModel.platform == "desktop")
        .where(PageRepositoryModel.name == application)
        .options(selectinload(PageRepositoryModel.elements))
        .limit(1)
    )
    page = result.scalar_one_or_none()
    if page:
        if body.application_path and not page.url_pattern:
            page.url_pattern = body.application_path
        return page

    page = PageRepositoryModel(
        name=application,
        url_pattern=body.application_path,
        description=f"Desktop object repository for {application}",
        platform="desktop",
        tags=sorted(set(["desktop", "object-repository", *body.tags])),
    )
    db.add(page)
    await db.flush()
    return page


def _desktop_object_metadata(
    page: PageRepositoryModel,
    values: dict[str, Any],
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    metadata = dict(existing or {})
    nested = values.get("metadata")
    if isinstance(nested, dict):
        metadata.update(nested)

    for key in (
        "object_key",
        "application",
        "application_path",
        "repository_scope",
        "window",
        "screen",
        "ui_framework",
        "process_name",
        "hierarchy_path",
        "bounding_box",
        "screenshot_url",
        "ocr_text",
        "ai_label",
        "primary_locator",
    ):
        if key in values and values.get(key) is not None:
            metadata[key] = values.get(key)

    metadata.setdefault("platform", "desktop")
    metadata.setdefault("application", page.name)
    metadata.setdefault("application_path", page.url_pattern or "")
    metadata.setdefault("repository_scope", "shared")
    if not metadata.get("primary_locator"):
        metadata["primary_locator"] = (
            values.get("automation_id")
            or values.get("uia_path")
            or values.get("name_text")
            or values.get("class_name")
            or ""
        )
    return metadata


def _apply_desktop_object_values(
    page: PageRepositoryModel,
    element: PageElementModel,
    values: dict[str, Any],
) -> None:
    metadata = _desktop_object_metadata(page, values, _element_metadata(element))
    if values.get("application") is not None:
        page.name = str(values.get("application") or page.name)
    if values.get("application_path") is not None:
        page.url_pattern = str(values.get("application_path") or page.url_pattern or "")

    if values.get("name") is not None:
        element.name = str(values.get("name") or element.name)
    if values.get("control_type") is not None:
        element.element_type = str(values.get("control_type") or "element")
    if values.get("automation_id") is not None:
        element.id_attr = str(values.get("automation_id") or "")
    if values.get("name_text") is not None:
        element.name_attr = str(values.get("name_text") or "")
    if values.get("class_name") is not None:
        element.css_selector = str(values.get("class_name") or "")
    if values.get("uia_path") is not None:
        element.xpath = str(values.get("uia_path") or "")
    if values.get("locator_strategy") is not None:
        element.locator_strategy = str(values.get("locator_strategy") or "accessibility id")
    if values.get("alternative_locators") is not None:
        element.alternative_locators = values.get("alternative_locators") or []
    if values.get("confidence_score") is not None:
        element.confidence_score = values.get("confidence_score")
    if values.get("tags") is not None:
        element.tags = values.get("tags") or []
    if values.get("screenshot_url") is not None:
        element.source_url = str(values.get("screenshot_url") or "")
    element.discovery_metadata = metadata


# ── Page routes ───────────────────────────────────────────────────────────────

def _text_value(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _desktop_sync_key(value: Any, fallback: str = "desktop_object") -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")
    return slug or fallback


def _recorded_coordinate_locator(action: Any) -> str:
    x = getattr(action, "x", None)
    y = getattr(action, "y", None)
    if x is None or y is None:
        return ""
    try:
        return f"x={round(float(x))},y={round(float(y))}"
    except (TypeError, ValueError):
        return ""


def _is_placeholder_window_name(value: Any) -> bool:
    text = re.sub(r"\s+", "", str(value or "").strip().lower())
    return bool(re.fullmatch(r"untitled\d*", text))


def _locator_candidates_indicate_window(locators: list[dict[str, Any]]) -> bool:
    for locator in locators:
        value = _locator_text(locator).strip().lower()
        strategy = str(locator.get("strategy") or locator.get("locator_strategy") or "").strip().lower()
        if value.startswith("window:") or "window[" in value or "@controltype='window'" in value:
            return True
        if strategy == "class name" and value in {"sunawtframe", "wndclass_desked_gsk", "cabinetwclass"}:
            return True
    return False


def _desktop_repository_identity(
    *,
    application: Any,
    raw_key: Any,
    raw_name: Any,
    primary_locator: Any,
    control_type: Any = "",
    locators: list[dict[str, Any]] | None = None,
) -> tuple[str, str]:
    app_name = _text_value(application)
    object_name = _text_value(raw_name, raw_key, primary_locator, "Desktop Object")
    object_key_source = _text_value(raw_key, object_name)
    locator_value = _text_value(primary_locator, raw_key, raw_name)
    is_window = str(control_type or "").strip().lower() == "window" or _locator_candidates_indicate_window(locators or [])
    if app_name and is_window and (
        _is_placeholder_window_name(object_name)
        or _is_placeholder_window_name(object_key_source)
        or _is_placeholder_window_name(locator_value)
    ):
        return _desktop_sync_key(f"{app_name}_window"), f"{app_name} Window"
    return _desktop_sync_key(object_key_source), object_name


def _clean_desktop_process_name(value: Any) -> str:
    process_name = _text_value(value)
    return "" if process_name.isdigit() else process_name


def _locator_text(locator: dict[str, Any]) -> str:
    return _text_value(locator.get("locator"), locator.get("selector"), locator.get("value"))


def _locator_score(locator: dict[str, Any]) -> float:
    try:
        return float(locator.get("score") if locator.get("score") is not None else locator.get("confidence") or 0)
    except (TypeError, ValueError):
        return 0.0


def _desktop_locator_details(
    *,
    strategy: Any = "",
    locator: Any = "",
    locators: Any = None,
) -> dict[str, Any]:
    candidates = [dict(item) for item in (locators or []) if isinstance(item, dict)]
    fields = {"automation_id": "", "name_text": "", "uia_path": "", "class_name": ""}
    confidence: float | None = None

    for candidate in candidates:
        candidate_strategy = _canonical_desktop_strategy(candidate.get("strategy") or candidate.get("locator_strategy"))
        candidate_locator = _locator_text(candidate)
        if not candidate_locator:
            continue
        score = max(0.0, min(_locator_score(candidate) or 1.0, 1.0))
        confidence = max(confidence or 0.0, score)
        if candidate_strategy == "accessibility id" and not fields["automation_id"]:
            fields["automation_id"] = candidate_locator
        elif candidate_strategy == "name" and not fields["name_text"]:
            fields["name_text"] = candidate_locator
        elif candidate_strategy == "xpath" and not fields["uia_path"]:
            fields["uia_path"] = candidate_locator
        elif candidate_strategy == "class name" and not fields["class_name"]:
            fields["class_name"] = candidate_locator

    primary_strategy = _canonical_desktop_strategy(strategy)
    primary_locator = _text_value(locator)
    if not primary_locator and candidates:
        sorted_candidates = sorted(candidates, key=lambda item: (_locator_score(item), _locator_text(item)), reverse=True)
        for candidate in sorted_candidates:
            candidate_locator = _locator_text(candidate)
            if candidate_locator:
                primary_strategy = _canonical_desktop_strategy(candidate.get("strategy") or candidate.get("locator_strategy"))
                primary_locator = candidate_locator
                break

    if primary_strategy == "accessibility id" and primary_locator and not fields["automation_id"]:
        fields["automation_id"] = primary_locator
    elif primary_strategy == "name" and primary_locator and not fields["name_text"]:
        fields["name_text"] = primary_locator
    elif primary_strategy == "xpath" and primary_locator and not fields["uia_path"]:
        fields["uia_path"] = primary_locator
    elif primary_strategy == "class name" and primary_locator and not fields["class_name"]:
        fields["class_name"] = primary_locator

    if primary_strategy == "name" and _is_placeholder_window_name(primary_locator):
        if fields["automation_id"]:
            primary_strategy = "accessibility id"
            primary_locator = fields["automation_id"]
        elif fields["uia_path"]:
            primary_strategy = "xpath"
            primary_locator = fields["uia_path"]
        elif fields["class_name"]:
            primary_strategy = "class name"
            primary_locator = fields["class_name"]

    return {
        **fields,
        "locator_strategy": primary_strategy or "accessibility id",
        "primary_locator": primary_locator,
        "alternative_locators": candidates,
        "confidence_score": confidence,
    }


def _find_desktop_element(page: PageRepositoryModel | None, object_key: Any) -> PageElementModel | None:
    if page is None:
        return None
    needle = str(object_key or "").strip().lower()
    if not needle:
        return None
    for element in page.elements or []:
        keys = {
            str(element.id or "").strip().lower(),
            str(element.name or "").strip().lower(),
            str(element.id_attr or "").strip().lower(),
            str(element.name_attr or "").strip().lower(),
            _desktop_object_key(element).strip().lower(),
        }
        if needle in keys:
            return element
    return None


async def _upsert_desktop_object_from_sync(
    db: AsyncSession,
    values: dict[str, Any],
    *,
    source: str,
    update_existing: bool,
    impact_summary: dict[str, Any] | None = None,
) -> tuple[str, str, bool, PageRepositoryModel | None, PageElementModel | None]:
    object_key = _text_value(values.get("object_key"))
    if not object_key:
        return "skipped", "No object key", False, None, None
    if not _text_value(values.get("primary_locator"), values.get("automation_id"), values.get("name_text"), values.get("uia_path"), values.get("class_name")):
        return "skipped", "No usable locator", False, None, None

    body = DesktopObjectCreateSchema(**values)
    existing_page_result = await db.execute(
        select(PageRepositoryModel)
        .where(PageRepositoryModel.platform == "desktop")
        .where(PageRepositoryModel.name == (body.application.strip() or "Desktop Application"))
        .options(selectinload(PageRepositoryModel.elements))
        .limit(1)
    )
    existing_page = existing_page_result.scalar_one_or_none()
    page = await _desktop_page_for_body(body, db)
    page_created = existing_page is None
    element = None if page_created else _find_desktop_element(page, body.object_key)

    if element is None:
        metadata = _desktop_object_metadata(page, body.model_dump())
        element = PageElementModel(
            page_id=page.id,
            name=body.name,
            element_type=body.control_type or "element",
            description=body.metadata.get("description", "") if isinstance(body.metadata, dict) else "",
            xpath=body.uia_path,
            css_selector=body.class_name,
            id_attr=body.automation_id,
            name_attr=body.name_text,
            locator_strategy=body.locator_strategy or "accessibility id",
            tags=body.tags,
            confidence_score=body.confidence_score,
            alternative_locators=body.alternative_locators,
            source_url=body.screenshot_url,
            discovery_metadata=metadata,
        )
        db.add(element)
        await db.flush()
        _record_desktop_object_history(
            db,
            page,
            element,
            action="created",
            source=source,
            before=None,
            after=_desktop_object_snapshot(page, element),
            impact_summary=impact_summary,
        )
        return "created", "", page_created, page, element

    if not update_existing:
        return "skipped", "Object already exists", page_created, page, element

    before = _desktop_object_snapshot(page, element)
    _apply_desktop_object_values(page, element, body.model_dump())
    await db.flush()
    after = _desktop_object_snapshot(page, element)
    if not _changed_fields(before, after):
        return "skipped", "Object already up to date", page_created, page, element
    _record_desktop_object_history(
        db,
        page,
        element,
        action="updated",
        source=source,
        before=before,
        after=after,
        impact_summary=impact_summary,
    )
    return "updated", "", page_created, page, element


def _workflow_launch_context(workflow: WorkflowModel) -> dict[str, Any]:
    variables = _dict_value(getattr(workflow, "variables", None))
    launch_config: dict[str, Any] = {}
    for node in getattr(workflow, "nodes", []) or []:
        if str(getattr(node, "type", "") or "") in {"desktop.launch", "desktop.attach"}:
            launch_config = _dict_value(getattr(node, "config", None))
            break

    workflow_name = str(getattr(workflow, "name", "") or "Desktop Workflow")
    application = _text_value(
        variables.get("application"),
        variables.get("application_name"),
        variables.get("desktop_recorder_session_name"),
        workflow_name.removesuffix(" Workflow"),
        workflow_name,
    )
    return {
        "application": application or "Desktop Application",
        "application_path": _text_value(variables.get("application_path"), launch_config.get("app")),
        "window": _text_value(variables.get("window_title"), launch_config.get("window_title")),
        "process_name": _clean_desktop_process_name(_text_value(variables.get("process_name"), launch_config.get("process_name"))),
        "session_id": _text_value(variables.get("desktop_recorder_session_id")),
    }


def _node_object_name(node: WorkflowNodeModel, config: dict[str, Any], object_key: str, primary_locator: str) -> str:
    for key in ("object_name", "name", "label", "target"):
        value = _text_value(config.get(key))
        if value:
            return value
    label = _text_value(getattr(node, "label", ""))
    if " - " in label:
        return label.split(" - ", 1)[1].strip() or label
    return _text_value(object_key, primary_locator, label, "Desktop Object")


def _desktop_values_from_workflow_node(
    workflow: WorkflowModel,
    node: WorkflowNodeModel,
    context: dict[str, Any],
) -> dict[str, Any] | None:
    node_type = str(getattr(node, "type", "") or "")
    if not node_type.startswith("desktop."):
        return None
    if node_type in {"desktop.launch", "desktop.attach", "desktop.wait", "desktop.wait_for_window", "desktop.close"}:
        return None

    config = _dict_value(getattr(node, "config", None))
    locators = [dict(item) for item in (config.get("locators") or []) if isinstance(item, dict)]
    locator_details = _desktop_locator_details(
        strategy=config.get("locator_strategy") or config.get("strategy"),
        locator=config.get("primary_locator") or config.get("selector") or config.get("locator"),
        locators=locators,
    )
    primary_locator = _text_value(locator_details.get("primary_locator"))
    raw_key = _text_value(
        config.get("object_key"),
        config.get("repository_key"),
        config.get("element_key"),
        config.get("selector"),
        primary_locator,
        getattr(node, "node_key", ""),
    )
    inferred_control_type = _text_value(config.get("control_type"), config.get("element_type"))
    object_key, name = _desktop_repository_identity(
        application=context["application"],
        raw_key=raw_key,
        raw_name=_node_object_name(node, config, raw_key, primary_locator),
        primary_locator=primary_locator,
        control_type=inferred_control_type,
        locators=locators,
    )
    metadata = {
        "source": "desktop_workflow_sync",
        "workflow_id": str(getattr(workflow, "id", "") or ""),
        "workflow_name": str(getattr(workflow, "name", "") or ""),
        "node_key": str(getattr(node, "node_key", "") or ""),
        "node_type": node_type,
        "selector": config.get("selector"),
        "strategy": config.get("strategy"),
        "locators": locators,
    }
    if config.get("coordinate_fallback") is not None:
        metadata["coordinate_fallback"] = bool(config.get("coordinate_fallback"))
    if config.get("x") is not None or config.get("y") is not None:
        metadata["coordinates"] = {"x": config.get("x"), "y": config.get("y")}

    return {
        "application": context["application"],
        "application_path": context["application_path"],
        "repository_scope": "shared",
        "object_key": object_key,
        "name": name,
        "control_type": _text_value(inferred_control_type, "element"),
        "automation_id": _text_value(config.get("automation_id"), locator_details.get("automation_id")),
        "name_text": _text_value(config.get("name_text"), locator_details.get("name_text"), name),
        "class_name": _text_value(config.get("class_name"), locator_details.get("class_name")),
        "uia_path": _text_value(config.get("uia_path"), locator_details.get("uia_path")),
        "locator_strategy": locator_details["locator_strategy"],
        "primary_locator": primary_locator,
        "alternative_locators": locator_details["alternative_locators"],
        "window": _text_value(config.get("window"), config.get("window_title"), context["window"]),
        "screen": _text_value(config.get("screen"), config.get("window"), context["window"]),
        "process_name": _clean_desktop_process_name(_text_value(config.get("process_name"), context["process_name"])),
        "confidence_score": locator_details["confidence_score"],
        "tags": ["desktop", "recorded", "workflow-sync"],
        "metadata": metadata,
    }


def _desktop_values_from_recorded_action(
    session: DesktopRecordingSessionModel,
    action: DesktopRecordedActionModel,
) -> dict[str, Any] | None:
    locators = [dict(item) for item in (getattr(action, "locators", None) or []) if isinstance(item, dict)]
    coordinate = _recorded_coordinate_locator(action)
    if coordinate and not any(
        _canonical_desktop_strategy(item.get("strategy") or item.get("locator_strategy")) == "coordinate"
        and _locator_text(item) == coordinate
        for item in locators
    ):
        locators.append({
            "strategy": "coordinate",
            "locator": coordinate,
            "verified": False,
            "element_count": 0,
            "score": 0.34,
            "reason": "Recorded screen coordinate fallback",
        })
    locator_details = _desktop_locator_details(
        strategy=getattr(action, "locator_strategy", ""),
        locator=None,
        locators=locators,
    )
    primary_locator = _text_value(
        locator_details.get("primary_locator"),
        getattr(action, "automation_id", ""),
        getattr(action, "uia_path", ""),
        getattr(action, "class_name", ""),
        getattr(action, "name_text", ""),
    )
    application = _text_value(getattr(session, "application", ""), getattr(session, "name", ""), "Desktop Application")
    raw_name = _text_value(getattr(action, "object_name", ""), getattr(action, "object_key", ""), primary_locator, "Desktop Object")
    control_type = _text_value(getattr(action, "control_type", ""), "element")
    raw_key = _text_value(getattr(action, "object_key", ""))
    if coordinate and _is_placeholder_window_name(raw_name) and str(control_type).strip().lower() == "element":
        raw_name = f"Desktop Object @ {coordinate}"
    if coordinate and _is_placeholder_window_name(raw_key) and str(control_type).strip().lower() == "element":
        raw_key = f"{application} {coordinate}"
    object_key, name = _desktop_repository_identity(
        application=application,
        raw_key=raw_key,
        raw_name=raw_name,
        primary_locator=primary_locator,
        control_type=control_type,
        locators=locators,
    )
    recorded_name_text = _text_value(getattr(action, "name_text", ""), locator_details.get("name_text"))
    if _is_placeholder_window_name(recorded_name_text):
        recorded_name_text = ""
    metadata = dict(getattr(action, "action_metadata", None) or {})
    metadata.update({
        "source": "desktop_recorder_sync",
        "recording_session_id": str(getattr(session, "id", "") or ""),
        "recorded_action_id": str(getattr(action, "id", "") or ""),
        "action_order": getattr(action, "action_order", None),
        "action_type": str(getattr(action, "action_type", "") or ""),
        "locators": locators,
    })
    if getattr(action, "x", None) is not None or getattr(action, "y", None) is not None:
        metadata["coordinates"] = {"x": getattr(action, "x", None), "y": getattr(action, "y", None)}

    return {
        "page_id": str(getattr(session, "repository_page_id", "") or "") or None,
        "application": application,
        "application_path": _text_value(getattr(session, "application_path", "")),
        "repository_scope": "shared",
        "object_key": object_key,
        "name": name,
        "control_type": control_type,
        "automation_id": _text_value(getattr(action, "automation_id", ""), locator_details.get("automation_id")),
        "name_text": _text_value(recorded_name_text, raw_name if not _is_placeholder_window_name(raw_name) else ""),
        "class_name": _text_value(getattr(action, "class_name", ""), locator_details.get("class_name")),
        "uia_path": _text_value(getattr(action, "uia_path", ""), locator_details.get("uia_path")),
        "locator_strategy": locator_details["locator_strategy"],
        "primary_locator": primary_locator,
        "alternative_locators": locator_details["alternative_locators"],
        "window": _text_value(getattr(action, "window_title", ""), getattr(session, "window_title", "")),
        "screen": _text_value(getattr(action, "screen", ""), getattr(action, "window_title", ""), getattr(session, "window_title", "")),
        "process_name": _clean_desktop_process_name(getattr(session, "process_name", "")),
        "bounding_box": metadata.get("bounding_box") if isinstance(metadata.get("bounding_box"), dict) else None,
        "confidence_score": locator_details["confidence_score"],
        "tags": ["desktop", "recorded", "recorder-sync"],
        "metadata": metadata,
    }


@router.get("/pages", response_model=list[PageListItem])
async def list_pages(platform: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    q = select(PageRepositoryModel).options(selectinload(PageRepositoryModel.elements))
    if platform:
        q = q.where(PageRepositoryModel.platform == platform)
    result = await db.execute(q.order_by(PageRepositoryModel.name))
    return [_page_list(p) for p in result.scalars().all()]


@router.post("/pages", response_model=PageDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_page(body: PageCreateSchema, db: AsyncSession = Depends(get_db)):
    page = PageRepositoryModel(
        name=body.name, url_pattern=body.url_pattern,
        description=body.description, platform=body.platform, tags=body.tags,
    )
    db.add(page)
    await db.commit()
    return _page_detail(await _load(page.id, db))


@router.get("/pages/{page_id}", response_model=PageDetailResponse)
async def get_page(page_id: str, db: AsyncSession = Depends(get_db)):
    return _page_detail(await _load(page_id, db))


@router.put("/pages/{page_id}", response_model=PageDetailResponse)
async def update_page(page_id: str, body: PageUpdateSchema, db: AsyncSession = Depends(get_db)):
    page = await _load(page_id, db)
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(page, field, val)
    await db.commit()
    return _page_detail(await _load(page_id, db))


@router.delete("/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_page(page_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PageRepositoryModel).where(PageRepositoryModel.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        return None
    await _detach_page_references(page_id, db)
    await db.execute(
        delete(PageElementModel)
        .where(PageElementModel.page_id == page_id)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        delete(PageRepositoryModel)
        .where(PageRepositoryModel.id == page_id)
        .execution_options(synchronize_session=False)
    )
    await db.commit()


# ── Element routes ────────────────────────────────────────────────────────────

@router.post("/pages/{page_id}/elements", response_model=PageElementResponse, status_code=status.HTTP_201_CREATED)
async def create_element(page_id: str, body: ElementCreateSchema, db: AsyncSession = Depends(get_db)):
    await _load(page_id, db)
    elem = PageElementModel(
        page_id=page_id, name=body.name, element_type=body.element_type,
        description=body.description, xpath=body.xpath, css_selector=body.css_selector,
        id_attr=body.id_attr, name_attr=body.name_attr,
        locator_strategy=body.locator_strategy, tags=body.tags,
        confidence_score=body.confidence_score,
        alternative_locators=body.alternative_locators,
        discovery_metadata=body.discovery_metadata,
    )
    db.add(elem)
    await db.commit()
    await db.refresh(elem)
    return _elem(elem)


@router.put("/elements/{element_id}", response_model=PageElementResponse)
async def update_element(element_id: str, body: ElementUpdateSchema, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PageElementModel).where(PageElementModel.id == element_id))
    elem = result.scalar_one_or_none()
    if not elem:
        raise HTTPException(status_code=404, detail="Element not found")
    previous_name = elem.name
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(elem, field, val)
    await db.flush()
    await _sync_test_steps_for_element(elem, db, previous_name=previous_name)
    await db.commit()
    await db.refresh(elem)
    return _elem(elem)


@router.delete("/elements/{element_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_element(element_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PageElementModel).where(PageElementModel.id == element_id))
    elem = result.scalar_one_or_none()
    if not elem:
        raise HTTPException(status_code=404, detail="Element not found")
    await db.execute(
        update(TestStepModel)
        .where(TestStepModel.page_element_id == element_id)
        .values(page_element_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(DesktopRepositoryStepModel)
        .where(DesktopRepositoryStepModel.page_element_id == element_id)
        .values(page_element_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(ExecutionStepResultModel)
        .where(ExecutionStepResultModel.page_element_id == element_id)
        .values(page_element_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        delete(PageElementModel)
        .where(PageElementModel.id == element_id)
        .execution_options(synchronize_session=False)
    )
    await db.commit()


# ── All-in-one for autocomplete ───────────────────────────────────────────────

@router.post("/desktop/sync-workflows", response_model=DesktopWorkflowSyncResponse)
async def sync_desktop_workflows_to_repository(
    body: DesktopWorkflowSyncRequest,
    db: AsyncSession = Depends(get_db),
):
    workflows = []
    if not body.session_id or body.workflow_id:
        workflow_query = (
            select(WorkflowModel)
            .options(selectinload(WorkflowModel.nodes))
            .order_by(WorkflowModel.created_at.desc())
        )
        if body.workflow_id:
            workflow_query = workflow_query.where(WorkflowModel.id == body.workflow_id)
        if not body.include_archived:
            workflow_query = workflow_query.where(WorkflowModel.status != "archived")
        workflow_result = await db.execute(workflow_query)
        for workflow in workflow_result.scalars().all():
            platforms = {str(item).lower() for item in (getattr(workflow, "platforms", None) or [])}
            tags = {str(item).lower() for item in (getattr(workflow, "tags", None) or [])}
            has_desktop_node = any(
                str(getattr(node, "type", "") or "").startswith("desktop.")
                for node in (getattr(workflow, "nodes", None) or [])
            )
            if "desktop" in platforms or "desktop" in tags or has_desktop_node:
                workflows.append(workflow)

    session_query = (
        select(DesktopRecordingSessionModel)
        .options(selectinload(DesktopRecordingSessionModel.actions))
        .order_by(DesktopRecordingSessionModel.created_at.desc())
    )
    session_ids = {_text_value(_dict_value(getattr(workflow, "variables", None)).get("desktop_recorder_session_id")) for workflow in workflows}
    session_ids.discard("")
    if body.include_recording_sessions:
        if body.session_id:
            session_query = session_query.where(DesktopRecordingSessionModel.id == body.session_id)
        elif body.workflow_id and session_ids:
            session_query = session_query.where(DesktopRecordingSessionModel.id.in_(list(session_ids)))
        elif body.workflow_id:
            session_query = session_query.where(DesktopRecordingSessionModel.id == "__no_session__")
    else:
        session_query = session_query.where(DesktopRecordingSessionModel.id == "__no_session__")
    session_result = await db.execute(session_query)
    sessions = list(session_result.scalars().all())

    created = updated = skipped = pages_created = 0
    items: list[DesktopWorkflowSyncItem] = []
    seen: set[tuple[str, str]] = set()

    async def apply_values(
        values: dict[str, Any] | None,
        *,
        source: str,
        workflow: WorkflowModel | None = None,
        node: WorkflowNodeModel | None = None,
        session: DesktopRecordingSessionModel | None = None,
    ) -> None:
        nonlocal created, updated, skipped, pages_created
        if values is None:
            return
        object_key = _text_value(values.get("object_key"))
        application = _text_value(values.get("application"), "Desktop Application")
        dedupe_key = (application.lower(), object_key.lower())
        if dedupe_key in seen:
            skipped += 1
            items.append(DesktopWorkflowSyncItem(
                object_key=object_key,
                name=_text_value(values.get("name"), object_key),
                application=application,
                action="skipped",
                reason="Duplicate object in sync source",
                source=source,
                workflow_id=str(getattr(workflow, "id", "") or ""),
                workflow_name=str(getattr(workflow, "name", "") or ""),
                node_key=str(getattr(node, "node_key", "") or ""),
                session_id=str(getattr(session, "id", "") or ""),
            ))
            return
        seen.add(dedupe_key)

        action, reason, did_create_page, page, element = await _upsert_desktop_object_from_sync(
            db,
            values,
            source=source,
            update_existing=body.update_existing,
            impact_summary={
                "workflow_id": str(getattr(workflow, "id", "") or ""),
                "node_key": str(getattr(node, "node_key", "") or ""),
                "recording_session_id": str(getattr(session, "id", "") or ""),
            },
        )
        if action == "created":
            created += 1
        elif action == "updated":
            updated += 1
        else:
            skipped += 1
        if did_create_page:
            pages_created += 1
        items.append(DesktopWorkflowSyncItem(
            object_key=object_key,
            name=_text_value(values.get("name"), object_key),
            application=application,
            action=action,
            reason=reason,
            source=source,
            workflow_id=str(getattr(workflow, "id", "") or ""),
            workflow_name=str(getattr(workflow, "name", "") or ""),
            node_key=str(getattr(node, "node_key", "") or ""),
            session_id=str(getattr(session, "id", "") or ""),
            object=_desktop_object_response(page, element) if page is not None and element is not None else None,
        ))

    for session in sessions:
        for action in session.actions or []:
            await apply_values(
                _desktop_values_from_recorded_action(session, action),
                source="desktop_recorder_sync",
                session=session,
            )

    for workflow in workflows:
        context = _workflow_launch_context(workflow)
        for node in workflow.nodes or []:
            await apply_values(
                _desktop_values_from_workflow_node(workflow, node, context),
                source="desktop_workflow_sync",
                workflow=workflow,
                node=node,
            )

    await db.commit()
    return DesktopWorkflowSyncResponse(
        scanned_workflows=len(workflows),
        scanned_recording_sessions=len(sessions),
        created=created,
        updated=updated,
        skipped=skipped,
        pages_created=pages_created,
        objects=items,
    )


@router.get("/desktop/objects", response_model=list[DesktopObjectResponse])
async def list_desktop_objects(
    application: Optional[str] = None,
    window: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PageRepositoryModel)
        .where(PageRepositoryModel.platform.in_(["desktop", "windows"]))
        .options(selectinload(PageRepositoryModel.elements))
        .order_by(PageRepositoryModel.name)
    )
    app_filter = str(application or "").strip().lower()
    window_filter = str(window or "").strip().lower()
    search_filter = str(search or "").strip().lower()
    objects: list[DesktopObjectResponse] = []

    for page in result.scalars().all():
        if app_filter and app_filter not in page.name.lower():
            continue
        for element in page.elements or []:
            metadata = _element_metadata(element)
            if window_filter and window_filter not in str(metadata.get("window") or "").lower():
                continue
            haystack = " ".join(
                str(value or "")
                for value in (
                    element.name,
                    _desktop_object_key(element),
                    element.id_attr,
                    element.name_attr,
                    element.xpath,
                    element.css_selector,
                    metadata.get("ai_label"),
                    metadata.get("ocr_text"),
                )
            ).lower()
            if search_filter and search_filter not in haystack:
                continue
            objects.append(_desktop_object_response(page, element))
    return sorted(objects, key=lambda item: (item.application.lower(), item.name.lower()))


@router.post("/desktop/objects", response_model=DesktopObjectResponse, status_code=status.HTTP_201_CREATED)
async def create_desktop_object(body: DesktopObjectCreateSchema, db: AsyncSession = Depends(get_db)):
    page = await _desktop_page_for_body(body, db)
    values = body.model_dump()
    metadata = _desktop_object_metadata(page, values)
    elem = PageElementModel(
        page_id=page.id,
        name=body.name,
        element_type=body.control_type or "element",
        description=body.metadata.get("description", "") if isinstance(body.metadata, dict) else "",
        xpath=body.uia_path,
        css_selector=body.class_name,
        id_attr=body.automation_id,
        name_attr=body.name_text,
        locator_strategy=body.locator_strategy or "accessibility id",
        tags=body.tags,
        confidence_score=body.confidence_score,
        alternative_locators=body.alternative_locators,
        source_url=body.screenshot_url,
        discovery_metadata=metadata,
    )
    db.add(elem)
    await db.flush()
    _record_desktop_object_history(
        db,
        page,
        elem,
        action="created",
        source="desktop_repository_api",
        before=None,
        after=_desktop_object_snapshot(page, elem),
    )
    await db.commit()
    await db.refresh(page)
    await db.refresh(elem)
    return _desktop_object_response(page, elem)


@router.get("/desktop/objects/{object_key}", response_model=DesktopObjectResponse)
async def get_desktop_object(object_key: str, db: AsyncSession = Depends(get_db)):
    ref = await _load_desktop_object_ref(object_key, db)
    if ref is None:
        raise HTTPException(status_code=404, detail="Desktop object not found")
    page, element = ref
    return _desktop_object_response(page, element)


@router.get("/desktop/objects/{object_key}/impact", response_model=DesktopObjectImpactResponse)
async def analyze_desktop_object_impact(object_key: str, db: AsyncSession = Depends(get_db)):
    ref = await _load_desktop_object_ref(object_key, db)
    if ref is None:
        raise HTTPException(status_code=404, detail="Desktop object not found")
    page, element = ref

    step_result = await db.execute(
        select(TestStepModel)
        .options(
            selectinload(TestStepModel.test_case)
            .selectinload(TestCaseModel.module)
            .selectinload(TestModuleModel.project)
        )
        .order_by(TestStepModel.step_order)
    )
    steps: list[DesktopObjectImpactStep] = []
    for step in step_result.scalars().all():
        reasons = _desktop_object_impact_reasons(step, page, element)
        if reasons:
            steps.append(_impact_step_response(step, page, element))

    step_ids = {step.step_id for step in steps if step.step_id}
    workflow_result = await db.execute(
        select(WorkflowNodeModel)
        .options(selectinload(WorkflowNodeModel.workflow))
        .order_by(WorkflowNodeModel.node_key)
    )
    workflow_nodes: list[DesktopObjectImpactWorkflowNode] = []
    seen_nodes: set[str] = set()
    for node in workflow_result.scalars().all():
        if not _workflow_node_matches_desktop_object(node, step_ids, element):
            continue
        node_id = str(getattr(node, "id", "") or "")
        if node_id and node_id in seen_nodes:
            continue
        seen_nodes.add(node_id)
        workflow = getattr(node, "workflow", None)
        config = _dict_value(getattr(node, "config", None))
        workflow_nodes.append(DesktopObjectImpactWorkflowNode(
            workflow_id=str(getattr(workflow, "id", "") or getattr(node, "workflow_id", "") or ""),
            workflow_name=str(getattr(workflow, "name", "") or ""),
            node_key=str(getattr(node, "node_key", "") or ""),
            node_type=str(getattr(node, "type", "") or ""),
            node_label=str(getattr(node, "label", "") or ""),
            test_step_id=str(config.get("test_step_id") or ""),
        ))

    risk_summary = {"high": 0, "medium": 0, "low": 0}
    for step in steps:
        risk_summary[step.risk] = risk_summary.get(step.risk, 0) + 1

    return DesktopObjectImpactResponse(
        object_key=_desktop_object_key(element),
        object_name=element.name,
        application=str(_element_metadata(element).get("application") or page.name or ""),
        page_id=page.id,
        element_id=element.id,
        impacted_step_count=len(steps),
        workflow_node_count=len(workflow_nodes),
        risk_summary=risk_summary,
        steps=steps,
        workflow_nodes=workflow_nodes,
    )


@router.get("/desktop/objects/{object_key}/history", response_model=list[DesktopObjectHistoryResponse])
async def get_desktop_object_history(
    object_key: str,
    limit: int = 25,
    db: AsyncSession = Depends(get_db),
):
    ref = await _load_desktop_object_ref(object_key, db)
    element_id = ref[1].id if ref else ""
    needle = str(object_key or "").strip()
    query = select(DesktopObjectHistoryModel)
    if element_id:
        query = query.where(
            or_(
                DesktopObjectHistoryModel.object_key == needle,
                DesktopObjectHistoryModel.element_id == element_id,
            )
        )
    else:
        query = query.where(DesktopObjectHistoryModel.object_key == needle)
    query = query.order_by(DesktopObjectHistoryModel.created_at.desc()).limit(max(1, min(int(limit or 25), 100)))
    rows = (await db.execute(query)).scalars().all()
    return [_history_response(row) for row in rows]


@router.get("/desktop/objects/{object_key}/locator-profile", response_model=DesktopObjectLocatorProfileResponse)
async def get_desktop_object_locator_profile(
    object_key: str,
    db: AsyncSession = Depends(get_db),
):
    ref = await _load_desktop_object_ref(object_key, db)
    if ref is None:
        raise HTTPException(status_code=404, detail="Desktop object not found")
    page, element = ref
    rows = (
        await db.execute(
            select(DesktopObjectHistoryModel)
            .where(
                or_(
                    DesktopObjectHistoryModel.object_key == _desktop_object_key(element),
                    DesktopObjectHistoryModel.element_id == element.id,
                )
            )
            .order_by(DesktopObjectHistoryModel.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return _desktop_object_locator_profile(page, element, list(rows))


@router.get("/desktop/objects/{object_key}/healing-suggestions", response_model=list[DesktopObjectHealingSuggestionResponse])
async def list_desktop_object_healing_suggestions(
    object_key: str,
    status_filter: Optional[str] = None,
    limit: int = 25,
    db: AsyncSession = Depends(get_db),
):
    ref = await _load_desktop_object_ref(object_key, db)
    element_id = ref[1].id if ref else ""
    needle = str(object_key or "").strip()
    query = select(DesktopObjectHealingSuggestionModel)
    if element_id:
        query = query.where(
            or_(
                DesktopObjectHealingSuggestionModel.object_key == needle,
                DesktopObjectHealingSuggestionModel.element_id == element_id,
            )
        )
    else:
        query = query.where(DesktopObjectHealingSuggestionModel.object_key == needle)
    if status_filter:
        query = query.where(DesktopObjectHealingSuggestionModel.status == status_filter)
    query = query.order_by(DesktopObjectHealingSuggestionModel.created_at.desc()).limit(max(1, min(int(limit or 25), 100)))
    rows = (await db.execute(query)).scalars().all()
    return [_healing_suggestion_response(row) for row in rows]


@router.post(
    "/desktop/objects/{object_key}/healing-suggestions",
    response_model=DesktopObjectHealingSuggestionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_desktop_object_healing_suggestion(
    object_key: str,
    body: DesktopObjectHealingSuggestionCreateSchema,
    db: AsyncSession = Depends(get_db),
):
    ref = await _load_desktop_object_ref(object_key, db)
    if ref is None:
        raise HTTPException(status_code=404, detail="Desktop object not found")
    page, element = ref
    attempts = body.locator_attempts or body.attempts or []
    preview = _desktop_healing_suggestion_preview(
        page,
        element,
        attempts,
        successful_strategy=body.successful_strategy,
        successful_locator=body.successful_locator,
        confidence=body.confidence,
        source=body.source or "smart_identification",
        reason=body.reason,
        min_confidence=body.min_confidence,
    )
    if preview is None:
        raise HTTPException(
            status_code=400,
            detail="No new successful healing locator candidate was found for this object",
        )

    duplicate = (
        await db.execute(
            select(DesktopObjectHealingSuggestionModel)
            .where(DesktopObjectHealingSuggestionModel.object_key == _desktop_object_key(element))
            .where(DesktopObjectHealingSuggestionModel.status == "pending")
            .where(DesktopObjectHealingSuggestionModel.suggested_strategy == preview["suggested_strategy"])
            .where(DesktopObjectHealingSuggestionModel.suggested_locator == preview["suggested_locator"])
            .limit(1)
        )
    ).scalar_one_or_none()
    if duplicate:
        return _healing_suggestion_response(duplicate)

    suggestion = DesktopObjectHealingSuggestionModel(
        page_id=page.id,
        element_id=element.id,
        object_key=_desktop_object_key(element),
        object_name=element.name or "",
        application=str(_element_metadata(element).get("application") or page.name or ""),
        status="pending",
        source=body.source or "smart_identification",
        suggested_strategy=preview["suggested_strategy"],
        suggested_locator=preview["suggested_locator"],
        suggested_field=preview["suggested_field"],
        confidence=preview["confidence"],
        reason=preview["reason"],
        evidence=preview["evidence"],
        preview_update=preview["preview_update"],
    )
    db.add(suggestion)
    await db.commit()
    await db.refresh(suggestion)
    return _healing_suggestion_response(suggestion)


@router.post("/desktop/healing-suggestions/{suggestion_id}/resolve", response_model=DesktopObjectHealingSuggestionResponse)
async def resolve_desktop_object_healing_suggestion(
    suggestion_id: str,
    body: DesktopObjectHealingSuggestionDecisionSchema,
    db: AsyncSession = Depends(get_db),
):
    suggestion = await db.get(DesktopObjectHealingSuggestionModel, suggestion_id)
    if suggestion is None:
        raise HTTPException(status_code=404, detail="Healing suggestion not found")
    if suggestion.status != "pending":
        raise HTTPException(status_code=409, detail="Healing suggestion is already resolved")

    suggestion.resolved_at = datetime.now(UTC).replace(tzinfo=None)
    suggestion.resolved_by = body.actor or ""
    suggestion.resolution_note = body.note or ""

    if not body.approved:
        suggestion.status = "rejected"
        await db.commit()
        await db.refresh(suggestion)
        return _healing_suggestion_response(suggestion)

    ref = await _load_desktop_object_ref(suggestion.object_key, db)
    if ref is None:
        raise HTTPException(status_code=404, detail="Desktop object not found")
    page, element = ref
    before = _desktop_object_snapshot(page, element)
    values = dict(suggestion.preview_update or {})
    if not values:
        raise HTTPException(status_code=400, detail="Healing suggestion has no preview update")

    _apply_desktop_object_values(page, element, values)
    await db.flush()
    synced_steps = await _sync_test_steps_for_element(element, db, previous_name=None)
    after = _desktop_object_snapshot(page, element)
    _record_desktop_object_history(
        db,
        page,
        element,
        action="updated",
        source="healing_suggestion",
        actor=body.actor or "",
        before=before,
        after=after,
        impact_summary={
            "suggestion_id": suggestion.id,
            "suggested_strategy": suggestion.suggested_strategy,
            "suggested_field": suggestion.suggested_field,
            "synced_test_steps": synced_steps,
        },
    )
    suggestion.status = "approved"
    await db.commit()
    await db.refresh(suggestion)
    return _healing_suggestion_response(suggestion)


@router.put("/desktop/objects/{object_key}", response_model=DesktopObjectResponse)
async def update_desktop_object(
    object_key: str,
    body: DesktopObjectUpdateSchema,
    db: AsyncSession = Depends(get_db),
):
    ref = await _load_desktop_object_ref(object_key, db)
    if ref is None:
        raise HTTPException(status_code=404, detail="Desktop object not found")
    page, element = ref
    before = _desktop_object_snapshot(page, element)
    values = body.model_dump(exclude_unset=True)
    _apply_desktop_object_values(page, element, values)
    await db.flush()
    synced_steps = await _sync_test_steps_for_element(element, db, previous_name=None)
    after = _desktop_object_snapshot(page, element)
    _record_desktop_object_history(
        db,
        page,
        element,
        action="updated",
        source="desktop_repository_api",
        before=before,
        after=after,
        impact_summary={"synced_test_steps": synced_steps},
    )
    await db.commit()
    await db.refresh(page)
    await db.refresh(element)
    return _desktop_object_response(page, element)


@router.delete("/desktop/objects/{object_key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_desktop_object(object_key: str, db: AsyncSession = Depends(get_db)):
    ref = await _load_desktop_object_ref(object_key, db)
    if ref is None:
        raise HTTPException(status_code=404, detail="Desktop object not found")
    _page, element = ref
    await db.execute(
        update(DesktopObjectHistoryModel)
        .where(DesktopObjectHistoryModel.element_id == element.id)
        .values(element_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(DesktopObjectHealingSuggestionModel)
        .where(DesktopObjectHealingSuggestionModel.element_id == element.id)
        .values(element_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(TestStepModel)
        .where(TestStepModel.page_element_id == element.id)
        .values(page_element_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(DesktopRepositoryStepModel)
        .where(DesktopRepositoryStepModel.page_element_id == element.id)
        .values(page_element_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        delete(PageElementModel)
        .where(PageElementModel.id == element.id)
        .execution_options(synchronize_session=False)
    )
    await db.commit()


@router.get("/all", response_model=list[PageDetailResponse])
async def get_all(db: AsyncSession = Depends(get_db)):
    """Returns all pages with their elements — used for test-step autocomplete."""
    result = await db.execute(
        select(PageRepositoryModel)
        .options(selectinload(PageRepositoryModel.elements))
        .order_by(PageRepositoryModel.name)
    )
    return [_page_detail(p) for p in result.scalars().all()]


# ── Element Discovery Agent ──────────────────────────────────────────────────

@router.post("/discover", response_model=DiscoveryResponse)
async def discover_page_elements(
    body: DiscoveryRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Launch Playwright headless, inspect the page, discover UI elements,
    generate and score locator candidates, then auto-save into the repository.

    Idempotent: re-running on the same URL updates rather than duplicates.
    """
    # 1. Run the Playwright-backed discovery
    result = await discover_elements(body)
    if result.summary.has_error:
        return result

    # 2. Save results to the repository if save_mode == "auto"
    if body.save_mode == "auto" and result.elements:
        # Find or create the page
        existing_page = None
        if body.page_id:
            existing_page = await _load(body.page_id, db)
        if existing_page is None:
            page_query = (
                select(PageRepositoryModel)
                .where(PageRepositoryModel.name == body.page_name)
                .where(PageRepositoryModel.platform == body.platform)
                .options(selectinload(PageRepositoryModel.elements))
                .limit(1)
            )
            existing_page = (await db.execute(page_query)).scalars().first()
        if existing_page is None:
            page_query = (
                select(PageRepositoryModel)
                .where(PageRepositoryModel.url_pattern == body.url)
                .where(PageRepositoryModel.platform == body.platform)
                .options(selectinload(PageRepositoryModel.elements))
                .limit(1)
            )
            existing_page = (await db.execute(page_query)).scalars().first()

        if existing_page:
            page = existing_page
            # Update URL pattern if empty
            if not page.url_pattern:
                page.url_pattern = body.url
            page.updated_at = datetime.utcnow()
        else:
            page = PageRepositoryModel(
                name=body.page_name,
                url_pattern=body.url,
                description=f"Auto-discovered from {body.url}",
                platform=body.platform,
                tags=["auto-discovered"],
            )
            db.add(page)
            await db.flush()

        # Build lookups so rescans update elements instead of duplicating them.
        existing_by_locator: dict[str, PageElementModel] = {}
        existing_by_name: dict[str, PageElementModel] = {}
        for el in (page.elements or []):
            for locator in (el.css_selector, el.xpath, el.id_attr, el.name_attr):
                if locator:
                    existing_by_locator[locator.strip()] = el
            existing_by_name[el.name.strip().lower()] = el

        now = datetime.utcnow()
        saved_count = 0
        changed_elements: list[PageElementModel] = []

        for disc_el in result.elements:
            is_low_conf = disc_el.confidence_score < body.min_confidence

            candidate_key = (disc_el.best_locator or disc_el.css_selector or disc_el.xpath or "").strip()
            existing = existing_by_locator.get(candidate_key) if candidate_key else None
            if existing is None:
                existing = existing_by_name.get(disc_el.name.strip().lower())

            if existing:
                # Update changed locators but preserve manual edits for low confidence
                if is_low_conf:
                    continue  # Keep existing manual elements for low confidence
                existing.xpath = disc_el.xpath or existing.xpath
                existing.css_selector = disc_el.css_selector or existing.css_selector
                existing.id_attr = disc_el.id_attr or existing.id_attr
                existing.name_attr = disc_el.name_attr or existing.name_attr
                existing.locator_strategy = disc_el.locator_strategy or existing.locator_strategy
                existing.confidence_score = disc_el.confidence_score
                existing.alternative_locators = [
                    {
                        "strategy": a.strategy,
                        "locator": a.locator,
                        "verified": a.verified,
                        "element_count": a.element_count,
                        "score": a.score,
                        "reason": a.reason,
                    }
                    for a in disc_el.alternative_locators
                ]
                existing.source_url = body.url
                existing.last_verified_at = now
                existing.tags = sorted(set((existing.tags or []) + disc_el.tags))
                existing.updated_at = now
                changed_elements.append(existing)
                saved_count += 1
            else:
                # Create new element
                alt_locators = [
                    {
                        "strategy": a.strategy,
                        "locator": a.locator,
                        "verified": a.verified,
                        "element_count": a.element_count,
                        "score": a.score,
                        "reason": a.reason,
                    }
                    for a in disc_el.alternative_locators
                ]
                elem = PageElementModel(
                    page_id=page.id,
                    name=disc_el.name,
                    element_type=disc_el.element_type,
                    description=disc_el.description,
                    xpath=disc_el.xpath,
                    css_selector=disc_el.css_selector,
                    id_attr=disc_el.id_attr,
                    name_attr=disc_el.name_attr,
                    locator_strategy=disc_el.locator_strategy,
                    tags=disc_el.tags,
                    confidence_score=disc_el.confidence_score,
                    alternative_locators=alt_locators,
                    source_url=body.url,
                    last_verified_at=now,
                    discovery_metadata={"url": body.url, "mode": body.save_mode},
                )
                db.add(elem)
                saved_count += 1

        if changed_elements:
            await db.flush()
            seen_element_ids: set[str] = set()
            for element in changed_elements:
                if element.id in seen_element_ids:
                    continue
                seen_element_ids.add(element.id)
                await _sync_test_steps_for_element(element, db)

        await db.commit()

        # Update summary with actual saved count
        result.summary.elements_saved = saved_count
        result.summary.low_confidence = sum(
            1 for e in result.elements if e.confidence_score < body.min_confidence
        )

        # Update page info in response
        result.page = {
            "id": page.id,
            "name": page.name,
            "url_pattern": page.url_pattern,
            "platform": page.platform,
        }

    return result
