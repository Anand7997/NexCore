# Database Schema Specification

## Overview

The current persistence model is a relational orchestration store with JSON fields for extensible node config, output, event payloads, variables, and metadata.

## Tables

### workflows

Primary key:

- `id`

Columns:

- `name`
- `description`
- `status`
- `tags`
- `platforms`
- `variables`
- `retry_policy`
- `created_at`
- `updated_at`

Relationships:

- One workflow has many workflow nodes.
- One workflow has many workflow edges.
- One workflow has many executions.

Indexes:

- Primary key on `id`.

### workflow_nodes

Primary key:

- `id`

Columns:

- `workflow_id`
- `node_key`
- `type`
- `label`
- `description`
- `config`
- `position_x`
- `position_y`
- `timeout_seconds`
- `retry_policy`

Relationships:

- Many workflow nodes belong to one workflow.

Indexes:

- `workflow_id`

Required future constraint:

- Unique `(workflow_id, node_key)`.

### workflow_edges

Primary key:

- `id`

Columns:

- `workflow_id`
- `source_key`
- `target_key`
- `condition`

Relationships:

- Many workflow edges belong to one workflow.

Indexes:

- `workflow_id`

Required future constraints:

- `source_key` and `target_key` must reference node keys inside the same workflow.
- Unique `(workflow_id, source_key, target_key, condition)`.

### executions

Primary key:

- `id`

Columns:

- `workflow_id`
- `status`
- `trigger`
- `environment`
- `platform`
- `variables`
- `error`
- `started_at`
- `completed_at`
- `created_at`

Relationships:

- Many executions belong to one workflow.
- One execution has many execution nodes.
- One execution has many execution events.
- One execution has many timeline entries.
- One execution has many variable snapshots.
- One execution has many artifacts.

Indexes:

- `workflow_id`

### execution_nodes

Primary key:

- `id`

Columns:

- `execution_id`
- `node_key`
- `node_label`
- `node_type`
- `status`
- `attempt_count`
- `started_at`
- `completed_at`
- `duration_ms`
- `output`
- `error`

Relationships:

- Many execution nodes belong to one execution.

Indexes:

- `execution_id`

Required future constraint:

- Unique `(execution_id, node_key)`.

### execution_events

Primary key:

- `id`

Columns:

- `execution_id`
- `node_key`
- `event_type`
- `severity`
- `payload`
- `timestamp`

Relationships:

- Many execution events belong to one execution.

Indexes:

- `execution_id`

Recommended future indexes:

- `(execution_id, timestamp)`
- `(execution_id, node_key)`
- `(event_type, timestamp)`

### execution_timeline

Primary key:

- `id`

Columns:

- `execution_id`
- `node_key`
- `phase`
- `metadata`
- `timestamp`

Relationships:

- Many timeline entries belong to one execution.

Indexes:

- `execution_id`

Recommended future index:

- `(execution_id, timestamp)`

### variable_snapshots

Primary key:

- `id`

Columns:

- `execution_id`
- `node_key`
- `variables`
- `created_at`

Relationships:

- Many variable snapshots belong to one execution.

Indexes:

- `execution_id`

Recommended future index:

- `(execution_id, created_at)`

### execution_artifacts

Primary key:

- `id`

Columns:

- `execution_id`
- `node_key`
- `kind`
- `name`
- `relative_path`
- `content_type`
- `size_bytes`
- `metadata`
- `created_at`

Relationships:

- Many artifacts belong to one execution.

Indexes:

- `execution_id`
- `node_key`

Recommended future indexes:

- `(execution_id, kind)`
- `(execution_id, created_at)`

## Migration Requirements

Future migrations must add:

- Workflow schema version.
- Event schema version.
- Unique constraints for graph identity.
- Optional organization, project, and tenant boundaries in Phase 10.
- Redaction metadata for sensitive variables and artifacts.

