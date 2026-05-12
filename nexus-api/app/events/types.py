"""Typed event definitions for the orchestration event bus."""
from __future__ import annotations
from dataclasses import dataclass, field, fields, is_dataclass, asdict
from datetime import datetime
from typing import Any
import uuid


def _now() -> datetime:
    return datetime.utcnow()


def _uid() -> str:
    return str(uuid.uuid4())


def _serialize(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_serialize(v) for v in value]
    return value


@dataclass
class BaseEvent:
    id: str = field(default_factory=_uid)
    timestamp: datetime = field(default_factory=_now)
    payload: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        # Serialise every dataclass field so subclass fields (execution_id,
        # node_id, etc.) are present in the WS payload — the frontend
        # depends on them to drive live state.
        out: dict[str, Any] = {
            "id": self.id,
            "type": self.__class__.__name__,
            "timestamp": self.timestamp.isoformat(),
        }
        for f in fields(self):
            if f.name in {"id", "timestamp"}:
                continue
            out[f.name] = _serialize(getattr(self, f.name))
        return out


# ── Workflow events ──────────────────────────────────────────────────────────

@dataclass
class WorkflowCreated(BaseEvent):
    workflow_id: str = ""


@dataclass
class WorkflowUpdated(BaseEvent):
    workflow_id: str = ""


@dataclass
class WorkflowDeleted(BaseEvent):
    workflow_id: str = ""


# ── Execution events ─────────────────────────────────────────────────────────

@dataclass
class ExecutionStarted(BaseEvent):
    execution_id: str = ""
    workflow_id: str = ""
    workflow_name: str = ""
    triggered_by: str = "manual"


@dataclass
class ExecutionCompleted(BaseEvent):
    execution_id: str = ""
    workflow_id: str = ""
    workflow_name: str = ""
    duration_ms: int = 0


@dataclass
class ExecutionFailed(BaseEvent):
    execution_id: str = ""
    workflow_id: str = ""
    workflow_name: str = ""
    error: str = ""
    failed_node_id: str | None = None


@dataclass
class ExecutionCancelled(BaseEvent):
    execution_id: str = ""
    workflow_id: str = ""


@dataclass
class RuntimeAgentRegistered(BaseEvent):
    agent_id: str = ""
    name: str = ""
    agent_type: str = ""
    capabilities: list[str] = field(default_factory=list)


@dataclass
class RuntimeAgentHeartbeat(BaseEvent):
    agent_id: str = ""
    status: str = ""
    active_leases: int = 0


@dataclass
class ExecutionQueued(BaseEvent):
    execution_id: str = ""
    queue_id: str = ""
    platform: str = ""
    priority: int = 100
    required_capabilities: list[str] = field(default_factory=list)


@dataclass
class ExecutionDispatched(BaseEvent):
    execution_id: str = ""
    queue_id: str = ""
    agent_id: str = ""
    lease_id: str = ""
    platform: str = ""


@dataclass
class RuntimeLeaseReleased(BaseEvent):
    execution_id: str = ""
    agent_id: str = ""
    lease_id: str = ""
    final_status: str = ""


# ── Node events ──────────────────────────────────────────────────────────────

@dataclass
class NodeQueued(BaseEvent):
    execution_id: str = ""
    node_id: str = ""
    node_label: str = ""
    node_type: str = ""


@dataclass
class NodeStarted(BaseEvent):
    execution_id: str = ""
    node_id: str = ""
    node_label: str = ""
    node_type: str = ""
    attempt: int = 1


@dataclass
class NodeCompleted(BaseEvent):
    execution_id: str = ""
    node_id: str = ""
    node_label: str = ""
    node_type: str = ""
    duration_ms: int = 0
    output: dict[str, Any] = field(default_factory=dict)


@dataclass
class NodeFailed(BaseEvent):
    execution_id: str = ""
    node_id: str = ""
    node_label: str = ""
    node_type: str = ""
    error: str = ""
    attempt: int = 1
    will_retry: bool = False


@dataclass
class NodeRetrying(BaseEvent):
    execution_id: str = ""
    node_id: str = ""
    node_label: str = ""
    node_type: str = ""
    attempt: int = 1
    delay_ms: int = 0


@dataclass
class NodeSkipped(BaseEvent):
    execution_id: str = ""
    node_id: str = ""
    node_label: str = ""
    reason: str = ""


