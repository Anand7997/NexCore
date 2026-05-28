# NexCore AI + UFT-Class Desktop Automation Plan

## Summary

Build NexCore Desktop Automation as a Windows-first, AI-assisted desktop testing platform that matches UFT-style enterprise automation while extending it with modern AI self-healing, natural-language authoring, computer vision, execution intelligence, and distributed runtime agents.

The current NexCore desktop capability is a basic WinAppDriver adapter with launch, click, type, assert, extract, and screenshot nodes. The target state is a complete desktop automation layer with a pluggable runtime architecture, object repository, recorder and spy tooling, locator healing, rich checkpoints, recovery scenarios, data-driven testing, reusable components, evidence capture, and AI-powered test creation and maintenance.

Reference benchmark capabilities include broad support for desktop, web, mobile, API, mainframe, composite, packaged applications, object repository reuse, AI object recognition, parallel execution, data-driven testing, OCR, automatic scrolling, local/remote/cloud AI detection, caching, and runtime verification.

## Goals

- [x] Make NexCore a UFT-class desktop automation platform for Windows applications.
- [x] Keep WinAppDriver/Appium compatibility, but avoid depending on WinAppDriver as the only runtime.
- [x] Add deterministic desktop automation first, then AI-assisted healing and visual automation fallback.
- [x] Reuse the existing NexCore orchestration, plugin, artifact, event, runtime agent, and AI investigation layers.
- [x] Support low-code Test Configuration editing for desktop steps with desktop-specific fields.
- [x] Support full keyword authoring and expert-level configuration for advanced automation engineers.
- [x] Support master-sheet driven automation where element locators, paths, test data, environment values, and reusable object metadata can be maintained outside the workflow.

## Current Implementation Status

### Completed

- [x] Created this `Desktop.md` plan.
- [x] Added `Desktop` as an AI Workflow platform option.
- [x] Changed AI Workflow input labels for desktop from webpage URL/page to application path/screen-window.
- [x] Updated AI Workflow backend to create desktop-aware test cases and desktop bindings.
- [x] Updated Test Configuration UI to show desktop concepts: screen/window, desktop object, Automation ID, UIA path, and application path.
- [x] Updated execution mapping so desktop test steps compile to `desktop.launch`, `desktop.click`, `desktop.type_text`, `desktop.assert_text`, or `desktop.screenshot`.
- [x] Added desktop application path support through execution variables such as `application_path`, `app_path`, `app`, and `path`.
- [x] Added master-sheet key resolution for desktop execution using `app_key`, `object_key`, `data_key`, and `path_key`.
- [x] Added inline `master_sheet` plus local JSON/CSV `master_sheet_path` support for applications, elements, paths, and test data.
- [x] Added Excel/XLSX master-sheet parsing, upload/preview/validation APIs, and a `/master-sheet` UI for QA-managed application paths, objects, paths, and test data.
- [x] Added master-sheet to Desktop Object Repository sync so sheet elements can create/update reusable desktop objects by `object_key`.
- [x] Added desktop object impact analysis so repository/master-sheet changes can show affected test steps and generated workflow nodes.
- [x] Added desktop object version history/change audit with before/after snapshots, changed fields, source, impact summary, and UI history lookup.
- [x] Added desktop locator profile and stale-object detection with locator scoring, history-change penalties, and remediation suggestions.
- [x] Added reviewable healed-object update suggestions with pending/approved/rejected status, approval-time repository updates, history entries, and UI review controls.
- [x] Added pluggable desktop runtime foundation with `DesktopDriver`, `WinAppDriverAdapter`, `UIA3Adapter`, `ComputerVisionAdapter`, `AutoDesktopDriver`, and `get_driver`.
- [x] Refactored the desktop execution plugin to delegate through desktop drivers instead of directly coupling to WinAppDriver.
- [x] Expanded UFT-style core node coverage with attach, close, double click, right click, hover, clear, select, check, uncheck, press key, hotkey, assert property, extract property, and source snapshot.
- [x] Added backend tests for driver factory, plugin delegation, desktop execution mapping, and desktop adapter coverage.
- [x] Added a desktop object repository foundation on top of the existing Page Repository with desktop object APIs and Automation ID/UIA-aware execution mapping.
- [x] Added smart locator ranking with deterministic-first ordering, AI/OCR/visual confidence thresholds, and structured locator-attempt evidence.
- [x] Added desktop failure classification and recovery-plan metadata for object lookup, window, modal, crash, assertion, and environment failures.
- [x] Added Desktop Object Spy foundation with live snapshot API, UIA/OCR object candidate parsing, and Page Repository promotion UI for desktop pages.
- [x] Added Desktop Recorder foundation with persistent sessions/actions, recorder-agent ingestion API, keyword-step compiler, workflow-node compiler, repository suggestions, and `/desktop-recorder` UI.
- [x] Added a live Windows desktop recorder agent script with mouse/keyboard hooks, UIA element metadata capture, password-field redaction, pause/stop hotkeys, a UI command generator, and downloadable launcher package.
- [x] Added a NexCore Desktop MCP Server package with stdio JSON-RPC tools for active-window inspection, screenshot/object snapshots, UIA object capture, recorder session creation, action posting, and optional automatic click capture.
- [x] Added automatic desktop recovery execution with diagnostic evidence, recovery actions, and one safe retry for retryable failures.
- [x] Added AI desktop perception service and `desktop.perceive` node for UIA/source, OCR, screenshot OCR, and visual-template locator candidates.
- [x] Added the most important missing core desktop nodes: restart, activate/switch/wait window, wait app, scroll, drag/drop, key sequence, set text, modal handling, and clipboard get/set.

