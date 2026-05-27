# MCP Inspect Design

## Purpose

MCP Inspect is the full-authority investigation and repair system for NexCore QA executions. It goes beyond surface-level locator analysis and can diagnose failures across test configuration, page repository, backend execution code, database state, API behavior, browser runtime, evidence artifacts, and connected MCP servers.

Execution Quick Heal stays narrow and safe for minor locator fixes. MCP Inspect is the deep investigation workspace.

## Core Promise

MCP Inspect answers four questions for any failed execution:

1. What exactly failed?
2. Why did it fail across config, code, DB, API, browser, and environment layers?
3. What should be changed?
4. Can the system safely implement that change with audit and rollback?

## Authority Model

MCP Inspect can be given broad authority, but every authority level is explicit.

| Mode | What It Can Do | User Control |
| --- | --- | --- |
| Observe | Read execution, DB, logs, code, artifacts, API responses, browser state | No approval needed |
| Recommend | Produce ranked fixes with exact target files/rows/API calls | User reviews |
| Patch Config | Update Test Configuration, Page Repository, workflow nodes, retry/wait config | One-click approval |
| Patch Runtime | Edit backend/frontend code, plugin handlers, action mapping, selectors, schemas | Diff approval required |
| Patch DB | Run transactional DB updates/migrations/backfills | SQL preview plus backup required |
| Full Autopilot | Execute approved policy-scoped changes end-to-end | Disabled by default; audit required |

Full authority should mean "has the tools available", not "silently changes everything." MCP Inspect must show the planned patch set, confidence, blast radius, and rollback plan before high-impact actions.

## MCP Server Design

MCP Inspect is an orchestrator that can call specialized MCP tools.

| MCP Tool | Responsibility |
| --- | --- |
| Browser MCP | Reproduce execution in Playwright, inspect DOM, screenshots, network, console, accessibility tree |
| DB MCP | Read/write Postgres records, run transactional SQL, compare before/after rows |
| API MCP | Call NexCore APIs and target-app APIs, validate request/response contracts |
| Repo MCP | Read/edit code, produce diffs, run tests/builds, inspect git state |
| TestConfig MCP | Read/update projects, modules, test cases, steps, page elements, workflow node configs |
| Evidence MCP | Fetch screenshots, DOM snapshots, traces, logs, artifacts, timeline entries |
| Memory MCP | Retrieve similar failures, store fixed patterns, compare recurrence |
| Policy MCP | Enforce permissions, approvals, scope limits, rollback requirements |

The orchestrator should never bypass Policy MCP.

## Error Classes MCP Inspect Should Handle

### Locator and Element Failures

- Wrong absolute XPath.
- Wrong relative XPath.
- Wrong CSS selector.
- Element renamed or moved in DOM.
- Element hidden, detached, disabled, covered, or not editable.
- Playwright strict mode matched multiple elements.
- Page Repository element points to the wrong target.
- Test step linked to the wrong page element.
- Fallback locator exists but workflow config is stale.

Possible actions:

- Update Page Repository locator.
- Update linked test step locator fields.
- Refresh workflow node config.
- Generate better XPath/CSS/text/role locators.
- Verify locator in Browser MCP before applying.

### Action Mapping and Runtime Handler Failures

- Checkbox configured as assertion instead of check.
- Radio button configured as click instead of check.
- Dropdown configured as click instead of select.
- Keyboard action using a fake selector.
- Drag-and-drop source/target reversed or missing.
- Double-click/right-click/hover action not supported by plugin.
- Backend action mapping returns the wrong node type.
- Web plugin lacks handler for configured action.

Possible actions:

- Update test step action type.
- Update execution route mapping.
- Add or fix backend plugin handler.
- Add unit tests for action mapping.
- Refresh persisted workflow nodes.

### Assertion and Test Data Failures

- Expected text does not match actual text.
- Checkbox expected value checked using text assertion.
- Input value is wrong or outdated.
- Dropdown option label/value mismatch.
- Date format mismatch.
- Test data missing for fill/select/upload.
- Assertion belongs to a different UI state.

Possible actions:

- Recommend assertion correction.
- Update test step expected result.
- Convert wrong action to correct action.
- Add precondition/wait step.
- Mark as manual review if business expectation is unclear.

### Timing, Wait, and Readiness Failures

- Element appears late.
- Page load finished but UI data is still loading.
- Spinner/overlay blocks interaction.
- Network request not complete.
- Timeout too low.
- Retry policy wrong.
- Test step starts before previous action settles.

Possible actions:

- Add wait condition.
- Increase timeout only when justified by evidence.
- Add wait for URL, response, selector visible, selector enabled, or network idle.
- Tune retry policy.

### Navigation and Environment Failures

- HTTP 403/429.
- CAPTCHA or bot-block page.
- Cloudflare/access denied page.
- Wrong URL or route.
- Login/session expired.
- Environment unavailable.
- Test account lacks permission.

Possible actions:

- Recommend environment/access fix.
- Stop locator changes when page is blocked.
- Add auth/session setup step.
- Update base URL or environment variable.
- Escalate to manual if target system blocks automation.

### Backend Code and Plugin Failures

- Plugin handler throws runtime exception.
- State machine rejects a valid transition.
- Workflow generator persists stale config.
- API route has missing import or wrong query.
- DB model mismatch.
- Serialization/deserialization bug.
- Background worker crashes.
- Unsupported node type.

Possible actions:

- Patch backend code.
- Add regression tests.
- Run focused test suite.
- Restart/reload requirement note.
- Prepare rollback diff.

### Database and Configuration Integrity Failures

- Test step not linked to page element.
- Page element updated but linked steps stale.
- Workflow nodes stale after config changes.
- Execution references deleted page/test config.
- Duplicate/conflicting page elements.
- Invalid JSON fields in test data/bindings.
- Broken FK references.

