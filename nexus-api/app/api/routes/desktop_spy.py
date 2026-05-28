"""Desktop Object Spy API."""
from __future__ import annotations

import base64
import shlex
from datetime import UTC, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.models import PageElementModel, PageRepositoryModel
from app.database.session import get_db
from app.execution.plugins.desktop.drivers import get_driver
from app.execution.plugins.desktop.spy import parse_desktop_ui_tree

router = APIRouter(prefix="/desktop-spy", tags=["desktop-spy"])


class DesktopSpyRequest(BaseModel):
    driver_type: str = "uia3"
    server_url: str = settings.winappdriver_url
    app: str = ""
    args: list[str] | str | None = None
    window_title: str = ""
    process_name: str = ""
    timeout_ms: int = 30000
    close_after: bool = True
    include_screenshot: bool = False
    max_objects: int = 250


class DesktopSpyCandidate(BaseModel):
    object_key: str
    name: str
    control_type: str
    automation_id: str = ""
    name_text: str = ""
    class_name: str = ""
    uia_path: str = ""
    locator_strategy: str
    primary_locator: str
    alternative_locators: list[dict[str, Any]]
    bounding_box: Optional[dict[str, Any]] = None
    ocr_text: str = ""
    confidence_score: float
    strength: str = "medium"
    risk_flags: list[str] = []
    explanation: str = ""
    metadata: dict[str, Any]


class DesktopSpySnapshot(BaseModel):
    driver: str
    attached: bool = False
    launched: bool = False
    window_title: str = ""
    process_name: str = ""
    screenshot_base64: str = ""
    screenshot_size_bytes: int = 0
    ui_tree: str = ""
    candidates: list[DesktopSpyCandidate]
    capabilities: dict[str, Any] = {}


def _coerce_args(value: list[str] | str | None) -> list[str] | None:
    if value in (None, ""):
        return None
    if isinstance(value, list):
        return [str(item) for item in value]
    return shlex.split(str(value))


@router.post("/snapshot", response_model=DesktopSpySnapshot, status_code=status.HTTP_200_OK)
async def snapshot_desktop_objects(body: DesktopSpyRequest):
    if not body.app and not body.window_title and not body.process_name:
        raise HTTPException(status_code=400, detail="Provide app, window_title, or process_name for Desktop Object Spy")

    driver = get_driver(
        body.driver_type,
        server_url=body.server_url,
        timeout=max(body.timeout_ms, 1000) / 1000,
    )
    launched = False
    attached = False
    try:
        if body.app:
            launch = await driver.launch(body.app, args=_coerce_args(body.args), capabilities={})
            if not launch.success:
                raise HTTPException(status_code=502, detail=launch.error or "Desktop app launch failed")
            launched = True
        else:
            attach = await driver.attach(
                window_title=body.window_title or None,
                process_name=body.process_name or None,
            )
            if not attach.success:
                raise HTTPException(status_code=502, detail=attach.error or "Desktop attach failed")
            attached = True

        screenshot = await driver.screenshot()
        source = await driver.get_ui_tree()
        caps = await driver.report_capabilities()
        ui_tree = source.ui_tree or ""
        candidates = [
            DesktopSpyCandidate(**candidate.as_dict())
            for candidate in parse_desktop_ui_tree(ui_tree, max_objects=max(1, body.max_objects))
        ]
        screenshot_bytes = screenshot.screenshot_bytes or b""
        screenshot_base64 = base64.b64encode(screenshot_bytes).decode("ascii") if body.include_screenshot and screenshot_bytes else ""
        return DesktopSpySnapshot(
            driver=str(caps.get("driver") or body.driver_type),
            attached=attached,
            launched=launched,
            window_title=body.window_title,
            process_name=body.process_name,
            screenshot_base64=screenshot_base64,
            screenshot_size_bytes=len(screenshot_bytes),
            ui_tree=ui_tree,
            candidates=candidates,
            capabilities=caps,
        )
    finally:
        if body.close_after:
            await driver.close()


# ── Promote captured spy object to the page repository ────────────────────────

class DesktopSpyPromoteRequest(BaseModel):
    page_id: str
    candidate: dict[str, Any]
    update_existing: bool = True
    actor: str = "desktop_spy"


class DesktopSpyPromoteResponse(BaseModel):
    element_id: str
    object_key: str
    page_id: str
    action: str  # "created" | "updated"
    message: str


