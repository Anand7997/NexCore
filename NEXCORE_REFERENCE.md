# NexCore QA Platform — Complete Reference

> Last updated: 2026-05-18  
> Covers all work done across the full session history.

---

## Repository Layout

```
NexCore/
├── nexus-api/          Python FastAPI backend (port 8000)
├── nexus-backend/      NestJS control-plane backend (port 3001)
└── nexus-qa/           Next.js 15 frontend (port 3000)
```

---

## Start Commands

```bash
# Python API
cd nexus-api
python -m uvicorn app.main:app --port 8000 --reload

# NestJS worker (Temporal)
cd nexus-backend
npm run start:worker

# Next.js frontend
cd nexus-qa
npm run dev
```

---

## 1. Database — Full Schema (29 Tables)

All models live in `nexus-api/app/database/models.py`.  
Tables are auto-created on startup via `Base.metadata.create_all()`.  
New columns on existing tables are applied via `run_migrations()` in `session.py` (idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS`).

### 1.1 Core Test Authoring Tables

#### `test_projects`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | UUID |
| name | String(255) | |
| description | Text | |
| status | String(20) | active / draft / archived |
| tags | JSON list | |
| created_at | DateTime | |
| updated_at | DateTime | |

#### `test_modules`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | UUID |
| project_id | FK → test_projects | indexed |
| name | String(255) | |
| description | Text | |
| status | String(20) | |
| tags | JSON list | |
| created_at / updated_at | DateTime | |

#### `testing_types` *(new)*
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| name | String(100) | e.g. "Web Testing" |
| key | String(50) UNIQUE | web / api / mobile / desktop / database / performance / visual / security |
| description | Text | |
| category | String(50) | functional / api / ui / data / performance / security |
| icon | String(50) | lucide icon name |
| is_active | Boolean | |
| created_at | DateTime | |

Seed with `POST /api/testing-types/seed` — inserts 8 defaults if not already present.

#### `test_cases`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| module_id | FK → test_modules | |
| project_id | FK → test_projects | **new** — denormalised from module for direct queries |
| testing_type_id | FK → testing_types | **new** — nullable |
| name | String(255) | |
| description | Text | |
| status | String(20) | draft / active / deprecated |
| test_type | String(50) | functional / smoke / regression … |
| priority | String(20) | p0–p3 |
| execution_mode | String(20) | automated / manual / hybrid |
| platforms | JSON list | web / android / ios … |
| tags | JSON list | |
| default_variables | JSON dict | |
| created_at / updated_at | DateTime | |

#### `test_steps`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| test_case_id | FK → test_cases | |
| step_order | Integer | |
| name | String(255) | |
| description | Text | |
| **action_type** | String(100) | **new** — CLICK / ASSERTION / TYPE … (see full list below) |
| **page_id** | FK → page_repository | **new** — nullable |
| **page_element_id** | FK → page_elements | **new** — nullable |
| **api_endpoint_id** | FK → api_endpoints | **new** — nullable |
| **input_value** | Text | **new** |
| expected_result | Text | |
| **assertion_type** | String(100) | **new** — EQUALS / CONTAINS / IS_VISIBLE … |
| **secondary_action** | String(100) | **new** — LOG_STEP / TAKE_SCREENSHOT … |
| **secondary_value** | Text | **new** |
| is_enabled | Boolean | |
| intent | String(100) | legacy — kept for backward compat |
| target | String(255) | legacy |
| test_data | JSON dict | legacy |
| tags | JSON list | |
| bindings | JSON dict | legacy web bindings `{web:{page,element_name,selector,xpath}}` |
| created_at / updated_at | DateTime | |

**Supported action_type values:**
`OPEN_BROWSER, CLICK, DOUBLE_CLICK, RIGHT_CLICK, MOUSE_OVER, CLICK_AND_SELECT, CLICK_AND_TYPE, TYPE_AND_SELECT, CLEAR_AND_TYPE, RADIO_BUTTON, DRAG_AND_DROP, SELECT_COUNT, INCREMENT, DECREMENT, HANDLE_CHECKBOX, SWITCH_TO_NEW_WINDOW, SWITCH_TO_WINDOW_BY_INDEX, SWITCH_TO_WINDOW_BY_URL, SWITCH_TO_IFRAME, CLOSE_EXTRA_WINDOWS, NAVIGATE_TO_URL, REFRESH_PAGE, GO_BACK, GO_FORWARD, READ_TEXT, READ_VALUE, READ_TOOLTIP, READ_LABEL, COPY, PASTE, UPLOAD_FILE, DOWNLOAD_FILE, HANDLE, VISUAL_ASSERTION, TYPE, SELECT, WAIT, PRESS_KEY, ASSERTION`

**Supported assertion_type values:**
`EQUALS, CONTAINS, NOT_CONTAINS, STARTS_WITH, ENDS_WITH, REGEX, GREATER_THAN, LESS_THAN, IS_VISIBLE, IS_HIDDEN, IS_ENABLED, IS_DISABLED, IS_CHECKED, IS_EMPTY, COUNT_EQUALS`

**Supported secondary_action values:**
`LOG_STEP, AUTO_GENERATE_VALUE, TAKE_SCREENSHOT, HIGHLIGHT_ELEMENT, SCROLL_INTO_VIEW`

---

### 1.2 Page Object Repository

#### `page_repository`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| **project_id** | FK → test_projects | **new** — nullable |
| **module_id** | FK → test_modules | **new** — nullable |
| name | String(255) indexed | |
| url_pattern | String(512) | |
| description | Text | |
| platform | String(30) indexed | web / android / ios / desktop / api |
| tags | JSON list | |
| created_at / updated_at | DateTime | |

#### `page_elements`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| page_id | FK → page_repository | |
| name | String(255) | |
| element_type | String(50) | button / input / link / dropdown … |
| description | Text | |
| xpath | Text | |
| css_selector | Text | |
| id_attr | String(255) | |
| name_attr | String(255) | used for role/name strategy |
| locator_strategy | String(30) | xpath / css / id / name / text / **role** / **testid** |
| tags | JSON list | |
| created_at / updated_at | DateTime | |

**Locator strategy resolution:**
- `xpath` → `xpath` field
- `css` → `css_selector` field
- `id` → `#id_attr`
- `name` → `name_attr`
- `text` → element `name`
- `role` → `[role="name_attr"]`
- `testid` → `css_selector` or `[data-testid="id_attr"]`

---

### 1.3 API Testing Tables *(new)*

#### `api_collections`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| project_id | FK → test_projects | nullable |
| module_id | FK → test_modules | nullable |
| name | String(255) | |
| base_url | String(512) | |
| description | Text | |
| auth_type | String(50) | none / bearer / basic / api_key |
| auth_config | JSON dict | |
| default_headers | JSON dict | |
| tags | JSON list | |
| created_at / updated_at | DateTime | |

#### `api_endpoints`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| api_collection_id | FK → api_collections | |
| name | String(255) | |
| method | String(10) | GET / POST / PUT / DELETE … |
| path | String(512) | relative path, e.g. `/users/{id}` |
| description | Text | |
| headers | JSON dict | per-endpoint header overrides |
| query_params | JSON dict | |
| request_body | JSON dict | |
| expected_status | Integer | nullable |
| expected_response | JSON dict | assertions on response body |
| auth_override | JSON dict | override collection auth |
| tags | JSON list | |
| created_at / updated_at | DateTime | |

---

### 1.4 Workflow Architecture Tables

#### `workflows`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| **project_id** | FK → test_projects | **new** — nullable |
| **module_id** | FK → test_modules | **new** — nullable |
| name | String(255) | |
| description | Text | |
| status | String(20) | active / draft / archived |
| tags | JSON list | |
| platforms | JSON list | |
| variables | JSON dict | |
| retry_policy | JSON dict | |
| created_at / updated_at | DateTime | |

#### `workflow_nodes`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| workflow_id | FK → workflows | |
| **test_case_id** | FK → test_cases | **new** — links node to a real test case |
| node_key | String(100) | logical DAG key (unique within workflow) |
| type | String(50) | node type (webAction, apiValidation …) |
| label | String(255) | display label |
| description | Text | |
| config | JSON dict | |
| position_x / position_y | Float | canvas position |
| timeout_seconds | Integer | |
| retry_policy | JSON dict | |

#### `workflow_edges`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| workflow_id | FK → workflows | |
| source_key | String(100) | |
| target_key | String(100) | |
| condition | String(255) | optional expression |
| **execution_order** | Integer | **new** — for deterministic ordering |

---

### 1.5 Execution Tables

#### `executions`
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| workflow_id | FK → workflows | |
| **project_id** | FK → test_projects | **new** |
| **module_id** | FK → test_modules | **new** |
| **testing_type_id** | FK → testing_types | **new** |
| status | String(20) | queued / running / success / failed / cancelled |
| trigger | String(50) | manual / schedule / webhook |
| **triggered_by** | String(255) | **new** — user/system identifier |
| environment | String(50) | dev / staging / production / qa |
| platform | String(20) | web / android / ios / desktop |
| variables | JSON dict | |
| error | Text | nullable |
| started_at / completed_at | DateTime | nullable |
| created_at | DateTime | |

#### `execution_test_case_results` *(new)*
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| execution_id | FK → executions | |
| project_id | FK → test_projects | nullable |
| module_id | FK → test_modules | nullable |
| workflow_id | FK → workflows | nullable |
| test_case_id | FK → test_cases | |
| testing_type_id | FK → testing_types | nullable |
| status | String(20) | pending / running / passed / failed / skipped |
| started_at / completed_at | DateTime | nullable |
| duration_ms | Integer | nullable |
| error_message | Text | nullable |
| created_at | DateTime | |

#### `execution_step_results` *(new)*
| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | |
| execution_id | FK → executions | |
| test_case_result_id | FK → execution_test_case_results | |
| test_case_id | FK → test_cases | |
| test_step_id | FK → test_steps | |
| step_order | Integer | |
| action_type | String(100) | |
| page_id | FK → page_repository | nullable |
| page_element_id | FK → page_elements | nullable |
| api_endpoint_id | FK → api_endpoints | nullable |
| locator_used | Text | actual locator used at runtime |
| input_value | Text | |
| expected_result | Text | |
| actual_result | Text | |
| status | String(20) | pending / passed / failed / skipped |
| error_message | Text | nullable |
| screenshot_url | String(512) | nullable |
| log_output | Text | |
| started_at / completed_at | DateTime | nullable |
| duration_ms | Integer | nullable |
| created_at | DateTime | |

#### `execution_artifacts` (extended)
Previous columns remain. **New columns:**
- `test_case_id` FK → test_cases (nullable)
- `test_step_id` FK → test_steps (nullable)

#### Other execution tables (unchanged)
`execution_nodes`, `execution_events`, `execution_timeline`, `variable_snapshots`, `execution_queue`, `runtime_leases`, `runtime_agents`, `intelligence_jobs`

---

### 1.6 Enterprise Tables (unchanged)
`tenants`, `tenant_members`, `audit_logs`, `enterprise_integrations`, `report_snapshots`

---

## 2. API Routes

### Python FastAPI (`nexus-api`, prefix `/api`)

#### Test Configuration
| Method | Path | Description |
|--------|------|-------------|
| GET | `/test-configuration/tree` | Full tree: projects → modules → cases → steps |
| POST | `/test-configuration/projects` | Create project |
| PUT | `/test-configuration/projects/{id}` | Update project |
| DELETE | `/test-configuration/projects/{id}` | Delete project |
| POST | `/test-configuration/projects/{id}/modules` | Create module |
| PUT | `/test-configuration/modules/{id}` | Update module |
| DELETE | `/test-configuration/modules/{id}` | Delete module |
| POST | `/test-configuration/modules/{id}/cases` | Create test case (now accepts `project_id`, `testing_type_id`) |
| PUT | `/test-configuration/cases/{id}` | Update test case |
| DELETE | `/test-configuration/cases/{id}` | Delete test case |
| POST | `/test-configuration/cases/{id}/steps` | Create test step (now accepts all new explicit fields) |
| PUT | `/test-configuration/steps/{id}` | Update step |
| DELETE | `/test-configuration/steps/{id}` | Delete step |

#### Testing Types *(new)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/testing-types/` | List all (filter by `is_active`) |
| POST | `/testing-types/` | Create custom type |
| GET | `/testing-types/{id}` | Get by id |
| PUT | `/testing-types/{id}` | Update |
| DELETE | `/testing-types/{id}` | Delete |
| POST | `/testing-types/seed` | Insert 8 default types (idempotent) |

#### Page Repository
| Method | Path | Description |
|--------|------|-------------|
| GET | `/page-repository/pages` | List pages |
| POST | `/page-repository/pages` | Create page (accepts `project_id`, `module_id`) |
| GET | `/page-repository/pages/{id}` | Get page with elements |
| PUT | `/page-repository/pages/{id}` | Update page |
| DELETE | `/page-repository/pages/{id}` | Delete page + elements (cascade) |
| POST | `/page-repository/pages/{id}/elements` | Add element |
| PUT | `/page-repository/elements/{id}` | Update element |
| DELETE | `/page-repository/elements/{id}` | Delete element |
| GET | `/page-repository/all` | All pages + elements (used by test step autocomplete) |

#### API Testing *(new)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api-testing/collections` | List collections (filter by `project_id`, `module_id`) |
| POST | `/api-testing/collections` | Create collection |
| GET | `/api-testing/collections/{id}` | Get with endpoints |
| PUT | `/api-testing/collections/{id}` | Update |
| DELETE | `/api-testing/collections/{id}` | Delete (cascade endpoints) |
| POST | `/api-testing/collections/{id}/endpoints` | Add endpoint |
| GET | `/api-testing/endpoints/{id}` | Get endpoint |
| PUT | `/api-testing/endpoints/{id}` | Update endpoint |
| DELETE | `/api-testing/endpoints/{id}` | Delete endpoint |

#### Workflows / Architecture
| Method | Path | Description |
|--------|------|-------------|
| GET | `/workflows/` | List workflows (now includes `project_id`, `module_id`, `test_case_id` on nodes, `execution_order` on edges) |
| POST | `/workflows/` | Create (accepts `project_id`, `module_id` on workflow; `test_case_id` on nodes; `execution_order` on edges) |
| GET | `/workflows/{id}` | Get with nodes + edges |
| PUT | `/workflows/{id}` | Update |
| DELETE | `/workflows/{id}` | Delete |

#### Executions
| Method | Path | Description |
|--------|------|-------------|
| POST | `/executions/` | Trigger (now accepts `project_id`, `module_id`, `testing_type_id`, `triggered_by`) |
| GET | `/executions/` | List (filter by `workflow_id`, `status`) |
| GET | `/executions/{id}` | Get execution detail |
| POST | `/executions/{id}/cancel` | Cancel |
| GET | `/executions/{id}/nodes` | Execution node list |
| GET | `/executions/{id}/timeline` | Timeline entries |
| GET | `/executions/{id}/artifacts` | Artifacts list |

#### Execution Results *(new)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/executions/{id}/test-case-results` | All test-case results for execution |
| POST | `/executions/{id}/test-case-results` | Create result record (called by engine) |
| GET | `/executions/{id}/test-case-results/{result_id}` | Get with step results |
| PATCH | `/executions/{id}/test-case-results/{result_id}` | Update status / timestamps |
| POST | `/execution-results/{tc_result_id}/step-results` | Add step result |
| PATCH | `/execution-results/step-results/{step_result_id}` | Update step result |
| GET | `/executions/{id}/step-results` | Flat list of all step results (filter by `test_case_id`, `status_filter`) |
| GET | `/executions/{id}/results-summary` | Aggregate counts: total/passed/failed/pending per test-case + step |

#### Intelligence / AI Jobs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/intelligence/executions/{id}` | Heuristic analysis (instant, no AI) |
| POST | `/intelligence/executions/{id}/analyze` | Trigger AI job (async, streams via WS) |
| GET | `/intelligence/executions/{id}/jobs` | List AI jobs for execution |
| GET | `/intelligence/jobs/{job_id}` | Job status + result |
| DELETE | `/intelligence/jobs/{job_id}` | Cancel queued job |

#### Runtime Agents
| Method | Path | Description |
|--------|------|-------------|
| GET | `/runtime/agents` | List agents (live, 10s poll) |
| POST | `/runtime/agents` | Register agent |
| POST | `/runtime/agents/{id}/heartbeat` | Heartbeat |
| GET | `/runtime/queue` | Execution queue |
| POST | `/runtime/queue/schedule` | Trigger scheduler |
| GET | `/runtime/leases` | Lease list |

#### Enterprise
| Method | Path | Description |
|--------|------|-------------|
| GET | `/enterprise/reports/execution-summary?days=7` | Real metrics: total/success/failed/running + agent counts |
| GET/POST | `/enterprise/integrations` | Integration CRUD (requires admin role) |
| GET | `/enterprise/audit` | Audit log |
| GET/POST | `/enterprise/tenants` | Tenant management |

#### Other
- `GET /api/plugins/` — plugin catalog (drives node palette)
- `GET /api/plugins/node-types` — flat node type list
- `GET /api/artifacts/{id}/content` — stream artifact bytes
- `GET /api/health` — health check + WS connection count
- `WS /ws` — real-time event stream

---

## 3. Frontend Pages and Navigation

### Sidebar Navigation (`nexus-qa/src/components/layout/Sidebar.tsx`)

| Group | Label | Route | Status |
|-------|-------|-------|--------|
| Command | Workspace | `/` | Wired |
| Command | Create Project | `/workspace/new` | Wired (7-step wizard) |
| Intelligence | Architecture | `/architecture` | ReactFlow DAG builder |
| Intelligence | Page Repository | `/page-repository` | Fully wired CRUD |
| Intelligence | Intent Studio | `/intent-studio` | Partial |
| Intelligence | Test Config | `/test-configuration` | Fully wired |
| Execution | Workflows | `/workflows` | Fully wired |
| Execution | Executions | `/executions` | Fully wired |
| Execution | Agents | `/agents` | Wired to `/api/runtime/agents` |
| Observability | AI Analysis | `/ai-analysis` | Wired + AI job trigger |
| Observability | Knowledge Graph | `/knowledge-graph` | Static |
| Observability | Matrix | `/matrix` | Partial |
| System | Settings | `/settings` | Wired (adapters + integrations) |
| System | Reports | `/reports` | Wired to enterprise summary API |

> **Note:** Old sidebar routes `/testcases`, `/test-designer`, `/execution-control`, `/ai-investigation` were replaced with the above in the last update. Old pages still exist at those URLs but are not in the sidebar.

---

## 4. Post-Project Creation Workflow

After a project is created (`/workspace/new`), the success screen shows 5 ordered steps:

| Step | Page | Route |
|------|------|-------|
| ① Configure Test Cases & Modules | Test Configuration | `/test-configuration` |
| ② Configure Pages & Object Repository | Page Repository | `/page-repository` |
| ③ Configure Test Steps | Test Configuration | `/test-configuration` |
| ④ Build Test Architecture | Architecture Builder | `/architecture` |
| ⑤ Run Execution | Executions | `/executions` |

A workflow breadcrumb strip is shown on both `/test-configuration` and `/page-repository` pages.

---

## 5. Test Step Configuration UI

Located at `/test-configuration`.  
Three-column layout: Project Tree | Test Cases + Steps Table | Case/Module/Project Editor

### Steps Table Columns

| # | Description | Action | Page | Element / Locator | Value / Assertion | 2nd | Eye | Actions |
|---|-------------|--------|------|-------------------|-------------------|-----|-----|---------|
| step_order | Editable text | Dropdown (all action types) | Text + datalist from page repo | Element name + auto-filled locator sub-line | Value OR (assertion type + expected value when ASSERTION) | Secondary action dropdown | Enable/disable toggle | Move up/down, Add after, Delete |

### Element Auto-fill
When the user selects an element name and tabs out, the locator is auto-populated from the Page Repository using `resolveLocatorFromRepo()`. This handles all 7 strategies: xpath, css, id, name, text, role, testid.

### Data Storage
New explicit columns (`action_type`, `page_id`, `page_element_id`, `api_endpoint_id`, `input_value`, `assertion_type`, `secondary_action`, `secondary_value`) are saved alongside the legacy JSON fields (`intent`, `target`, `bindings`, `test_data`) for backward compatibility.

---

## 6. WebSocket Events

Server: `ws://localhost:8000/ws`  
All events are broadcast from `nexus-api/app/events/types.py` → `get_gateway().broadcast_event()`.

### Event type mapping (`nexus-qa/src/hooks/useWebSocket.ts`)

| Backend event class | Frontend RealtimeEventType |
|---------------------|---------------------------|
| `ExecutionStarted` / `execution_started` | `execution_started` |
| `ExecutionCompleted` / `execution_completed` | `execution_completed` |
| `ExecutionFailed` / `execution_failed` | `execution_failed` |
| `ExecutionCancelled` / `execution_cancelled` | `execution_cancelled` *(fixed)* |
| `NodeStarted` / `node_started` | `node_started` |
| `NodeCompleted` / `node_completed` | `node_completed` |
| `NodeFailed` / `node_failed` | `node_failed` *(fixed — was wrongly `node_completed`)* |
| `NodeRetrying` / `NodeSkipped` | `execution_progress` |
| `TerminalLog` / `terminal_line` | `log_added` |
| `BrowserAction` | `execution_progress` |
| `ApiCall` | `execution_progress` |
| `ArtifactCaptured` | `execution_progress` |
| `VariableSet` | `execution_progress` |
| `AIJobQueued` | `ai_job_queued` |
| `AIJobProgress` | `ai_job_progress` |
| `AIJobCompleted` | `ai_job_completed` |

### WS subscription
```json
{ "action": "subscribe", "execution_id": "<id>" }
{ "action": "unsubscribe", "execution_id": "<id>" }
```

---

## 7. Frontend API Hooks (`nexus-qa/src/lib/api/`)

| File | Hooks |
|------|-------|
| `executions.ts` | `useExecutions`, `useExecution`, `useTriggerExecution`, `useCancelExecution` |
| `workflows.ts` | `useWorkflows`, `useWorkflow`, `useCreateWorkflow`, `useUpdateWorkflow`, `useDeleteWorkflow` |
| `testConfiguration.ts` | `useTestConfigurationTree`, `useCreateTestProject`, `useUpdateTestProject`, `useCreateTestModule`, `useCreateTestCase`, `useUpdateTestCase`, `useCreateTestStep`, `useUpdateAnyTestStep`, `useDeleteTestStep` |
| `pageRepository.ts` | `useAllPages`, `useCreatePage`, `useUpdatePage`, `useDeletePage`, `useCreateElement`, `useUpdateElement`, `useDeleteElement` |
| `intelligence.ts` | `useExecutionAnalysis`, `useAIJobs`, `useAIJob`, `useTriggerAIAnalysis`, `useCancelAIJob` |
| `runtime.ts` | `useRuntimeAgents`, `useRuntimeQueue`, `useRuntimeLeases` |
| `enterprise.ts` | `useExecutionSummary`, `useIntegrations`, `useAuditLogs` |
| `artifacts.ts` | `useArtifacts`, `useArtifactContent` |
| `plugins.ts` | `usePlugins`, `usePluginNodeTypes` |
| `adapters.ts` | `useAdapterRuntimes` |

---

## 8. AI Intelligence Pipeline

**Trigger:** `POST /api/intelligence/executions/{id}/analyze`  
**Job types:** `root_cause_analysis` | `flaky_detection` | `locator_healing` | `anomaly_analysis`

**Flow:**
```
POST /analyze
  → build_evidence_bundle(execution_id, db)
  → IntelligenceJobModel saved (status: queued)
  → AIJobQueued event → WebSocket broadcast
  → enqueue_ai_job() background task
    → run_rca_streaming() [LangGraph, 6 nodes]
      → AIJobProgress (×6) → WebSocket
    → AIJobCompleted → WebSocket
  → result saved to intelligence_jobs.result
  → persisted to Qdrant vector store
```

**Frontend:** AI Analysis page (`/ai-analysis`) shows:
- Execution selector + job type selector + "Run" button
- Live job history panel with `QUEUED / RUNNING X% / COMPLETED` badges
- Insight list from heuristic analysis + AI job results

---

## 9. Execution Plugin Architecture

Located in `nexus-api/app/execution/`.

| Plugin | Node types |
|--------|-----------|
| `WebExecutionPlugin` | `web.navigate`, `web.click`, `web.fill`, `web.select`, `web.wait`, `web.assert_text`, `web.extract_text`, `web.screenshot`, `web.upload`, `web.execute_js` |
| `APIExecutionPlugin` | `api.get`, `api.post`, `api.put`, `api.delete`, `api.assert_status`, `api.assert_json_path`, `api.extract`, `api.assert_headers`, `api.assert_response_time` |

**Adding a new plugin:**
1. Create `nexus-api/app/execution/plugins/<name>/plugin.py` subclassing `ExecutionPlugin`
2. Register it in `_register_execution_plugins()` in `main.py`

**Config (`nexus-api/app/config.py`):**
```
enable_web_plugin = true
enable_api_plugin = true
enable_mobile_plugin = false
enable_desktop_plugin = false
web_plugin_headless = true
web_plugin_browser = chromium
web_plugin_record_video = false
web_plugin_record_trace = false
artifact_dir = ./artifacts
```

---

## 10. Nest.js Control Plane

- Location: `nexus-backend/` (port 3001)
- Global prefix: `/api` (set in `main.ts`)
- Frontend proxy: `nexus-qa/src/app/api/control/[...path]/route.ts`
- Default URL: `http://localhost:3001/api` *(fixed — was missing `/api`)*
- Environment override: `NEXT_PUBLIC_CONTROL_API_URL=http://localhost:3001/api`

**Key modules:** Temporal workflow orchestration (DAG execution), intent catalog, runtime management.

**Temporal workflow:** `dagExecutionWorkflow` in `nexus-backend/src/temporal/workflows/dag-execution.workflow.ts`
- Wave-based DAG traversal, per-node retry with exponential backoff
- Cancel signal: `cancelDagExecution`
- Status query: `getDagExecutionStatus`

---

## 11. Execution Flow (How Everything Connects)

```
User selects:
  Project → Workflow Architecture → Environment → Platform

Trigger POST /api/executions/
  ↓ saves to executions table (with project_id, workflow_id, testing_type_id)
  ↓ enqueues in execution_queue
  ↓ launches orchestration engine

Engine:
  1. Fetches WorkflowModel + WorkflowNodeModel + WorkflowEdgeModel
  2. Each node has test_case_id → fetches TestCaseModel + TestStepModel
  3. Steps have page_id / page_element_id / api_endpoint_id → fetches objects
  4. Runs steps via execution plugins (Web or API)
  5. Each step result → POST /execution-results/{tc_result_id}/step-results
  6. Each case result → POST /executions/{id}/test-case-results
  7. Screenshots / logs / traces → execution_artifacts
  8. All events broadcast via WebSocket to subscribed clients

Frontend monitors:
  - useWebSocket(execution_id) subscribes to live events
  - EvidencePanel shows screenshots, browser actions, API calls, variables
  - AI Analysis triggered on-demand: POST /intelligence/executions/{id}/analyze
```

---

## 12. Key File Locations

### Backend (nexus-api)
```
app/
├── main.py                          Entry point, router registration, startup
├── config.py                        Settings (DB URL, plugins, artifact dir)
├── database/
│   ├── models.py                    All 29 SQLAlchemy ORM models
│   └── session.py                   Engine, init_db(), run_migrations()
├── domain/
│   ├── executions/
│   │   ├── repository.py            Execution DB ops
│   │   └── schemas.py               ExecutionTriggerSchema (now has project_id etc)
│   ├── workflows/
│   │   ├── repository.py            Workflow DB ops (now saves project_id, test_case_id)
│   │   └── schemas.py               WorkflowCreateSchema (project_id, test_case_id on nodes)
│   └── test_configuration/
│       ├── repository.py            Test project/module/case/step ops
│       └── schemas.py               All create/update/response schemas
├── api/routes/
│   ├── test_configuration.py        CRUD routes
│   ├── page_repository.py           Page + element CRUD
│   ├── workflows.py                 Workflow CRUD
│   ├── executions.py                Execution trigger + monitoring
│   ├── testing_types.py             NEW — testing type catalog
│   ├── api_testing.py               NEW — api_collections + api_endpoints
│   ├── execution_results.py         NEW — test case + step result storage
│   ├── intelligence.py              AI analysis jobs
│   ├── runtime.py                   Agent fleet
│   └── enterprise.py                Reports, integrations, audit
├── execution/
│   ├── plugin.py                    ExecutionPlugin ABC
│   ├── registry.py                  Plugin registry
│   ├── artifacts.py                 ArtifactStore filesystem backend
│   ├── interpolation.py             {{variable}} interpolation
│   └── plugins/
│       ├── web/plugin.py            Playwright web automation
│       └── api/plugin.py            httpx API automation
└── intelligence/
    ├── evidence_builder.py          Build evidence bundle for AI analysis
    ├── job_dispatcher.py            LangGraph runner + Qdrant persistence
    ├── langgraph_rca.py             Root cause analysis graph
    └── analyzer.py                  Heuristic (no-AI) analysis
```

### Frontend (nexus-qa/src)
```
app/
├── workspace/new/page.tsx           7-step project wizard + ordered success screen
├── test-configuration/page.tsx      Test case + step grid (assertion, secondary action, locator)
├── page-repository/page.tsx         Page + element CRUD (role/testid locators)
├── workflows/page.tsx               Workflow CRUD + ReactFlow builder
├── executions/page.tsx              Execution control + live monitoring
├── agents/page.tsx                  Agent fleet (live from /api/runtime/agents)
├── ai-analysis/page.tsx             AI investigation + job trigger
├── reports/page.tsx                 Real metrics from /api/enterprise/reports/...
└── settings/page.tsx                Adapter runtimes + real integrations list
components/
├── layout/Sidebar.tsx               Navigation (updated routes)
└── execution/EvidencePanel.tsx      Screenshots/browser/API/variables evidence
hooks/
└── useWebSocket.ts                  Event mapping (fixed NodeFailed, ExecutionCancelled)
lib/api/
├── intelligence.ts                  useAIJobs, useTriggerAIAnalysis, useCancelAIJob
├── runtime.ts                       useRuntimeAgents, useRuntimeQueue, useRuntimeLeases
└── enterprise.ts                    useExecutionSummary, useIntegrations, useAuditLogs
types/
└── index.ts                         RealtimeEventType (added node_failed, execution_cancelled, ai_job_*)
```

---

## 13. Environment Variables

### nexus-api
```
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/NexCore
ARTIFACT_DIR=./artifacts
ENABLE_WEB_PLUGIN=true
ENABLE_API_PLUGIN=true
```

### nexus-qa (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
NEXT_PUBLIC_CONTROL_API_URL=http://localhost:3001/api
```

---

## 14. Known Gaps / Not Yet Implemented

| Area | Status |
|------|--------|
| Project creation — backend POST | Wizard UI complete, no `/api/projects` POST call yet. Data stays in UI state only. |
| Architecture persistence | Workflow builder saves to `/api/workflows` but node-to-test-case linking not exposed in UI canvas yet. |
| Dashboard metrics | Live animations only; metrics not pulled from execution DB. |
| Mobile plugin | `enable_mobile_plugin` scaffolded; Appium integration not built. |
| Desktop plugin | Same as mobile. |
| Intent Studio compile/validate | UI partial; backend Nest intent API not fully surfaced in UI. |
| Team management in Settings | Requires tenant_id configuration; shows placeholder message. |
| Execution engine → result tables | Engine writes to `execution_nodes` (old path); new `execution_test_case_results` / `execution_step_results` tables exist but are not yet populated by the engine automatically — populated via API calls from outside or future engine update. |

---

## 15. Dependencies

### Python (nexus-api/requirements.txt)
```
fastapi, uvicorn, sqlalchemy[asyncio]==2.0.23, asyncpg==0.29.0
httpx==0.27.0, playwright==1.45.0
langchain, langgraph, qdrant-client
pydantic>=2.0, nats-py (optional)
```

> Run `playwright install chromium` once on a fresh machine.

### Node.js (nexus-qa/package.json)
```
next 15, react 19, @tanstack/react-query v5
framer-motion, reactflow, recharts, lucide-react
tailwindcss, typescript
```