Possible actions:

- Transactional DB repair.
- Backfill missing links.
- Rebuild workflow nodes.
- Normalize test_data and bindings.
- Store audit entry with before/after JSON.

### API and Contract Failures

- Unexpected HTTP status.
- Response schema mismatch.
- Missing field or changed field type.
- Auth/header/cookie missing.
- Endpoint URL wrong.
- API collection or endpoint config stale.

Possible actions:

- Inspect API evidence.
- Update API endpoint config.
- Update assertion/schema.
- Recommend auth/header fix.

### Browser, Runner, and MCP Failures

- Browser crashed.
- Context/session closed.
- Download/upload path issue.
- File chooser failed.
- MCP server unavailable.
- Playwright command unsupported.
- Screenshot/DOM capture missing.

Possible actions:

- Retry with fresh browser context.
- Patch runtime plugin.
- Fix artifact capture.
- Recommend runner/MCP service restart.

### Flaky and Historical Pattern Failures

- Passes on retry.
- Fails only in one environment.
- Similar failure seen before.
- Rate-limit pattern.
- Slow selector cluster.
- UI animation/overlay intermittent issue.

Possible actions:

- Compare similar failures.
- Recommend stable wait/locator/policy change.
- Store memory after confirmed fix.

## Investigation Pipeline

1. Ingest execution evidence.
2. Build failure graph: execution -> failed node -> workflow node -> test step -> page element -> backend handler -> artifacts.
3. Classify failure layer: locator, action mapping, assertion, timing, environment, backend, DB, API, runner.
4. Reproduce with Browser MCP when possible.
5. Verify config and code support:
   - Does action type exist?
   - Does execution route map it correctly?
   - Does plugin implement node type?
   - Does workflow node config match current test step?
6. Generate patch candidates.
7. Score candidates by confidence, blast radius, and reversibility.
8. Preview exact changes.
9. Apply approved changes transactionally.
10. Run verification tests or smoke execution.
11. Store fix memory and audit trail.

## UI Design

Design direction: real-time monitoring dashboard with terminal-green authority signals, red blast-radius warnings, and precise code/data panels.

### Main Layout

- Left rail: executions, severity filters, failure class filters.
- Center: investigation graph and live agent worklog.
- Right rail: authority panel, tool calls, approvals, rollback.
- Bottom drawer: patch preview with tabs for Config, DB, Code, API, Browser.

### Required Panels

| Panel | Purpose |
| --- | --- |
| Failure Graph | Shows node -> test step -> page element -> backend handler -> DB rows |
| Evidence Timeline | Logs, screenshots, DOM, network, API calls, console |
| Tool Console | Live MCP tool calls with input/output summary |
| Capability Matrix | Shows what AI Inspect can solve and current permission level |
| Patch Plan | Ranked changes with target, confidence, blast radius |
| Diff/SQL Preview | Code diffs, DB before/after, API payloads |
| Verification Runner | Run unit tests, API smoke, browser reproduction |
| Audit Trail | Who approved, what changed, rollback command/data |

## Backend API Shape

### Start Deep Inspect

```http
POST /api/intelligence/executions/{execution_id}/inspect
```

Body:

```json
{
  "mode": "recommend",
  "authority": ["read_db", "read_code", "browser_mcp", "api_calls"],
  "focus": ["locator", "action_mapping", "backend", "db", "api", "environment"],
  "tenant_id": "default"
}
```

### Get Inspect Session

```http
GET /api/intelligence/inspect/{session_id}
```

### Preview Patch

```http
POST /api/intelligence/inspect/{session_id}/preview
```

### Apply Patch

```http
POST /api/intelligence/inspect/{session_id}/apply
```

Body:

```json
{
  "approved_plan_id": "plan-123",
  "approval_note": "Approved locator + action mapping fix",
  "verification": ["unit_tests", "db_smoke", "browser_replay"]
}
```

### Rollback

```http
POST /api/intelligence/inspect/{session_id}/rollback
```

## Data Model Additions

### inspect_sessions

- id
- execution_id
- status
- authority_level
- requested_authorities
- granted_authorities
- current_phase
- confidence
- created_at
- completed_at

### inspect_tool_calls

- id
- session_id
- tool_name
- input_summary
- output_summary
- status
- started_at
- completed_at

### inspect_patch_plans

- id
- session_id
- title
- confidence
- blast_radius
- actions_json
- rollback_json
- status

### inspect_audit_events

- id
- session_id
- event_type
- actor
- before_json
- after_json
- created_at

## Implementation Phases

### Phase 1: Deep Read-Only Inspect

- Add inspect session API.
- Build failure graph.
- Add capability matrix UI.
- Read DB/code/config/artifacts.
- No writes.

### Phase 2: Verified Config Repairs

- Apply Test Configuration, Page Repository, and workflow node fixes.
- Require preview and audit.
- Verify with unit tests and DB smoke.

### Phase 3: Backend Code Patch Support

- Generate code diffs for route/plugin/state-machine issues.
- Run targeted tests.
- Require diff approval.

### Phase 4: DB/API/MCP Full Authority

- Transactional DB changes.
- API repair workflows.
- Browser MCP reproduction.
- Tool-call timeline.

### Phase 5: Autopilot Policies

- Enable scoped auto-apply policies for low-risk fixes.
- Keep high-risk code/DB migrations approval-gated.

## Non-Negotiable Safety Rules

- No destructive DB/code change without rollback data.
- No code patch without diff preview.
- No DB patch without before/after preview.
- No external API mutation without request preview.
- No locator fix if navigation is blocked.
- No silent fixes to business assertions.
- Every applied fix must create an audit event.
- Every code/config fix should run at least one focused verification.

