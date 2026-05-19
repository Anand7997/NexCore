"""SQLAlchemy ORM models for the NEXUS QA orchestration engine."""
from __future__ import annotations
from datetime import datetime
from typing import Any
import uuid

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, Float,
    String, Text, JSON, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ── Tenancy ───────────────────────────────────────────────────────────────────

class TenantModel(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default="active")
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class TenantMemberModel(Base):
    __tablename__ = "tenant_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), default="")
    roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(30), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Testing Type Catalog ───────────────────────────────────────────────────────

class TestingTypeModel(Base):
    """Catalog of testing disciplines: web, api, mobile, desktop, database, performance."""
    __tablename__ = "testing_types"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(50), default="functional")
    icon: Mapped[str] = mapped_column(String(50), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Test Projects / Modules ───────────────────────────────────────────────────

class TestProjectModel(Base):
    __tablename__ = "test_projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    modules: Mapped[list["TestModuleModel"]] = relationship(
        "TestModuleModel",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="TestModuleModel.created_at",
    )


class TestModuleModel(Base):
    __tablename__ = "test_modules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("test_projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project: Mapped["TestProjectModel"] = relationship("TestProjectModel", back_populates="modules")
    test_cases: Mapped[list["TestCaseModel"]] = relationship(
        "TestCaseModel",
        back_populates="module",
        cascade="all, delete-orphan",
        order_by="TestCaseModel.created_at",
    )


