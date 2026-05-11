# Canonical Entity and Schema Definitions

## Entity Model

### Workflow

Purpose:

- Persistent graph definition for an executable workflow.

Canonical fields:

- `id`: UUID string.
- `name`: human-readable name.
- `description`: optional detail.
- `status`: `draft`, `active`, or `archived`.
- `tags`: string list.
- `platforms`: list of target platforms.
- `variables`: default variable dictionary.
- `retry_policy`: workflow-level retry defaults.
- `created_at`: creation timestamp.
- `updated_at`: last mutation timestamp.
- `nodes`: ordered collection of workflow nodes.
- `edges`: directed dependencies between nodes.

Rules:

- A workflow must be a DAG.
- A workflow may have one or more root nodes.
- A workflow may have one or more leaf nodes.
- Node keys must be unique inside a workflow.
- Edges must reference existing node keys.

### Workflow Node

Purpose:

- Logical executable step inside a workflow graph.

Canonical fields:

- `id`: UUID string.
- `workflow_id`: parent workflow id.
- `node_key`: stable logical id inside the workflow.
- `type`: plugin-owned node type.
- `label`: display label.
- `description`: optional detail.
- `config`: plugin-owned configuration object.
- `position_x`: canvas x position.
- `position_y`: canvas y position.
- `timeout_seconds`: node timeout.
- `retry_policy`: node-level retry overrides.

Rules:

- The orchestration engine treats `type` as opaque except for plugin lookup.
- The plugin owns validation of `config`.
- `node_key` is the graph identity used by edges, execution nodes, events, and artifacts.

### Workflow Edge

Purpose:

- Directed dependency between workflow nodes.

Canonical fields:

- `id`: UUID string.
- `workflow_id`: parent workflow id.
- `source_key`: upstream node key.
- `target_key`: downstream node key.
- `condition`: optional expression controlling traversal.

Rules:

- Edges must not create cycles.
- Conditions must not mutate workflow state.
- Conditional semantics are deferred to execution logic and must be deterministic.

### Execution

Purpose:

- Runtime instance of a workflow.

Canonical fields:

- `id`: UUID string.
- `workflow_id`: source workflow id.
- `status`: `queued`, `running`, `success`, `failed`, or `cancelled`.
- `trigger`: `manual`, `scheduled`, `api`, `ci`, or another registered trigger.
- `environment`: target environment name.
- `platform`: target platform.
- `variables`: initial execution variables.
- `error`: terminal error summary when applicable.
- `started_at`: first running timestamp.
- `completed_at`: terminal timestamp.
- `created_at`: creation timestamp.

Rules:

- An execution is immutable in workflow structure after it starts; runtime state is tracked separately.
- Execution status derives from node outcomes and cancellation state.
- Execution status must be terminal exactly once.

### Execution Node

Purpose:

- Runtime state for a workflow node inside one execution.

Canonical fields:

- `id`: UUID string.
- `execution_id`: parent execution id.
- `node_key`: workflow node key.
- `node_label`: copied display label at execution time.
- `node_type`: copied node type at execution time.
- `status`: node lifecycle state.
- `attempt_count`: number of execution attempts.
- `started_at`: node start timestamp.
- `completed_at`: node terminal timestamp.
- `duration_ms`: execution duration.
- `output`: plugin output object.
- `error`: node error summary.

Rules:

- Runtime node records must preserve historical labels and types even if the workflow later changes.
- `output` can update execution variables only through the engine context contract.

### Execution Event

Purpose:

- Append-only event observation for realtime UI, auditability, and investigation.

Canonical fields:

- `id`: UUID string.
- `execution_id`: parent execution id.
- `node_key`: optional node key.
- `event_type`: event class or canonical name.
- `severity`: `debug`, `info`, `success`, `warn`, or `error`.
- `payload`: structured event payload.
- `timestamp`: event time.

Rules:

- Events are observations, not commands.
- Consumers must tolerate unknown event types.
- Event payloads must remain JSON serializable.

### Execution Timeline Entry

Purpose:

- Ordered lifecycle track used by monitoring and investigation views.

Canonical fields:

- `id`: UUID string.
- `execution_id`: parent execution id.
- `node_key`: optional node key.
- `phase`: lifecycle phase.
- `metadata`: structured details.
- `timestamp`: phase timestamp.

Rules:

- Timeline entries must be append-only.
- Timeline phase names should be stable and documented.

### Variable Snapshot

Purpose:

- Point-in-time execution variable state.

Canonical fields:

- `id`: UUID string.
- `execution_id`: parent execution id.
- `node_key`: optional producer node key.
- `variables`: full or partial variable dictionary.
- `created_at`: snapshot timestamp.

Rules:

- Snapshots are evidence and replay support, not primary mutable state.
- Variable values must be serializable and redactable.

### Artifact

Purpose:

- Indexed pointer to evidence bytes such as screenshots, traces, requests, responses, logs, or reports.

Canonical fields:

- `id`: UUID string.
- `execution_id`: parent execution id.
- `node_key`: optional producer node key.
- `kind`: artifact kind.
- `name`: display filename or title.
- `relative_path`: storage-relative path.
- `content_type`: MIME type.
- `size_bytes`: byte size.
- `metadata`: structured artifact metadata.
- `created_at`: capture timestamp.

Rules:

- Artifact bytes stay outside the relational execution row.
- Artifact metadata must be enough to render evidence lists without loading bytes.

## Canonical Enums

### Workflow Status

- `draft`: editable, not intended for production execution.
- `active`: executable.
- `archived`: hidden from normal authoring and execution flows.

### Execution Status

- `queued`: accepted but not started.
- `running`: at least one node has started and execution is not terminal.
- `success`: terminal, all required nodes completed or were skipped by valid rules.
- `failed`: terminal, at least one required node failed and no retry remains.
- `cancelled`: terminal, cancellation requested and accepted.

### Node Status

- `created`: runtime node record exists.
- `queued`: node is eligible for scheduling.
- `waiting`: node is blocked on dependencies.
- `running`: plugin is executing.
- `retrying`: retry delay or retry preparation is active.
- `completed`: node succeeded.
- `failed`: node failed.
- `cancelled`: node was cancelled.
- `skipped`: node was skipped by dependency or condition logic.

### Platform

- `web`
- `api`
- `android`
- `ios`
- `desktop`

Only `web` and `api` are in current runtime scope. Mobile and desktop are blocked until later phases.

