"""Audit logging service for enterprise controls."""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AuditLogModel
from app.enterprise.auth import AuthContext


async def record_audit(
    db: AsyncSession,
    ctx: AuthContext,
    *,
    action: str,
    resource_type: str = "",
    resource_id: str | None = None,
    outcome: str = "success",
    ip_address: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLogModel:
    row = AuditLogModel(
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        outcome=outcome,
        ip_address=ip_address,
        metadata_=metadata or {},
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