class TestCaseModel(Base):
    __tablename__ = "test_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    module_id: Mapped[str] = mapped_column(ForeignKey("test_modules.id"), nullable=False, index=True)
    # Denormalised project FK for direct queries (mirrors module.project_id)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("test_projects.id"), index=True)
    testing_type_id: Mapped[str | None] = mapped_column(ForeignKey("testing_types.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    test_type: Mapped[str] = mapped_column(String(50), default="functional")
    priority: Mapped[str] = mapped_column(String(20), default="p2")
    execution_mode: Mapped[str] = mapped_column(String(20), default="automated")
    platforms: Mapped[list[str]] = mapped_column(JSON, default=list)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    default_variables: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    module: Mapped["TestModuleModel"] = relationship("TestModuleModel", back_populates="test_cases")
    testing_type: Mapped["TestingTypeModel | None"] = relationship("TestingTypeModel")
    test_steps: Mapped[list["TestStepModel"]] = relationship(
        "TestStepModel",
        back_populates="test_case",
        cascade="all, delete-orphan",
        order_by="TestStepModel.step_order",
    )


# ── API Testing ───────────────────────────────────────────────────────────────

class ApiCollectionModel(Base):
    """Grouped set of API endpoints for a project/module."""
    __tablename__ = "api_collections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("test_projects.id"), index=True)
    module_id: Mapped[str | None] = mapped_column(ForeignKey("test_modules.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[str] = mapped_column(String(512), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    auth_type: Mapped[str] = mapped_column(String(50), default="none")
    auth_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    default_headers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    endpoints: Mapped[list["ApiEndpointModel"]] = relationship(
        "ApiEndpointModel", back_populates="collection", cascade="all, delete-orphan"
    )
    project: Mapped["TestProjectModel | None"] = relationship("TestProjectModel")
    module: Mapped["TestModuleModel | None"] = relationship("TestModuleModel")


class ApiEndpointModel(Base):
    """Single API endpoint definition (method + path + expected response)."""
    __tablename__ = "api_endpoints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    api_collection_id: Mapped[str] = mapped_column(
        ForeignKey("api_collections.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    method: Mapped[str] = mapped_column(String(10), default="GET")
    path: Mapped[str] = mapped_column(String(512), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    headers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    query_params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    request_body: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    expected_status: Mapped[int | None] = mapped_column(Integer)
    expected_response: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    auth_override: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    collection: Mapped["ApiCollectionModel"] = relationship("ApiCollectionModel", back_populates="endpoints")


# ── Test Steps ────────────────────────────────────────────────────────────────

class TestStepModel(Base):
    __tablename__ = "test_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    test_case_id: Mapped[str] = mapped_column(ForeignKey("test_cases.id"), nullable=False, index=True)
    step_order: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")

    # Explicit action fields (normalized)
    action_type: Mapped[str] = mapped_column(String(100), default="")
    page_id: Mapped[str | None] = mapped_column(ForeignKey("page_repository.id"), index=True)
    page_element_id: Mapped[str | None] = mapped_column(ForeignKey("page_elements.id"), index=True)
    api_endpoint_id: Mapped[str | None] = mapped_column(ForeignKey("api_endpoints.id"), index=True)
    input_value: Mapped[str] = mapped_column(Text, default="")
    expected_result: Mapped[str] = mapped_column(Text, default="")
    assertion_type: Mapped[str] = mapped_column(String(100), default="")
    secondary_action: Mapped[str] = mapped_column(String(100), default="")
    secondary_value: Mapped[str] = mapped_column(Text, default="")
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Legacy JSON fields kept for backward compatibility with existing UI
    intent: Mapped[str] = mapped_column(String(100), default="action")
    target: Mapped[str] = mapped_column(String(255), default="")
    test_data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    bindings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    test_case: Mapped["TestCaseModel"] = relationship("TestCaseModel", back_populates="test_steps")
    page: Mapped["PageRepositoryModel | None"] = relationship("PageRepositoryModel")
    page_element: Mapped["PageElementModel | None"] = relationship("PageElementModel")
    api_endpoint: Mapped["ApiEndpointModel | None"] = relationship("ApiEndpointModel")


# ── Page Object Repository ────────────────────────────────────────────────────

class PageRepositoryModel(Base):
    """Application page definition with its UI element catalog."""
    __tablename__ = "page_repository"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("test_projects.id"), index=True)
    module_id: Mapped[str | None] = mapped_column(ForeignKey("test_modules.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    url_pattern: Mapped[str] = mapped_column(String(512), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    platform: Mapped[str] = mapped_column(String(30), default="web", index=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    elements: Mapped[list["PageElementModel"]] = relationship(
        "PageElementModel", back_populates="page",
        cascade="all, delete-orphan", order_by="PageElementModel.name",
    )
    project: Mapped["TestProjectModel | None"] = relationship("TestProjectModel")
    module: Mapped["TestModuleModel | None"] = relationship("TestModuleModel")


class PageElementModel(Base):
    """A named UI element on a page, with one or more locator strategies."""
    __tablename__ = "page_elements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    page_id: Mapped[str] = mapped_column(ForeignKey("page_repository.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    element_type: Mapped[str] = mapped_column(String(50), default="element")
    description: Mapped[str] = mapped_column(Text, default="")
    xpath: Mapped[str] = mapped_column(Text, default="")
    css_selector: Mapped[str] = mapped_column(Text, default="")
    id_attr: Mapped[str] = mapped_column(String(255), default="")
    name_attr: Mapped[str] = mapped_column(String(255), default="")
    locator_strategy: Mapped[str] = mapped_column(String(30), default="xpath")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    # ── Element Discovery Agent fields ──
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    alternative_locators: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    source_url: Mapped[str] = mapped_column(Text, default="")
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    discovery_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # ── Timestamps ──
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    page: Mapped["PageRepositoryModel"] = relationship("PageRepositoryModel", back_populates="elements")


# ── Workflow Architecture ─────────────────────────────────────────────────────

class WorkflowModel(Base):
    __tablename__ = "workflows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("test_projects.id"), index=True)
    module_id: Mapped[str | None] = mapped_column(ForeignKey("test_modules.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    platforms: Mapped[list] = mapped_column(JSON, default=list)
    variables: Mapped[dict] = mapped_column(JSON, default=dict)
    retry_policy: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    nodes: Mapped[list["WorkflowNodeModel"]] = relationship(
        "WorkflowNodeModel", back_populates="workflow", cascade="all, delete-orphan"
    )
    edges: Mapped[list["WorkflowEdgeModel"]] = relationship(
        "WorkflowEdgeModel", back_populates="workflow", cascade="all, delete-orphan"
    )
    executions: Mapped[list["ExecutionModel"]] = relationship(
        "ExecutionModel", back_populates="workflow"
    )
    project: Mapped["TestProjectModel | None"] = relationship("TestProjectModel")
    module: Mapped["TestModuleModel | None"] = relationship("TestModuleModel")


class WorkflowNodeModel(Base):
    __tablename__ = "workflow_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.id"), nullable=False, index=True)
    test_case_id: Mapped[str | None] = mapped_column(ForeignKey("test_cases.id"), index=True)
    node_key: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    position_x: Mapped[float] = mapped_column(Float, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, default=0.0)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=60)
    retry_policy: Mapped[dict] = mapped_column(JSON, default=dict)

    workflow: Mapped["WorkflowModel"] = relationship("WorkflowModel", back_populates="nodes")
    test_case: Mapped["TestCaseModel | None"] = relationship("TestCaseModel")


class WorkflowEdgeModel(Base):
    __tablename__ = "workflow_edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.id"), nullable=False, index=True)
    source_key: Mapped[str] = mapped_column(String(100), nullable=False)
    target_key: Mapped[str] = mapped_column(String(100), nullable=False)
    condition: Mapped[str | None] = mapped_column(String(255))
    execution_order: Mapped[int] = mapped_column(Integer, default=0)

    workflow: Mapped["WorkflowModel"] = relationship("WorkflowModel", back_populates="edges")


# ── Executions ────────────────────────────────────────────────────────────────

class ExecutionModel(Base):
    __tablename__ = "executions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.id"), nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("test_projects.id"), index=True)
    module_id: Mapped[str | None] = mapped_column(ForeignKey("test_modules.id"), index=True)
    testing_type_id: Mapped[str | None] = mapped_column(ForeignKey("testing_types.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    trigger: Mapped[str] = mapped_column(String(50), default="manual")
    triggered_by: Mapped[str] = mapped_column(String(255), default="")
    environment: Mapped[str] = mapped_column(String(50), default="dev")
    platform: Mapped[str] = mapped_column(String(20), default="web")
    variables: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    workflow: Mapped["WorkflowModel"] = relationship("WorkflowModel", back_populates="executions")
    project: Mapped["TestProjectModel | None"] = relationship("TestProjectModel")
    module: Mapped["TestModuleModel | None"] = relationship("TestModuleModel")
    testing_type: Mapped["TestingTypeModel | None"] = relationship("TestingTypeModel")
    nodes: Mapped[list["ExecutionNodeModel"]] = relationship(
        "ExecutionNodeModel", back_populates="execution", cascade="all, delete-orphan"
    )
    events: Mapped[list["ExecutionEventModel"]] = relationship(
        "ExecutionEventModel", back_populates="execution", cascade="all, delete-orphan"
    )
    timeline: Mapped[list["ExecutionTimelineModel"]] = relationship(
        "ExecutionTimelineModel", back_populates="execution", cascade="all, delete-orphan"
    )
    variable_snapshots: Mapped[list["VariableSnapshotModel"]] = relationship(
        "VariableSnapshotModel", back_populates="execution", cascade="all, delete-orphan"
    )
    artifacts: Mapped[list["ArtifactModel"]] = relationship(
        "ArtifactModel", back_populates="execution", cascade="all, delete-orphan"
    )
    queue_item: Mapped["ExecutionQueueModel | None"] = relationship(
        "ExecutionQueueModel", back_populates="execution", cascade="all, delete-orphan"
    )
    runtime_leases: Mapped[list["RuntimeLeaseModel"]] = relationship(
        "RuntimeLeaseModel", back_populates="execution", cascade="all, delete-orphan"
    )
    test_case_results: Mapped[list["ExecutionTestCaseResultModel"]] = relationship(
        "ExecutionTestCaseResultModel", back_populates="execution", cascade="all, delete-orphan"
    )
    step_results: Mapped[list["ExecutionStepResultModel"]] = relationship(
        "ExecutionStepResultModel", back_populates="execution", cascade="all, delete-orphan"
    )


class ExecutionNodeModel(Base):
    __tablename__ = "execution_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    node_key: Mapped[str] = mapped_column(String(100), nullable=False)
    node_label: Mapped[str] = mapped_column(String(255), nullable=False)
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="created")
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    output: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)

    execution: Mapped["ExecutionModel"] = relationship("ExecutionModel", back_populates="nodes")


class ExecutionEventModel(Base):
    __tablename__ = "execution_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    node_key: Mapped[str | None] = mapped_column(String(100))
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="info")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    execution: Mapped["ExecutionModel"] = relationship("ExecutionModel", back_populates="events")


