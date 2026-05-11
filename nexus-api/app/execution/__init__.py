"""
NEXUS QA Execution Layer.

This package contains the pluggable execution intelligence layer that sits
ABOVE the orchestration engine. The orchestration engine is execution-framework
agnostic — it simply asks the registry: "who can run a node of type X?" and
delegates execution to the matching plugin.

Plugins live under `app.execution.plugins.<name>` and self-register on import
through `register_plugin()`.

Public surface:
    - ExecutionPlugin     (abstract base contract)
    - PluginRegistry      (dynamic registry)
    - PluginResult        (result dataclass)
    - ExecutionEnvelope   (per-node runtime container)
    - ArtifactRecorder    (artifact capture interface)
    - VariableInterpolator
"""
from app.execution.plugin import (
    ExecutionPlugin,
    ExecutionEnvelope,
    PluginResult,
    PluginNodeSpec,
)
from app.execution.registry import (
    PluginRegistry,
    register_plugin,
    get_plugin_for,
    list_plugins,
    list_node_specs,
)
from app.execution.artifacts import (
    Artifact,
    ArtifactKind,
    ArtifactRecorder,
    ArtifactStore,
)
from app.execution.interpolation import VariableInterpolator

__all__ = [
    "ExecutionPlugin",
    "ExecutionEnvelope",
    "PluginResult",
    "PluginNodeSpec",
    "PluginRegistry",
    "register_plugin",
    "get_plugin_for",
    "list_plugins",
    "list_node_specs",
    "Artifact",
    "ArtifactKind",
    "ArtifactRecorder",
    "ArtifactStore",
    "VariableInterpolator",
]
