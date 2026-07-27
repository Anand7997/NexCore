# NexCore Recorder Beyond UFT Blueprint

## Purpose

Build the NexCore recording layer into an AI-native, self-healing, repository-first recording system that goes beyond UFT-style recording. The target is not only to capture user actions, but to understand intent, learn stable objects, produce reusable automation assets, and continuously improve recorded tests after every run.

This document focuses only on the recording part of NexCore: desktop recorder sessions, live recorder agent, Desktop MCP capture, object spy integration, compile pipeline, repository suggestions, keyword generation, workflow generation, reusable components, evidence, and quality review.

## Product Goal

NexCore Recorder should become a "record once, maintain intelligently" system.

UFT-style recording is strong at object-based capture, object repositories, and enterprise desktop technology support. NexCore should exceed that by combining deterministic UI Automation metadata with AI perception, semantic intent extraction, automatic component creation, quality scoring, self-healing feedback, and multi-platform recording.

## Current NexCore Foundation

The repo already has the important base pieces:

- Desktop recorder API in `nexus-api/app/api/routes/desktop_recorder.py`.
- Recorder compiler in `nexus-api/app/execution/plugins/desktop/recorder.py`.
- Live Windows recorder agent in `nexus-api/tools/desktop_recorder_agent.py`.
- Desktop MCP server in `nexus-api/tools/desktop_mcp_server.py`.
- Desktop Object Spy API in `nexus-api/app/api/routes/desktop_spy.py`.
- Desktop object repository APIs in `nexus-api/app/api/routes/page_repository.py`.
- Smart identification support in `nexus-api/app/execution/plugins/desktop/smart_identification.py`.
- Desktop Recorder UI in `nexus-qa/src/app/desktop-recorder/page.tsx`.
- Recorder tests in `nexus-api/tests/execution/plugins/desktop/test_recorder.py` and API route tests.

The next step is to convert this foundation into a complete advanced recorder system.

## Beyond UFT Principles

1. Object-first, not coordinate-first.
   Every captured action should prefer stable UIA, Automation ID, name, class, hierarchy, relative anchor, and repository keys before using coordinates.

2. Semantic capture, not raw replay.
   A click on a Save button should become "save customer form", not merely "click x=410,y=220".

3. Repository learning by default.
   Every useful captured object should become a reviewable repository candidate with locator quality, risk flags, history, and impact analysis.

4. Quality gates before workflow save.
   The recorder should show whether a recorded test is production-ready, review-needed, or unstable.

5. AI-assisted, deterministic-controlled.
   AI may suggest object labels, intent, checkpoints, reusable components, and locator repair, but deterministic verification must own final locator trust.

6. Self-healing feedback loop.
   Every execution should feed locator attempt outcomes back into recorder intelligence and object repository suggestions.

7. Multi-evidence capture.
   Each step should be backed by UI tree, screenshot, locator candidates, selected locator reason, window/process context, timing, and optional OCR/visual evidence.

8. Human review where it matters.
   The UI should ask for review only when the action is risky: coordinate-only, weak locator, virtual object, sensitive data, missing checkpoint, or unstable window context.

## UFT Baseline vs NexCore Target

| Area | UFT-style baseline | NexCore beyond-UFT target |
| --- | --- | --- |
| Recording | Captures object actions into scripts | Captures actions, intent, repository candidates, quality diagnostics, evidence, and reusable assets |
| Object repository | Central object storage | Versioned, scored, AI-assisted repository with impact analysis and healing suggestions |
| Smart identification | Property fallback | Ranked deterministic, historical, relative-anchor, OCR, visual, and AI candidates with evidence |
| Script generation | Recorded code/keyword steps | Keyword steps, workflow nodes, business components, checkpoints, and data parameters |
| Maintenance | Manual object update and rerun | Auto-suggested repairs from failed and healed executions |
| Visual handling | Image/AI object support depending on setup | UIA + OCR + screenshot + visual-template + multimodal perception candidates |
| Recorder review | Manual inspection | Production-readiness score, weak-step heatmap, and fix recommendations |
| Data handling | Parameterization after recording | Auto-detect sensitive values, credentials, test data candidates, and environment variables |
| Enterprise controls | Add-ins | Extension packs plus custom-control SDK, MCP capture, and AI object modeling |
| Reporting | Run reports | Recorder quality reports, locator stability reports, repository drift reports, and evidence trace |