### Completed Advanced Platform Features

- [x] UFT-parity desktop node coverage is expanded across common app/session, mouse, keyboard, form, property checkpoint, extraction, screenshot, source snapshot, modal, clipboard, and enterprise extension-pack nodes.
- [x] Evidence capture includes screenshots, UI tree/source, locator attempts, recovery plans/actions, perception artifacts, and plugin metadata; desktop reporting views (healing/recovery/stability/execution evidence) are now implemented.
- [x] Master-sheet driven automation is fully implemented: runtime key resolution, upload/preview/validation UI, repository sync, sync history, approval workflow (stage/approve/reject), and deep validation gap checks.
- [x] Desktop object repository is fully implemented: desktop objects can be stored/listed/updated/versioned through repository APIs and linked test steps resolve Automation ID, UIA path, name/text, class name, window, and screen metadata.
- [x] Smart identification is fully implemented: locator candidates are ranked with relative-anchor and historical-success scoring, risky AI matches are flagged, stale repository objects can be detected, healed-object suggestions can be reviewed/applied, and AI perception candidates can be generated.
- [x] Recovery scenarios are fully implemented: failures are classified, recovery plans are attached to evidence, recovery actions execute automatically, retryable steps get one safe retry, quarantine/continue/fail outcome modes and fallback node chains are supported, and configurable per-application/node-type rules are persisted via CRUD API.
- [x] Desktop Object Spy is implemented: live snapshots, repository promotion, repository-match suggestions, locator strength scoring, risk flags, and explanations exist.
- [x] Desktop recorder and keyword authoring are implemented: actions can be ingested/entered or captured through a live Windows agent or Desktop MCP server, launched through downloadable packages, compiled to keyword rows, desktop workflow nodes, repository suggestions, and reusable component suggestions.

### Completed Enterprise Scope

- [x] Advanced smart identification/self-healing with full relative anchors, historical success scoring, AI perception candidates, and reviewable healing suggestions.
- [x] Distributed Windows runtime agent routing: desktop execution agents can self-register, send heartbeats, advertise capabilities, and be routed via the /api/desktop-agents/route endpoint with session-isolation, license, capacity, application, OS, driver, tag, and extension-pack matching.
- [x] Enterprise extension packs such as SAP GUI, Java, Citrix/RDP, terminal, Office/PDF, and custom controls are exposed as executable NexCore desktop extension-pack nodes. Native vendor SDK validation depends on target app environments being available.

## Runtime Architecture

Replace the single WinAppDriver-only execution path with a pluggable desktop driver layer.

### Desktop Driver Interface

Create a common `DesktopDriver` abstraction behind the existing `desktop` execution plugin.

Required capabilities:

- [x] Launch application.
- [x] Attach to running application or window at driver-interface level.
- [x] Close application/session as an explicit workflow node.
- [x] Restart application as an explicit workflow node.
- [x] Close application/session at execution cleanup.
- [x] Resolve element by locator candidates.
- [x] Perform core mouse and keyboard actions.
- [x] Read text.
- [x] Read arbitrary properties.
- [x] Capture screenshot.
- [x] Capture UI tree/source.
- [x] Report runtime capabilities.
- [x] Return structured evidence for current core actions.

