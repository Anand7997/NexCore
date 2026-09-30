# .NET Control Plane as Single Runtime-Agent Registry

Date: 2026-09-29
Status: Implemented

## Goal

One reliable control plane. .NET (port 3001) owns runtime agents, leases,
execution queue, agent commands and runtime audit, persisted in PostgreSQL.
FastAPI (port 8000) stays the Python AI/execution service and registers its
workers with .NET. Dashboards talk only to .NET. NATS JetStream carries
durable jobs/events when available.

```
Frontend (Nexus-Advanced :3000, Nexus-Modern :3002)
   |  all /api/* and /ws
   v
.NET Control Plane :3001
   |-- owns: /api/runtime/*, /api/ai/jobs, /api/intent/*, legacy test mgmt
   |-- PostgreSQL: runtime_agents, runtime_leases, execution_queue,
   |               runtime_agent_commands, runtime_agent_events, audit_logs, ai_jobs
   |-- NATS JetStream (optional): NEXUS_RUNTIME (nexus.runtime.>), NEXUS_AI (ai.>)
   |-- reverse proxy (YARP): every other /api/* and /ws -> FastAPI :8000
   v
FastAPI :8000 (internal)          Python workers (python -m app.worker_runtime)
   |-- AI, OCR/CV, executions      |-- register/heartbeat/commands -> .NET
   |-- embedded runtime worker     |-- run Playwright/API/mobile/desktop engine
```

## Decisions

1. **Single registry.** FastAPI `/api/runtime/*` router removed. The Python
   `DistributedScheduler` is replaced by `ControlPlaneClient` (HTTP to .NET).
   `desktop_agents` (desktop recorder routing) is out of scope and unchanged.
2. **Schema compatibility.** .NET reuses the existing `runtime_agents`,
   `execution_queue`, `runtime_leases`, `audit_logs` tables (same columns as the
   SQLAlchemy models; `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`
   for `tenant_id`, `variables`). New tables: `runtime_agent_commands`,
   `runtime_agent_events`, `ai_jobs`. Timestamps are naive UTC `TIMESTAMP`
   like the Python models.
3. **Contract.** Runtime JSON is snake_case and matches what the UIs already
   consume (`id, name, status, agent_type, endpoint, version, capabilities,
   labels, max_concurrency, active_leases, last_heartbeat_at, registered_at`).
4. **Stable agent identity.** Registration is an upsert by `id`. Workers send
   `uuid5(hostname/AGENT_ID)` so restarts reuse the same row.
5. **Liveness.** `RuntimeReaper` (BackgroundService, every 10s):
   agents silent > 45s become `offline`; their leases become `expired`;
   dispatched-not-started queue items are requeued; running ones are failed
   (`Runtime agent lost`); delivered-but-unacked commands older than 60s are
   redelivered (max 5 attempts); queued items are rescheduled.
6. **Dispatch.** Scheduling runs in one transaction using
   `FOR UPDATE SKIP LOCKED` on the queue and row locks on agents. Match rule:
   same tenant, status idle/ready, fresh heartbeat, free slot, capability
   contains platform (or `any`) and all required capabilities. Dispatch inserts
   a lease and a `run_execution` command.
7. **Commands.** `GET /agents/{id}/commands` atomically claims pending commands
   (`pending -> delivered`). Worker acks with `completed|failed`. Postgres is the
   source of truth; NATS only wakes the worker immediately
   (`nexus.runtime.agents.{id}.commands`). Without NATS the worker polls every 2s.
8. **Executions.** FastAPI no longer launches executions inline. Trigger =
   create execution row + `POST /api/runtime/executions/{id}/schedule` on .NET.
   FastAPI runs an embedded runtime worker (on by default,
   `EMBEDDED_WORKER_ENABLED`) so a two-process dev setup still executes.
   If .NET is unreachable the trigger returns 503 and the execution is marked failed.
   The engine reports `running`/`finish` to .NET. Cancel sends a
   `cancel_execution` command to the lease holder.
9. **Realtime.** Dashboards connect to `ws://localhost:3001/ws` (proxied to
   FastAPI). Standalone workers relay their execution events over NATS
   (`nexus.events.execution`) and FastAPI rebroadcasts them to WS clients.
   .NET publishes runtime events (`nexus.runtime.events.*`), which FastAPI also
   rebroadcasts.
10. **AI jobs.** `/api/ai/jobs` is persisted in `ai_jobs`. When NATS is up,
    .NET publishes to `ai.jobs` (JetStream stream `NEXUS_AI`) and consumes
    `ai.results`/`ai.progress` via durable consumers. The Python AI runner uses a
    durable JetStream consumer (`ai-workers`) so jobs survive worker restarts.
11. **Front door.** .NET proxies all non-owned `/api/*` and `/ws` to FastAPI
    (YARP), so both dashboards use one base URL: `http://localhost:3001`.
    Explicit .NET routes win over the proxy catch-all. `x-user-roles` is copied
    to `x-roles` for FastAPI.

## Out of scope (later phases)

Moving auth/JWT, projects, executions, workflows and the audit API from FastAPI
into .NET. EF Core migrations. `desktop_agents` consolidation.

## Testing

- .NET: xunit integration tests against local PostgreSQL in an isolated schema
  (register/upsert, heartbeat, dispatch + claim + ack, reaper expiry/requeue).
- Python: pytest for the worker (register uuid5 id, heartbeat, command claim,
  run/cancel handler, ack) and the control-plane client, with `httpx.MockTransport`.
- Manual: start .NET + FastAPI, verify agent appears via `GET :3001/api/runtime/agents`,
  trigger an execution, verify queue -> dispatched -> running -> completed.
