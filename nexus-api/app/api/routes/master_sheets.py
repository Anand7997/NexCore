"""Master Sheet ingestion, preview, and validation APIs."""
from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database.models import (
    DesktopMasterSheetApprovalModel,
    PageElementModel,
    PageRepositoryModel,
)
from app.database.session import get_db
from app.execution.master_sheet import (
    MASTER_SHEET_TEMPLATE,
    DesktopMasterSheet,
    MasterSheetError,
    load_master_sheet,
    load_master_sheet_sql,
    load_master_sheet_url,
    master_sheet_summary,
    normalise_master_sheet,
    validate_master_sheet,
)
from app.api.routes.page_repository import (
    _apply_desktop_object_values,
    _desktop_object_key,
    _desktop_object_metadata,
    _desktop_object_response,
    _desktop_object_snapshot,
    _element_metadata,
    _record_desktop_object_history,
    _sync_test_steps_for_element,
    DesktopObjectResponse,
)

router = APIRouter(prefix="/master-sheets", tags=["master-sheets"])

SUPPORTED_EXTENSIONS = {".json", ".csv", ".xlsx", ".xlsm", ".yaml", ".yml"}


class MasterSheetPreviewRequest(BaseModel):
    master_sheet: Optional[dict[str, Any]] = None
    master_sheet_path: str = ""
    master_sheet_url: str = ""
    master_sheet_headers: dict[str, str] = {}
    db_connection_string: str = ""
    db_query: str = ""
    repository_source: bool = False


class MasterSheetIssue(BaseModel):
    severity: str
    section: str
    key: str
    field: str = ""
    message: str


class MasterSheetPreviewResponse(BaseModel):
    source: str
    saved_path: str = ""
    filename: str = ""
    summary: dict[str, int]
    issues: list[MasterSheetIssue]
    normalized: dict[str, Any]
    valid: bool


class MasterSheetTemplateResponse(BaseModel):
    supported_extensions: list[str]
    required_sections: list[str]
    template: dict[str, Any]


class MasterSheetRepositorySyncRequest(MasterSheetPreviewRequest):
    application_key: str = ""
    repository_scope: str = "shared"
    update_existing: bool = True
    skip_invalid: bool = True


class MasterSheetRepositorySyncItem(BaseModel):
    object_key: str
    name: str
    application: str
    action: str
    reason: str = ""
    object: Optional[DesktopObjectResponse] = None


class MasterSheetRepositorySyncResponse(BaseModel):
    source: str
    created: int
    updated: int
    skipped: int
    pages_created: int
    issues: list[MasterSheetIssue]
    objects: list[MasterSheetRepositorySyncItem]


def _safe_filename(name: str) -> str:
    base = Path(name or "master_sheet").name
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", Path(base).stem).strip("._") or "master_sheet"
    suffix = Path(base).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        suffix = ".json"
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"{stem}_{timestamp}{suffix}"


def _storage_dir() -> Path:
    path = Path(settings.artifact_dir).expanduser() / "master_sheets"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _preview(data: dict[str, Any], *, source: str, filename: str = "", saved_path: str = "") -> MasterSheetPreviewResponse:
    issues = [MasterSheetIssue(**item) for item in validate_master_sheet(data)]
    return MasterSheetPreviewResponse(
        source=source,
        saved_path=saved_path,
        filename=filename,
        summary=master_sheet_summary(data),
        issues=issues,
        normalized=normalise_master_sheet(data),
        valid=not any(issue.severity == "error" for issue in issues),
    )


def _first(*values: Any) -> str:
    for value in values:
        if value not in (None, ""):
            return str(value)
    return ""


def _as_tags(value: Any, *extra: str) -> list[str]:
    tags: list[str] = []
    if isinstance(value, str):
        tags.extend(part.strip() for part in re.split(r"[,|]", value) if part.strip())
    elif isinstance(value, list):
        tags.extend(str(part).strip() for part in value if str(part).strip())
    tags.extend(tag for tag in extra if tag)
    return sorted(set(tags))


