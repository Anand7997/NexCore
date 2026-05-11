"""
ExecutionPlugin SDK — the contract every execution backend implements.

Design goals:
- The orchestration engine MUST NOT know about Playwright, httpx, mobile drivers, etc.
- A plugin is a self-contained execution domain (web, api, mobile, db, ai-action, ...).
- A plugin owns a set of node-types, each with its own JSON schema and runner.
- Plugins emit realtime events through an injected emitter (no direct event-bus
  coupling) and capture artifacts through an injected recorder.

Lifecycle, per node:
    1. validate(envelope)           — config sanity check, raises PluginValidationError
    2. execute(envelope)            — runs the node, returns PluginResult
       (can be cancelled via envelope.cancel_event)
    3. collect_artifacts(envelope)  — finalises any pending artifacts
"""
from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Awaitable, Callable, Protocol

from app.execution.artifacts import ArtifactRecorder
from app.orchestration.context import ExecutionContext


# ── Errors ──────────────────────────────────────────────────────────────────

class PluginError(Exception):
    """Base error for all plugin failures."""


class PluginValidationError(PluginError):
    """Raised when node config fails plugin validation."""


class PluginExecutionError(PluginError):
    """Raised when execution fails irrecoverably (not a normal node failure)."""


# ── Result envelope ─────────────────────────────────────────────────────────

@dataclass
class PluginResult:
    """
    Returned by `ExecutionPlugin.execute`.

    `success=False` is a *normal* node failure — the orchestration engine
    decides retry vs propagate. Raise PluginExecutionError to signal a plugin
    bug (never retried).
    """
    success: bool
    duration_ms: int
    output: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    metrics: dict[str, Any] = field(default_factory=dict)
    # Evidence pointers — populated by the plugin itself.
    artifact_ids: list[str] = field(default_factory=list)


# ── Emitter protocols ───────────────────────────────────────────────────────

class LogEmitter(Protocol):
    """Plugins call this to stream a log line to xterm.js."""

    async def __call__(
        self, level: str, message: str, *, source: str = "plugin"
    ) -> None: ...


class EventEmitter(Protocol):
    """
    Plugins call this to emit a domain event (BrowserAction, ApiCall, …).
    The engine wires these onto the global event bus + WS gateway.
    """

    async def __call__(self, event: Any) -> None: ...


# ── Per-node execution envelope ─────────────────────────────────────────────

@dataclass
class ExecutionEnvelope:
    """
    Everything a plugin needs to execute a single node, packaged together.

    Created by the engine, immutable from the plugin's perspective.
    """
    execution_id: str
    workflow_id: str
    node_key: str
    node_label: str
    node_type: str
    config: dict[str, Any]
    timeout_seconds: int
    attempt: int

    context: ExecutionContext
    artifacts: ArtifactRecorder
    log: LogEmitter
    emit: EventEmitter

    cancel_event: asyncio.Event

    # Plugin-scoped session storage — survives across nodes in the same
    # execution. Plugins use this for browser instances, http clients, etc.
    session: dict[str, Any] = field(default_factory=dict)


# ── Node spec — describes a node-type to the frontend palette ───────────────

@dataclass
class PluginNodeSpec:
    """
    Self-describing metadata for a node type.

    Exposed via /api/plugins so the frontend can render a node palette,
    config form, and validate input without hard-coding node types.
    """
    type: str                 # e.g. "web.navigate"
    plugin: str               # e.g. "web"
    label: str                # human label
    category: str             # e.g. "Web Automation"
    description: str
    icon: str = "circle"
    color: str = "#3b82f6"
    config_schema: dict[str, Any] = field(default_factory=dict)
    output_schema: dict[str, Any] = field(default_factory=dict)
    supports_retry: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "plugin": self.plugin,
            "label": self.label,
            "category": self.category,
            "description": self.description,
            "icon": self.icon,
            "color": self.color,
            "config_schema": self.config_schema,
            "output_schema": self.output_schema,
            "supports_retry": self.supports_retry,
        }


# ── Base plugin contract ────────────────────────────────────────────────────

class ExecutionPlugin(ABC):
    """
    Abstract base for all execution plugins.

    Subclasses MUST set a class-level `name` (used as the plugin key) and
    a `node_specs` list (the node types they own).
    """

    name: str = ""
    version: str = "1.0.0"
    description: str = ""

    def __init__(self) -> None:
        if not self.name:
            raise PluginError(f"{type(self).__name__} must define `name`")

    # ---- Discovery ---------------------------------------------------------

    @abstractmethod
    def node_specs(self) -> list[PluginNodeSpec]:
        """Return all node-types this plugin can execute."""

    def supports(self, node_type: str) -> bool:
        return any(spec.type == node_type for spec in self.node_specs())

    # ---- Lifecycle ---------------------------------------------------------

    async def on_register(self) -> None:
        """Called once when the plugin is registered (e.g. install browsers)."""

    async def on_execution_start(self, execution_id: str) -> None:
        """Called once when an execution begins, before any nodes run."""

    async def on_execution_end(self, execution_id: str) -> None:
        """Called once when an execution finishes — release per-execution state."""

    # ---- Per-node API ------------------------------------------------------

    async def validate(self, envelope: ExecutionEnvelope) -> None:
        """Default no-op validator. Override to reject bad configs early."""
        return None

    @abstractmethod
    async def execute(self, envelope: ExecutionEnvelope) -> PluginResult:
        """
        Execute the node. Must respect `envelope.cancel_event` and complete
        within `envelope.timeout_seconds`. Returns PluginResult.
        """

    async def cancel(self, envelope: ExecutionEnvelope) -> None:
        """
        Best-effort cancellation hook. The engine has already set
        `envelope.cancel_event`, so most plugins won't need to override this.
        """

    async def stream_logs(
        self, envelope: ExecutionEnvelope
    ) -> AsyncIterator[str]:
        """Optional log streaming hook (most plugins use envelope.log directly)."""
        if False:
            yield ""  # pragma: no cover — keeps generator typing happy

    async def collect_artifacts(
        self, envelope: ExecutionEnvelope
    ) -> list[str]:
        """
        Return ids of any final artifacts produced by this node. The engine
        already gets ids via PluginResult.artifact_ids, but plugins may
        publish a snapshot here (e.g. trace.zip for failed nodes).
        """
        return []

    # ---- Helpers -----------------------------------------------------------

    def __repr__(self) -> str:
        return f"<ExecutionPlugin name={self.name!r} version={self.version}>"