## Target Architecture

```text
Desktop App / Web App / Remote Desktop
        |
        v
Recorder Capture Layer
  - Live Windows agent
  - Desktop MCP server
  - Object Spy capture
  - Future web/mobile recorder adapters
        |
        v
Normalization Layer
  - Action normalization
  - UIA metadata extraction
  - Window/process scoping
  - Sensitive-data redaction
  - Locator candidate generation
        |
        v
Intelligence Layer
  - Locator quality scoring
  - Intent classification
  - Reusable component detection
  - Checkpoint recommendation
  - Parameterization recommendation
  - Noise/wait filtering
        |
        v
Repository Learning Layer
  - Object repository suggestions
  - Existing object matching
  - Duplicate detection
  - Version diff and impact preview
  - Approval workflow
        |
        v
Compiler Layer
  - Keyword table
  - Workflow nodes and edges
  - Reusable components
  - Master-sheet bindings
  - Test data and environment variables
        |
        v
Execution Feedback Loop
  - Locator attempt evidence
  - Failed step classification
  - Healing suggestion
  - Recorder quality model update
```

## Recorder Data Contract

Every recorded action should support this enriched structure:

```json
{
  "action_type": "click",
  "object_key": "customer_save_button",
  "object_name": "Save",
  "semantic_intent": "save_customer_form",
  "business_action": "Save customer",
  "control_type": "Button",
  "automation_id": "btnSave",
  "name_text": "Save",
  "class_name": "Button",
  "uia_path": "/Window/Pane/Button[3]",
  "locator_strategy": "accessibility id",
  "value": "",
  "expected": "",
  "window_title": "Customer Management",
  "process_name": "CustomerApp.exe",
  "screen": "Customer Form",
  "x": 410,
  "y": 220,
  "duration_ms": 85,
  "locators": [
    {
      "strategy": "accessibility id",
      "locator": "btnSave",
      "score": 0.98,
      "verified": true,
      "element_count": 1,
      "reason": "Stable Automation ID"
    },
    {
      "strategy": "name",
      "locator": "Save",
      "score": 0.86,
      "verified": true,
      "element_count": 1,
      "reason": "Visible control text"
    }
  ],
  "quality": {
    "score": 0.94,
    "grade": "production_ready",
    "risk_flags": [],
    "fixes": []
  },
  "evidence": {
    "screenshot_artifact_id": "artifact_step_1_png",
    "ui_tree_artifact_id": "artifact_step_1_uia",
    "selected_locator_reason": "Automation ID is unique and stable"
  },
  "metadata": {
    "source": "live_desktop_recorder_agent",
    "recording_mode": "uia",
    "capture_scope": "element",
    "redacted": false
  }
}
```

## Recording Modes

### UIA Mode

Use when the recorder can identify a real UI Automation element.

Required capture:

- Automation ID.
- Name/text.
- Control type.
- Class name.
- UIA path.
- Bounding box.
- Window title.
- Process name.
- Parent/child hierarchy.
- Locator candidates.

Output should be production-ready if the object has at least one unique deterministic locator.

### Hybrid Mode

Use when UIA metadata exists but the click/type also needs coordinate context.

Required capture:

- All UIA fields from UIA mode.
- Screen coordinate.
- Relative coordinate inside bounding box.
- Relative anchor locator.
- Screenshot crop if available.

Output should be review-needed if deterministic locators are incomplete.

### Analog Mode

Use only when no reliable object metadata exists.

Required capture:

- Coordinate.
- Window title.
- Process name.
- Screenshot.
- OCR text near point.
- Visual crop.
- Relative anchor candidates.
- Virtual object model.

Output should never be silently marked production-ready. It must become a virtual object suggestion with review.

