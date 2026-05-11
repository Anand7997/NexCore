# NEXUS QA Enterprise Backend Architecture

## 1. Product Definition

NEXUS QA is an AI-powered unified execution intelligence platform. The backend is an execution operating system for business-intent compilation, durable orchestration, distributed runtime execution, realtime observability, and AI-assisted investigation.

It is not a Selenium wrapper, Jenkins alternative, CRUD backend, test management system, or traditional automation framework.

The backend must feel like a combination of Temporal, Datadog, Airflow, Kubernetes control plane, Palantir Foundry, LangGraph, and a modern observability platform.

Core properties:

- Realtime by default.
- Event-driven internally.
- Durable for long-running workflows.
- Distributed at the execution edge.
- Modular monolith at the product core.
- AI-native for analysis, healing, and investigation.
- Observable across orchestration, executor, infrastructure, and AI layers.

## 2. Architecture Style

Use a modular monolith with an event-driven core and distributed execution fabric.

Do not begin with microservices. The first production architecture should keep domain modules in one NestJS backend while separating concerns through clear module boundaries, internal events, Temporal workflows, and runtime agents.

The distributed boundary belongs around executor runtime nodes, device agents, browser pools, desktop agents, telemetry collectors, and AI workers when they require independent scaling.

## 2.1 Ecosystem Ownership Boundary

The platform uses two ecosystems with strict ownership rules.

### TypeScript / Next.js / NestJS Ownership

TypeScript owns the product and execution control plane.

Responsibilities:

- Product experience and all user-facing workflows.
- Next.js frontend application.
- NestJS backend control plane.
- Workflow orchestration APIs.
- Temporal workflow definitions and orchestration commands.
- Execution scheduling and runtime lease control.
- Realtime gateways and UI streaming contracts.
- REST and GraphQL API contracts.
- Auth, tenancy, RBAC, audit, and enterprise integrations.
- Event contracts, DTOs, schemas, and frontend/backend type safety.
- Runtime registry, executor capability matching, and dispatch decisions.

TypeScript must not own:

- OCR algorithms.
- Computer vision processing.
- ML model execution.
- LLM agent reasoning loops.
- Embedding generation.
- Heavy image/PDF analysis.

### Python Ownership

Python owns intelligence and analysis workers.

Responsibilities:

- AI investigation workers.
- LangGraph workflows.
- OCR using Tesseract and related tooling.
- Computer vision using OpenCV or similar libraries.
- ML inference and anomaly detection.
- Embedding generation and vector memory enrichment.
- Pytest validation workers.
- AI assertion generation.
- Locator healing analysis.
- Screenshot, PDF, image, and document intelligence.

Python must not own:

- Product API routing.
- Workflow orchestration control plane.
- Tenant, RBAC, or enterprise policy decisions.
- Realtime UI gateway ownership.
- Execution scheduling authority.
- Frontend/backend product contracts.

### Boundary Rule

TypeScript sends commands and evidence to Python workers. Python workers return structured insights, artifacts, scores, patches, and recommendations. Python never directly mutates workflow state, execution state, tenant policy, or product contracts. All mutations flow back through the TypeScript/NestJS control plane.

## 3. Mandatory Layer Order

```text
Workflow Engine
  -> Business Intent Layer
  -> Execution Compiler
  -> Executor Abstraction Layer
  -> Runtime Executors
  -> Playwright | Appium | WinAppDriver | Pytest | OCR | AI Validation
```

Rules:

- The workflow engine must never import Playwright, Appium, WinAppDriver, Selenium, Pytest, OCR, or runtime-specific SDKs.
- Temporal owns durable orchestration state, retries, replay, long-running execution, and workflow recovery.
- NestJS owns product APIs, command routing, domain modules, auth, realtime gateways, ingestion, projections, and integration with infrastructure.
- Executors run as isolated runtime workers or agents.
- Every executor reports through the unified execution event model.

## 4. High-Level System Topology

```text
UI / CLI / API Clients
  -> NestJS API Gateway
      -> REST Commands
      -> Apollo GraphQL Intelligence Queries
      -> Socket.IO Realtime Streams
      -> Auth / RBAC / Tenant Guards
  -> Application Modules
      -> Workflow
      -> Business Intent
      -> Execution Compiler
      -> Execution Fabric
      -> Runtime Registry
      -> AI Gateway / Intelligence Contracts
      -> Observability
      -> Artifacts
      -> Search
      -> Integrations
  -> Temporal Client
      -> Temporal Workflows
      -> Temporal Activities
      -> Temporal Workers
  -> Event Bus
      -> NATS subjects
      -> future Kafka topics
  -> Data Layer
      -> PostgreSQL
      -> ClickHouse
      -> Neo4j
      -> Qdrant
      -> Meilisearch
      -> MinIO
  -> Distributed Runtime Fabric
      -> Playwright Agents
      -> Appium Device Agents
      -> Desktop Agents
      -> Pytest Workers
      -> OCR Workers
      -> AI / ML / CV Workers
  -> Observability Stack
      -> OpenTelemetry
      -> Prometheus
      -> Grafana
      -> Loki
```

## 4.1 Current Repository Migration Note

The current repository contains a Python FastAPI backend under `nexus-api/` that temporarily owns orchestration, realtime streaming, execution control, plugins, distributed scheduling, and enterprise APIs. That implementation is useful as a prototype and contract reference, but it is not the final ecosystem boundary.

Migration target:

- Move product control-plane responsibilities from Python FastAPI to TypeScript/NestJS.
- Keep the existing Python modules as references while extracting AI, OCR, CV, ML, and Pytest worker responsibilities.
- Preserve event contracts and behavior while migrating ownership.
- Do not expand Python control-plane code further except as a compatibility bridge during migration.

## 5. NestJS Backend Module Structure

Recommended repository structure:

```text
nexus-api/
  src/
    main.ts
    app.module.ts
    config/
    common/
      auth/
      tenancy/
      guards/
      decorators/
      errors/
      logging/
      validation/
      tracing/
      events/
      ids/
    infrastructure/
      postgres/
      clickhouse/
      neo4j/
      qdrant/
      nats/
      temporal/
      minio/
      meilisearch/
      keycloak/
      otel/
    modules/
      identity/
      tenants/
      projects/
      workflows/
      dag/
      orchestration/
      business-intent/
      compiler/
      execution-fabric/
      executor-registry/
      runtime-agents/
      telemetry/
      observability/
      artifacts/
      ai-gateway/
      investigation/
      search/
      integrations/
      audit/
      realtime/
      terminal/
    temporal/
      workflows/
      activities/
      workers/
      signals/
      queries/
    contracts/
      events/
      commands/
      schemas/
      executor/
      telemetry/
      ai/
      python-worker/
    graphql/
    migrations/
    test/
```

Module rules:

- `contracts/` contains versioned DTOs and schemas shared across modules.
- `infrastructure/` wraps external systems and exposes domain-safe providers.
- `modules/*` contains domain logic and application services.
- `temporal/` contains Temporal workflows and activities, but workflows should call activities rather than direct infrastructure clients.
- Runtime-specific implementation belongs in runtime agents, not the orchestration core.
- AI, OCR, CV, ML, and Pytest execution contracts are defined in TypeScript, but their runtime implementation lives in Python workers.

## 6. Domain-Driven Modules

### Identity Module

Purpose:

- Integrate Keycloak.
- Resolve users, groups, roles, service accounts, and agent identities.
- Enforce tenant-aware authorization.

Entities:

- UserProfile
- TenantMembership
- RoleBinding
- ServiceAccount
- AgentPrincipal

### Tenant Module

Purpose:

- Tenant isolation.
- Tenant runtime quotas.
- Tenant database partitioning rules.
- Tenant-specific execution policies.

Entities:

- Tenant
- TenantPolicy
- TenantQuota
- TenantRuntimePool

### Project Module

Purpose:

- Organize workflows, test cases, environments, integrations, and execution policies.

Entities:

- Project
- Environment
- RuntimeConfiguration
- SecretReference
- IntegrationBinding

### Workflow Module

Purpose:

- Store workflow definitions.
- Version workflows.
- Validate workflow contracts.
- Manage workflow publication lifecycle.

Entities:

- WorkflowDefinition
- WorkflowVersion
- WorkflowNode
- WorkflowEdge
- WorkflowVariable
- WorkflowInputSchema

### DAG Module

Purpose:

- Validate DAG shape.
- Reject cycles.
- Compute node readiness.
- Support dependency traversal.
- Create execution graph snapshots.

Responsibilities:

- Topological sort.
- Critical path detection.
- Fan-out/fan-in planning.
- Retry propagation calculation.
- Failure propagation calculation.

### Orchestration Module

Purpose:

- Submit executions.
- Start Temporal workflows.
- Control execution lifecycle.
- Pause, resume, cancel, retry, replay, and skip.
- Own execution state machine.

Entities:

- ExecutionRun
- ExecutionAttempt
- NodeRun
- StepRun
- RetryDecision
- CancellationRequest
- ReplayRequest

### Business Intent Module

Purpose:

- Define cross-platform business intents.
- Make one business action executable across web, mobile, desktop, API, and DB.

Examples:

- `auth.login`
- `cart.addItem`
- `checkout.pay`
- `invoice.validate`
- `record.search`
- `desktop.exportPdf`

Entities:

- IntentDefinition
- IntentVersion
- IntentParameterSchema
- IntentCapabilityRequirement
- IntentSemanticContract

### Execution Compiler Module

Purpose:

- Compile workflow and business intent into executor-ready execution plans.
- Resolve platform capabilities.
- Select executor strategies.
- Attach telemetry requirements.

Compiler pipeline:

```text
Workflow Definition
  -> Intent Expansion
  -> Capability Resolution
  -> Platform Binding
  -> Runtime Plan Generation
  -> Validation
  -> Execution Contract
```

Outputs:

- ExecutionPlan
- RuntimeNodePlan
- ExecutorCommand
- ArtifactPolicy
- TelemetryPolicy
- RetryPolicy

### Execution Fabric Module

Purpose:

- Schedule execution work onto distributed runtime agents.
- Track capacity.
- Assign runtime leases.
- Maintain runtime health.
- Coordinate queueing.

Components:

- ExecutionScheduler
- RuntimeLeaseManager
- RuntimeQueue
- AgentRegistry
- CapacityPlanner
- DispatchCoordinator

### Executor Registry Module

Purpose:

- Store executor capabilities and runtime contracts.
- Allow executors to self-register.
- Match execution plans to compatible runtimes.

Executor types:

- Playwright
- Appium
- WinAppDriver
- Pytest
- OCR
- AIValidation

Capability examples:

- Browser type.
- OS type.
- Device type.
- Desktop automation support.
- OCR support.
- Network capture support.
- Video capture support.
- Trace capture support.

### Runtime Agents Module

Purpose:

- Authenticate agents.
- Register heartbeats.
- Track runtime node state.
- Stream logs, screenshots, traces, and terminal output.
- Receive command acknowledgements.

Agent states:

- Registered
- Idle
- Reserved
- Running
- Draining
- Degraded
- Offline

### Telemetry Module

Purpose:

- Normalize runtime telemetry.
- Ingest high-volume execution events.
- Write analytics to ClickHouse.
- Forward operational metrics to OpenTelemetry.

Telemetry categories:

- Execution events.
- Step events.
- Browser telemetry.
- Mobile telemetry.
- Desktop telemetry.
- API timing.
- DB validation metrics.
- Network events.
- Performance events.
- AI analysis events.

### AI Gateway Module

Purpose:

- Own TypeScript-side AI contracts, job dispatch, policy enforcement, result ingestion, and realtime streaming.
- Submit evidence packages to Python intelligence workers.
- Validate AI worker outputs before storing or presenting them.
- Enforce human-review policy before workflow mutation.
- Persist AI insights and investigation metadata.
- Stream AI investigation progress to the UI.

