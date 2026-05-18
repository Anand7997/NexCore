"""Pydantic DTOs for the execution domain."""
from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class ExecutionTriggerSchema(BaseModel):
    workflow_id: str
    project_id: str | None = None
    module_id: str | None = None
    testing_type_id: str | None = None
    trigger: str = "manual"
    triggered_by: str = ""
    environment: str = "dev"
    platform: str = "web"
    variables: dict[str, Any] = Field(default_factory=dict)


class ExecutionNodeResponse(BaseModel):
    id: str
    node_key: str
    node_label: str
    node_type: str
    status: str
    attempt_count: int
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None
    output: dict[str, Any]
    error: str | None

    model_config = {"from_attributes": True}


class TimelineEntryResponse(BaseModel):
    id: str
    node_key: str | None
    phase: str
    metadata_: dict[str, Any]
    timestamp: datetime

    model_config = {"from_attributes": True}


class ExecutionEventResponse(BaseModel):
    id: str
    node_key: str | None
    event_type: str
    severity: str
    payload: dict[str, Any]
    timestamp: datetime

    model_config = {"from_attributes": True}


class ExecutionResponse(BaseModel):
    id: str
    workflow_id: str
    status: str
    trigger: str
    environment: str
    platform: str
    variables: dict[str, Any]
    error: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    nodes: list[ExecutionNodeResponse] = Field(default_factory=list)
    timeline: list[TimelineEntryResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ExecutionListItem(BaseModel):
    id: str
    workflow_id: str
    status: str
    trigger: str
    environment: str
    platform: str
    error: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    node_count: int = 0
    completed_nodes: int = 0

    model_config = {"from_attributes": True}
