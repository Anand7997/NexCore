# Phase 4 Orchestration Engine Hardening

## Scope

Phase 4 hardens the workflow orchestration engine while keeping runtime automation details isolated behind plugins or simulator fallback.

Out of scope:

- New browser, API, mobile, or desktop automation behavior.
- AI investigation logic.
- Intent abstraction.
- Distributed execution.

## Current Engine Capabilities

Implemented in `nexus-api/app/orchestration/engine.py`:

- Execution loading and workflow DAG construction.
- DAG traversal by dependency readiness.
- Concurrent node execution per ready wave.
- Node retry orchestration.
- Cancellation signaling.
- Failure propagation through skipped descendants.
- Timeline persistence.
- Variable propagation through `ExecutionContext`.
- Variable snapshot persistence.
- Event publication through event bus.
- Plugin dispatch with simulator fallback.
- Artifact persistence and event publication.

## Phase 4 Hardening Changes

### Workflow DAG Validation at Persistence Boundary

Implemented in:

- `nexus-api/app/domain/workflows/repository.py`
- `nexus-api/app/api/routes/workflows.py`

Behavior:

- Rejects duplicate `node_key` values.
- Rejects edges that reference unknown node keys.
- Rejects cycles through `DAGGraph`.
- Returns HTTP 400 for invalid workflow graph saves.

Why:

- Invalid graph definitions must not be persisted and discovered only at execution time.

### Node Lifecycle Enforcement

Implemented in:

- `nexus-api/app/orchestration/engine.py`

Behavior:

- Runtime nodes are queued before traversal.
- Node status updates now pass through the state machine transition contract.
- Invalid node transitions raise `StateMachineError` and are logged.
- Completion must legally transition into `completed`.

Why:

- The state machine is now an enforced lifecycle contract, not only documentation.

## DAG Traversal Contract

Traversal behavior:

1. Build executable DAG from persisted workflow nodes and edges.
2. Ensure execution node rows exist.
3. Mark runtime nodes as queued.
4. Resolve ready nodes from dependency closure.
5. Launch all newly ready nodes concurrently.
6. Wait for at least one running node to finish.
7. Mark success or failure.
8. Skip nodes blocked by failed predecessors.
9. Finish execution as success only when no permanent failures remain.

## Retry Contract

Implemented in:

- `nexus-api/app/orchestration/retry.py`
- `nexus-api/app/orchestration/engine.py`

Behavior:

- Engine owns retry decisions.
- Plugins return node failure; plugins do not schedule retries.
- `NodeRetrying` events include next attempt and delay.
- Retry delay uses exponential backoff and optional jitter.

## Cancellation Contract

Implemented in:

- `ExecutionEngine.cancel`
- `ExecutionEnvelope.cancel_event`

Behavior:

- Active node tasks are cancelled.
- Plugin path receives cancellation through envelope event.
- Execution can transition to cancelled on engine cancellation.

## Event Bus and WebSocket Contract

Implemented in:

- `nexus-api/app/events/bus.py`
- `nexus-api/app/events/types.py`
- `nexus-api/app/realtime/gateway.py`

Behavior:

- Engine and plugins publish typed events.
- Event bus broadcasts to websocket gateway.
- Frontend consumes execution, node, terminal, artifact, browser, API, and variable events.

Phase 4 note:

- Event version metadata is documented in Phase 1 and remains a future hardening item.

## Timeline and Variable Propagation

Implemented in:

- `ExecutionTimelineModel`
- `VariableSnapshotModel`
- `ExecutionContext`

Behavior:

- Lifecycle phases are appended to execution timeline.
- Plugin output updates execution context.
- Variable snapshots persist after node output.
- `VariableSet` event publishes changed variables.

## Replay Model

Current replay surfaces:

- Event bus has in-memory replay support through broker replay.
- Persisted timeline provides execution phase replay.
- Simulator fallback allows deterministic-ish workflow traversal without real runtime plugin support.

Phase 4 limitation:

- Full deterministic execution replay is not yet a separate API surface.
- Phase 6 or later can build richer evidence replay from persisted timeline, events, artifacts, and variable snapshots.

## Verification

Commands run:

```powershell
python -c "import ast, pathlib; [ast.parse(p.read_text(encoding='utf-8')) for p in pathlib.Path('app').rglob('*.py')]; print('AST OK')"
```

```powershell
$env:DEBUG='false'; <workflow validation smoke test>
```

Results:

- Python AST parse passed.
- State machine transition smoke test passed.
- Workflow validation rejected dangling edges.
- Workflow validation rejected cycles.

Local environment note:

- The current local `.env` contains `DEBUG=release`, which Pydantic cannot parse as a boolean. Verification overrode `DEBUG=false` for the smoke test only.

