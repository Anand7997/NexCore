"""Desktop Recovery Rules API.

Provides CRUD for per-application / per-node-type recovery rule configurations
that override the built-in defaults in
``app.execution.plugins.desktop.recovery``.
"""
from __future__ import annotations

from datetime import datetime, UTC
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import DesktopRecoveryRuleModel
from app.database.session import get_db

router = APIRouter(prefix="/desktop-recovery-rules", tags=["desktop-recovery-rules"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class RecoveryRuleCreate(BaseModel):
    category: str = Field(..., description="Failure category key (object_not_found, app_crash, …)")
    application: str = Field("", description="Scope rule to this application key (empty = all)")
    node_type: str = Field("", description="Scope rule to this desktop node type (empty = all)")
    retryable: bool = False
    failure_outcome: str = Field("fail", pattern="^(fail|continue|quarantine)$")
    actions: list[dict[str, Any]] = Field(default_factory=list)
    node_chain: list[dict[str, Any]] = Field(default_factory=list)
    reason: str = ""
    enabled: bool = True


class RecoveryRuleUpdate(BaseModel):
    retryable: bool | None = None
    failure_outcome: str | None = Field(None, pattern="^(fail|continue|quarantine)$")
    actions: list[dict[str, Any]] | None = None
    node_chain: list[dict[str, Any]] | None = None
    reason: str | None = None
    enabled: bool | None = None


class RecoveryRuleResponse(BaseModel):
    id: str
    category: str
    application: str
    node_type: str
    retryable: bool
    failure_outcome: str
    actions: list[dict[str, Any]]
    node_chain: list[dict[str, Any]]
    reason: str
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _row_to_response(row: DesktopRecoveryRuleModel) -> RecoveryRuleResponse:
    return RecoveryRuleResponse(
        id=row.id,
        category=row.category,
        application=row.application or "",
        node_type=row.node_type or "",
        retryable=bool(row.retryable),
        failure_outcome=row.failure_outcome or "fail",
        actions=list(row.actions or []),
        node_chain=list(row.node_chain or []),
        reason=row.reason or "",
        enabled=bool(row.enabled),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[RecoveryRuleResponse])
async def list_recovery_rules(
    application: str = "",
    node_type: str = "",
    category: str = "",
    enabled_only: bool = True,
    db: AsyncSession = Depends(get_db),
) -> list[RecoveryRuleResponse]:
    """List desktop recovery rules, optionally filtered by scope fields."""
    stmt = select(DesktopRecoveryRuleModel)
    if enabled_only:
        stmt = stmt.where(DesktopRecoveryRuleModel.enabled.is_(True))
    if application:
        stmt = stmt.where(DesktopRecoveryRuleModel.application == application)
    if node_type:
        stmt = stmt.where(DesktopRecoveryRuleModel.node_type == node_type)
    if category:
        stmt = stmt.where(DesktopRecoveryRuleModel.category == category)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_row_to_response(r) for r in rows]


@router.post("", response_model=RecoveryRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_recovery_rule(
    body: RecoveryRuleCreate,
    db: AsyncSession = Depends(get_db),
) -> RecoveryRuleResponse:
    """Create a new configurable recovery rule."""
    row = DesktopRecoveryRuleModel(
        category=body.category,
        application=body.application,
        node_type=body.node_type,
        retryable=body.retryable,
        failure_outcome=body.failure_outcome,
        actions=body.actions,
        node_chain=body.node_chain,
        reason=body.reason,
        enabled=body.enabled,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row_to_response(row)


@router.get("/defaults", response_model=list[dict[str, Any]])
async def list_default_recovery_rules() -> list[dict[str, Any]]:
    """Return the built-in default recovery rules (read-only reference)."""
    from app.execution.plugins.desktop.recovery import DEFAULT_RECOVERY_RULES
    return list(DEFAULT_RECOVERY_RULES)


@router.get("/{rule_id}", response_model=RecoveryRuleResponse)
async def get_recovery_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
) -> RecoveryRuleResponse:
    result = await db.execute(
        select(DesktopRecoveryRuleModel).where(DesktopRecoveryRuleModel.id == rule_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Recovery rule not found")
    return _row_to_response(row)


@router.patch("/{rule_id}", response_model=RecoveryRuleResponse)
async def update_recovery_rule(
    rule_id: str,
    body: RecoveryRuleUpdate,
    db: AsyncSession = Depends(get_db),
) -> RecoveryRuleResponse:
    """Partially update a recovery rule."""
    result = await db.execute(
        select(DesktopRecoveryRuleModel).where(DesktopRecoveryRuleModel.id == rule_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Recovery rule not found")
    for field_name, value in body.model_dump(exclude_none=True).items():
        setattr(row, field_name, value)
    row.updated_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
    await db.refresh(row)
    return _row_to_response(row)


@router.delete(
    "/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_recovery_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    result = await db.execute(
        select(DesktopRecoveryRuleModel).where(DesktopRecoveryRuleModel.id == rule_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Recovery rule not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