## Locator Quality Model

Each recorded step should receive a quality score from 0 to 1.

Suggested weights:

- Automation ID unique: +0.35
- Stable name/text unique: +0.18
- UIA hierarchy available: +0.14
- Class/control type available: +0.08
- Window/process scope available: +0.08
- Relative anchor available: +0.07
- Screenshot/UI tree evidence available: +0.05
- Historical success signal: +0.05
- Coordinate-only penalty: -0.35
- Placeholder object name penalty: -0.15
- Shell/window fallback penalty: -0.20
- Sensitive value without redaction penalty: -0.30
- Duplicate locator penalty: -0.20

Grades:

- `production_ready`: score >= 0.85 and no blocking risk flags.
- `review_needed`: score >= 0.60 and at least one fix recommendation.
- `unstable`: score < 0.60 or coordinate-only without verified visual/relative fallback.

Risk flags:

- `coordinate_only`
- `window_fallback`
- `placeholder_name`
- `missing_automation_id`
- `duplicate_name`
- `missing_window_scope`
- `sensitive_value`
- `weak_virtual_object`
- `unverified_ai_locator`
- `missing_checkpoint`
- `no_repository_match`

Fix recommendations:

- Add Automation ID if app is owned by the team.
- Promote UIA path as secondary locator.
- Add name/text as fallback locator.
- Create virtual object with screenshot/OCR evidence.
- Bind this step to an existing repository object.
- Add checkpoint after submit/save/navigation.
- Parameterize typed value.
- Replace fixed wait with condition-based wait.

## Compiler Output

The compile endpoint should return:

- `keyword_steps`: clean keyword rows with quality, evidence references, and semantic labels.
- `workflow`: executable desktop workflow.
- `repository_suggestions`: object repository candidates.
- `component_suggestions`: reusable business components.
- `checkpoint_suggestions`: recommended assertions.
- `parameter_suggestions`: data values that should become variables.
- `quality_report`: production readiness, weak steps, risk flags, and fixes.
- `object_repository_diff`: new, matched, changed, duplicate, and stale objects.
- `evidence_summary`: screenshot, UI-tree, virtual-crop, and missing-evidence coverage.
- `evidence_steps`: drawer-ready rows with selected locator, locator reason, artifacts, context, quality, and semantic labels.
- `semantic_steps`: deterministic semantic analysis per recorded action.
- `semantic_analysis`: business-flow summary, category counts, intent counts, confidence counts, and semantic checkpoint/parameter hints.
- `execution_readiness`: whether workflow can run unattended.

Implemented compile response shape:

```json
{
  "session_id": "session-123",
  "name": "Customer Flow",
  "platform": "desktop",
  "keyword_steps": [
    {
      "step": 1,
      "object": "Save",
      "operation": "click",
      "quality_grade": "production_ready",
      "quality_score": 0.91,
      "screenshot_artifact_id": "artifact_step_1_png",
      "ui_tree_artifact_id": "artifact_step_1_uia",
      "selected_locator_reason": "Automation ID is unique and stable",
      "semantic_intent": "submit_form",
      "business_action": "Submit form",
      "semantic_category": "transaction",
      "semantic_confidence": 0.88
    }
  ],
  "workflow": {},
  "repository_suggestions": [],
  "component_suggestions": [],
  "checkpoint_suggestions": [],
  "parameter_suggestions": [],
  "object_repository_diff": {
    "summary": {
      "new": 2,
      "matched": 7,
      "changed": 1,
      "duplicate": 0,
      "stale": 0
    }
  },
  "evidence_summary": {
    "total_steps": 10,
    "steps_with_screenshot": 8,
    "steps_with_ui_tree": 9,
    "steps_with_virtual_crop": 1,
    "steps_missing_evidence": 1,
    "artifact_ids": []
  },
  "evidence_steps": [],
  "semantic_steps": [],
  "semantic_analysis": {
    "total_steps": 10,
    "dominant_category": "transaction",
    "categories": {
      "data_entry": 4,
      "transaction": 3,
      "verification": 3
    },
    "high_confidence_steps": 8,
    "review_needed_steps": 2,
    "business_flow": ["Enter username", "Enter password", "Submit login"]
  },
  "quality_report": {
    "score": 0.88,
    "grade": "production_ready",
    "production_ready_steps": 8,
    "review_needed_steps": 2,
    "unstable_steps": 0,
    "risk_summary": {
      "coordinate_only": 1,
      "missing_checkpoint": 2
    },
    "top_fixes": [
      "Review step 5 coordinate fallback",
      "Add checkpoint after Save"
    ]
  },
  "execution_readiness": {
    "can_run_unattended": true,
    "blocking_issues": [],
    "warnings": []
  }
}
```