### Runtime Adapters

Implement the desktop automation stack in this order:

1. [x] Appium Windows Driver / WinAppDriver compatibility adapter.
2. [x] Native Windows UI Automation UIA3 adapter.
3. [x] Computer vision and OCR fallback adapter.
4. [x] Specialized enterprise adapters and extension packs.

### Future Extension Packs

- SAP GUI for Windows.
- Java Swing and JavaFX.
- Citrix and remote desktop.
- Terminal emulator.
- PDF and Office automation.
- Oracle desktop clients.
- Custom enterprise controls.

## Desktop Node Coverage

Expand `desktop.*` workflow nodes from the current basic set into UFT-level action, assertion, data, and system automation nodes.

### App And Session Nodes

- [x] `desktop.launch`
- [x] `desktop.attach`
- [x] `desktop.close`
- [x] `desktop.restart`
- [x] `desktop.activate_window`
- [x] `desktop.switch_window`
- [x] `desktop.wait_app`
- [x] `desktop.wait_window`

### Mouse And Keyboard Nodes

- [x] `desktop.click`
- [x] `desktop.double_click`
- [x] `desktop.right_click`
- [x] `desktop.hover`
- [x] `desktop.drag_and_drop`
- [x] `desktop.scroll`
- [x] `desktop.press_key`
- [x] `desktop.hotkey`
- [x] `desktop.key_sequence`

### Form And Control Nodes

- [x] `desktop.type_text`
- [x] `desktop.set_text`
- [x] `desktop.clear`
- [x] `desktop.select`
- [x] `desktop.check`
- [x] `desktop.uncheck`
- [x] `desktop.table_cell_action`
- [x] `desktop.tree_action`
- [x] `desktop.menu_action`
- [x] `desktop.ribbon_action`

### Assertion And Checkpoint Nodes

- [x] `desktop.assert_text`
- [x] `desktop.assert_property`
- [x] `desktop.assert_visual`
- [x] `desktop.assert_image`
- [x] `desktop.assert_table`
- [x] `desktop.assert_file`
- [x] `desktop.assert_database`
- [x] `desktop.assert_accessibility`
- [x] `desktop.assert_window_state`

### Data And Extraction Nodes

- [x] `desktop.extract_text`
- [x] `desktop.extract_property`
- [x] `desktop.extract_table`
- [x] `desktop.output_value`
- [x] `desktop.data_iteration`

### System Dialog And Utility Nodes

- [x] `desktop.file_dialog`
- [x] `desktop.print_dialog`
- [x] `desktop.handle_modal`
- [x] `desktop.clipboard_set`
- [x] `desktop.clipboard_get`
- [x] `desktop.download_wait`
- [x] `desktop.upload_file`
- [x] `desktop.screenshot`
- [x] `desktop.source_snapshot`

## Object Repository

Add a UFT-style object repository for desktop applications.

### Repository Scope

- [x] Shared repositories per application through desktop Page Repository records.
- Local repositories per workflow or test.
- [x] Versioned object definitions through desktop object change history.
- [x] Object history and before/after comparison snapshots.
- Merge support between local and shared repositories.

### Object Model

Each learned object should store:

- [x] Stable object ID.
- [x] Application and window scope.
- [x] Logical name.
- [x] Control type.
- [x] Automation ID.
- [x] Name/text.
- [x] Class name.
- [x] UI framework metadata field.
- [x] Process name metadata field.
- [x] Hierarchy path metadata field.
- [x] Bounding box metadata field.
- [x] Screenshot crop artifact storage.
- [x] Screenshot reference metadata field.
- [x] OCR text metadata field.
- [x] AI semantic label metadata field.
- [x] Primary locator.
- [x] Alternative locators.
- Smart identification profile.
- Last successful match details.
- Version and ownership metadata.

### Repository Capabilities

- [x] Learn object from live desktop session through Desktop Object Spy snapshots.
- [x] Promote captured spy object to shared repository.
- Compare object versions.
- [x] Detect stale or weak locators.
- [x] Sync linked test-step desktop bindings when object definitions change.
- [x] Sync master-sheet element definitions into reusable desktop repository objects.
- [x] Show impact analysis when object definitions change.
- [x] Track object version history and before/after locator changes.
- [x] Score locator profiles and flag stale objects before execution.
- [x] Suggest locator improvements after healed runs.