# ── AI events ────────────────────────────────────────────────────────────────

@dataclass
class AIAnalysisGenerated(BaseEvent):
    execution_id: str = ""
    insight_type: str = ""
    title: str = ""
    confidence: float = 0.0
    severity: str = "info"


@dataclass
class AIJobQueued(BaseEvent):
    """Fired the moment a new AI analysis job is accepted."""
    job_id: str = ""
    execution_id: str = ""
    job_type: str = ""
    tenant_id: str = ""


@dataclass
class AIJobProgress(BaseEvent):
    """Fired after each LangGraph node completes — drives the frontend progress bar."""
    job_id: str = ""
    execution_id: str = ""
    step: str = ""          # gather_evidence | classify_failure | … | completed | failed
    progress: float = 0.0   # 0.0 → 1.0
    detail: str = ""        # last analysis_steps entry or human-readable description


@dataclass
class AIJobCompleted(BaseEvent):
    """Fired when all LangGraph nodes finish and the result is persisted."""
    job_id: str = ""
    execution_id: str = ""
    job_type: str = ""
    confidence: float = 0.0
    summary: str = ""
    findings: list[dict[str, Any]] = field(default_factory=list)
    recommendations: list[dict[str, Any]] = field(default_factory=list)


# ── Terminal / realtime events ───────────────────────────────────────────────

@dataclass
class TerminalLog(BaseEvent):
    execution_id: str = ""
    node_id: str | None = None
    level: str = "info"
    message: str = ""
    source: str = "orchestrator"


@dataclass
class WebSocketConnected(BaseEvent):
    client_id: str = ""


@dataclass
class WebSocketDisconnected(BaseEvent):
    client_id: str = ""


# ── Plugin / execution-evidence events ───────────────────────────────────────

@dataclass
class BrowserAction(BaseEvent):
    """Live browser action — emitted by WebExecutionPlugin per Playwright step."""
    execution_id: str = ""
    node_id: str = ""
    action: str = ""               # navigate/click/fill/screenshot/...
    selector: str | None = None
    url: str | None = None
    duration_ms: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ApiCall(BaseEvent):
    """Live HTTP call — emitted by APIExecutionPlugin per request/response."""
    execution_id: str = ""
    node_id: str = ""
    method: str = "GET"
    url: str = ""
    status_code: int | None = None
    duration_ms: int = 0
    request_size: int = 0
    response_size: int = 0
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class MobileAction(BaseEvent):
    """Live mobile action emitted by Appium-backed mobile execution."""
    execution_id: str = ""
    node_id: str = ""
    platform: str = "android"
    action: str = ""
    selector: str | None = None
    duration_ms: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class DesktopAction(BaseEvent):
    """Live desktop action emitted by WinAppDriver-backed execution."""
    execution_id: str = ""
    node_id: str = ""
    action: str = ""
    selector: str | None = None
    duration_ms: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ArtifactCaptured(BaseEvent):
    """A new artifact (screenshot, trace, response body, …) is available."""
    execution_id: str = ""
    node_id: str | None = None
    artifact_id: str = ""
    kind: str = ""
    name: str = ""
    content_type: str = ""
    size_bytes: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class VariableSet(BaseEvent):
    """Shared-context variable updated by a node (drives the live var panel)."""
    execution_id: str = ""
    node_id: str | None = None
    variables: dict[str, Any] = field(default_factory=dict)


# Registry for deserialization by type name
EVENT_REGISTRY: dict[str, type[BaseEvent]] = {
    cls.__name__: cls for cls in [
        WorkflowCreated, WorkflowUpdated, WorkflowDeleted,
        ExecutionStarted, ExecutionCompleted, ExecutionFailed, ExecutionCancelled,
        RuntimeAgentRegistered, RuntimeAgentHeartbeat, ExecutionQueued,
        ExecutionDispatched, RuntimeLeaseReleased,
        NodeQueued, NodeStarted, NodeCompleted, NodeFailed, NodeRetrying, NodeSkipped,
        AIAnalysisGenerated, AIJobQueued, AIJobProgress, AIJobCompleted,
        TerminalLog, WebSocketConnected, WebSocketDisconnected,
        BrowserAction, ApiCall, MobileAction, DesktopAction, ArtifactCaptured, VariableSet,
    ]
}