## Advanced Recorder Features

### 1. Intent-Aware Recording

The recorder should infer intent from action sequence, object labels, control types, screen names, and values.

Examples:

- Type into Username + type into Password + click Login = Login Component.
- Fill form fields + click Save = Save Form Component.
- Search field + click Search + results visible = Search Component.
- Click Export + file dialog = Export File Component.

Generated fields:

- `semantic_intent`
- `business_action`
- `component_candidate`
- `expected_next_state`
- `checkpoint_candidates`

### 2. Object Repository Autopilot

For every recorded object:

- Match against existing repository objects.
- Show exact/strong/weak/no match.
- Suggest new object only when no strong match exists.
- Detect renamed objects by locator similarity.
- Detect duplicate objects by Automation ID or hierarchy.
- Show before/after locator diff before updating repository.
- Require approval for weak or changed repository objects.

### 3. AI Object Spy Fusion

Recorder should use Object Spy data in three ways:

- Pre-recording: inspect target app and learn object map.
- During recording: enrich weak actions with deeper UI tree/screenshot capture.
- Post-recording: compare recorded objects against spy snapshot and repository.

Fusion inputs:

- UIA candidate.
- OCR candidate.
- Visual-template candidate.
- Screenshot crop.
- Existing repository object.
- Historical execution success.

Fusion output:

- Best locator.
- Alternative locators.
- Object label.
- Locator strength.
- Risk flags.
- Human-readable explanation.

### 4. Virtual Object Learning

For owner-drawn, canvas, remote desktop, Citrix, terminal, and custom controls:

- Capture crop around click point.
- Capture OCR text near point.
- Capture relative position inside parent window or anchor.
- Store virtual object profile.
- Allow user to name the virtual object.
- Generate `desktop.custom_control_action` nodes.
- Reuse virtual object profiles across sessions.

### 5. Checkpoint Recommendation

The recorder should suggest checkpoints automatically.

Rules:

- After Save/Submit/Login/Next/Finish: suggest success/status checkpoint.
- After Search: suggest results visible/count checkpoint.
- After navigation: suggest active window/screen checkpoint.
- After file export: suggest file exists checkpoint.
- After extraction: suggest non-empty value checkpoint.
- After delete: suggest object absent or confirmation message checkpoint.

Checkpoint output:

- `desktop.assert_text`
- `desktop.assert_property`
- `desktop.assert_visible`
- `desktop.wait_window`
- `desktop.file_exists`
- `desktop.extract_text`

### 6. Test Data Parameterization

Recorder should detect:

- Names.
- Emails.
- Phone numbers.
- Dates.
- Amounts.
- IDs.
- Credentials.
- File paths.
- Environment-specific values.

It should recommend:

- Variable names.
- Default values.
- Master-sheet keys.
- Secret-store keys for sensitive values.
- Example data rows.

### 7. Noise Filtering

Recorder should suppress or merge:

- Mouse move noise.
- Duplicate clicks on same object within a short interval.
- Focus-only clicks before typing.
- Accidental window activation events.
- Keyboard chatter.
- Unnecessary waits.
- Shell windows captured by mistake.

The raw event can remain in diagnostics, but compiled workflow should stay clean.

### 8. Smart Wait Generation

Instead of recording fixed waits, NexCore should infer condition-based waits:

- Wait for window.
- Wait for object visible.
- Wait for object enabled.
- Wait for text contains.
- Wait for process idle.
- Wait for file exists.
- Wait for network/API response if correlated.

### 9. Continuous Learning Loop

After every execution:

- Record which locator succeeded.
- Record which locator failed.
- Update locator history.
- Generate healing suggestions for repository review.
- Lower score for unstable locators.
- Increase score for consistently successful locators.
- Update recorder quality model.

### 10. Cross-Platform Recorder Strategy

Desktop recorder is first priority, but the architecture should support:

- Web recorder with Playwright locator verification.
- Mobile recorder with Appium accessibility IDs.
- API recorder from browser/network traffic.
- Hybrid flow recorder across desktop, web, API, and database steps.

The compile output should be platform-aware but share the same semantic concepts: action, object, locator, intent, evidence, data, checkpoint, component, and quality.

## UI Requirements

Enhance `/desktop-recorder` with:

- Session quality score.
- Step quality badges.
- Risk flag column.
- Weak locator review queue.
- Repository match panel.
- Suggested checkpoint panel.
- Parameterization panel.
- Component preview panel.
- Evidence drawer per step.
- Raw event vs compiled step toggle.
- Promote object to repository button.
- Approve/reject repository update button.
- "Make production-ready" action that applies safe fixes and lists manual fixes.

Recommended main layout:

```text
Left: Sessions
Center: Recorded steps + quality badges + keyword view
Right: Recorder intelligence
  - Quality report
  - Repository suggestions
  - Component suggestions
  - Checkpoint suggestions
  - Parameter suggestions
  - Live Agent / MCP tools
```

## Backend Implementation Plan

> Implementation status (updated 2026-06-24): Phases 1-5 are implemented and tested.
> Phase 6 execution feedback loop and Phase 7 advanced capture adapters remain open.

### Phase 1: Recorder Quality Report — DONE

Add quality scoring in `nexus-api/app/execution/plugins/desktop/recorder.py`.

Deliverables:

- [x] Per-action `quality` object (`assess_action_quality`, mirrored onto node, keyword, repository suggestion).
- [x] Compile-level `quality_report` (`build_quality_report`).
- [x] Risk flag and fix recommendation functions (`QUALITY_WEIGHTS`, `BLOCKING_RISK_FLAGS`, `RISK_FIXES`).
- [x] Unit tests for production-ready, review-needed, and unstable steps.
- [x] TS types + "Recorder Quality" panel and per-step quality badges in `/desktop-recorder`.

### Phase 2: Rich Compile Suggestions — DONE

Add:

- [x] `checkpoint_suggestions` (`suggest_checkpoints`)
- [x] `parameter_suggestions` (`suggest_parameters`, with sensitive→secret masking)
- [x] `execution_readiness` (`assess_execution_readiness`)
- [x] `object_repository_diff` -- delivered in Phase 3 with DB repository access

Deliverables:

- [x] Extend compile response schema.
- [x] UI panels for suggestions (Checkpoint, Parameter, Execution Readiness).
- [x] Tests for common action patterns.

### Phase 3: Repository Matching During Compile — DONE

Connect recorder compile with desktop object repository.

Deliverables:

- [x] Match recorded objects against repository (`build_object_repository_diff` + `_load_existing_desktop_objects` in the compile route).
- [x] Return match confidence (exact/strong/weak/none scoring).
- [x] Return create/update/duplicate/no-op recommendation (plus `stale` detection).
- [x] Add approval flow hooks (`object_repository_diff` buckets surfaced as badges in the Repository Suggestions panel).
- [x] Unit tests for the diff + a route integration test against seeded repository objects.

### Phase 4: Evidence Capture -- DONE

Compile now exposes step-level evidence without requiring the UI to re-derive it from raw actions.

Deliverables:

