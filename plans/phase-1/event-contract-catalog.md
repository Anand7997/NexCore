# Event Contract Catalog

## Event Policy

Events are append-only observations emitted by the workflow engine, plugins, websocket gateway, and future intelligence layers.

Consumers must tolerate:

- Unknown event types.
- Additional fields.
- Missing optional fields.
- Out-of-order websocket delivery.

## Versioning Policy

Canonical event envelopes must include:

- `id`
- `type`
- `timestamp`
- event-specific fields
- `payload`

Target Phase 2/4 hardening:

- Add `schema_version` to emitted events.
- Keep backward-compatible fields for at least one minor product version.
- Add new optional fields instead of renaming existing fields.
- Breaking changes require a new event type or explicit version migration.

## Base Envelope

```json
{
  "id": "uuid",
  "type": "NodeStarted",
  "timestamp": "2026-05-07T00:00:00.000000",
  "payload": {}
}
```

## Workflow Events

### WorkflowCreated

Fields:

- `workflow_id`

Purpose:

- Notify that a workflow definition was created.

### WorkflowUpdated

Fields:

- `workflow_id`

Purpose:

- Notify that a workflow definition changed.

### WorkflowDeleted

Fields:

- `workflow_id`

Purpose:

- Notify that a workflow definition was deleted.

## Execution Events

### ExecutionStarted

Fields:

- `execution_id`
- `workflow_id`
- `workflow_name`
- `triggered_by`

Purpose:

- Mark execution traversal start.

### ExecutionCompleted

Fields:

- `execution_id`
- `workflow_id`
- `workflow_name`
- `duration_ms`

Purpose:

- Mark successful terminal completion.

### ExecutionFailed

Fields:

- `execution_id`
- `workflow_id`
- `workflow_name`
- `error`
- `failed_node_id`

Purpose:

- Mark failed terminal completion.

### ExecutionCancelled

Fields:

- `execution_id`
- `workflow_id`

Purpose:

- Mark cancelled terminal completion.

## Node Events

### NodeQueued

Fields:

- `execution_id`
- `node_id`
- `node_label`
- `node_type`

### NodeStarted

Fields:

- `execution_id`
- `node_id`
- `node_label`
- `node_type`
- `attempt`

### NodeCompleted

Fields:

- `execution_id`
- `node_id`
- `node_label`
- `node_type`
- `duration_ms`
- `output`

### NodeFailed

Fields:

- `execution_id`
- `node_id`
- `node_label`
- `node_type`
- `error`
- `attempt`
- `will_retry`

### NodeRetrying

Fields:

- `execution_id`
- `node_id`
- `node_label`
- `node_type`
- `attempt`
- `delay_ms`

### NodeSkipped

Fields:

- `execution_id`
- `node_id`
- `node_label`
- `reason`

## Plugin Evidence Events

### BrowserAction

Fields:

- `execution_id`
- `node_id`
- `action`
- `selector`
- `url`
- `duration_ms`
- `metadata`

Purpose:

- Stream web automation evidence without coupling the engine to Playwright.

### ApiCall

Fields:

- `execution_id`
- `node_id`
- `method`
- `url`
- `status_code`
- `duration_ms`
- `request_size`
- `response_size`
- `error`
- `metadata`

Purpose:

- Stream HTTP evidence without coupling the engine to httpx.

### ArtifactCaptured

Fields:

- `execution_id`
- `node_id`
- `artifact_id`
- `kind`
- `name`
- `content_type`
- `size_bytes`
- `metadata`

Purpose:

- Notify clients that evidence bytes are indexed and available.

### VariableSet

Fields:

- `execution_id`
- `node_id`
- `variables`

Purpose:

- Notify clients of execution-context variable updates.

## AI and Realtime Events

### AIAnalysisGenerated

Fields:

- `execution_id`
- `insight_type`
- `title`
- `confidence`
- `severity`

Purpose:

- Notify clients that an explainable investigation output exists.

### TerminalLog

Fields:

- `execution_id`
- `node_id`
- `level`
- `message`
- `source`

Purpose:

- Stream terminal output into contextual terminal surfaces.

### WebSocketConnected

Fields:

- `client_id`

### WebSocketDisconnected

Fields:

- `client_id`