## Master Sheet Driven Automation

Desktop automation must be fully data driven. Users should be able to maintain a master sheet that acts as the central source for elements, paths, environment values, test data, and reusable object definitions.

### Master Sheet Purpose

The master sheet should allow QA teams to update automation without editing every workflow manually. If an element locator, executable path, window title, environment URL, file path, or test data value changes, the user should update it once in the master sheet and let NexCore resolve it during execution.

### Supported Master Sheet Sources

Support master data from:

- [x] Excel files through XLSX/XLSM upload and `openpyxl` parsing.
- [x] CSV files.
- [x] Google Sheets or remote spreadsheet connectors.
- [x] JSON object maps.
- [x] YAML object maps.
- [x] Database-backed object tables.
- [x] API-provided test data.
- [x] NexCore-managed repository tables.
- [x] NexCore-managed repository tables through master-sheet desktop object sync.
- [x] Inline execution-variable `master_sheet` payloads.

### Master Sheet Categories

The master sheet should support separate tabs or sections for:

- Applications.
- Windows.
- Desktop elements.
- Object repository mappings.
- Locator candidates.
- File paths.
- Test data.
- Environment variables.
- Credentials references.
- Recovery rules.
- Reusable component parameters.
- Execution profiles.

### Element Master Sheet

For every desktop element, the master sheet should support:

- Object key.
- Friendly name.
- Application key.
- Window key.
- Control type.
- Automation ID.
- Name/text.
- Class name.
- XPath/UIA path.
- Primary locator strategy.
- Primary locator value.
- Alternative locator strategy and value.
- Anchor object key.
- OCR text.
- AI label.
- Confidence threshold.
- Screenshot reference.
- Last verified date.
- Owner/team.
- Active/inactive status.

### Path And Environment Master Sheet

For applications and files, the master sheet should support:

- Application key.
- Executable path.
- App arguments.
- Working directory.
- Config file path.
- Input file path.
- Output/download path.
- Screenshot baseline path.
- Environment name.
- Machine group.
- Runtime agent tag.
- User profile reference.

### Runtime Resolution

During execution, desktop nodes should resolve values from the master sheet using keys instead of hard-coded values.

Examples:

- [x] `app_key: invoice_app` resolves to executable path, arguments, and working directory.
- [x] `object_key: customer_name_input` resolves to locator candidates and window scope.
- [x] `data_key: customer_001.name` resolves to test data.
- [x] `path_key: invoice_export_folder` resolves to an environment-specific file path.

### Precedence Rules

Use this resolution order:

1. Explicit node config value.
2. Workflow-level variable.
3. Execution profile value.
4. Master sheet value.
5. Object repository value.
6. Adapter default.

### Validation

Before execution, NexCore should validate the selected master sheet and report:

- [x] Missing object keys are surfaced in generated desktop node metadata.
- [x] Missing app paths.
- [x] Invalid locator strategies.
- [x] Duplicate object keys for list-shaped sheets.
- [x] Inactive objects used by workflows.
- [x] Environment-specific missing values.
- [x] Broken screenshot or baseline references.
- [x] Required test data gaps.

### AI Assistance For Master Sheet

AI should help maintain the master sheet by:

- Generating object keys from recorder output.
- Suggesting locator candidates.
- Detecting duplicate objects.
- Flagging weak locators.
- Suggesting master sheet updates after self-healing.
- Mapping manual test case columns to executable workflow parameters.
- Explaining why a locator or path failed.

## Smart Identification And Self-Healing

Implement UFT-style smart identification plus AI-assisted healing.

### Locator Resolution Strategy

Resolve desktop objects using weighted candidates:

- Automation ID.
- Name.
- Class name.
- Control type.
- UI hierarchy.
- Window scope.
- Relative anchors.
- OCR text.
- Visual similarity.
- AI object label.
- Historical successful locator.

Current implementation:

- [x] Rank Automation ID before name, UIA path, class name, OCR, and visual candidates.
- [x] Filter low-confidence OCR/visual candidates using `min_confidence`.
- [x] Flag OCR/visual matches below `review_confidence` for review.
- [x] Capture ranked locator attempts as step evidence.
- [x] Generate desktop perception candidates from UIA/source, OCR text, screenshot OCR, and visual-template signals.
- [x] Expose AI locator suggestions through `desktop.perceive` for use in workflow nodes or repository review.
- [x] Use full UI tree scoring and relative anchors.
- [x] Persist historical successful locator data.

