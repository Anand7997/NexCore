"""Pydantic DTOs for the workflow domain."""
from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class RetryPolicySchema(BaseModel):
    max_attempts: int = 3
    backoff_base: float = 1.5
    max_delay: float = 30.0
    jitter: bool = True


class WorkflowNodePositionSchema(BaseModel):
    x: float = 0.0
    y: float = 0.0


class WorkflowNodeSchema(BaseModel):
    node_key: str
    type: str
    label: str
    description: str = ""
    test_case_id: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    position: WorkflowNodePositionSchema = Field(default_factory=WorkflowNodePositionSchema)
    timeout_seconds: int = 60
    retry_policy: RetryPolicySchema = Field(default_factory=RetryPolicySchema)


class WorkflowEdgeSchema(BaseModel):
    source_key: str
    target_key: str
    condition: str | None = None
    execution_order: int = 0


class WorkflowCreateSchema(BaseModel):
    name: str
    description: str = ""
    project_id: str | None = None
    module_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    platforms: list[str] = Field(default_factory=list)
    variables: dict[str, Any] = Field(default_factory=dict)
    nodes: list[WorkflowNodeSchema] = Field(default_factory=list)
    edges: list[WorkflowEdgeSchema] = Field(default_factory=list)


class WorkflowUpdateSchema(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    project_id: str | None = None
    module_id: str | None = None
    tags: list[str] | None = None
    variables: dict[str, Any] | None = None
    nodes: list[WorkflowNodeSchema] | None = None
    edges: list[WorkflowEdgeSchema] | None = None


class WorkflowNodeResponse(BaseModel):
    id: str
    node_key: str
    type: str
    label: str
    description: str
    test_case_id: str | None
    config: dict[str, Any]
    position_x: float
    position_y: float
    timeout_seconds: int
    retry_policy: dict[str, Any]

    model_config = {"from_attributes": True}


class WorkflowEdgeResponse(BaseModel):
    id: str
    source_key: str
    target_key: str
    condition: str | None
    execution_order: int

    model_config = {"from_attributes": True}


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: str
    status: str
    tags: list[str]
    platforms: list[str]
    variables: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    nodes: list[WorkflowNodeResponse] = Field(default_factory=list)
    edges: list[WorkflowEdgeResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class WorkflowListItem(BaseModel):
    id: str
    name: str
    description: str
    status: str
    tags: list[str]
    platforms: list[str]
    created_at: datetime
    updated_at: datetime
    node_count: int = 0

    model_config = {"from_attributes": True}