def _locator_value(element: dict[str, Any], sheet: DesktopMasterSheet) -> str:
    return _first(
        element.get("primary_locator_value"),
        element.get("primary_locator"),
        element.get("locator"),
        element.get("selector"),
        element.get("automation_id"),
        element.get("auto_id"),
        element.get("uia_path"),
        element.get("xpath"),
        element.get("name_text"),
        element.get("text"),
        element.get("name"),
        element.get("class_name"),
        element.get("class"),
        *(locator.get("locator") for locator in sheet.locators_for(element)),
    )


def _master_element_to_desktop_values(
    object_key: str,
    element: dict[str, Any],
    sheet: DesktopMasterSheet,
    *,
    repository_scope: str,
) -> dict[str, Any]:
    app_key = _first(element.get("application_key"), element.get("app_key"))
    app = sheet.application(app_key) if app_key else None
    window_key = _first(element.get("window_key"))
    window = sheet.section("windows").get(window_key) if window_key else None
    window = window if isinstance(window, dict) else {}
    application = _first(
        element.get("application"),
        app.get("name") if app else "",
        app.get("application") if app else "",
        app_key,
        "Desktop Application",
    )
    application_path = _first(
        element.get("application_path"),
        sheet.application_path(app_key),
        app.get("path") if app else "",
        app.get("executable_path") if app else "",
    )
    automation_id = _first(element.get("automation_id"), element.get("auto_id"))
    uia_path = _first(element.get("uia_path"), element.get("xpath"))
    name_text = _first(element.get("name_text"), element.get("text"), element.get("name"))
    class_name = _first(element.get("class_name"), element.get("class"))
    control_type = _first(element.get("control_type"), element.get("element_type"), "element")
    primary_locator = _locator_value(element, sheet)
    locator_strategy = _first(
        element.get("primary_locator_strategy"),
        element.get("locator_strategy"),
        "accessibility id" if automation_id else "xpath" if uia_path else "name" if name_text else "class name" if class_name else "",
    )
    metadata = {
        "source": "master_sheet_sync",
        "master_sheet_source": sheet.source,
        "app_key": app_key,
        "window_key": window_key,
        "active": element.get("active", True),
        "owner": element.get("owner") or element.get("team") or "",
    }
    return {
        "object_key": object_key,
        "name": _first(element.get("friendly_name"), element.get("name"), element.get("text"), object_key),
        "application": application,
        "application_path": application_path,
        "repository_scope": repository_scope,
        "control_type": control_type,
        "automation_id": automation_id,
        "name_text": name_text,
        "class_name": class_name,
        "uia_path": uia_path,
        "locator_strategy": locator_strategy or "accessibility id",
        "primary_locator": primary_locator,
        "alternative_locators": sheet.locators_for(element),
        "window": _first(element.get("window"), window.get("title"), window.get("name"), window_key),
        "screen": _first(element.get("screen"), element.get("window"), window.get("title"), window_key),
        "ui_framework": _first(element.get("ui_framework"), element.get("framework")),
        "process_name": _first(element.get("process_name"), app.get("process_name") if app else ""),
        "hierarchy_path": _first(element.get("hierarchy_path"), uia_path),
        "bounding_box": element.get("bounding_box") if isinstance(element.get("bounding_box"), dict) else None,
        "screenshot_url": _first(element.get("screenshot_url"), element.get("screenshot_reference")),
        "ocr_text": _first(element.get("ocr_text")),
        "ai_label": _first(element.get("ai_label"), element.get("semantic_label")),
        "confidence_score": element.get("confidence_score") if element.get("confidence_score") not in ("", None) else None,
        "tags": _as_tags(element.get("tags"), "desktop-object", "master-sheet"),
        "metadata": metadata,
    }


