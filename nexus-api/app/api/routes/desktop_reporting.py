"""Desktop Reporting API.

Aggregated views for:
- Healing suggestion statistics (object-level + platform-level)
- Recovery trigger statistics (by category, outcome)
- Per-object / per-page stability scores
- Full execution evidence report for a single desktop execution
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models import (
    DesktopLocatorSuccessModel,
    DesktopObjectHealingSuggestionModel,
    DesktopObjectHistoryModel,
    PageElementModel,
    PageRepositoryModel,
)
from app.database.session import get_db

router = APIRouter(prefix="/desktop-reporting", tags=["desktop-reporting"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class HealingStats(BaseModel):
    total_suggestions: int
    approved: int
    rejected: int
    pending: int
    approval_rate: float
    top_healed_objects: list[dict[str, Any]]


class RecoveryStats(BaseModel):
    total_healed_executions: int
    total_locator_successes: int
    strategy_success_rates: dict[str, float]
    top_failing_objects: list[dict[str, Any]]


class ObjectStability(BaseModel):
    object_key: str
    element_id: str
    name: str
    success_rate: float
    total_attempts: int
    successful_attempts: int
    best_strategy: str
    healing_suggestions_pending: int
    last_activity: str | None


class PageStabilityReport(BaseModel):
    page_id: str
    page_name: str
    application: str
    total_objects: int
    stable_objects: int
    unstable_objects: int
    avg_success_rate: float
    objects: list[ObjectStability]


class ExecutionEvidenceReport(BaseModel):
    execution_id: str
    total_steps: int
    objects_accessed: list[str]
    locator_strategies_used: dict[str, int]
    healed_steps: int
    history_entries: list[dict[str, Any]]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/healing", response_model=HealingStats)
async def healing_stats(
    application: str = "",
    db: AsyncSession = Depends(get_db),
) -> HealingStats:
    """Aggregate healing suggestion statistics."""
    stmt = select(DesktopObjectHealingSuggestionModel)
    if application:
        stmt = stmt.where(DesktopObjectHealingSuggestionModel.application == application)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    counts: dict[str, int] = defaultdict(int)
    object_counts: dict[str, int] = defaultdict(int)
    for row in rows:
        counts[row.status] += 1
        if row.status == "approved":
            object_counts[row.object_key] += 1

    total = len(rows)
    approved = counts.get("approved", 0)
    approval_rate = round(approved / total, 4) if total else 0.0

    top_healed = sorted(object_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return HealingStats(
        total_suggestions=total,
        approved=approved,
        rejected=counts.get("rejected", 0),
        pending=counts.get("pending", 0),
        approval_rate=approval_rate,
        top_healed_objects=[{"object_key": k, "heal_count": v} for k, v in top_healed],
    )


@router.get("/recovery", response_model=RecoveryStats)
async def recovery_stats(
    application: str = "",
    db: AsyncSession = Depends(get_db),
) -> RecoveryStats:
    """Aggregate locator and healing recovery statistics."""
    stmt = select(DesktopLocatorSuccessModel)
    if application:
        stmt = stmt.where(DesktopLocatorSuccessModel.application == application)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    strategy_total: dict[str, int] = defaultdict(int)
    strategy_success: dict[str, int] = defaultdict(int)
    object_failures: dict[str, int] = defaultdict(int)
    healed_executions: set[str] = set()

    for row in rows:
        strategy_total[row.strategy] += 1
        if row.confidence and row.confidence >= 0.5:
            strategy_success[row.strategy] += 1
        if row.healed:
            healed_executions.add(row.execution_id)
        if not row.healed and row.confidence and row.confidence < 0.5:
            object_failures[row.object_key] += 1

    strategy_rates = {
        s: round(strategy_success.get(s, 0) / total, 4)
        for s, total in strategy_total.items()
        if total > 0
    }

    top_failing = sorted(object_failures.items(), key=lambda x: x[1], reverse=True)[:10]

    return RecoveryStats(
        total_healed_executions=len(healed_executions),
        total_locator_successes=len(rows),
        strategy_success_rates=strategy_rates,
        top_failing_objects=[{"object_key": k, "failure_count": v} for k, v in top_failing],
    )


@router.get("/stability/{page_id}", response_model=PageStabilityReport)
async def page_stability_report(
    page_id: str,
    db: AsyncSession = Depends(get_db),
) -> PageStabilityReport:
    """Per-object stability scores for a page using locator success history."""
    result = await db.execute(
        select(PageRepositoryModel)
        .where(PageRepositoryModel.id == page_id)
        .options(selectinload(PageRepositoryModel.elements))
    )
    page = result.scalar_one_or_none()
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")

    elements = list(page.elements or [])
    if not elements:
        return PageStabilityReport(
            page_id=page_id,
            page_name=page.name or "",
            application=str((page.tags or {}) if isinstance(page.tags, dict) else ""),
            total_objects=0,
            stable_objects=0,
            unstable_objects=0,
            avg_success_rate=0.0,
            objects=[],
        )

    element_ids = [e.id for e in elements]
    success_result = await db.execute(
        select(DesktopLocatorSuccessModel).where(DesktopLocatorSuccessModel.element_id.in_(element_ids))
    )
    success_rows = success_result.scalars().all()

    healing_result = await db.execute(
        select(DesktopObjectHealingSuggestionModel)
        .where(DesktopObjectHealingSuggestionModel.element_id.in_(element_ids))
        .where(DesktopObjectHealingSuggestionModel.status == "pending")
    )
    pending_healing: dict[str, int] = defaultdict(int)
    for h in healing_result.scalars().all():
        if h.element_id:
            pending_healing[h.element_id] += 1

    by_element: dict[str, list[DesktopLocatorSuccessModel]] = defaultdict(list)
    for row in success_rows:
        if row.element_id:
            by_element[row.element_id].append(row)

    object_reports: list[ObjectStability] = []
    total_rate = 0.0

    for elem in elements:
        rows = by_element.get(elem.id, [])
        total_attempts = len(rows)
        successful = sum(1 for r in rows if r.confidence and r.confidence >= 0.5)
        rate = round(successful / total_attempts, 4) if total_attempts else 1.0

        strategy_counts: dict[str, int] = defaultdict(int)
        for r in rows:
            if r.confidence and r.confidence >= 0.5:
                strategy_counts[r.strategy] += 1
        best_strategy = max(strategy_counts, key=lambda s: strategy_counts[s]) if strategy_counts else (elem.locator_strategy or "")

        last_created = max((r.created_at for r in rows), default=None)

        object_reports.append(ObjectStability(
            object_key=str((elem.discovery_metadata or {}).get("object_key") or elem.name or elem.id),
            element_id=elem.id,
            name=elem.name or "",
            success_rate=rate,
            total_attempts=total_attempts,
            successful_attempts=successful,
            best_strategy=best_strategy,
            healing_suggestions_pending=pending_healing.get(elem.id, 0),
            last_activity=last_created.isoformat() if last_created else None,
        ))
        total_rate += rate

    stable = sum(1 for o in object_reports if o.success_rate >= 0.8)
    avg = round(total_rate / len(object_reports), 4) if object_reports else 0.0

    application_name = ""
    if page.tags and isinstance(page.tags, list):
        for tag in page.tags:
            if tag not in ("desktop", "object-repository", "master-sheet"):
                application_name = tag
                break

    return PageStabilityReport(
        page_id=page_id,
        page_name=page.name or "",
        application=application_name or page.name or "",
        total_objects=len(object_reports),
        stable_objects=stable,
        unstable_objects=len(object_reports) - stable,
        avg_success_rate=avg,
        objects=sorted(object_reports, key=lambda o: o.success_rate),
    )


@router.get("/execution/{execution_id}", response_model=ExecutionEvidenceReport)
async def execution_evidence_report(
    execution_id: str,
    db: AsyncSession = Depends(get_db),
) -> ExecutionEvidenceReport:
    """Full desktop evidence report for a single execution (locators, healing, history)."""
    success_result = await db.execute(
        select(DesktopLocatorSuccessModel).where(DesktopLocatorSuccessModel.execution_id == execution_id)
    )
    success_rows = success_result.scalars().all()

    history_result = await db.execute(
        select(DesktopObjectHistoryModel).where(DesktopObjectHistoryModel.source == "execution_" + execution_id)
    )
    history_rows = history_result.scalars().all()

    strategy_counts: dict[str, int] = defaultdict(int)
    objects_accessed: set[str] = set()
    healed = 0
    for row in success_rows:
        strategy_counts[row.strategy] += 1
        objects_accessed.add(row.object_key)
        if row.healed:
            healed += 1

    return ExecutionEvidenceReport(
        execution_id=execution_id,
        total_steps=len(success_rows),
        objects_accessed=sorted(objects_accessed),
        locator_strategies_used=dict(strategy_counts),
        healed_steps=healed,
        history_entries=[
            {
                "id": h.id,
                "object_key": str((h.after_snapshot or {}).get("object_key") or ""),
                "action": h.action,
                "created_at": h.created_at.isoformat() if h.created_at else None,
            }
            for h in history_rows
        ],
    )