class ExecutionTimelineModel(Base):
    __tablename__ = "execution_timeline"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    node_key: Mapped[str | None] = mapped_column(String(100))
    phase: Mapped[str] = mapped_column(String(50), nullable=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    execution: Mapped["ExecutionModel"] = relationship("ExecutionModel", back_populates="timeline")


class VariableSnapshotModel(Base):
    __tablename__ = "variable_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    node_key: Mapped[str | None] = mapped_column(String(100))
    variables: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    execution: Mapped["ExecutionModel"] = relationship("ExecutionModel", back_populates="variable_snapshots")


# ── Artifacts ─────────────────────────────────────────────────────────────────

class ArtifactModel(Base):
    """Indexed pointer to execution evidence (screenshot, trace, request log…)."""
    __tablename__ = "execution_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    test_case_id: Mapped[str | None] = mapped_column(ForeignKey("test_cases.id"), index=True)
    test_step_id: Mapped[str | None] = mapped_column(ForeignKey("test_steps.id"), index=True)
    node_key: Mapped[str | None] = mapped_column(String(100), index=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    relative_path: Mapped[str] = mapped_column(String(512), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    artifact_metadata: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    execution: Mapped["ExecutionModel"] = relationship("ExecutionModel", back_populates="artifacts")
    test_case: Mapped["TestCaseModel | None"] = relationship("TestCaseModel")
    test_step: Mapped["TestStepModel | None"] = relationship("TestStepModel")


# ── Execution Results (per test case and per test step) ───────────────────────

class ExecutionTestCaseResultModel(Base):
    """One result row per test case executed within an execution run."""
    __tablename__ = "execution_test_case_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("test_projects.id"), index=True)
    module_id: Mapped[str | None] = mapped_column(ForeignKey("test_modules.id"), index=True)
    workflow_id: Mapped[str | None] = mapped_column(ForeignKey("workflows.id"), index=True)
    test_case_id: Mapped[str] = mapped_column(ForeignKey("test_cases.id"), nullable=False, index=True)
    testing_type_id: Mapped[str | None] = mapped_column(ForeignKey("testing_types.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    execution: Mapped["ExecutionModel"] = relationship("ExecutionModel", back_populates="test_case_results")
    test_case: Mapped["TestCaseModel"] = relationship("TestCaseModel")
    step_results: Mapped[list["ExecutionStepResultModel"]] = relationship(
        "ExecutionStepResultModel", back_populates="test_case_result", cascade="all, delete-orphan"
    )


class ExecutionStepResultModel(Base):
    """One result row per test step executed within a test case result."""
    __tablename__ = "execution_step_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    test_case_result_id: Mapped[str] = mapped_column(
        ForeignKey("execution_test_case_results.id"), nullable=False, index=True
    )
    test_case_id: Mapped[str] = mapped_column(ForeignKey("test_cases.id"), nullable=False, index=True)
    test_step_id: Mapped[str] = mapped_column(ForeignKey("test_steps.id"), nullable=False, index=True)
    step_order: Mapped[int] = mapped_column(Integer, default=1)
    action_type: Mapped[str] = mapped_column(String(100), default="")
    page_id: Mapped[str | None] = mapped_column(ForeignKey("page_repository.id"))
    page_element_id: Mapped[str | None] = mapped_column(ForeignKey("page_elements.id"))
    api_endpoint_id: Mapped[str | None] = mapped_column(ForeignKey("api_endpoints.id"))
    locator_used: Mapped[str] = mapped_column(Text, default="")
    input_value: Mapped[str] = mapped_column(Text, default="")
    expected_result: Mapped[str] = mapped_column(Text, default="")
    actual_result: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    error_message: Mapped[str | None] = mapped_column(Text)
    screenshot_url: Mapped[str | None] = mapped_column(String(512))
    log_output: Mapped[str] = mapped_column(Text, default="")
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    execution: Mapped["ExecutionModel"] = relationship("ExecutionModel", back_populates="step_results")
    test_case_result: Mapped["ExecutionTestCaseResultModel"] = relationship(
        "ExecutionTestCaseResultModel", back_populates="step_results"
    )
    test_step: Mapped["TestStepModel"] = relationship("TestStepModel")
    page: Mapped["PageRepositoryModel | None"] = relationship("PageRepositoryModel")
    page_element: Mapped["PageElementModel | None"] = relationship("PageElementModel")
    api_endpoint: Mapped["ApiEndpointModel | None"] = relationship("ApiEndpointModel")


# ── Distributed Runtime Fabric ────────────────────────────────────────────────

class RuntimeAgentModel(Base):
    __tablename__ = "runtime_agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="idle", index=True)
    agent_type: Mapped[str] = mapped_column(String(50), default="generic", index=True)
    endpoint: Mapped[str | None] = mapped_column(String(512))
    version: Mapped[str] = mapped_column(String(50), default="1.0.0")
    capabilities: Mapped[list[str]] = mapped_column(JSON, default=list)
    labels: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    max_concurrency: Mapped[int] = mapped_column(Integer, default=1)
    active_leases: Mapped[int] = mapped_column(Integer, default=0)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime)
    registered_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    leases: Mapped[list["RuntimeLeaseModel"]] = relationship(
        "RuntimeLeaseModel", back_populates="agent", cascade="all, delete-orphan"
    )


class ExecutionQueueModel(Base):
    __tablename__ = "execution_queue"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    platform: Mapped[str] = mapped_column(String(30), default="web", index=True)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    required_capabilities: Mapped[list[str]] = mapped_column(JSON, default=list)
    assigned_agent_id: Mapped[str | None] = mapped_column(String(36), index=True)
    dispatch_reason: Mapped[str] = mapped_column(Text, default="")
    queued_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    execution: Mapped["ExecutionModel"] = relationship("ExecutionModel", back_populates="queue_item")


class RuntimeLeaseModel(Base):
    __tablename__ = "runtime_leases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("runtime_agents.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    platform: Mapped[str] = mapped_column(String(30), default="web")
    acquired_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    released_at: Mapped[datetime | None] = mapped_column(DateTime)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime)
    lease_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)

    execution: Mapped["ExecutionModel"] = relationship("ExecutionModel", back_populates="runtime_leases")
    agent: Mapped["RuntimeAgentModel"] = relationship("RuntimeAgentModel", back_populates="leases")


# ── Enterprise ────────────────────────────────────────────────────────────────

class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    user_id: Mapped[str] = mapped_column(String(255), default="system", index=True)
    action: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(80), default="")
    resource_id: Mapped[str | None] = mapped_column(String(120), index=True)
    outcome: Mapped[str] = mapped_column(String(30), default="success")
    ip_address: Mapped[str | None] = mapped_column(String(80))
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class IntegrationModel(Base):
    __tablename__ = "enterprise_integrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    integration_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), default="configured")
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    secret_ref: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class ReportSnapshotModel(Base):
    __tablename__ = "report_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    report_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String(255), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── AI Intelligence ───────────────────────────────────────────────────────────

class IntelligenceJobModel(Base):
    __tablename__ = "intelligence_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    execution_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    current_step: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