@router.post("/promote", response_model=DesktopSpyPromoteResponse, status_code=status.HTTP_200_OK)
async def promote_spy_candidate(
    body: DesktopSpyPromoteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Promote a Desktop Object Spy candidate into the shared Page Repository.

    If an element with the same ``object_key`` already exists on the page and
    ``update_existing`` is True, the element is updated in place with a history
    record.  Otherwise a new element is created.
    """
    from app.api.routes.page_repository import (
        _apply_desktop_object_values,
        _desktop_object_key,
        _desktop_object_metadata,
        _desktop_object_snapshot,
        _record_desktop_object_history,
        _sync_test_steps_for_element,
    )

    page = await db.get(PageRepositoryModel, body.page_id)
    if not page:
        raise HTTPException(status_code=404, detail=f"Page repository not found: {body.page_id}")

    cand = body.candidate
    object_key = str(cand.get("object_key") or _desktop_object_key(cand))
    if not object_key:
        raise HTTPException(status_code=422, detail="candidate must have a non-empty object_key")

    # Try to find an existing element with the same object_key on this page
    stmt = select(PageElementModel).where(
        PageElementModel.page_id == body.page_id,
        PageElementModel.name == object_key,
    )
    result = await db.execute(stmt)
    existing = result.scalars().first()

    if existing and body.update_existing:
        before = _desktop_object_snapshot(existing)
        _apply_desktop_object_values(existing, cand)
        existing.updated_at = datetime.now(UTC).replace(tzinfo=None)
        await db.flush()
        after = _desktop_object_snapshot(existing)
        await _record_desktop_object_history(
            db, existing,
            action="updated",
            source="desktop_spy",
            actor=body.actor,
            before=before,
            after=after,
        )
        await _sync_test_steps_for_element(db, existing)
        await db.commit()
        return DesktopSpyPromoteResponse(
            element_id=existing.id,
            object_key=object_key,
            page_id=body.page_id,
            action="updated",
            message=f"Desktop object '{object_key}' updated in repository from spy capture.",
        )

    # Create a new element
    element = PageElementModel(
        page_id=body.page_id,
        name=object_key,
        element_type=str(cand.get("control_type") or "element"),
        description=str(cand.get("name") or object_key),
        xpath=str(cand.get("uia_path") or ""),
        css_selector="",
        id_attr=str(cand.get("automation_id") or ""),
        name_attr=str(cand.get("name_text") or cand.get("name") or ""),
        locator_strategy=str(cand.get("locator_strategy") or "name"),
        tags=["desktop", "spy"],
        confidence_score=float(cand.get("confidence_score") or 0.5),
        alternative_locators=list(cand.get("alternative_locators") or []),
        discovery_metadata=_desktop_object_metadata(cand),
        source_url=str(page.url or ""),
    )
    db.add(element)
    await db.flush()
    await _record_desktop_object_history(
        db, element,
        action="created",
        source="desktop_spy",
        actor=body.actor,
        before={},
        after=_desktop_object_snapshot(element),
    )
    await db.commit()
    return DesktopSpyPromoteResponse(
        element_id=element.id,
        object_key=object_key,
        page_id=body.page_id,
        action="created",
        message=f"Desktop object '{object_key}' added to repository from spy capture.",
    )


# ── Repository match suggestions for a spy snapshot ──────────────────────────

class RepositoryMatchSuggestion(BaseModel):
    element_id: str
    object_key: str
    name: str
    locator_strategy: str
    primary_locator: str
    match_score: float
    match_reason: str


class RepositoryMatchResponse(BaseModel):
    page_id: str
    query_key: str
    suggestions: list[RepositoryMatchSuggestion]


@router.post("/repository-match", response_model=RepositoryMatchResponse, status_code=status.HTTP_200_OK)
async def find_repository_matches(
    body: DesktopSpyPromoteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Find existing repository elements that may match a spy candidate.

    Scores each existing element on the page against the spy candidate using
    automation_id, name_text, class_name, and control_type similarity.
    Returns the top matches sorted by descending score.
    """
    cand = body.candidate
    cand_auto_id = str(cand.get("automation_id") or "").strip().lower()
    cand_name = str(cand.get("name_text") or cand.get("name") or "").strip().lower()
    cand_class = str(cand.get("class_name") or "").strip().lower()
    cand_type = str(cand.get("control_type") or "").strip().lower()
    object_key = str(cand.get("object_key") or "").strip()

    stmt = select(PageElementModel).where(PageElementModel.page_id == body.page_id)
    result = await db.execute(stmt)
    elements = result.scalars().all()

    suggestions: list[RepositoryMatchSuggestion] = []
    for elem in elements:
        meta = dict(elem.discovery_metadata or {})
        score = 0.0
        reasons: list[str] = []

        elem_auto_id = str(meta.get("automation_id") or elem.id_attr or "").strip().lower()
        elem_name = str(elem.name_attr or elem.description or "").strip().lower()
        elem_class = str(meta.get("class_name") or "").strip().lower()
        elem_type = str(elem.element_type or "").strip().lower()

        if cand_auto_id and elem_auto_id and cand_auto_id == elem_auto_id:
            score += 0.7
            reasons.append("automation_id match")
        if cand_name and elem_name and (cand_name == elem_name or cand_name in elem_name or elem_name in cand_name):
            score += 0.5 if cand_name == elem_name else 0.25
            reasons.append("name/text match")
        if cand_class and elem_class and cand_class == elem_class:
            score += 0.2
            reasons.append("class_name match")
        if cand_type and elem_type and cand_type == elem_type:
            score += 0.1
            reasons.append("control_type match")

        if score > 0:
            suggestions.append(RepositoryMatchSuggestion(
                element_id=elem.id,
                object_key=str(meta.get("object_key") or elem.name or elem.id),
                name=elem.description or elem.name,
                locator_strategy=elem.locator_strategy,
                primary_locator=elem.id_attr or elem.name_attr or elem.xpath or "",
                match_score=round(min(score, 1.0), 3),
                match_reason="; ".join(reasons),
            ))

    suggestions.sort(key=lambda s: s.match_score, reverse=True)
    return RepositoryMatchResponse(
        page_id=body.page_id,
        query_key=object_key,
        suggestions=suggestions[:10],
    )