async def _repository_master_sheet(db: AsyncSession) -> dict[str, Any]:
    result = await db.execute(
        select(PageRepositoryModel)
        .where(PageRepositoryModel.platform.in_(["desktop", "windows"]))
        .options(selectinload(PageRepositoryModel.elements))
    )
    data: dict[str, Any] = {"applications": {}, "elements": {}, "paths": {}, "test_data": {}}
    for page in result.scalars().all():
        app_key = re.sub(r"[^a-z0-9]+", "_", str(page.name or page.id).lower()).strip("_") or page.id
        data["applications"][app_key] = {
            "key": app_key,
            "name": page.name,
            "application_path": page.url_pattern or "",
            "repository_page_id": page.id,
        }
        for element in page.elements or []:
            metadata = _element_metadata(element)
            object_key = _desktop_object_key(element) or element.name or element.id
            data["elements"][object_key] = {
                "key": object_key,
                "name": element.name,
                "application_key": app_key,
                "control_type": element.element_type or "element",
                "automation_id": element.id_attr or "",
                "name_text": element.name_attr or "",
                "class_name": element.css_selector or "",
                "uia_path": element.xpath or "",
                "locator_strategy": element.locator_strategy or "accessibility id",
                "primary_locator_value": metadata.get("primary_locator") or element.id_attr or element.name_attr or element.xpath or element.css_selector or "",
                "alternative_locators": element.alternative_locators or [],
                "window": metadata.get("window") or "",
                "screen": metadata.get("screen") or "",
                "active": metadata.get("active", True),
            }
    return data


async def _load_sheet_from_request(body: MasterSheetPreviewRequest, db: AsyncSession | None = None) -> tuple[dict[str, Any], str]:
    if body.master_sheet_path:
        try:
            return load_master_sheet(body.master_sheet_path), body.master_sheet_path
        except MasterSheetError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if body.master_sheet_url:
        try:
            return load_master_sheet_url(body.master_sheet_url, headers=body.master_sheet_headers), body.master_sheet_url
        except MasterSheetError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if body.db_connection_string and body.db_query:
        try:
            return load_master_sheet_sql(body.db_connection_string, body.db_query), "database"
        except MasterSheetError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if body.repository_source:
        if db is None:
            raise HTTPException(status_code=400, detail="repository_source requires a database session")
        return await _repository_master_sheet(db), "nexcore_repository"
    if body.master_sheet is not None:
        return body.master_sheet, "inline"
    raise HTTPException(status_code=400, detail="Provide master_sheet, master_sheet_path, master_sheet_url, db query, or repository_source")


async def _desktop_page_for_sync(
    db: AsyncSession,
    *,
    application: str,
    application_path: str,
    tags: list[str],
) -> tuple[PageRepositoryModel, bool]:
    result = await db.execute(
        select(PageRepositoryModel)
        .where(PageRepositoryModel.platform == "desktop")
        .where(PageRepositoryModel.name == application)
        .options(selectinload(PageRepositoryModel.elements))
        .limit(1)
    )
    page = result.scalar_one_or_none()
    if page:
        if application_path and not page.url_pattern:
            page.url_pattern = application_path
        page.tags = sorted(set([*(page.tags or []), *tags]))
        return page, False

    page = PageRepositoryModel(
        name=application,
        url_pattern=application_path,
        description=f"Desktop object repository for {application}",
        platform="desktop",
        tags=sorted(set(["desktop", "object-repository", "master-sheet", *tags])),
    )
    db.add(page)
    await db.flush()
    await db.refresh(page, ["elements"])
    return page, True


def _find_desktop_element(page: PageRepositoryModel, object_key: str) -> PageElementModel | None:
    needle = str(object_key or "").strip().lower()
    for element in page.elements or []:
        keys = {
            str(element.id or "").strip().lower(),
            str(element.name or "").strip().lower(),
            _desktop_object_key(element).strip().lower(),
        }
        metadata = _element_metadata(element)
        keys.add(str(metadata.get("object_key") or "").strip().lower())
        if needle in keys:
            return element
    return None


