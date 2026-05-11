# Plugin Contract Specification

## Plugin Boundary

Execution plugins own runtime-specific behavior. The workflow engine owns lifecycle, scheduling, retry, cancellation, persistence, and event routing.

The engine must never import runtime driver concepts from a plugin such as browser pages, HTTP clients, mobile sessions, or desktop automation handles.

## Plugin Identity

Each plugin must define:

- `name`: unique plugin key.
- `version`: plugin version.
- `description`: human-readable description.
- `node_specs()`: list of node types owned by the plugin.

## Node Spec Contract

Each node spec declares:

- `type`: globally unique node type.
- `plugin`: owning plugin key.
- `label`: display label.
- `category`: palette grouping.
- `description`: user-facing explanation.
- `icon`: symbolic icon key.
- `color`: UI accent color.
- `config_schema`: JSON schema-like configuration contract.
- `output_schema`: JSON schema-like output contract.
- `supports_retry`: whether engine retry is allowed.

Rules:

- Node type collisions are not allowed in product policy, even if the current registry logs and replaces collisions.
- The frontend must discover node types from plugin specs when possible.
- Config schemas are validation contracts, not only documentation.

## ExecutionEnvelope

The engine passes one immutable envelope per node execution:

- `execution_id`
- `workflow_id`
- `node_key`
- `node_label`
- `node_type`
- `config`
- `timeout_seconds`
- `attempt`
- `context`
- `artifacts`
- `log`
- `emit`
- `cancel_event`
- `session`

Rules:

- Plugins may read and write execution context only through `context`.
- Plugins may capture evidence only through `artifacts`.
- Plugins may stream logs only through `log`.
- Plugins may publish domain events only through `emit`.
- Plugins must respect `cancel_event`.
- `session` is plugin-scoped and execution-scoped.

## PluginResult

Plugins return:

- `success`: boolean node outcome.
- `duration_ms`: measured node runtime.
- `output`: structured node output.
- `error`: node error summary when failed.
- `metrics`: optional runtime metrics.
- `artifact_ids`: evidence ids produced by the node.

Rules:

- `success = false` is a normal node failure and may be retried by the engine.
- Raising `PluginExecutionError` indicates plugin infrastructure failure.
- Plugins do not directly update execution or node database rows.
- Plugins do not decide terminal execution status.

## Lifecycle Hooks

### on_register

Called when the plugin is registered.

Allowed:

- Validate local dependencies.
- Warm metadata.

Not allowed:

- Start execution-specific sessions.

### on_execution_start

Called once before an execution begins.

Allowed:

- Create execution-scoped plugin state.

### validate

Called before execution.

Allowed:

- Reject invalid node config with `PluginValidationError`.

### execute

Called for each node attempt.

Requirements:

- Complete within `timeout_seconds`.
- Respect `cancel_event`.
- Return `PluginResult`.
- Emit evidence events as work progresses.

### cancel

Best-effort cancellation hook.

### collect_artifacts

Called to finalize pending artifacts.

### on_execution_end

Called once after execution terminal state.

Requirements:

- Release sessions.
- Close clients, browser instances, and other runtime handles.

## Isolation Rules

- Plugins must not import orchestration engine internals other than the SDK contract.
- Plugins must not mutate SQLAlchemy models directly.
- Plugins must not bypass artifact recorder paths.
- Plugins must not publish websocket messages directly.
- Plugins must not store secrets in event payloads or artifact metadata.
- Plugins must redact sensitive request headers, tokens, passwords, cookies, and credentials.

## Current Plugin Scope

In Phase 1 to Phase 5:

- Web plugin is allowed.
- API plugin is allowed.

Blocked until later phases:

- Mobile runtime plugins.
- Desktop runtime plugins.
- Intent compilation plugins.
- Autonomous AI remediation plugins.