- [x] Return `evidence_summary` from `compile_recording`.
- [x] Return drawer-ready `evidence_steps` from `build_evidence_steps`.
- [x] Preserve screenshot, UI tree, virtual crop, selected locator, selected strategy, selected locator reason, locator candidates, window/process, timing, and point context.
- [x] Mirror evidence identifiers onto keyword rows where useful.
- [x] Add an Evidence Trace panel in `/desktop-recorder`.
- [x] Add an Evidence drawer per compiled keyword step.
- [x] Add backend tests for compile evidence output and route-level analyze output.

Implemented files:

- `nexus-api/app/execution/plugins/desktop/recorder.py`
- `nexus-api/app/api/routes/desktop_recorder.py`
- `nexus-qa/src/app/desktop-recorder/page.tsx`
- `nexus-qa/src/lib/api/types.ts`

### Phase 5: Deterministic Semantic Layer -- DONE

The first semantic layer is intentionally deterministic. It does not depend on an AI provider, so compile and `/analyze` produce repeatable results in local tests and CI.

Deliverables:

- [x] Add deterministic semantic module: `nexus-api/app/execution/plugins/desktop/semantics.py`.
- [x] Classify common intents such as username entry, password entry, search, submit form, login submit, export, delete, navigation, verification, extraction, and keyboard operations.
- [x] Produce `business_action`, `semantic_intent`, category, confidence, signals, tokens, value type, sensitive flag, checkpoint hint, and parameter hint per step.
- [x] Summarize semantic output with dominant category, category counts, intent counts, high-confidence/review-needed counts, and business flow.
- [x] Integrate semantic payload into compiled keyword rows, workflow nodes, repository suggestion metadata, and compile response.
- [x] Add `/api/desktop-recorder/sessions/{session_id}/analyze` using the same enriched compile pipeline.
- [x] Add Semantic Analysis panel and keyword-table semantic chips in `/desktop-recorder`.
- [x] Add TS types for `semantic_steps`, `semantic_analysis`, and evidence payloads.
- [x] Add unit tests for semantic classification and summary.

Deferred AI layer:

- [ ] Optional provider-backed object name normalizer.
- [ ] Prompt tests for provider-backed semantic enrichment.
- [ ] Null-provider fallback should keep the deterministic module as source of truth.

### Phase 6: Execution Feedback Loop — PENDING

Connect execution results back into recorder/repository intelligence.

Deliverables:

- Successful locator history.
- Failed locator history.
- Healing suggestion generation.
- Recorder quality model updates.

### Phase 7: Advanced Capture Adapters — PENDING

Expand capture sources.

Deliverables:

- Desktop MCP watch mode improvements.
- Web recorder adapter.
- Mobile recorder adapter.
- API/network recorder adapter.
- Remote desktop/Citrix virtual object capture improvements.

## API Additions

Implemented in this slice:

```text
POST /api/desktop-recorder/sessions/{session_id}/analyze
```

`/compile` remains the main one-click path and now returns quality, repository diff, evidence, and semantic analysis in one response. `/analyze` uses the same enriched compile pipeline for UI review workflows where the user wants intelligence without thinking of it as workflow generation.

Recommended future endpoints:

```text
GET  /api/desktop-recorder/sessions/{session_id}/quality
POST /api/desktop-recorder/sessions/{session_id}/suggest-checkpoints
POST /api/desktop-recorder/sessions/{session_id}/suggest-parameters
POST /api/desktop-recorder/sessions/{session_id}/repository-match
POST /api/desktop-recorder/sessions/{session_id}/make-production-ready
POST /api/desktop-recorder/actions/{action_id}/promote-object
POST /api/desktop-recorder/actions/{action_id}/capture-evidence
```

Keep `/compile` as the authoritative compile path. Additional endpoints are useful for incremental review, background refresh, and targeted UI panels.

## Quality Gates

A recording can be saved as a production workflow when:

- No unstable steps exist.
- No coordinate-only step exists without virtual object review.
- Every action has a selector or object key.
- Every application session has launch or attach scope.
- Sensitive values are redacted or mapped to secrets.
- Save/submit/login/search actions have at least one checkpoint suggestion accepted or explicitly dismissed.
- Repository suggestions are approved, linked, or intentionally skipped.

## Test Plan

Backend tests:

- Recorder quality score with Automation ID.
- Coordinate-only action is unstable.
- Window fallback action requires review.
- Sensitive typed value is redacted and parameterized.
- Login sequence produces component suggestion.
- Save sequence produces checkpoint suggestion.
- Duplicate noisy clicks are filtered.
- Repository match returns exact/strong/weak/no match.
- Compile response includes quality report and execution readiness.

Implemented tests as of 2026-06-24:

- `nexus-api/tests/execution/plugins/desktop/test_semantics.py` covers deterministic semantic classification and summary.
- `nexus-api/tests/execution/plugins/desktop/test_recorder.py` covers semantic payloads, evidence summaries, evidence steps, quality, checkpoints, parameters, readiness, and repository diff behavior.
- `nexus-api/tests/api/test_desktop_recorder_timestamps.py` covers `/analyze` returning semantic and evidence output.
- Targeted backend command: `python -m pytest tests\execution\plugins\desktop\test_semantics.py tests\execution\plugins\desktop\test_recorder.py tests\api\test_desktop_recorder_timestamps.py -q` -> 49 passed.
- Frontend command: `npm run build` in `nexus-qa` -> passed. Current build still prints a non-fatal chart sizing warning unrelated to recorder changes.

Frontend tests:

- Recorder screen shows quality score.
- Weak steps show risk badges.
- Checkpoint suggestions render.
- Parameter suggestions render.
- Repository suggestions can be reviewed.
- Compile and save workflow still work with the expanded response.

End-to-end tests:

- Record Notepad flow and compile to production-ready workflow.
- Record Calculator flow and validate object repository suggestions.
- Record owner-drawn/custom-control sample and require virtual object review.
- Execute compiled workflow, collect locator attempt evidence, and generate healing suggestion after locator drift.

## Acceptance Criteria

NexCore Recorder is beyond UFT when:

- A user can record a desktop flow and immediately see production readiness.
- The recorder explains why each object locator is strong or weak.
- Coordinate-only captures are automatically isolated for review.
- Recorded flows compile into keyword steps, executable workflows, repository objects, checkpoint suggestions, parameter suggestions, and reusable components.
- Repository learning is reviewable and versioned.
- Execution results improve future recordings through locator history and healing suggestions.
- The UI makes weak recording areas obvious without forcing the user to inspect raw logs.
- The same recorder intelligence model can extend to web, mobile, API, and hybrid workflows.

## Immediate Next Build Slice — DONE

Recommended first implementation slice:

1. [x] Add `quality_report` to `compile_recording`.
2. [x] Add per-step quality/risk/fix metadata to compiled nodes and repository suggestions.
3. [x] Add TypeScript types for the new compile response.
4. [x] Show a compact "Recorder Quality" panel in `/desktop-recorder`.
5. [x] Add tests proving Automation ID is production-ready and coordinate-only is review-needed or unstable.

This slice is small, high-value, and directly addresses the current gap against UFT recording: object intelligence and recording quality visibility.

## Phase 4/5 Build Slice -- DONE

Completed implementation slice:

1. [x] Return evidence references and summary in compile output.
2. [x] Build drawer-ready evidence rows for every compiled step.
3. [x] Add Evidence Trace panel and Evidence drawer in `/desktop-recorder`.
4. [x] Add deterministic semantic classifier and compile integration.
5. [x] Add `/analyze` endpoint for semantic/evidence review.
6. [x] Add Semantic Analysis panel and semantic chips in keyword rows.
7. [x] Add backend tests and frontend type coverage.

This moves NexCore beyond UFT in the recording review loop: each step now carries locator proof, quality diagnostics, and deterministic business intent instead of only raw replay actions.

## Next Build Slice

Recommended next implementation slice (Phase 6: Execution Feedback Loop):

1. Persist locator attempts from workflow execution.
2. Store successful and failed locator history by object key.
3. Generate healing suggestions from failed locator attempts.
4. Feed locator history back into `quality_report` and repository diff scoring.
5. Add a recorder/repository UI panel for healing suggestions and locator drift.
