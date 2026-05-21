# AI Workflow Orchestrator - Master Implementation Plan

## Product Identity

- Product name: AI Workflow
- Primary agent: TestGenerationAgent
- Platform: Nexus QA
- Backend: FastAPI in `nexus-api`
- Frontend: Next.js in `nexus-qa`
- Existing integration targets:
  - Page Repository: `/page-repository`
  - Element discovery: `/page-repository/discover`
  - Test Configuration: `/test-configuration`

## Architecture Overview

```text
User Input: BRD + Webpage URL + Project Info
        |
        v
TestGenerationAgent
        |
        v
+------------------------------------------------+
| BRDAnalysisAgent            Parses BRD          |
| AppDiscoveryAgent           Runs MCP/Playwright |
| PageConfigurationAgent      Creates page config |
| LocatorRankingAgent         Scores locators     |
| ScenarioGenerationAgent     Creates scenarios   |
| TestCaseGenerationAgent     Creates test cases  |
| TestStepBindingAgent        Maps steps/elements |
| ReviewAndValidationAgent    Flags review items  |
+------------------------------------------------+
        |
        v
Existing APIs: Page Repository + Test Configuration
```

The system must behave like an autonomous QA engineer. The user gives a BRD and a webpage URL. AI Workflow creates or reuses a project and module, discovers page elements, verifies locators, saves Page Repository data, generates scenarios, lets the user select scenarios, and then creates mapped test cases and test steps.

## Plan 1 - Backend Orchestrator And AI Foundation

### 1. New Backend Domain

Create a new backend package:

```text
nexus-api/app/ai_workflow/
|-- router.py
|-- models.py
|-- schemas.py
|-- service.py
|-- state.py
|-- agents/
|   |-- brd_analysis.py
|   |-- app_discovery.py
|   |-- page_configuration.py
|   |-- locator_ranking.py
|   |-- scenario_generation.py
|   |-- testcase_generation.py
|   |-- teststep_binding.py
|   `-- review_validation.py
|-- providers/
|   |-- base.py
|   |-- openai_provider.py
|   |-- claude_provider.py
|   `-- null_provider.py
|-- discovery/
|   |-- adapter.py
|   |-- mcp_adapter.py
|   `-- playwright_adapter.py
|-- prompts/
|   |-- brd_analysis_prompt.py
|   |-- scenario_prompt.py
|   |-- testcase_prompt.py
|   |-- teststep_prompt.py
|   `-- locator_classify_prompt.py
`-- tests/
    |-- test_providers.py
    |-- test_workflow_states.py
    |-- test_scenario_selection.py
    |-- test_testcase_generation.py
    `-- test_unmapped_fallback.py
```

### 2. API Routes

Add `router.py` with these endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/ai-workflows` | Start a workflow from BRD, URL, project info, and model choice |
| `GET` | `/ai-workflows/{workflow_id}` | Poll workflow state, progress, counters, and errors |
| `GET` | `/ai-workflows/models` | List configured providers and models |
| `POST` | `/ai-workflows/{workflow_id}/scenarios/generate` | Generate scenarios after discovery |
| `POST` | `/ai-workflows/{workflow_id}/scenarios/confirm` | Save selected scenario IDs |
| `POST` | `/ai-workflows/{workflow_id}/testcases/generate` | Generate test cases and steps |
| `GET` | `/ai-workflows/{workflow_id}/review` | Return final review summary |

Register this router in the backend application startup with the existing API routers.

### 3. Workflow State Machine

Persist workflow state in the database. Do not keep workflow progress only in memory.

Required states:

```text
CREATED
PROJECT_READY
MODULE_READY
PAGE_CREATED
DISCOVERY_RUNNING
DISCOVERY_DONE
LOCATORS_RANKED
PAGE_SAVED
SCENARIOS_GENERATING
SCENARIOS_READY
AWAITING_CONFIRMATION
TESTCASES_GENERATING
TESTCASES_READY
REVIEW_READY
COMPLETED
FAILED
```

Each transition must be atomic and persisted. `GET /ai-workflows/{workflow_id}` must return:

- current state
- progress percentage
- current message
- project/module/page IDs
- element/scenario/testcase/teststep counters
- unmapped step count
- low-confidence locator count
- accumulated errors

Frontend polling target interval: 2 seconds.

### 4. Core Schemas

Implement Pydantic schemas in `schemas.py`.

#### WorkflowCreateRequest

```python
class WorkflowCreateRequest(BaseModel):
    brd_text: str
    webpage_url: str
    project_name: str
    module_name: str | None = None
    platform: str = "web"
    save_mode: str = "auto"
    ai_provider: str
    ai_model: str
