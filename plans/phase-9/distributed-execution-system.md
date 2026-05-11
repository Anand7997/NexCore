# Phase 9 Distributed Execution System

## Scope Completed

Phase 9 adds a backend control plane for distributed execution while preserving the current local execution engine as a fallback runner. The system can now model runtime agents, queue executions, schedule work onto compatible agents, track active leases, and expose runtime health through APIs.

## Implemented Components

- Added distributed runtime database models:
  - `RuntimeAgentModel`
  - `ExecutionQueueModel`
  - `RuntimeLeaseModel`
- Added distributed scheduler service in `nexus-api/app/distributed/scheduler.py`.
- Added runtime fabric DTOs in `nexus-api/app/distributed/schemas.py`.
- Added runtime control-plane routes:
  - `POST /api/runtime/agents`
  - `POST /api/runtime/agents/{agent_id}/heartbeat`
  - `GET /api/runtime/agents`
  - `GET /api/runtime/queue`
  - `POST /api/runtime/queue/schedule`
  - `POST /api/runtime/executions/{execution_id}/schedule`
  - `GET /api/runtime/leases`
- Added runtime events:
  - `RuntimeAgentRegistered`
  - `RuntimeAgentHeartbeat`
  - `ExecutionQueued`
  - `ExecutionDispatched`
  - `RuntimeLeaseReleased`
- Connected execution trigger flow to distributed queue creation.
- Connected execution lifecycle to queue and lease state:
  - running execution marks queue item `running`
  - successful execution marks queue item `completed`
  - failed execution marks queue item `failed`
  - cancelled execution marks queue item `cancelled`
  - active runtime leases are released on terminal execution state

## Scheduler Behavior

The scheduler matches executions to agents using:

- platform
- required capabilities
- agent status
- heartbeat freshness
- active lease count
- max concurrency
- queue priority
- queue creation time

Queue states:

- `queued`
- `dispatched`
- `running`
- `completed`
- `failed`
- `cancelled`

Agent states:

- `idle`
- `ready`
- `busy`
- `offline`

Lease states:

- `active`
- `released`

## Agent Capability Model

Agents advertise capabilities such as:

- `web`
- `api`
- `android`
- `ios`
- `desktop`
- `mobile`
- `any`

Executions are queued with a platform and optional required capabilities. The scheduler only assigns work to agents that satisfy the platform and capability requirements.

## Current Runtime Behavior

The backend can now:

- register runtime workers
- receive heartbeats
- queue execution work
- assign compatible runtime capacity
- create execution leases
- expose queue and lease state to the UI
- release leases after execution termination

The existing local engine still runs execution work in-process. This keeps the development environment functional without requiring a remote fleet. The distributed fabric is now ready for the next hardening step: replacing local background launch with remote agent command dispatch.

## Guardrail

Phase 9 is complete as a backend distributed execution control plane. It does not yet include a separate long-running external agent process that polls leases and runs workflows outside the API process. That is the natural production hardening path before Phase 10 enterprise rollout.

## Verification

Commands run:

```powershell
python -m compileall nexus-api\app
```

```powershell
# Smoke: initialize runtime tables, register a web agent, enqueue a web execution,
# verify it is dispatched with one active lease.
```

Results:

- Python compilation passed.
- Plugin registration still reports `api`, `web`, `mobile`, and `desktop`.
- Scheduler smoke test produced one dispatched queue item and one active lease.