@router.get("/template", response_model=MasterSheetTemplateResponse)
async def get_master_sheet_template():
    return MasterSheetTemplateResponse(
        supported_extensions=sorted(SUPPORTED_EXTENSIONS),
        required_sections=["applications", "elements", "paths", "test_data"],
        template=MASTER_SHEET_TEMPLATE,
    )


@router.post("/preview", response_model=MasterSheetPreviewResponse)
async def preview_master_sheet(body: MasterSheetPreviewRequest, db: AsyncSession = Depends(get_db)):
    data, source = await _load_sheet_from_request(body, db)
    return _preview(data, source=source, saved_path=body.master_sheet_path)


@router.post("/upload", response_model=MasterSheetPreviewResponse, status_code=status.HTTP_201_CREATED)
async def upload_master_sheet(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported master sheet format: {suffix or file.filename}")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded master sheet is empty")
    saved = _storage_dir() / _safe_filename(file.filename or f"master_sheet{suffix}")
    saved.write_bytes(content)
    try:
        data = load_master_sheet(str(saved))
    except MasterSheetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _preview(data, source=str(saved), filename=file.filename or saved.name, saved_path=str(saved))


@router.post("/sync-desktop-repository", response_model=MasterSheetRepositorySyncResponse)
async def sync_master_sheet_desktop_repository(
    body: MasterSheetRepositorySyncRequest,
    db: AsyncSession = Depends(get_db),
):
    data, source = await _load_sheet_from_request(body, db)
    normalized = normalise_master_sheet(data)
    issues = [MasterSheetIssue(**item) for item in validate_master_sheet(normalized)]
    sheet = DesktopMasterSheet(normalized, source=source)
    results: list[MasterSheetRepositorySyncItem] = []
    created = updated = skipped = pages_created = 0

    for object_key, element in sheet.section("elements").items():
        if not isinstance(element, dict):
            skipped += 1
            results.append(MasterSheetRepositorySyncItem(
                object_key=object_key,
                name=object_key,
                application="",
                action="skipped",
                reason="Element row is not an object",
            ))
            continue
        if body.application_key:
            row_app_key = _first(element.get("application_key"), element.get("app_key"))
            if row_app_key and row_app_key != body.application_key:
                skipped += 1
                results.append(MasterSheetRepositorySyncItem(
                    object_key=object_key,
                    name=_first(element.get("name"), object_key),
                    application=row_app_key,
                    action="skipped",
                    reason="Filtered by application_key",
                ))
                continue
            element = {**element, "application_key": body.application_key}

        values = _master_element_to_desktop_values(
            object_key,
            element,
            sheet,
            repository_scope=body.repository_scope,
        )
        if not values.get("primary_locator") and body.skip_invalid:
            skipped += 1
            results.append(MasterSheetRepositorySyncItem(
                object_key=object_key,
                name=values["name"],
                application=values["application"],
                action="skipped",
                reason="No usable locator",
            ))
            continue

        page, did_create_page = await _desktop_page_for_sync(
            db,
            application=values["application"],
            application_path=values["application_path"],
            tags=values["tags"],
        )
        pages_created += 1 if did_create_page else 0
        element_model = _find_desktop_element(page, object_key)

        if element_model is None:
            metadata = _desktop_object_metadata(page, values)
            element_model = PageElementModel(
                page_id=page.id,
                name=values["name"],
                element_type=values["control_type"] or "element",
                description=str(values.get("metadata", {}).get("description") or ""),
                xpath=values["uia_path"],
                css_selector=values["class_name"],
                id_attr=values["automation_id"],
                name_attr=values["name_text"],
                locator_strategy=values["locator_strategy"] or "accessibility id",
                tags=values["tags"],
                confidence_score=values["confidence_score"],
                alternative_locators=values["alternative_locators"],
                source_url=values["screenshot_url"],
                discovery_metadata=metadata,
            )
            db.add(element_model)
            await db.flush()
            _record_desktop_object_history(
                db,
                page,
                element_model,
                action="created",
                source="master_sheet_sync",
                before=None,
                after=_desktop_object_snapshot(page, element_model),
                impact_summary={"master_sheet_source": source},
            )
            created += 1
            action = "created"
            reason = ""
        elif body.update_existing:
            before = _desktop_object_snapshot(page, element_model)
            _apply_desktop_object_values(page, element_model, values)
            await db.flush()
            synced_steps = await _sync_test_steps_for_element(element_model, db, previous_name=None)
            after = _desktop_object_snapshot(page, element_model)
            _record_desktop_object_history(
                db,
                page,
                element_model,
                action="updated",
                source="master_sheet_sync",
                before=before,
                after=after,
                impact_summary={"synced_test_steps": synced_steps, "master_sheet_source": source},
            )
            updated += 1
            action = "updated"
            reason = ""
        else:
            skipped += 1
            action = "skipped"
            reason = "Object already exists"

        results.append(MasterSheetRepositorySyncItem(
            object_key=object_key,
            name=values["name"],
            application=values["application"],
            action=action,
            reason=reason,
            object=_desktop_object_response(page, element_model) if action != "skipped" else None,
        ))

    await db.commit()
    return MasterSheetRepositorySyncResponse(
        source=source,
        created=created,
        updated=updated,
        skipped=skipped,
        pages_created=pages_created,
        issues=issues,
        objects=results,
    )