```

#### WorkflowStateResponse

```python
class WorkflowStateResponse(BaseModel):
    workflow_id: str
    state: WorkflowState
    progress_percent: int
    current_message: str
    project_id: str | None = None
    module_id: str | None = None
    page_id: str | None = None
    elements_saved: int = 0
    scenarios: list[ScenarioPreview] = []
    testcases_created: int = 0
    teststeps_created: int = 0
    unmapped_steps: int = 0
    low_confidence_locators: int = 0
    errors: list[str] = []
```

#### ScenarioPreview

```python
class ScenarioPreview(BaseModel):
    scenario_id: str
    title: str
    business_requirement: str
    priority: Literal["high", "medium", "low"]
    test_type: Literal["functional", "regression", "smoke", "e2e"]
    classification: Literal["positive", "negative", "edge"]
    pages_involved: list[str]
    estimated_test_cases: int
    confidence: float
    selected: bool = False
```

#### LocatorCandidate

```python
class LocatorCandidate(BaseModel):
    strategy: str
    locator: str
    verified: bool
    element_count: int
    score: float
    reason: str
```

#### DiscoveredElement

```python
class DiscoveredElement(BaseModel):
    tag: str
    role: str | None = None
    label: str | None = None
    placeholder: str | None = None
    id: str | None = None
    name: str | None = None
    test_id: str | None = None
    text: str | None = None
    css_selector: str
    xpath: str
    is_visible: bool
    is_enabled: bool
    bounding_box: dict[str, float]
    locator_candidates: list[LocatorCandidate]
    best_locator: LocatorCandidate | None = None
    ai_suggested_name: str | None = None
    ai_suggested_action: str | None = None
    confidence: float
```

#### GeneratedTestStep

```python
class GeneratedTestStep(BaseModel):
    step_number: int
    description: str
    action_type: str
    page_id: str | None = None
    page_element_id: str | None = None
    input_value: str | None = None
    assertion_type: str | None = None
    expected_result: str | None = None
    test_data: dict[str, Any] | None = None
    tags: list[str] = []
    needs_review: bool = False
    review_reason: str | None = None
    confidence: float
```

### 5. AI Provider Layer

Create an abstraction in `providers/base.py`:

```python
class AbstractAIProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, schema: type[BaseModel]) -> BaseModel:
        ...
