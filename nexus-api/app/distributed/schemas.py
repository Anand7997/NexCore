"""DTOs for the distributed runtime fabric control plane."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RuntimeAgentRegisterRequest(BaseModel):
    name: str
    agent_type: str = "generic"
    endpoint: str | None = None
    version: str = "1.0.0"
    capabilities: list[str] = Field(default_factory=list)
    labels: dict[str, Any] = Field(default_factory=dict)
    max_concurrency: int = 1


class RuntimeAgentHeartbeatRequest(BaseModel):
    status: str | None = None
    active_leases: int | None = None
    capabilities: list[str] | None = None
    labels: dict[str, Any] | None = None


class RuntimeAgentResponse(BaseModel):
    id: str
    name: str
    status: str
    agent_type: str
    endpoint: str | None
    version: str
    capabilities: list[str]
    labels: dict[str, Any]
    max_concurrency: int
    active_leases: int
    last_heartbeat_at: datetime | None
    registered_at: datetime

    model_config = {"from_attributes": True}


class ExecutionQueueResponse(BaseModel):
    id: str
    execution_id: str
    status: str
    platform: str
    priority: int
    required_capabilities: list[str]
    assigned_agent_id: str | None
    dispatch_reason: str
    queued_at: datetime
    dispatched_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class RuntimeLeaseResponse(BaseModel):
    id: str
    execution_id: str
    agent_id: str
    status: str
    platform: str
    acquired_at: datetime
    released_at: datetime | None
    heartbeat_at: datetime | None
    lease_metadata: dict[str, Any]

    model_config = {"from_attributes": True}


class ExecutionScheduleRequest(BaseModel):
    platform: str = "web"
    priority: int = 100
    required_capabilities: list[str] = Field(default_factory=list)
