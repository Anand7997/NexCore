# Phase 7 Business Intent Layer Implementation

## Scope

Phase 7 introduces the business intent layer between workflow authoring and platform execution adapters. This keeps user intent separate from Playwright, Appium, WinAppDriver, and other runtime-specific engines.

## Implemented Components

- Added backend intent registry in `nexus-api/app/intent/registry.py`.
- Added platform capability matrix for `web`, `android`, `ios`, and `desktop`.
- Added mapping contracts that describe adapter, node type, required params, and support status per platform.
- Added intent validation and compile contract for target platforms.
- Added intent API routes:
  - `GET /api/intents/`
  - `GET /api/intents/capability-matrix`
  - `POST /api/intents/validate`
- Updated the frontend platform matrix workspace to consume the backend intent capability matrix with a local fallback.

## Initial Intent Catalog

- `nav.open`
- `ui.click`
- `form.fill`
- `ui.assert_text`
- `data.extract`
- `evidence.screenshot`
- `api.request`

## Platform Contract Behavior

Web and API-backed intents can compile into existing executable node types where those plugins already exist.

Mobile and desktop mappings are intentionally marked `partial` or `unsupported` until Phase 8 introduces runtime adapters. This satisfies the Phase 7 contract requirement without pretending Appium or WinAppDriver execution is available.

## Validation Contract

`POST /api/intents/validate` accepts a target platform and ordered intent steps, then returns:

- `valid`
- `platform`
- `compiled_nodes`
- `unsupported`
- `partial`
- `missing_params`

This gives the workflow builder a deterministic way to explain why a cross-platform intent can or cannot execute on a selected adapter.

## Exit Criteria Status

The same intent can now be evaluated and compiled through platform-specific adapter contracts. Full mobile and desktop runtime execution remains blocked until Phase 8.