```

Implement:

- `OpenAIProvider`
  - Uses `OPENAI_API_KEY`
  - Uses request `ai_model`
  - Requests strict JSON output
  - Validates the parsed result with Pydantic
- `ClaudeProvider`
  - Uses `ANTHROPIC_API_KEY`
  - Prompts with JSON-only instruction
  - Strips markdown fences before parsing
  - Validates with Pydantic
- `NullProvider`
  - Deterministic fallback for tests and CI
  - Returns template-based structural output

Environment variables:

```env
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
DEFAULT_AI_PROVIDER=claude
DEFAULT_AI_MODEL=claude-sonnet-4-20250514
AI_WORKFLOW_TIMEOUT_SECONDS=600
```

### 6. Discovery Adapter

Create `BrowserDiscoveryAdapter` in `discovery/adapter.py`.

Behavior:

1. Try MCP Playwright adapter if configured.
2. Fall back to existing direct Playwright discovery.
3. Return normalized discovery records for the orchestrator.

Discovery must collect:

- tag
- role
- label
- placeholder
- id
- name
- test id
- text content
- CSS selector
- XPath
- visibility
- enabled state
- bounding box
- page title
- current URL
- accessibility snapshot where available

Environment variables:

```env
MCP_PLAYWRIGHT_URL=http://localhost:3001
PLAYWRIGHT_FALLBACK=true
DISCOVERY_ALLOW_PRIVATE_NETWORK=false
```

### 7. Locator Ranking Rules

`LocatorRankingAgent` scores locator candidates with this priority:

| Priority | Locator type | Base score |
| --- | --- | --- |
| 1 | stable test id | `1.00` |
| 2 | role + accessible name | `0.90` |
| 3 | label/placeholder CSS | `0.80` |
| 4 | unique id | `0.75` |
| 5 | unique name attribute | `0.65` |
| 6 | stable CSS attributes | `0.55` |
| 7 | text locator | `0.45` |
| 8 | XPath fallback | `0.30` |

Rules:

- AI can classify, rename, and recommend locator order.
- `verified = true` must come only from Playwright/MCP verification.
- A locator can be saved as `best_locator` only when `verified = true` and `element_count == 1`.
- Never save an unverified locator as the best locator.

### 8. Orchestrator Responsibilities

`AIWorkflowService` coordinates the complete backend flow:

1. Persist workflow with state `CREATED`.
2. Create or reuse project through existing Test Configuration repository/API.
3. Create or reuse module.
4. Create or reuse page.
5. Trigger `BrowserDiscoveryAdapter`.
6. Rank and verify locators.
7. Save verified elements into Page Repository.
8. Generate scenarios only after model selection.
9. Persist generated scenario previews.
10. Wait for user scenario confirmation.
11. Generate test cases only for selected scenarios.
12. Bind generated steps to `page_id` and `page_element_id` when available.
13. Mark missing bindings as `needs_review = true`.
14. Build final review summary.
15. End in `COMPLETED` or `FAILED`.

### 9. AI Rules Enforced In Code

- All prompt strings live in `app/ai_workflow/prompts/`.
- Route handlers must not contain prompt bodies.
- Every AI response must be validated by Pydantic before saving.
- Failed AI schema validation must add an error to workflow state and continue where possible.
- AI can generate plans, names, classifications, scenarios, test cases, and test steps.
- AI cannot be trusted as the final locator verifier.
- If AI references an element that does not exist in Page Repository, do not invent one. Mark the step as `needs_review = true` with reason `"element not found in page repository"`.
- Existing manual project, module, testcase, and page configuration data must not be overwritten.

### 10. Backend Tests

Add tests:

| Test file | Coverage |
| --- | --- |
| `test_providers.py` | OpenAI/Claude JSON parsing, schema validation, malformed output handling |
| `test_workflow_states.py` | Valid transitions, invalid transition rejection, persisted progress |
| `test_scenario_selection.py` | Confirm endpoint accepts valid IDs and rejects empty selection |
| `test_testcase_generation.py` | Test cases are created only for confirmed scenarios |
| `test_unmapped_fallback.py` | Missing elements create `needs_review = true` steps |

Required backend validation:

```text
python -m py_compile <all new/changed backend python files>
```

## Plan 2 - Frontend AI Workflow Experience

### 1. New Route

Create a new Next.js route:

```text
nexus-qa/src/app/ai-workflow/page.tsx
```

Add API client hooks/types near existing API client modules.

Required frontend API interactions:

- start workflow
- poll workflow state
- fetch available models
- generate scenarios
- confirm selected scenarios
- generate test cases
- fetch final review

### 2. Three-Panel Layout

The AI Workflow page must be a real tool, not a marketing page.

```text
+---------------+--------------------------+--------------------+
| Left Panel    | Main Content             | Right Panel        |
| Step Timeline | Active Step UI           | Live Intelligence  |
| sticky        |                          | sticky             |
+---------------+--------------------------+--------------------+
```

### 3. Left Panel - Workflow Timeline

Always visible vertical timeline:

1. Input
2. Model Selection
3. Discovery
4. Scenarios
5. Test Generation
6. Review

Each item shows:

- step number
- step name
- status icon: pending, active, done, error
- active step highlight
- completed steps clickable for read-only review

### 4. Right Panel - Live Intelligence Summary

Show live counters:

- elements found
- locators verified
- scenarios ready
- tests created
- steps created
- unmapped steps
- low-confidence locators

Also show:

- selected provider/model
- current running agent
- confidence distribution bar: high, medium, low
- last agent message/log line

### 5. Step 1 - Input

Fields:

- BRD textarea, large and resizable
- BRD character count
- BRD upload placeholder accepting `.txt`, `.pdf`, `.docx`
- webpage URL input with HTTP/HTTPS validation
- project name input
- reuse existing project toggle
- module name input
- auto-detect module from BRD toggle
- platform selector: Web default, Mobile, API
- save mode selector: Auto default, Manual review

CTA:

- `Start AI Workflow`

Validation:

- BRD text or file is required
- URL must be valid HTTP/HTTPS
- project name is required

### 6. Step 2 - Model Selection

Show after discovery and before scenario generation.

Model cards:

| Label | Description | Default model |
| --- | --- | --- |
| Fast and Cheaper | Small BRDs and quick iterations | `gpt-4o-mini` |
| Balanced | Good reasoning and moderate cost | `claude-sonnet-4-20250514` |
| Best Reasoning | Complex BRDs and large apps | Claude Opus or GPT-4o |

Each card shows:

- provider label
- model name
- speed indicator
- cost indicator
- best-for description
- select button
- highlighted selected state with checkmark

CTA:

- `Generate Scenarios with <Model Name>`

### 7. Step 3 - Discovery Progress

Show a terminal-style live progress feed:

```text
[00:01] OK  Project "NexusShop" created
[00:02] OK  Module "Checkout" created
[00:03] OK  Page record created for https://...
[00:04] RUN Opening browser via MCP Playwright
[00:06] RUN Collecting DOM snapshot
[00:08] RUN Collecting accessibility tree
[00:11] OK  247 elements discovered
[00:18] OK  198 locators verified
[00:20] RUN AI classifying elements
[00:22] OK  Elements saved to Page Repository
```

Below the log, show a searchable and paginated element table:

- Element Name
- Tag
- Role
- Best Locator Strategy
- Locator String
- Verified
- Confidence

Confidence color:

- green: `>= 0.80`
- amber: `>= 0.50` and `< 0.80`
- red: `< 0.50`

### 8. Step 4 - Scenario Selection

Show scenario cards in a two-column grid.

Each card contains:

- title
- business requirement covered
- priority badge: High, Medium, Low
- test type badge: Functional, Regression, Smoke, E2E
- classification badge: Positive, Negative, Edge
- pages involved
- estimated test case count
- confidence bar
- select/deselect toggle

Top controls:

- Select All
- Deselect All
- filter by priority
- filter by test type
- filter by classification
- counter: `X of Y scenarios selected`

CTA:

- `Generate Test Cases for X Scenarios`
- Disabled until at least one scenario is selected.

### 9. Step 5 - Test Generation Progress

Show a progress bar and live feed:

```text
OK  Processing Scenario: User Login - Happy Path
OK  Test Case created: TC-001
OK  Step 1: Navigate to /login       [page: Login, action: navigate]
OK  Step 2: Enter email              [element: email_input, action: fill]
OK  Step 3: Enter password           [element: password_input, action: fill]
OK  Step 4: Click Login button       [element: login_btn, action: click]
OK  Step 5: Assert dashboard visible [element: dashboard_header, action: assert]
WARN Step 6: Verify toast            [needs-review: element not found]
```

Color indicators:

- green: fully mapped step
- amber: needs review
- red: failed step

Running counters:

- test cases created
- steps mapped
- steps needing review

### 10. Step 6 - Review Dashboard

Summary cards:

- project created/reused
- modules created
- pages created
- elements saved
- scenarios generated
- scenarios selected
- test cases created
- test steps created

Two-column detail section:

- Left: Needs Review Items
  - testcase name
  - step number
  - description
  - reason
  - Mark Resolved action
- Right: Low Confidence Locators
  - element name
  - current locator
  - confidence
  - strategy
  - Edit Locator link to Page Repository

CTA row:

- Open in Test Configuration
- Open Page Repository
- Export Summary as PDF
- Run Another Workflow

### 11. Frontend Design Rules

- Use the existing Nexus QA visual language.
- Keep the interface dense, polished, and operational.
- Use icons in buttons where appropriate.
- Do not create a landing page.
- Avoid nested cards and decorative-only visuals.
- Text must fit in buttons, badges, tables, and cards on mobile and desktop.
- The workflow must be usable from the first screen.

### 12. Frontend Tests

Required checks:

| Area | Validation |
| --- | --- |
| `/ai-workflow` route | Renders without crash |
| Model selector | Selected provider/model state updates |
| Scenario cards | Selection toggles work |
| Review dashboard | Counters render correctly |
| Build | `npm run build` exits with code 0 |

## End-To-End Data Flow

1. User fills BRD, URL, and project info.
2. User clicks `Start AI Workflow`.
3. Frontend calls `POST /ai-workflows`.
4. Backend returns `workflow_id`.
5. Frontend polls `GET /ai-workflows/{workflow_id}` every 2 seconds.
6. Backend creates or reuses project.
7. Backend creates or reuses module.
8. Backend creates or reuses page.
9. Backend triggers `BrowserDiscoveryAdapter`.
10. Discovery collects DOM and accessibility context.
11. `LocatorRankingAgent` scores candidates.
12. Playwright/MCP verifies candidates.
13. Backend saves verified elements to Page Repository.
14. UI shows model selection.
15. User selects model.
16. Frontend calls `POST /ai-workflows/{workflow_id}/scenarios/generate`.
17. `BRDAnalysisAgent` and `ScenarioGenerationAgent` generate scenarios.
18. UI shows selectable scenario cards.
19. User confirms selected scenarios.
20. Frontend calls `POST /ai-workflows/{workflow_id}/scenarios/confirm`.
21. Frontend calls `POST /ai-workflows/{workflow_id}/testcases/generate`.
22. `TestCaseGenerationAgent` creates test cases.
23. `TestStepBindingAgent` maps steps to pages/elements/test data.
24. `ReviewAndValidationAgent` flags unmapped steps and low-confidence locators.
25. Workflow reaches `COMPLETED`.
26. UI shows final review dashboard.

## Integration With Existing APIs

Never create a parallel project/module/testcase system. AI Workflow must reuse or wrap existing repository logic.

| Existing API/domain | AI Workflow usage |
| --- | --- |
| `/page-repository` | Create/reuse page records |
| `/page-repository/discover` | Trigger element discovery or call same service internally |
| Page Repository element model | Save verified elements |
| `/page-repository/all` | Look up pages/elements during step binding |
| `/test-configuration/projects/` | Create/reuse project |
| `/test-configuration/projects/{project_id}/modules/` | Create/reuse module |
| `/test-configuration/modules/{module_id}/cases/` | Create test cases |
| `/test-configuration/cases/{case_id}/steps/` | Create test steps |

## Acceptance Criteria Checklist

- [ ] User can paste BRD and URL, then start a workflow.
- [ ] Model selector appears before scenario generation.
- [ ] Page Repository receives only Playwright/MCP-verified final locators.
- [ ] Scenario list displays metadata and supports selection.
- [ ] Test cases are generated only for selected scenarios.
- [ ] Generated steps include `page_id`, `action_type`, and `page_element_id` where available.
- [ ] Unmapped steps are marked `needs_review = true` with a reason.
- [ ] Low-confidence locators are shown in the Review Dashboard.
- [ ] Existing manual project/module/testcase/page data is not overwritten.
- [ ] Backend Python compile check passes.
- [ ] Frontend build passes.

## Implementation Guardrails

- Keep services small and single-purpose.
- No prompt strings in route handlers.
- Validate every AI response with Pydantic before saving.
- Do not trust AI-generated locators without Playwright/MCP verification.
- Do not invent missing elements during step binding.
- Use `needs_review` for unmapped or uncertain steps.
- Discovery must run through `BrowserDiscoveryAdapter`.
- Workflow state must be persisted and resumable.
- The UI must show progress and partial errors clearly.

## Recommended Build Order

1. Add backend schemas, state enum, ORM model, and router registration.
2. Add `NullProvider` and provider abstraction.
3. Implement workflow creation, polling, and state transitions.
4. Wire project/module/page creation using existing repositories.
5. Wire discovery adapter to existing Playwright discovery.
6. Add locator ranking and verified-element save path.
7. Add scenario generation with `NullProvider`, then real providers.
8. Add scenario confirmation.
9. Add testcase/teststep generation and binding.
10. Add review summary.
11. Build `/ai-workflow` frontend page.
12. Add model selector, polling, scenario selection, generation feed, and review dashboard.
13. Add tests.
14. Run backend compile check and frontend build.