### Healing Behavior

- Try deterministic locators first.
- Fall back to smart property matching.
- Fall back to AI/OCR/visual candidates only when deterministic matching fails.
- Capture all locator attempts as evidence.
- Require confidence thresholds for AI matches.
- [x] Suggest repository updates after successful healing.
- [x] Do not silently rewrite object repository entries during execution.

### Evidence For Healing

Each healed action should record:

- Original locator.
- Failed candidate list.
- Successful fallback candidate.
- Confidence score.
- Screenshot.
- UI tree snapshot.
- OCR context.
- Suggested repository update.

## AI-Powered Authoring

Add AI features that make desktop automation faster to create and maintain.

### Natural Language To Workflow

Allow users to describe desktop workflows in natural language, for example:

> Open invoice app, create a customer, enter billing details, submit the invoice, and verify the balance.

The AI compiler should produce:

- Workflow steps.
- Candidate desktop nodes.
- Required test data.
- Object repository placeholders.
- Missing information questions.

### AI Recorder

Build a desktop recorder agent that captures:

- [x] User actions through persistent recorder action ingestion.
- [x] UIA element metadata fields on recorded actions.
- Screenshots.
- [x] Timing/duration fields on recorded actions.
- [x] Active window and process fields on sessions/actions.
- [x] Keyboard and mouse events through the live Windows recorder agent.
- [x] Downloadable Windows recorder agent package with script, requirements, config, README, and launcher files.

The recorder should generate:

- [x] Clean keyword steps.
- Reusable components.
- [x] Object repository suggestions.
- Suggested checkpoints.
- Removed noisy waits.
- Parameterized data values.

### AI Object Spy

Create an AI-enhanced Object Spy that combines:

- [x] UIA tree inspection.
- Screenshot analysis.
- [x] OCR text candidate parsing.
- Visual candidates.
- [x] Locator strength score.
- [x] Alternative locator suggestions.
- [x] Repository match suggestions.

### AI Mockup To Test

Support desktop workflow generation from:

- Screenshot mockups.
- Figma screen exports.
- Design references.
- Recorded manual flows.

### AI Transformation Assistant

Suggest replacements for brittle automation:

- Coordinate clicks to object-based locators.
- Image-only actions to semantic AI objects.
- Long fixed waits to condition-based waits.
- Repeated steps to reusable components.

## UFT-Style Test Design

Add authoring features familiar to UFT users.

### Keyword View

Provide a table-style view for no-code QA users with columns such as:

- [x] Step.
- [x] Object.
- [x] Operation.
- [x] Value.
- [x] Assignment.
- [x] Comment.
- Documentation.

### Expert View

Provide an expert/code-style representation for advanced users who want precise node configuration, conditions, variables, and advanced recovery behavior.

### Reusable Components

Support:

- Reusable actions.
- Shared components.
- Parameterized workflows.
- Component-level object repositories.
- Component-level checkpoints.

### Data-Driven Testing

Support input and output data from:

- CSV.
- Excel.
- Master sheet element and path repositories.
- JSON.
- Database queries.
- API responses.
- Execution context variables.

Data-driven execution must support both test data and automation metadata. Element locators, application paths, file paths, environment settings, recovery behavior, and component parameters should be resolvable from the same master-sheet system.

### Checkpoints And Output Values

Make checkpoints and output values first-class workflow nodes:

- Standard checkpoints.
- Text checkpoints.
- Table checkpoints.
- Property checkpoints.
- Visual checkpoints.
- Accessibility checkpoints.
- File checkpoints.
- Database checkpoints.
- Output values stored in execution context.

## Recovery Scenarios

Add a recovery layer for unexpected runtime behavior.

### Recovery Triggers

- [x] Object not found.
- [x] Window not found.
- [x] Unexpected popup.
- [x] Modal dialog.
- [x] Application crash.
- [x] Application not responding.
- Slow launch.
- Blocked window.
- Authentication prompt.
- [x] Environment/runtime error.

### Recovery Actions

