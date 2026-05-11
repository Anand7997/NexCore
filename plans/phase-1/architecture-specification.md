# NEXUS QA Phase 1 Architecture Specification

## Product Boundary

NEXUS QA is an AI-powered unified execution intelligence platform. Its primary product is a realtime execution operating system for workflow engineering, orchestration observability, and evidence-backed investigation.

NEXUS QA is not a generic test management portal, a dashboard collection, or a framework-specific automation runner.

## Core Promise

Users define execution workflows once, observe their traversal in realtime, inspect node-level evidence, and later map business intent across platform-specific runtimes.

## Mandatory Layer Order

1. Workflow Engine
2. Business Intent Layer
3. Platform Adapter Layer
4. Execution Engines

The current implementation is allowed to contain workflow and execution plugin code, but the architecture boundary remains strict: the workflow engine must not depend on Playwright, Appium, WinAppDriver, httpx, or any future runtime-specific detail.

## System Layers

### Workflow Engine

Responsibilities:

- Store workflow graph definitions.
- Validate DAG shape and reject cycles.
- Resolve node readiness from dependencies.
- Own execution lifecycle, node lifecycle, retry, cancellation, skipping, and replay semantics.
- Persist execution state, timeline, events, variable snapshots, and artifacts.
- Publish realtime orchestration events.

Out of scope:

- Browser automation behavior.
- API request implementation details.
- Mobile or desktop driver semantics.
- AI autonomy or remediation.

### Business Intent Layer

Responsibilities:

- Define business-level actions independent of runtime.
- Maintain intent registry and capability requirements.
- Compile intent steps into adapter-ready execution plans.

Phase 1 status:

- Contract only. Runtime implementation is blocked until Phase 7.

### Platform Adapter Layer

Responsibilities:

- Translate intent or workflow node requirements into platform-specific executable node plans.
- Validate platform capability support.
- Report unsupported or partial mappings.

Phase 1 status:

- Contract only. Runtime implementation is blocked until Phase 7 and Phase 8.

### Execution Engines

Responsibilities:

- Execute concrete node types through registered plugins.
- Capture artifacts.
- Emit domain evidence events.
- Respect cancellation and timeout signals.

Current engines:

- Web plugin.
- API plugin.

Future engines:

- Mobile via Appium.
- Desktop via WinAppDriver or equivalent adapter.

## Workspace Architecture

The frontend is organized as a layered workspace shell:

- Requirements & Planning: product contracts and phase control.
- Workflow Development: workflow DAG authoring and simulation.
- Execution Monitoring: live execution graph, queue, node states, retries, timings, and event stream.
- AI Investigation: failure timeline, evidence, logs, traces, screenshots, and recommendations.
- Cross-Platform Matrix: web, mobile, desktop parity visualization.
- Reporting & Optimization: operational reports and later optimization loops.
- Environment & Integrations: runtimes, plugins, credentials, environments, and runner settings.

Each workspace must preserve one primary purpose and progressively reveal advanced details.

## Architectural Invariants

- Workflow definitions are graph data, not runtime scripts.
- Node type ownership belongs to plugins, not the orchestration core.
- The execution engine talks to plugins through `ExecutionEnvelope`, `PluginResult`, and plugin lifecycle methods.
- Events are append-only observations; state transitions are still owned by the engine.
- Artifacts are indexed metadata plus external bytes, never embedded directly in execution state.
- Plugin failures and node failures are distinct. Node failures may be retried; plugin defects are infrastructure failures.
- AI investigation consumes evidence after execution data exists; it does not own lifecycle transitions.

## Current Baseline Mapping

Implemented or partially implemented:

- SQLAlchemy persistence models for workflows, nodes, edges, executions, execution nodes, events, timeline, variable snapshots, and artifacts.
- DAG validation and dependency resolution.
- Node lifecycle state machine.
- Plugin SDK and registry.
- API and web plugins.
- Event dataclasses and websocket gateway.
- Frontend workspace shell with planning, workflow, execution, investigation, matrix, reporting, and settings routes.

Known contract gaps to harden in later phases:

- Execution status names differ between backend API DTOs and some frontend display types.
- Event version metadata is not yet included in event payloads.
- Workflow schema does not yet have a formal persisted schema version.
- Plugin node config schemas are exposed, but not yet enforced as canonical product schema documentation.

