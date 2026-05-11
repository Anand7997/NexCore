"""Enterprise platform routes: tenancy, RBAC, audit, integrations, reports."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.models import (
    AuditLogModel,
    ExecutionModel,
    IntegrationModel,
    ReportSnapshotModel,
    RuntimeAgentModel,
    TenantMemberModel,
    TenantModel,
)
from app.database.session import get_db
from app.enterprise.audit import record_audit
from app.enterprise.auth import AuthContext, require_roles
from app.enterprise.schemas import (
    AuditLogResponse,
    IntegrationCreateRequest,
    IntegrationResponse,
    ReportSnapshotCreateRequest,
    ReportSnapshotResponse,
    TenantCreateRequest,
    TenantMemberRequest,
    TenantMemberResponse,
    TenantResponse,
)

router = APIRouter(prefix="/enterprise", tags=["enterprise"])


@router.post("/tenants", response_model=TenantResponse)
async def create_tenant(
    payload: TenantCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(require_roles("admin")),
):
    tenant = TenantModel(name=payload.name, slug=payload.slug, settings=payload.settings)
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    await record_audit(
        db,
        ctx,
        action="tenant.create",
        resource_type="tenant",
        resource_id=tenant.id,
        ip_address=request.client.host if request.client else None,
    )
    return tenant


@router.get("/tenants", response_model=list[TenantResponse])
async def list_tenants(
    db: AsyncSession = Depends(get_db),
    _: AuthContext = Depends(require_roles("admin")),
):
    result = await db.execute(select(TenantModel).order_by(TenantModel.created_at.desc()))
    return list(result.scalars().all())


@router.post("/tenants/{tenant_id}/members", response_model=TenantMemberResponse)
async def add_tenant_member(
    tenant_id: str,
    payload: TenantMemberRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(require_roles("admin")),
):
    member = TenantMemberModel(
        tenant_id=tenant_id,
        user_id=payload.user_id,
        email=payload.email,
        roles=payload.roles,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    await record_audit(
        db,
        ctx,
        action="tenant.member.add",
        resource_type="tenant_member",
        resource_id=member.id,
        ip_address=request.client.host if request.client else None,
        metadata={"tenant_id": tenant_id, "roles": payload.roles},
    )
    return member


@router.get("/tenants/{tenant_id}/members", response_model=list[TenantMemberResponse])
async def list_tenant_members(
    tenant_id: str,
    db: AsyncSession = Depends(get_db),
    _: AuthContext = Depends(require_roles("admin", "operator")),
):
    result = await db.execute(
        select(TenantMemberModel)
        .where(TenantMemberModel.tenant_id == tenant_id)
        .order_by(TenantMemberModel.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/audit", response_model=list[AuditLogResponse])
async def list_audit_logs(
    tenant_id: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(require_roles("admin", "auditor")),
):
    stmt = select(AuditLogModel).order_by(AuditLogModel.created_at.desc()).limit(limit)
    effective_tenant = tenant_id or ctx.tenant_id
    if effective_tenant:
        stmt = stmt.where(AuditLogModel.tenant_id == effective_tenant)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/integrations", response_model=IntegrationResponse)
async def create_integration(
    payload: IntegrationCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(require_roles("admin", "operator")),
):
    integration = IntegrationModel(
        tenant_id=ctx.tenant_id,
        name=payload.name,
        integration_type=payload.integration_type,
        config=payload.config,
        secret_ref=payload.secret_ref,
    )
    db.add(integration)
    await db.commit()
    await db.refresh(integration)
    await record_audit(
        db,
        ctx,
        action="integration.create",
        resource_type="integration",
        resource_id=integration.id,
        ip_address=request.client.host if request.client else None,
        metadata={"integration_type": payload.integration_type},
    )
    return integration


@router.get("/integrations", response_model=list[IntegrationResponse])
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(require_roles("admin", "operator", "viewer")),
):
    stmt = select(IntegrationModel).order_by(IntegrationModel.created_at.desc())
    if ctx.tenant_id:
        stmt = stmt.where(IntegrationModel.tenant_id == ctx.tenant_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/reports/execution-summary")
async def execution_summary(
    days: int = 7,
    db: AsyncSession = Depends(get_db),
    _: AuthContext = Depends(require_roles("admin", "operator", "viewer")),
) -> dict[str, Any]:
    since = datetime.utcnow() - timedelta(days=max(1, min(days, 90)))
    total = await db.scalar(select(func.count()).where(ExecutionModel.created_at >= since)) or 0
    success = await db.scalar(select(func.count()).where(ExecutionModel.created_at >= since, ExecutionModel.status == "success")) or 0
    failed = await db.scalar(select(func.count()).where(ExecutionModel.created_at >= since, ExecutionModel.status == "failed")) or 0
    running = await db.scalar(select(func.count()).where(ExecutionModel.status == "running")) or 0
    agents = await db.scalar(select(func.count()).select_from(RuntimeAgentModel)) or 0
    active_agents = await db.scalar(select(func.count()).where(RuntimeAgentModel.status.in_(["idle", "ready", "busy"]))) or 0
    return {
        "window_days": days,
        "executions": {
            "total": total,
            "success": success,
            "failed": failed,
            "running": running,
            "success_rate": round(success / total, 4) if total else 0,
        },
        "runtime_agents": {
            "total": agents,
            "active": active_agents,
        },
    }


@router.post("/reports/snapshots", response_model=ReportSnapshotResponse)
async def create_report_snapshot(
    payload: ReportSnapshotCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(require_roles("admin", "operator")),
):
    snapshot = ReportSnapshotModel(
        tenant_id=ctx.tenant_id,
        report_type=payload.report_type,
        title=payload.title,
        payload=payload.payload,
        created_by=ctx.user_id,
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)
    await record_audit(
        db,
        ctx,
        action="report.snapshot.create",
        resource_type="report_snapshot",
        resource_id=snapshot.id,
        ip_address=request.client.host if request.client else None,
    )
    return snapshot


@router.get("/reports/snapshots", response_model=list[ReportSnapshotResponse])
async def list_report_snapshots(
    db: AsyncSession = Depends(get_db),
    ctx: AuthContext = Depends(require_roles("admin", "operator", "viewer")),
):
    stmt = select(ReportSnapshotModel).order_by(ReportSnapshotModel.created_at.desc())
    if ctx.tenant_id:
        stmt = stmt.where(ReportSnapshotModel.tenant_id == ctx.tenant_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/sso/config")
async def sso_config(_: AuthContext = Depends(require_roles("admin"))):
    return {
        "provider": "keycloak",
        "oidc_ready": True,
        "issuer_env": "KEYCLOAK_ISSUER_URL",
        "client_id_env": "KEYCLOAK_CLIENT_ID",
        "configured": bool(getattr(settings, "keycloak_issuer_url", "")),
    }


@router.get("/compliance/readiness")
async def compliance_readiness(_: AuthContext = Depends(require_roles("admin", "auditor"))):
    return {
        "rbac": "enabled",
        "tenant_isolation": "header-context-ready",
        "audit_logging": "enabled",
        "sso": "oidc-keycloak-ready",
        "secret_handling": "secret-reference-model",
        "runtime_authorization": "agent-registration-and-leases",
        "deployment": "docker-compose-and-kubernetes-ready-docs",
    }