TypeScript responsibilities:

- AI job API.
- AI evidence bundle builder.
- AI worker queue producer.
- AI result validator.
- AI insight projection.
- AI streaming gateway.
- AI policy and approval gates.

Python worker responsibilities:

- Flaky detection.
- Root cause analysis.
- Locator healing analysis.
- Retry optimization analysis.
- Execution summarization.
- Patch recommendation generation.
- Validation generation.
- Anomaly detection.

### Investigation Module

Purpose:

- Provide AI-assisted investigation workflows.
- Compare executions.
- Cluster failures.
- Correlate telemetry, graph relationships, artifacts, and history.

Outputs:

- InvestigationReport
- SuspectedRootCause
- EvidenceTimeline
- SimilarFailures
- RecommendedAction
- GeneratedPatchDraft

### Observability Module

Purpose:

- Provide operational visibility across orchestration, execution, AI, and runtime agents.
- Expose metrics, logs, traces, heatmaps, and health views.

### Artifact Module

Purpose:

- Store and index screenshots, videos, HAR files, Playwright traces, Appium logs, OCR snapshots, PDFs, terminal logs, and AI reports.

Storage:

- MinIO for binary artifacts.
- PostgreSQL for artifact metadata.
- ClickHouse for artifact-related telemetry.
- Meilisearch for searchable artifact descriptions.

### Search Module

Purpose:

- Index executions, workflows, failures, AI insights, logs, and runtime intelligence in Meilisearch.

### Realtime Module

Purpose:

- Socket.IO gateways for live topology, execution streams, terminal streams, telemetry streams, and AI investigation streams.
- Future-compatible with gRPC streaming.

### Audit Module

Purpose:

- Record security-sensitive actions.
- Track user and agent activity.
- Support compliance requirements.

## 7. Temporal Orchestration Design

Temporal is mandatory and acts as the orchestration brain.

Temporal responsibilities:

- Durable workflow execution.
- Retry orchestration.
- Replay.
- Long-running workflow state.
- Cancellation.
- Signal handling.
- Execution recovery.
- Distributed coordination.

Temporal should not become the product database. Store product state in PostgreSQL and analytics in ClickHouse. Use Temporal as durable orchestration runtime.

### Temporal Workflows

Core workflows:

- `ExecutionRunWorkflow`
- `NodeExecutionWorkflow`
- `BusinessIntentWorkflow`
- `InvestigationWorkflow`
- `ReplayWorkflow`
- `RuntimeProvisioningWorkflow`
- `ArtifactProcessingWorkflow`
- `LocatorHealingWorkflow`

### Temporal Activities

Core activities:

- `CompileExecutionPlanActivity`
- `PersistExecutionStateActivity`
- `AcquireRuntimeLeaseActivity`
- `DispatchExecutorCommandActivity`
- `WaitForExecutorCompletionActivity`
- `ReleaseRuntimeLeaseActivity`
- `IngestExecutionEventsActivity`
- `PersistArtifactsActivity`
- `UpdateExecutionGraphActivity`
- `TriggerAIAnalysisActivity`
- `PublishRealtimeEventActivity`

### Temporal Signals

Signals:

- Pause execution.
- Resume execution.
- Cancel execution.
- Retry failed node.
- Skip node.
- Inject variable.
- Attach runtime artifact.
- Update priority.
- Request live diagnostic snapshot.

### Temporal Queries

Queries:

- Current execution state.
- Current DAG traversal position.
- Active node runs.
- Retry state.
- Runtime lease state.
- Pending signals.

### Workflow Execution Pattern

```text
REST command: StartExecution
  -> NestJS validates auth, tenant, project, workflow
  -> NestJS creates ExecutionRun in PostgreSQL
  -> NestJS starts Temporal ExecutionRunWorkflow
  -> Temporal compiles execution plan
  -> Temporal traverses DAG
  -> Temporal schedules executor commands through activities
  -> Runtime agents emit NATS events
  -> Telemetry module ingests events into ClickHouse
  -> Realtime module streams updates to UI
  -> NestJS AI gateway packages evidence for Python workers
  -> Python workers produce insights
  -> NestJS validates, stores, and streams AI results
  -> Temporal completes, fails, cancels, or waits for intervention
```

## 8. Multi-Database Architecture

### PostgreSQL

Purpose:

- Core transactional system.
- Product state.
- Configuration.
- Permissions.
- Runtime contracts.

Use Drizzle ORM.

Store:

- Tenants.
- Users.
- Projects.
- Workflows.
- Test case metadata.
- Execution contracts.
- Execution run state.
- Runtime configs.
- Permissions.
- Integrations.
- Audit logs.
- Artifact metadata.

Schema groups:

- `identity_*`
- `tenant_*`
- `project_*`
- `workflow_*`
- `intent_*`
- `execution_*`
- `runtime_*`
- `artifact_*`
- `integration_*`
- `audit_*`

### ClickHouse

Purpose:

- Execution analytics.
- Telemetry intelligence.
- Observability dashboards.
- High-volume ingestion.

Store:

- Execution logs.
- Runtime telemetry.
- Step timings.
- Retry analytics.
- Flaky trends.
- Performance metrics.
- Network telemetry.
- AI analysis history.
- Event streams.

Recommended tables:

- `execution_events`
- `step_events`
- `runtime_metrics`
- `browser_network_events`
- `mobile_device_metrics`
- `desktop_runtime_metrics`
- `api_request_metrics`
- `retry_events`
- `failure_events`
- `ai_analysis_events`
- `artifact_events`

Partitioning:

- Partition by month or day depending on volume.
- Order by tenant, project, execution, timestamp.
- Use TTL policies for raw high-volume telemetry.
- Keep aggregated materialized views for long-term intelligence.

### Neo4j

Purpose:

- Execution intelligence graph.
- Dependency traversal.
- Impact analysis.
- Failure propagation.
- Runtime topology intelligence.

Nodes:

