"""Pydantic schemas for Test Configuration."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


TAG_CATALOG = [
    {
        "key": "test_type",
        "label": "Test Type",
        "values": ["functional", "smoke", "sanity", "regression", "integration", "e2e", "api", "ui", "db"],
    },
    {
        "key": "platform",
        "label": "Platform",
        "values": ["web", "android", "ios", "windows", "api"],
    },
    {
        "key": "framework",
        "label": "Framework",
        "values": ["playwright", "appium", "winappdriver", "httpx"],
    },
    {
        "key": "priority",
        "label": "Priority",
        "values": ["p0", "p1", "p2", "p3"],
    },
    {
        "key": "execution_mode",
        "label": "Execution Mode",
        "values": ["automated", "manual", "hybrid"],
    },
    {
        "key": "component",
        "label": "Component",
        "values": ["auth", "checkout", "payments", "orders", "profile"],
    },
]


class TagCatalogDimensionResponse(BaseModel):
    key: str
    label: str
    values: list[str]


class TestProjectCreateSchema(BaseModel):
    name: str
    description: str = ""
    status: str = "active"
    tags: list[str] = Field(default_factory=list)


class TestProjectUpdateSchema(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    tags: list[str] | None = None


class TestModuleCreateSchema(BaseModel):
    name: str
    description: str = ""
    status: str = "active"
    tags: list[str] = Field(default_factory=list)


class TestModuleUpdateSchema(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    tags: list[str] | None = None


class TestCaseCreateSchema(BaseModel):
    name: str
    description: str = ""
    status: str = "draft"
    test_type: str = "functional"
    priority: str = "p2"
    execution_mode: str = "automated"
    platforms: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    default_variables: dict[str, Any] = Field(default_factory=dict)


class TestCaseUpdateSchema(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    test_type: str | None = None
    priority: str | None = None
    execution_mode: str | None = None
    platforms: list[str] | None = None
    tags: list[str] | None = None
    default_variables: dict[str, Any] | None = None


class TestStepCreateSchema(BaseModel):
    name: str
    description: str = ""
    step_order: int | None = None
    intent: str = "action"
    target: str = ""
    expected_result: str = ""
    test_data: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    bindings: dict[str, dict[str, Any]] = Field(default_factory=dict)
    is_enabled: bool = True


class TestStepUpdateSchema(BaseModel):
    name: str | None = None
    description: str | None = None
    step_order: int | None = None
    intent: str | None = None
    target: str | None = None
    expected_result: str | None = None
    test_data: dict[str, Any] | None = None
    tags: list[str] | None = None
    bindings: dict[str, dict[str, Any]] | None = None
    is_enabled: bool | None = None


class TestStepResponse(BaseModel):
    id: str
    step_order: int
    name: str
    description: str
    intent: str
    target: str
    expected_result: str
    test_data: dict[str, Any]
    tags: list[str]
    bindings: dict[str, dict[str, Any]]
    is_enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TestCaseResponse(BaseModel):
    id: str
    module_id: str
    name: str
    description: str
    status: str
    test_type: str
    priority: str
    execution_mode: str
    platforms: list[str]
    tags: list[str]
    default_variables: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    test_steps: list[TestStepResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class TestModuleResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: str
    status: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    test_cases: list[TestCaseResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class TestProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    status: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    modules: list[TestModuleResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class TestProjectListItem(BaseModel):
    id: str
    name: str
    description: str
    status: str
    tags: list[str]
    module_count: int = 0
    case_count: int = 0
    step_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TestConfigurationTreeResponse(BaseModel):
    projects: list[TestProjectResponse] = Field(default_factory=list)
    tag_catalog: list[TagCatalogDimensionResponse] = Field(default_factory=list)
