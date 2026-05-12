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


# ── Workflows ────────────────────────────────────────────────────────────────

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


class WorkflowModel(Base):
    __tablename__ = "workflows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    platforms: Mapped[list] = mapped_column(JSON, default=list)
    variables: Mapped[dict] = mapped_column(JSON, default=dict)
    retry_policy: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    nodes: Mapped[list[WorkflowNodeModel]] = relationship(
        "WorkflowNodeModel", back_populates="workflow", cascade="all, delete-orphan"
    )
    edges: Mapped[list[WorkflowEdgeModel]] = relationship(
        "WorkflowEdgeModel", back_populates="workflow", cascade="all, delete-orphan"
    )
    executions: Mapped[list[ExecutionModel]] = relationship(
        "ExecutionModel", back_populates="workflow"
    )


class WorkflowNodeModel(Base):
    __tablename__ = "workflow_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.id"), nullable=False, index=True)
    node_key: Mapped[str] = mapped_column(String(100), nullable=False)  # logical id within DAG
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    position_x: Mapped[float] = mapped_column(Float, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, default=0.0)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=60)
    retry_policy: Mapped[dict] = mapped_column(JSON, default=dict)  # {max_attempts, backoff_base, max_delay}

    workflow: Mapped[WorkflowModel] = relationship("WorkflowModel", back_populates="nodes")


class WorkflowEdgeModel(Base):
    __tablename__ = "workflow_edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.id"), nullable=False, index=True)
    source_key: Mapped[str] = mapped_column(String(100), nullable=False)  # source node_key
    target_key: Mapped[str] = mapped_column(String(100), nullable=False)  # target node_key
    condition: Mapped[str | None] = mapped_column(String(255))  # optional expression

    workflow: Mapped[WorkflowModel] = relationship("WorkflowModel", back_populates="edges")


# ── Executions ───────────────────────────────────────────────────────────────

class ExecutionModel(Base):
    __tablename__ = "executions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued/running/success/failed/cancelled
    trigger: Mapped[str] = mapped_column(String(50), default="manual")
    environment: Mapped[str] = mapped_column(String(50), default="dev")
    platform: Mapped[str] = mapped_column(String(20), default="web")
    variables: Mapped[dict] = mapped_column(JSON, default=dict)  # initial variables
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    workflow: Mapped[WorkflowModel] = relationship("WorkflowModel", back_populates="executions")
    nodes: Mapped[list[ExecutionNodeModel]] = relationship(
        "ExecutionNodeModel", back_populates="execution", cascade="all, delete-orphan"
    )
    events: Mapped[list[ExecutionEventModel]] = relationship(
        "ExecutionEventModel", back_populates="execution", cascade="all, delete-orphan"
    )
    timeline: Mapped[list[ExecutionTimelineModel]] = relationship(
        "ExecutionTimelineModel", back_populates="execution", cascade="all, delete-orphan"
    )
    variable_snapshots: Mapped[list[VariableSnapshotModel]] = relationship(
        "VariableSnapshotModel", back_populates="execution", cascade="all, delete-orphan"
    )
    artifacts: Mapped[list[ArtifactModel]] = relationship(
        "ArtifactModel", back_populates="execution", cascade="all, delete-orphan"
    )
    queue_item: Mapped[ExecutionQueueModel | None] = relationship(
        "ExecutionQueueModel", back_populates="execution", cascade="all, delete-orphan"
    )
    runtime_leases: Mapped[list[RuntimeLeaseModel]] = relationship(
        "RuntimeLeaseModel", back_populates="execution", cascade="all, delete-orphan"
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

    execution: Mapped[ExecutionModel] = relationship("ExecutionModel", back_populates="nodes")


class ExecutionEventModel(Base):
    __tablename__ = "execution_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    node_key: Mapped[str | None] = mapped_column(String(100))
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="info")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    execution: Mapped[ExecutionModel] = relationship("ExecutionModel", back_populates="events")


class ExecutionTimelineModel(Base):
    __tablename__ = "execution_timeline"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    node_key: Mapped[str | None] = mapped_column(String(100))
    phase: Mapped[str] = mapped_column(String(50), nullable=False)  # queued/started/completed/failed/retrying
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    execution: Mapped[ExecutionModel] = relationship("ExecutionModel", back_populates="timeline")


class VariableSnapshotModel(Base):
    __tablename__ = "variable_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    node_key: Mapped[str | None] = mapped_column(String(100))
    variables: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    execution: Mapped[ExecutionModel] = relationship("ExecutionModel", back_populates="variable_snapshots")


# ── Artifacts ────────────────────────────────────────────────────────────────

class ArtifactModel(Base):
    """
    Indexed pointer to an execution artifact (screenshot, trace, request log…).
    The actual bytes live on disk under settings.artifact_dir/{execution_id}/…
    """
    __tablename__ = "execution_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(ForeignKey("executions.id"), nullable=False, index=True)
    node_key: Mapped[str | None] = mapped_column(String(100), index=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)         # ArtifactKind value
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    relative_path: Mapped[str] = mapped_column(String(512), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    artifact_metadata: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    execution: Mapped[ExecutionModel] = relationship("ExecutionModel", back_populates="artifacts")


# Distributed Runtime Fabric

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

    leases: Mapped[list[RuntimeLeaseModel]] = relationship(
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

    execution: Mapped[ExecutionModel] = relationship("ExecutionModel", back_populates="queue_item")


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

    execution: Mapped[ExecutionModel] = relationship("ExecutionModel", back_populates="runtime_leases")
    agent: Mapped[RuntimeAgentModel] = relationship("RuntimeAgentModel", back_populates="leases")


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


# Test Configuration

class TestProjectModel(Base):
    __tablename__ = "test_projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    modules: Mapped[list[TestModuleModel]] = relationship(
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

    project: Mapped[TestProjectModel] = relationship("TestProjectModel", back_populates="modules")
    test_cases: Mapped[list[TestCaseModel]] = relationship(
        "TestCaseModel",
        back_populates="module",
        cascade="all, delete-orphan",
        order_by="TestCaseModel.created_at",
    )


class TestCaseModel(Base):
    __tablename__ = "test_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    module_id: Mapped[str] = mapped_column(ForeignKey("test_modules.id"), nullable=False, index=True)
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

    module: Mapped[TestModuleModel] = relationship("TestModuleModel", back_populates="test_cases")
    test_steps: Mapped[list[TestStepModel]] = relationship(
        "TestStepModel",
        back_populates="test_case",
        cascade="all, delete-orphan",
        order_by="TestStepModel.step_order",
    )


class TestStepModel(Base):
    __tablename__ = "test_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    test_case_id: Mapped[str] = mapped_column(ForeignKey("test_cases.id"), nullable=False, index=True)
    step_order: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    intent: Mapped[str] = mapped_column(String(100), default="action")
    target: Mapped[str] = mapped_column(String(255), default="")
    expected_result: Mapped[str] = mapped_column(Text, default="")
    test_data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    bindings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    test_case: Mapped[TestCaseModel] = relationship("TestCaseModel", back_populates="test_steps")


# ── AI Intelligence ───────────────────────────────────────────────────────────

class IntelligenceJobModel(Base):
    """Tracks a single AI analysis job from submission through completion.

    One row per POST /intelligence/executions/{id}/analyze request.
    The evidence snapshot is stored here so replay is always possible even
    after the execution record changes.
    """
    __tablename__ = "intelligence_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    execution_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    # root_cause_analysis | flaky_detection | locator_healing | anomaly_analysis
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # queued → running → completed | failed
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    current_step: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