- Tenant
- Project
- Workflow
- Intent
- TestCase
- ExecutionRun
- NodeRun
- RuntimeAgent
- Executor
- Artifact
- Failure
- Service
- Database
- APIEndpoint

Relationships:

- `DEPENDS_ON`
- `EXECUTED_AS`
- `FAILED_AT`
- `PRODUCED_ARTIFACT`
- `USED_RUNTIME`
- `AFFECTS`
- `SIMILAR_TO`
- `HEALED_BY`
- `RETRIED_BY`
- `CALLS_API`
- `READS_TABLE`
- `WRITES_TABLE`

### Qdrant

Purpose:

- AI memory.
- Similarity search.
- Historical runtime pattern matching.

Collections:

- `execution_embeddings`
- `failure_embeddings`
- `locator_embeddings`
- `artifact_embeddings`
- `investigation_memory`
- `runtime_pattern_memory`
- `validation_memory`

Payload metadata:

- tenantId
- projectId
- workflowId
- executionId
- platform
- executorType
- failureType
- timestamp

### Meilisearch

Purpose:

- Fast text search for product UX.

Indexes:

- `executions`
- `workflows`
- `failures`
- `ai_insights`
- `runtime_logs`
- `orchestration_events`
- `artifacts`

### MinIO

Purpose:

- S3-compatible artifact storage.

Buckets:

- `screenshots`
- `videos`
- `traces`
- `har`
- `pdfs`
- `ocr`
- `terminal`
- `ai-snapshots`

Security:

- Use pre-signed URLs.
- Encrypt at rest.
- Store tenant and execution metadata.
- Enforce retention policies.

## 9. Event Streaming Architecture

Use NATS initially. Keep contracts Kafka-compatible.

NATS responsibilities:

- Realtime orchestration events.
- Runtime agent communication.
- Executor telemetry.
- AI streaming.
- Distributed synchronization.
- Command acknowledgements.

Subject structure:

```text
nexus.{tenantId}.orchestration.execution.started
nexus.{tenantId}.orchestration.execution.completed
nexus.{tenantId}.orchestration.node.started
nexus.{tenantId}.orchestration.node.failed
nexus.{tenantId}.runtime.agent.heartbeat
nexus.{tenantId}.runtime.command.dispatch
nexus.{tenantId}.runtime.command.ack
nexus.{tenantId}.telemetry.execution
nexus.{tenantId}.telemetry.browser
nexus.{tenantId}.telemetry.mobile
nexus.{tenantId}.telemetry.desktop
nexus.{tenantId}.artifact.created
nexus.{tenantId}.ai.investigation.started
nexus.{tenantId}.ai.investigation.token
nexus.{tenantId}.ai.insight.created
```

Event envelope:

```json
{
  "eventId": "evt_...",
  "eventType": "ExecutionStarted",
  "eventVersion": 1,
  "tenantId": "ten_...",
  "projectId": "prj_...",
  "workflowId": "wf_...",
  "executionId": "exec_...",
  "nodeRunId": "node_run_...",
  "correlationId": "corr_...",
  "causationId": "evt_...",
  "timestamp": "2026-05-11T00:00:00.000Z",
  "producer": "playwright-agent-01",
  "payload": {}
}
```

## 10. Unified Execution Event Model

Every executor emits standardized events.

Mandatory lifecycle events:

- `ExecutionStarted`
- `ExecutionQueued`
- `ExecutionScheduled`
- `ExecutionPaused`
- `ExecutionResumed`
- `ExecutionCancelled`
- `ExecutionCompleted`
- `ExecutionFailed`
- `ExecutionTimedOut`

Node and step events:

- `NodeStarted`
- `NodeCompleted`
- `NodeFailed`
- `StepStarted`
- `StepCompleted`
- `StepFailed`
- `ValidationStarted`
- `ValidationCompleted`
- `ValidationFailed`

Runtime events:

- `RuntimeLeaseAcquired`
- `RuntimeLeaseReleased`
- `RuntimeAgentHeartbeat`
- `RuntimeAgentDegraded`
- `RuntimeCommandDispatched`
- `RuntimeCommandAcknowledged`

Intelligence events:

- `RetryTriggered`
- `HealingTriggered`
- `FailureDetected`
- `AnomalyDetected`
- `AIInvestigationStarted`
- `AIInsightGenerated`
- `PatchRecommendationGenerated`

Artifact events:

- `ScreenshotCaptured`
- `VideoCaptured`
- `TraceCaptured`
- `HarCaptured`
- `PdfCaptured`
- `OcrSnapshotCaptured`
- `TerminalOutputCaptured`

## 11. Execution Fabric Architecture

The execution fabric is the distributed runtime layer.

```text
Orchestration Core
  -> Execution Scheduler
  -> Execution Queue
  -> Runtime Lease Manager
  -> Distributed Runtime Fabric
  -> Executor Runtime Nodes
```

### Execution Scheduler

Responsibilities:

- Select compatible executor.
- Respect tenant quotas.
- Respect project priority.
- Respect runtime availability.
- Schedule retries.
- Support queue backpressure.
- Support autoscaling signals.

### Runtime Lease Manager

Responsibilities:

- Reserve runtime capacity.
- Avoid double assignment.
- Track active execution ownership.
- Release capacity after completion or failure.
- Detect stale leases.

### Runtime Agent Protocol

Agent startup:

1. Agent boots with agent token.
2. Agent authenticates against backend.
3. Agent registers capabilities.
4. Agent subscribes to assigned NATS subjects.
5. Agent sends heartbeat.
6. Agent waits for runtime commands.

Command lifecycle:

1. Backend dispatches command.
2. Agent acknowledges receipt.
3. Agent starts isolated runtime.
4. Agent streams events and artifacts.
5. Agent reports completion.
6. Backend releases lease.

### Runtime Isolation

Isolation options:

- Docker container per execution for web and API.
- Emulator or device session lease for mobile.
- Windows VM or remote desktop agent for desktop.
- Python virtual environment or container for Pytest.
- Sandboxed worker for OCR and AI validation.