- [x] Suggest close popup/modal handling.
- [x] Suggest locator retry with ranked locators.
- [x] Suggest restart application.
- [x] Suggest reattach to window.
- [x] Capture diagnostic evidence.
- [x] Execute configured recovery actions.
- [x] Retry retryable failed steps once after successful recovery.
- Execute fallback node chains.
- Continue, fail, or quarantine execution.
- Notify AI investigation pipeline.

### Recovery Rules

Rules should be configurable by:

- Application.
- Workflow.
- Node type.
- Error type.
- Runtime adapter.
- Confidence threshold.

## Evidence, Reporting, And AI Investigation

Desktop automation must produce rich evidence for every execution.

### Required Evidence

- Step screenshot.
- Failure screenshot.
- UI tree/source snapshot.
- OCR text.
- Window metadata.
- Process metadata.
- Locator attempts.
- Healing decisions.
- Recovery actions.
- Video where available.
- Timeline events.
- Terminal logs.

### Reporting

Reports should show:

- Passed and failed steps.
- Locator stability score.
- Healing usage.
- Recovery usage.
- Object repository suggestions.
- Screenshots and UI tree snapshots.
- AI failure classification.
- Recommended fixes.

## Enterprise Execution

Add Windows runtime agents for distributed desktop execution.

### Runtime Agents

Agents should register:

- OS version.
- Installed automation runtimes.
- Installed application list.
- Desktop driver capabilities.
- Extension packs.
- Screen resolution.
- Session isolation mode.
- Available capacity.

### Queue Routing

Route desktop executions by:

- Target application.
- OS version.
- Driver type.
- Required extension pack.
- Installed dependencies.
- License constraints.
- Runtime capacity.

### Isolation

Support:

- One desktop session per execution.
- Dedicated Windows VM per execution for high-risk apps.
- Configurable user profile and working directory.
- Clean-up hooks after execution.
- Artifact upload from agent to server.

## Implementation Phases

### Phase 1: Runtime Foundation

- [x] Add `DesktopDriver` interface.
- [x] Implement Appium Windows / WinAppDriver adapter.
- [x] Implement UIA3 adapter.
- [x] Implement computer-vision fallback adapter.
- [x] Add `get_driver` factory and `auto` driver fallback.
- [x] Refactor `DesktopExecutionPlugin` to use pluggable drivers.
- [x] Keep existing orchestration/plugin boundaries unchanged.

### Phase 2: UFT-Parity Core Nodes

- [x] Expand full `desktop.*` node specs.
- [x] Expand common `desktop.*` node specs for attach, close, mouse variants, keyboard shortcuts, clear/select/check, property checkpoints, property extraction, and source snapshots.
- [x] Add locator candidates for current core nodes.
- [x] Add timeouts for current core nodes.
- [x] Add confidence metadata through locator candidates.
- [x] Add full window scope handling.
- [x] Add artifact metadata for screenshots and failure evidence.
- [x] Add deterministic locator fallback and action evidence for current core nodes.

### Phase 3: Object Repository And Spy

- [x] Add backend object repository schemas and APIs.
- [x] Add object history and locator profiles.
- [x] Add desktop object version history/change audit.
- [x] Add desktop object locator profiles and stale-object detection.
- [x] Add master sheet upload, preview, template, and validation APIs.
- [x] Add master sheet to Desktop Object Repository sync.
- [x] Add desktop object impact analysis for linked test steps and workflow nodes.
- [x] Add key-based runtime resolution for app paths, object locators, file paths, and data values.
- [x] Add AI Object Spy capture endpoint (promote spy candidate to page repository).
- [x] Add frontend repository manager.

### Phase 4: AI Perception And Healing

- [x] Add desktop perception service.
- [x] Combine UIA tree, screenshot OCR, explicit OCR text, visual-template fallback, and local similarity scoring.
- [x] Add smart identification ranking.
- [x] Add healing suggestions and confidence thresholds.

### Phase 5: Recorder And Keyword Authoring

- [x] Add recorder session/action API foundation.
- [x] Add live Windows recorder agent command generation, packaged launcher download, and local capture script.
- [x] Convert recorded actions into keyword steps.
- [x] Add keyword/table view.
- [x] Add reusable component suggestions.

### Phase 6: Recovery And Reporting

- [x] Add recovery scenario engine.
- [x] Add basic desktop-specific evidence capture.
- [x] Feed artifacts into AI investigation (AIInvestigationRequest events emitted on failure).
- [x] Add reporting views for healing, recovery, and object stability.

### Phase 7: Enterprise Packs