# ── Approval Workflow ─────────────────────────────────────────────────────────

class SyncWithApprovalRequest(MasterSheetRepositorySyncRequest):
    requester: str = ""


class ApprovalResponse(BaseModel):
    id: str
    object_key: str
    application_key: str
    status: str
    change_type: str
    before_snapshot: dict[str, Any] | None
    proposed_snapshot: dict[str, Any]
    source: str
    requester: str
    reviewer: str
    review_note: str
    created_at: datetime
    reviewed_at: datetime | None

    model_config = {"from_attributes": True}


class ApprovalReviewBody(BaseModel):
    reviewer: str = ""
    review_note: str = ""


def _approval_response(row: DesktopMasterSheetApprovalModel) -> ApprovalResponse:
    return ApprovalResponse(
        id=row.id,
        object_key=row.object_key or "",
        application_key=row.application_key or "",
        status=row.status or "pending",
        change_type=row.change_type or "create",
        before_snapshot=row.before_snapshot,
        proposed_snapshot=row.proposed_snapshot or {},
        source=row.source or "",
        requester=row.requester or "",
        reviewer=row.reviewer or "",
        review_note=row.review_note or "",
        created_at=row.created_at,
        reviewed_at=row.reviewed_at,
    )


@router.post("/sync-with-approval", status_code=status.HTTP_202_ACCEPTED)
async def sync_master_sheet_with_approval(
    body: SyncWithApprovalRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Stage master sheet changes as pending approvals instead of applying them immediately."""
    data, source = await _load_sheet_from_request(body, db)
    normalized = normalise_master_sheet(data)
    issues = [MasterSheetIssue(**item) for item in validate_master_sheet(normalized)]
    sheet = DesktopMasterSheet(normalized, source=source)

    staged = 0
    for object_key, element in sheet.section("elements").items():
        if not isinstance(element, dict):
            continue
        if body.application_key:
            row_app_key = _first(element.get("application_key"), element.get("app_key"))
            if row_app_key and row_app_key != body.application_key:
                continue
            element = {**element, "application_key": body.application_key}

        values = _master_element_to_desktop_values(
            object_key, element, sheet, repository_scope=body.repository_scope
        )
        # Find existing page/element for before snapshot
        page_result = await db.execute(
            select(PageRepositoryModel)
            .where(PageRepositoryModel.platform == "desktop")
            .where(PageRepositoryModel.name == values["application"])
            .options(selectinload(PageRepositoryModel.elements))
            .limit(1)
        )
        page = page_result.scalar_one_or_none()
        existing = _find_desktop_element(page, object_key) if page else None
        change_type = "update" if existing else "create"
        before = _desktop_object_snapshot(page, existing) if existing else None

        approval = DesktopMasterSheetApprovalModel(
            object_key=object_key,
            application_key=body.application_key or values["application"],
            status="pending",
            change_type=change_type,
            before_snapshot=before,
            proposed_snapshot=values,
            source=source,
            requester=body.requester,
        )
        db.add(approval)
        staged += 1

    await db.commit()
    return {
        "staged": staged,
        "issues": [i.model_dump() for i in issues],
        "source": source,
        "message": f"Staged {staged} changes pending approval.",
    }


@router.get("/approvals", response_model=list[ApprovalResponse])
async def list_approvals(
    status_filter: str = "pending",
    application_key: str = "",
    db: AsyncSession = Depends(get_db),
) -> list[ApprovalResponse]:
    stmt = select(DesktopMasterSheetApprovalModel)
    if status_filter:
        stmt = stmt.where(DesktopMasterSheetApprovalModel.status == status_filter)
    if application_key:
        stmt = stmt.where(DesktopMasterSheetApprovalModel.application_key == application_key)
    stmt = stmt.order_by(DesktopMasterSheetApprovalModel.created_at.desc())
    result = await db.execute(stmt)
    return [_approval_response(r) for r in result.scalars().all()]


@router.post("/approvals/{approval_id}/approve", response_model=ApprovalResponse)
async def approve_master_sheet_change(
    approval_id: str,
    body: ApprovalReviewBody,
    db: AsyncSession = Depends(get_db),
) -> ApprovalResponse:
    """Apply the proposed change from a staged approval to the repository."""
    result = await db.execute(
        select(DesktopMasterSheetApprovalModel).where(DesktopMasterSheetApprovalModel.id == approval_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Approval not found")
    if row.status != "pending":
        raise HTTPException(status_code=400, detail=f"Approval is already {row.status}")

    values = dict(row.proposed_snapshot or {})
    page, _ = await _desktop_page_for_sync(
        db,
        application=values.get("application", ""),
        application_path=values.get("application_path", ""),
        tags=values.get("tags", []),
    )
    page_result_loaded = await db.execute(
        select(PageRepositoryModel)
        .where(PageRepositoryModel.id == page.id)
        .options(selectinload(PageRepositoryModel.elements))
    )
    page = page_result_loaded.scalar_one()
    existing = _find_desktop_element(page, row.object_key)

    if existing is None:
        metadata = _desktop_object_metadata(page, values)
        elem = PageElementModel(
            page_id=page.id,
            name=values.get("name", row.object_key),
            element_type=values.get("control_type", "element"),
            xpath=values.get("uia_path", ""),
            css_selector=values.get("class_name", ""),
            id_attr=values.get("automation_id", ""),
            name_attr=values.get("name_text", ""),
            locator_strategy=values.get("locator_strategy", "accessibility id"),
            tags=values.get("tags", []),
            alternative_locators=values.get("alternative_locators", []),
            discovery_metadata=metadata,
        )
        db.add(elem)
        await db.flush()
        _record_desktop_object_history(
            db, page, elem, action="created", source="master_sheet_approval",
            before=None, after=_desktop_object_snapshot(page, elem),
            impact_summary={"approval_id": approval_id},
        )
    else:
        _apply_desktop_object_values(page, existing, values)
        await db.flush()
        await _sync_test_steps_for_element(existing, db, previous_name=None)
        _record_desktop_object_history(
            db, page, existing, action="updated", source="master_sheet_approval",
            before=row.before_snapshot, after=_desktop_object_snapshot(page, existing),
            impact_summary={"approval_id": approval_id},
        )

    row.status = "approved"
    row.reviewer = body.reviewer
    row.review_note = body.review_note
    row.reviewed_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
    await db.refresh(row)
    return _approval_response(row)


@router.post("/approvals/{approval_id}/reject", response_model=ApprovalResponse)
async def reject_master_sheet_change(
    approval_id: str,
    body: ApprovalReviewBody,
    db: AsyncSession = Depends(get_db),
) -> ApprovalResponse:
    result = await db.execute(
        select(DesktopMasterSheetApprovalModel).where(DesktopMasterSheetApprovalModel.id == approval_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Approval not found")
    if row.status != "pending":
        raise HTTPException(status_code=400, detail=f"Approval is already {row.status}")
    row.status = "rejected"
    row.reviewer = body.reviewer
    row.review_note = body.review_note
    row.reviewed_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
    await db.refresh(row)
    return _approval_response(row)


# ── Enhanced Validation with Gap Checks ──────────────────────────────────────

@router.post("/validate", response_model=MasterSheetPreviewResponse)
async def validate_master_sheet_deep(
    body: MasterSheetPreviewRequest,
    db: AsyncSession = Depends(get_db),
) -> MasterSheetPreviewResponse:
    """Deep validation including inactive-object usage, broken refs, env placeholders, and data gaps."""
    data, source = await _load_sheet_from_request(body, db)
    normalized = normalise_master_sheet(data)
    basic_issues = validate_master_sheet(normalized)
    extra_issues: list[dict[str, Any]] = []

    sheet = DesktopMasterSheet(normalized, source=source)
    elements = sheet.section("elements")
    test_data = sheet.section("test_data")
    paths = sheet.section("paths")

    # Gap: inactive objects
    for key, elem in elements.items():
        if isinstance(elem, dict) and elem.get("active") is False:
            extra_issues.append({
                "severity": "warning",
                "section": "elements",
                "key": key,
                "field": "active",
                "message": f"Object '{key}' is marked inactive and may be used by workflows.",
            })

    # Gap: missing env-specific values ({{env.*}} placeholders with no substitution hint)
    import re as _re
    for key, elem in elements.items():
        if isinstance(elem, dict):
            for field_name, val in elem.items():
                if isinstance(val, str) and _re.search(r"\{\{env\.", val):
                    extra_issues.append({
                        "severity": "warning",
                        "section": "elements",
                        "key": key,
                        "field": field_name,
                        "message": f"Object '{key}'.{field_name} contains env placeholder '{val}' — ensure it resolves in all environments.",
                    })

    # Gap: broken screenshot references
    for key, elem in elements.items():
        if isinstance(elem, dict):
            ref = _first(elem.get("screenshot_url"), elem.get("screenshot_reference"))
            if ref and ref.startswith("/") and not Path(ref).exists():
                extra_issues.append({
                    "severity": "warning",
                    "section": "elements",
                    "key": key,
                    "field": "screenshot_url",
                    "message": f"Screenshot reference '{ref}' for object '{key}' was not found on disk.",
                })

    # Gap: required test data missing
    for key, td in test_data.items():
        if isinstance(td, dict) and td.get("required") and not td.get("value") and not td.get("default"):
            extra_issues.append({
                "severity": "error",
                "section": "test_data",
                "key": key,
                "field": "value",
                "message": f"Required test data '{key}' has no value or default set.",
            })

    all_issues = [MasterSheetIssue(**i) for i in [*basic_issues, *extra_issues]]
    return MasterSheetPreviewResponse(
        source=source,
        saved_path=body.master_sheet_path,
        filename="",
        summary=master_sheet_summary(normalized),
        issues=all_issues,
        normalized=normalized,
        valid=not any(i.severity == "error" for i in all_issues),
    )