## 12. Executor Abstraction Layer

All executors implement a common runtime contract.

```ts
export interface ExecutorRuntime {
  readonly type: ExecutorType;
  readonly capabilities: ExecutorCapabilities;

  prepare(command: ExecutorCommand): Promise<RuntimeSession>;
  execute(session: RuntimeSession, command: ExecutorCommand): AsyncIterable<ExecutionEvent>;
  collectArtifacts(session: RuntimeSession): Promise<ArtifactDescriptor[]>;
  cancel(sessionId: string): Promise<void>;
  dispose(sessionId: string): Promise<void>;
}
```

Responsibilities:

- Normalize execution commands.
- Standardize telemetry.
- Unify artifacts.
- Unify reporting.
- Expose cancellation.
- Support retries.
- Enable cross-platform synchronization.
- Avoid leaking runtime-specific details upward.

## 13. Cross-Platform Business Intent Model

Business intent describes what the business action means, not how a tool performs it.

Intent example:

```json
{
  "intentKey": "auth.login",
  "version": 1,
  "parameters": {
    "username": "{{user.email}}",
    "password": "{{secrets.password}}"
  },
  "capabilities": ["identity.formAuth", "secureInput", "assertNavigation"],
  "platformBindings": {
    "web": "playwright.login.form",
    "mobile": "appium.login.form",
    "desktop": "winappdriver.login.window",
    "api": "pytest.auth.token"
  }
}
```

Compilation stages:

1. Resolve intent definition.
2. Validate parameters.
3. Resolve target platforms.
4. Match capability requirements.
5. Generate runtime-specific commands.
6. Attach validation strategy.
7. Attach telemetry and artifact policies.
8. Return execution plan.

## 14. Playwright Execution Engine

Use Playwright as the primary web runtime engine.

Capabilities:

- Chromium, Firefox, WebKit.
- Parallel browser execution.
- Trace viewer.
- HAR capture.
- Video recording.
- Screenshot streaming.
- DOM intelligence.
- Accessibility scanning.
- API interception.
- Realtime telemetry.

Architecture:

- Playwright agent runs outside the NestJS monolith.
- Browser sessions are isolated per execution or per tenant policy.
- Browser pool manager controls capacity.
- Trace, video, screenshot, HAR, and DOM snapshots flow to MinIO.
- Runtime events flow to NATS.
- Metrics flow to OpenTelemetry and ClickHouse.

Advanced hooks:

- DOM intelligence capture after key steps.
- Locator healing request on selector failure.
- Network intelligence for API correlation.
- Performance metrics per page and step.
- Trace streaming for live execution view.
- Accessibility snapshots for validation.

## 15. Appium Execution Engine

Use Appium as the mobile runtime engine.

Capabilities:

- Android execution.
- iOS execution.
- Emulator orchestration.
- Real device orchestration.
- Gesture execution.
- Mobile telemetry.
- Runtime diagnostics.

Architecture:

- Distributed device agents register available devices.
- Device capability manager tracks OS, version, form factor, health, and availability.
- Runtime leases prevent concurrent conflicting access.
- Device agents stream logs, screenshots, crash data, and performance telemetry.

Advanced hooks:

- AI gesture healing.
- Locator intelligence.
- Crash analytics.
- Mobile performance telemetry.
- Device stability scoring.
- Device farm compatibility.

## 16. Desktop Execution Engine

Use WinAppDriver, UIAutomation, OCR, and image recognition for desktop execution.

Capabilities:

- Windows automation.
- Electron app automation.
- Desktop telemetry.
- OCR validation.
- PDF validation.
- Image recognition.
- Visual automation.

Architecture:

- Desktop agents run on isolated Windows machines or VMs.
- Remote execution uses authenticated agent channel.
- Screenshots stream through artifact pipeline.
- UIAutomation snapshots are normalized into telemetry events.
- Python OCR/CV workers analyze screenshots and PDFs.

Advanced hooks:

- AI screenshot analysis.
- OCR intelligence.
- Desktop healing logic.
- Dependency monitoring.
- Visual element recognition.

## 17. Pytest Execution Engine

Use Pytest as a Python worker runtime for API, DB, assertion, and backend validation.

Capabilities:

- API testing.
- DB validation.
- Schema validation.
- Contract testing.
- Async execution.
- Plugin execution.

Architecture:

- Pytest workers run in isolated Python containers.
- Test contracts are generated from execution plans.
- Runtime injects secrets and environment through secure short-lived config.
- Results are emitted as unified execution events.

Advanced hooks:

- AI assertion generation.
- Anomaly detection.
- AI-generated validations.
- Intelligent schema analysis.
- Contract drift detection.

## 18. Python OCR And Document Intelligence Workers

Use Python workers with Tesseract OCR, OpenCV, and future multimodal AI providers.

Capabilities:

- Invoice validation.
- Screenshot intelligence.
- PDF validation.
- Visual assertion.
- Desktop OCR automation.
- Image comparison.

Pipeline:

```text
Artifact Created
  -> NestJS schedules OCR job
  -> Python OCR worker extracts text
  -> Python CV worker parses layout
  -> Python worker applies visual/document validation
  -> Embedding Stored in Qdrant
  -> NestJS ingests result
  -> Search index updated
  -> AI insight generated
```

## 19. Python AI Intelligence Architecture

Use Python and LangGraph for multi-agent AI workflows.

AI should be event-driven and evidence-grounded. It must analyze execution telemetry, artifacts, graph relationships, and historical memory before making recommendations.

NestJS owns AI job orchestration, authorization, evidence packaging, and result ingestion. Python owns the reasoning, OCR, CV, ML, embedding, and analysis execution.

### AI Agents

Recommended agents:

- Failure Triage Agent.
- Root Cause Agent.
- Locator Healing Agent.
- Flaky Detection Agent.
- Retry Optimization Agent.
- Validation Generation Agent.
- Execution Summary Agent.
- Patch Recommendation Agent.
- Orchestration Optimization Agent.

### AI Context Sources

Sources:

- PostgreSQL execution metadata.
- ClickHouse telemetry and logs.
- Neo4j dependency graph.
- Qdrant historical memory.
- MinIO artifacts.
- Meilisearch text results.
- OpenTelemetry traces.

### AI Investigation Flow

```text
FailureDetected
  -> NestJS gathers execution timeline
  -> NestJS fetches artifact references
  -> NestJS queries similar failures from Qdrant
  -> NestJS traverses graph dependencies in Neo4j
  -> NestJS queries telemetry trends from ClickHouse
  -> NestJS creates evidence bundle
  -> Python runs LangGraph investigation
  -> Python generates evidence-backed report
  -> NestJS validates and ingests results
  -> NestJS streams findings to UI
  -> NestJS stores memory and insights
```

AI outputs:

- Failure explanation.
- Evidence timeline.
- Suspected root cause.
- Similar historical failures.
- Retry recommendation.
- Locator healing patch.
- Validation patch.
- Product bug suspicion.
- Infrastructure issue suspicion.

## 20. Retry Intelligence Architecture

Retry must not be blind repetition.

Retry decision inputs:

- Failure type.
- Historical flakiness.
- Runtime health.
- Network telemetry.
- Locator confidence.
- Dependency graph impact.
- Step idempotency.
- Tenant retry policy.
- Workflow retry policy.

Retry classes:

- Immediate retry.
- Delayed retry.
- Retry on different runtime.
- Retry with healed locator.
- Retry after dependency recovery.
- No retry, require investigation.

Retry flow:

```text
NodeFailed
  -> Classify failure
  -> Query historical behavior
  -> Check runtime health
  -> Evaluate retry policy
  -> Ask AI retry optimizer if needed
  -> Emit RetryTriggered or InvestigationRequired
  -> Temporal schedules retry or pauses workflow
```

## 21. Execution Graph System

The execution graph system powers dependency visualization, failure propagation, and orchestration intelligence.

Graph responsibilities:

- DAG traversal.
- Runtime topology.
- Dependency impact.
- Failure propagation.
- Retry propagation.
- Cross-platform synchronization.
- Orchestration visualization.

Graph data stores:

- PostgreSQL stores workflow graph definitions.
- Temporal stores active durable workflow state.
- Neo4j stores intelligence graph and historical relationships.
- ClickHouse stores time-series execution events.

## 22. Realtime Streaming System

Use Socket.IO initially.

Realtime streams:

- Live execution timeline.
- Orchestration topology.
- Node state updates.
- Runtime telemetry.
- Screenshot stream.
- Terminal stream.
- AI investigation stream.
- Retry propagation.
- Execution heatmaps.

Socket namespaces:

```text
/executions
/orchestration
/runtime
/telemetry
/terminal
/ai
/artifacts
```

Room strategy:

- `tenant:{tenantId}`
- `project:{projectId}`
- `execution:{executionId}`
- `node:{nodeRunId}`
- `agent:{agentId}`

Future extension:

- Use gRPC streaming for agent-to-control-plane high-volume streams.
- Keep Socket.IO for browser UX.

## 23. Terminal And Runtime Debugging

Terminal infrastructure supports:

- Live execution terminal.
- Runtime shell logs.
- Pytest output.
- Playwright console logs.
- Appium device logs.
- Desktop agent logs.
- AI investigation logs.

Design:

- Runtime agents stream terminal chunks to NATS.
- Terminal module persists chunks to ClickHouse and MinIO depending on retention policy.
- Socket.IO broadcasts chunks to authorized UI rooms.
- Access requires execution-level authorization.
- Redact secrets before persistence and broadcast.

## 24. Observability Platform

Use OpenTelemetry, Prometheus, Grafana, and Loki.

Observability dimensions:

- API latency.
- Temporal workflow duration.
- Temporal activity failures.
- NATS publish/consume lag.
- Runtime agent health.
- Execution duration.
- Step duration.
- Retry rate.
- Failure rate.
- Artifact upload latency.
- ClickHouse ingestion lag.
- AI workflow latency.
- Token usage and AI failure rate.

### Tracing

Propagate trace context through:

- REST request.
- GraphQL resolver.
- Temporal workflow start.
- Temporal activities.
- NATS events.
- Runtime agent command.
- Executor steps.
- Artifact upload.
- AI investigation.

### Metrics

Prometheus metrics:

- `nexus_execution_started_total`
- `nexus_execution_completed_total`
- `nexus_execution_failed_total`
- `nexus_node_duration_seconds`
- `nexus_retry_total`
- `nexus_runtime_agent_heartbeat_age_seconds`
- `nexus_runtime_queue_depth`
- `nexus_artifact_upload_duration_seconds`
- `nexus_ai_investigation_duration_seconds`

### Logs

Use structured JSON logs with:

- tenantId
- projectId
- executionId
- workflowId
- nodeRunId
- agentId
- traceId
- spanId
- eventType

## 25. API Architecture

Use REST and GraphQL hybrid.

### REST

REST is for commands and operational actions:

- Start execution.
- Cancel execution.
- Pause execution.
- Resume execution.
- Retry node.
- Replay execution.
- Register agent.
- Dispatch runtime command.
- Upload artifact metadata.

Example endpoints:

```text
POST /v1/projects/:projectId/executions
POST /v1/executions/:executionId/cancel
POST /v1/executions/:executionId/pause
POST /v1/executions/:executionId/resume
POST /v1/executions/:executionId/replay
POST /v1/node-runs/:nodeRunId/retry
POST /v1/runtime-agents/register
POST /v1/artifacts/complete
```

### GraphQL

GraphQL is for intelligence, visualization, and aggregation:

- Execution topology.
- Workflow graph.
- AI investigation results.
- Failure clusters.
- Runtime heatmaps.
- Dependency graph.
- Historical comparisons.

Use Apollo GraphQL.

## 26. Security Architecture

Use Keycloak for enterprise identity.

Security requirements:

- RBAC.
- SSO.
- OAuth2/OIDC.
- Tenant isolation.
- Execution-level authorization.
- Agent authentication.
- Audit logging.
- Encrypted secrets.
- Secure runtime communication.
- Sandbox execution.

### Tenant Isolation

Enforce tenant at:

- API guard.
- DB query filters.
- Event subjects.
- MinIO object metadata and bucket policy.
- Search filters.
- Qdrant payload filters.
- Neo4j query filters.
- Runtime agent lease constraints.

### Secrets

Rules:

- Never send long-lived secrets to runtime agents.
- Use short-lived execution-scoped secret material.
- Redact secrets from logs and telemetry.
- Store references in PostgreSQL, encrypted values in a secret manager.
- Rotate agent credentials.

### Agent Security

Agent authentication:

- Agent service account.
- Short-lived JWT or mTLS.
- Capability-scoped permissions.
- Tenant and pool assignment.

Agent authorization:

- Agent can only receive commands for assigned runtime pool.
- Agent cannot query arbitrary execution state.
- Agent uploads artifacts only for leased executions.

## 27. Deployment Architecture

Start with Docker Compose for local and early integration. Keep services Kubernetes-ready.

### Docker Compose Services

Services:

- `api`
- `temporal`
- `temporal-ui`
- `postgres`
- `clickhouse`
- `neo4j`
- `qdrant`
- `nats`
- `minio`
- `meilisearch`
- `keycloak`
- `prometheus`
- `grafana`
- `loki`
- `otel-collector`
- `playwright-agent`
- `pytest-worker`

Optional later:

- `appium-agent`
- `desktop-agent`
- `ocr-worker`
- `ai-worker`

### Kubernetes Readiness

Prepare for:

- Separate deployments for API, Temporal workers, runtime agents, AI workers, and telemetry consumers.
- Horizontal Pod Autoscalers for runtime workers.
- StatefulSets for databases where appropriate.
- Network policies.
- Secrets management.
- Runtime node pools.
- Dedicated GPU or device pools when needed.

## 28. Scaling Strategy

Scale independently:

- API pods for request load.
- Temporal workers for workflow and activity throughput.
- Runtime agents for execution load.
- Playwright browser containers for web parallelism.
- Appium device agents for mobile capacity.
- Desktop agents for Windows execution capacity.
- Pytest workers for API and DB validation.
- Telemetry consumers for event ingestion.
- AI workers for investigation and summarization.
- ClickHouse nodes for analytics volume.

Backpressure controls:

- Tenant quotas.
- Queue depth limits.
- Runtime pool limits.
- NATS consumer lag monitoring.
- Temporal task queue partitioning.
- AI concurrency limits.

## 29. Backend UX Integration Strategy

The backend must power an immersive operational UX.

UX views and backend support:

- Realtime orchestration graph: DAG state from Temporal, PostgreSQL, and Socket.IO.
- Live execution topology: Runtime leases, agent state, node state, and telemetry streams.
- AI investigation UI: LangGraph streamed tokens, evidence timeline, and artifact references.
- Dependency visualization: Neo4j graph queries.
- Execution heatmaps: ClickHouse aggregations.
- Runtime dashboards: agent metrics and queue depth.
- Trace viewer: MinIO artifacts and Playwright trace metadata.
- Failure clustering: Qdrant similarity and ClickHouse trend analytics.
- Terminal: NATS terminal stream and Socket.IO rooms.

## 30. Implementation Phases

### Phase 1: Backend Foundation

Deliver:

- NestJS workspace.
- Config module.
- Health endpoints.
- PostgreSQL connection using Drizzle.
- Keycloak guard skeleton.
- Tenant context provider.
- OpenTelemetry bootstrap.
- Structured logging.

Checklist:

- [ ] Create NestJS API project.
- [ ] Add global config validation.
- [ ] Add request correlation IDs.
- [ ] Add tenant resolution.
- [ ] Add Keycloak JWT validation.
- [ ] Add Drizzle migrations.
- [ ] Add health checks for all configured infrastructure.

### Phase 2: Core Domain And Workflow Storage

Deliver:

- Tenant, project, workflow, DAG, and execution metadata schemas.
- Workflow versioning.
- DAG validation.

Checklist:

- [ ] Implement PostgreSQL schemas.
- [ ] Implement workflow CRUD only as domain foundation.
- [ ] Implement DAG validation service.
- [ ] Implement workflow publish lifecycle.
- [ ] Implement execution contract generation.

### Phase 3: Temporal Orchestration Core

Deliver:

- Temporal worker.
- ExecutionRunWorkflow.
- Core activities.
- Execution state machine.

Checklist:

- [ ] Add Temporal client module.
- [ ] Add Temporal worker process.
- [ ] Implement execution start command.
- [ ] Implement execution lifecycle persistence.
- [ ] Implement pause, resume, cancel, retry, and replay signals.
- [ ] Add workflow query endpoints.

### Phase 4: Event-Driven Core

Deliver:

- NATS integration.
- Unified event envelope.
- Event publisher.
- Event consumers.
- Realtime event bridge.

Checklist:

- [ ] Define versioned event contracts.
- [ ] Implement NATS publisher.
- [ ] Implement idempotent consumers.
- [ ] Implement event persistence to ClickHouse.
- [ ] Implement Socket.IO gateway.
- [ ] Add event replay test harness.

### Phase 5: Execution Fabric

Deliver:

- Runtime agent registry.
- Runtime lease manager.
- Scheduler.
- Runtime command protocol.

Checklist:

- [ ] Implement agent registration endpoint.
- [ ] Implement agent heartbeat consumer.
- [ ] Implement runtime capability model.
- [ ] Implement runtime lease table.
- [ ] Implement scheduler service.
- [ ] Implement command dispatch over NATS.
- [ ] Implement command acknowledgement handling.

### Phase 6: Playwright And Pytest Executors

Deliver:

- First distributed web runtime.
- First API and DB validation runtime.

Checklist:

- [ ] Build Playwright agent.
- [ ] Add browser pooling.
- [ ] Capture screenshots, video, HAR, traces, DOM snapshots.
- [ ] Stream Playwright telemetry.
- [ ] Build Pytest worker.
- [ ] Normalize Pytest results into execution events.
- [ ] Store artifacts in MinIO.

### Phase 7: ClickHouse Telemetry And Dashboards

Deliver:

- High-volume telemetry ingestion.
- Execution analytics.
- Heatmap-ready projections.

Checklist:

- [ ] Create ClickHouse schemas.
- [ ] Implement batch ingestion.
- [ ] Implement materialized views.
- [ ] Add query services for execution timelines.
- [ ] Add retry analytics queries.
- [ ] Add failure trend queries.

### Phase 8: Business Intent And Compiler

Deliver:

- Intent registry.
- Capability matching.
- Execution compiler.

Checklist:

- [ ] Implement intent definition schema.
- [ ] Implement platform binding schema.
- [ ] Implement compiler pipeline.
- [ ] Add capability resolution.
- [ ] Generate executor commands from intent.
- [ ] Add compiler validation tests.

### Phase 9: Neo4j Execution Intelligence Graph

Deliver:

- Dependency and execution graph.
- Impact analysis.
- Failure propagation.

Checklist:

- [ ] Add Neo4j module.
- [ ] Sync workflow topology to Neo4j.
- [ ] Sync execution relationships.
- [ ] Implement impact analysis query.
- [ ] Implement failure propagation query.
- [ ] Implement graph visualization API.

### Phase 10: AI Intelligence Layer

Deliver:

- NestJS AI gateway.
- Python LangGraph investigation workers.
- Qdrant memory integration.
- AI insight ingestion and streaming.

Checklist:

- [ ] Add Qdrant module in NestJS.
- [ ] Create embedding collections.
- [ ] Define TypeScript AI job and result contracts.
- [ ] Build NestJS AI job dispatcher.
- [ ] Build Python LangGraph investigation worker.
- [ ] Build Python flaky detection worker.
- [ ] Build Python locator healing worker.
- [ ] Build Python execution summarizer.
- [ ] Validate AI results in NestJS before persistence.
- [ ] Stream AI results over Socket.IO from NestJS.

### Phase 11: Mobile And Desktop Runtimes

Deliver:

- Appium device agents.
- Desktop agents.
- OCR intelligence workers.

Checklist:

- [ ] Implement Appium agent registration.
- [ ] Implement device lease manager.
- [ ] Implement mobile telemetry ingestion.
- [ ] Implement desktop agent protocol.
- [ ] Add screenshot streaming.
- [ ] Add Python OCR processing worker.
- [ ] Add NestJS OCR job/result contracts.

### Phase 12: Enterprise Hardening

Deliver:

- Security, quotas, audit, scaling, and production readiness.

Checklist:

- [ ] Enforce tenant quotas.
- [ ] Add audit trails.
- [ ] Add retention policies.
- [ ] Add secrets manager integration.
- [ ] Add agent mTLS option.
- [ ] Add rate limiting.
- [ ] Add Kubernetes manifests or Helm chart.
- [ ] Add load tests for thousands of parallel executions.

## 31. Initial Milestone Definition

The first meaningful backend milestone should not try to implement every executor.

Milestone 1 target:

- NestJS API.
- PostgreSQL with Drizzle.
- Temporal orchestration.
- NATS event bus.
- Socket.IO live execution stream.
- Runtime agent registry.
- Minimal Playwright agent.
- MinIO artifact storage.
- ClickHouse event ingestion.
- Keycloak auth skeleton.

Milestone 1 success criteria:

- User starts a workflow execution through REST.
- Temporal durably orchestrates the execution.
- Scheduler assigns a Playwright agent.
- Agent executes a simple web step.
- Events stream through NATS.
- UI can subscribe through Socket.IO.
- Artifacts upload to MinIO.
- Execution events land in ClickHouse.
- Execution state persists in PostgreSQL.

## 32. Non-Negotiable Architecture Rules

- Do not put executor SDKs inside the workflow engine.
- Do not use PostgreSQL for high-volume telemetry.
- Do not use ClickHouse as the transactional source of truth.
- Do not let agents bypass the backend control plane.
- Do not let AI recommendations mutate workflows without review or policy.
- Do not emit unversioned events.
- Do not store secrets in logs, events, traces, or artifacts.
- Do not make runtime workers depend on UI-specific contracts.
- Do not couple business intent to one platform.
- Do not build microservices until module boundaries and scaling pressure prove the need.
- Do not implement product orchestration, execution scheduling, RBAC, tenancy, realtime gateways, or API contracts in Python.
- Do not implement OCR, CV, ML inference, LangGraph reasoning, embedding generation, or heavy AI analysis in TypeScript.
- Do not allow Python workers to write directly to workflow, execution, tenancy, or policy tables.
- Do not allow the Next.js frontend to call Python workers directly; all product traffic goes through the TypeScript/NestJS control plane.

## 33. Recommended First Code Tasks

1. Create NestJS modules for `orchestration`, `workflows`, `execution-fabric`, `runtime-agents`, `telemetry`, `artifacts`, and `realtime`.
2. Add `contracts/events` with the unified execution event envelope.
3. Add PostgreSQL Drizzle schemas for tenants, projects, workflows, execution runs, node runs, runtime agents, runtime leases, and artifacts.
4. Add Temporal worker with a minimal `ExecutionRunWorkflow`.
5. Add NATS publisher and consumer abstraction.
6. Add Socket.IO gateway that broadcasts execution events by tenant, project, and execution room.
7. Add a mock runtime agent before Playwright to test scheduling, leases, event flow, and replay.
8. Replace mock runtime with Playwright agent.
9. Add ClickHouse ingestion.
10. Add MinIO artifact upload.
11. Add Python worker contracts for AI, OCR, CV, ML, and Pytest jobs.
12. Add NestJS job dispatch and result ingestion for Python workers.

This creates the execution operating system spine before expanding into mobile, desktop, AI, graph intelligence, and enterprise scaling.