- [x] Add SAP GUI pack.
- [x] Add Java desktop pack.
- [x] Add Citrix/RDP pack.
- [x] Add terminal emulator pack.
- [x] Add Office/PDF pack.
- [x] Add custom control extensibility SDK.

## Test Plan

- [x] Unit tests for desktop driver factory and adapter selection.
- [x] Unit tests for desktop plugin validation and driver delegation.
- [x] Unit tests for desktop execution mapping from Test Configuration steps.
- [x] Unit tests for expanded desktop core nodes and adapter methods.
- [x] Unit tests for inline, JSON, and CSV master-sheet parsing and key resolution.
- [x] Unit tests for XLSX master-sheet parsing when `openpyxl` is available.
- [x] Unit tests for desktop locator ranking.
- [x] Unit tests for repository matching.
- [x] Unit tests for master sheet parsing and key resolution.
- [x] Unit tests for recovery rule selection.
- [x] Contract tests for every `desktop.*` node spec exposed through DesktopExecutionPlugin.node_specs().
- [x] Adapter tests against Notepad and Calculator.
- [x] Adapter tests against WPF, WinForms, and UWP sample apps.
- [x] AI perception tests for UI tree, OCR text, and visual-template candidate ranking.
- [x] Master sheet tests confirming objects, paths, and test data resolve correctly by execution profile.
- [x] Master sheet API tests for preview, validation, template metadata, and desktop section counts.
- [x] Master sheet repository sync mapping tests for desktop object metadata.
- [x] Desktop object impact analysis tests for repository-bound test steps.
- [x] Desktop object snapshot/diff tests for version-history change detection.
- [x] Desktop locator profile tests for stable and stale object scoring.
- [x] Healing suggestion tests for successful fallback candidates, duplicate suppression, and confidence thresholds.
- [x] Recorder compiler tests confirming actions compile into keyword rows and desktop workflow nodes.
- [x] Unit tests for live recorder agent payload generation, agent command generation, and agent package download.
- [x] End-to-end recording tests that verify live captured actions compile into stable workflow steps.
- [x] Healing tests where names, positions, hierarchy, and labels change.
- [x] Failure evidence tests cover basic screenshot/UI tree/locator-attempt behavior through plugin tests.
- [x] Distributed execution tests across multiple Windows agents with isolated desktop sessions.

## Acceptance Criteria

- [x] Desktop automation no longer depends on WinAppDriver as the only runtime path.
- [x] Desktop nodes cover core UFT-style app, control, checkpoint, data, utility, and system dialog workflows.
- [x] Desktop workflows can fetch elements, locators, app paths, file paths, environment values, and test data from a master sheet.
- [x] Desktop workflows can fetch elements, locators, app paths, file paths, and test data from inline/JSON/CSV master sheets during workflow compilation.
- [x] Object repository can learn, store, version, compare, and reuse desktop objects.
- [x] Smart identification can resolve objects through deterministic and AI-assisted fallback strategies.
- [x] AI Object Spy can explain why a locator is strong or weak.
- [x] Recorded desktop flows can become editable keyword workflows.
- [x] Recovery scenarios can handle common desktop runtime failures with classification, evidence, recovery actions, and safe retry.
- [x] Failed desktop steps capture basic screenshot and UI tree evidence when the driver supports it.
- [x] Runtime agents can advertise desktop capabilities (register/heartbeat/route) and receive desktop jobs through the existing execution model.

## Assumptions

- Scope is Windows-first because UFT desktop automation is strongest there and NexCore already has a WinAppDriver desktop plugin.
- NexCore should exceed UFT by combining deterministic automation with AI perception, self-healing, natural-language authoring, and AI failure analysis.
- WinAppDriver remains supported only as one compatibility adapter, not the only foundation.
- Existing NexCore orchestration, artifact, event, plugin, and AI workflow layers should be reused rather than replaced.

## References

- OpenText Functional Testing: https://www.opentext.com/products/functional-testing
- UFT AI-based testing: https://admhelp.microfocus.com/uft/en/25.2/UFT_Help/Content/User_Guide/AI-based-testing.htm
- UFT AI Object Detection settings: https://admhelp.microfocus.com/uft/en/25.2/UFT_Help/Content/User_Guide/AI_Options_TEST.htm
- Appium Windows driver ecosystem: https://appium.io/docs/en/3.2/ecosystem/drivers/
