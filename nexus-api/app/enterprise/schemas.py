"""Enterprise platform DTOs."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TenantCreateRequest(BaseModel):
    name: str
    slug: str
    settings: dict[str, Any] = Field(default_factory=dict)


class TenantResponse(BaseModel):
    id: str
    name: str
    slug: str
    status: str
    settings: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class TenantMemberRequest(BaseModel):
    user_id: str
    email: str = ""
    roles: list[str] = Field(default_factory=lambda: ["viewer"])


class TenantMemberResponse(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    email: str
    roles: list[str]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogResponse(BaseModel):
    id: str
    tenant_id: str | None
    user_id: str
    action: str
    resource_type: str
    resource_id: str | None
    outcome: str
    ip_address: str | None
    metadata_: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class IntegrationCreateRequest(BaseModel):
    name: str
    integration_type: str
    config: dict[str, Any] = Field(default_factory=dict)
    secret_ref: str | None = None


class IntegrationResponse(BaseModel):
    id: str
    tenant_id: str | None
    name: str
    integration_type: str
    status: str
    config: dict[str, Any]
    secret_ref: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportSnapshotCreateRequest(BaseModel):
    report_type: str
    title: str
    payload: dict[str, Any] = Field(default_factory=dict)


class ReportSnapshotResponse(BaseModel):
    id: str
    tenant_id: str | None
    report_type: str
    title: str
    payload: dict[str, Any]
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}
