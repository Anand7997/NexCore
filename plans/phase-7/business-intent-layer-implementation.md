# Phase 7 Business Intent Layer Implementation

## Scope

Phase 7 introduces the business intent layer between workflow authoring and platform execution adapters. This keeps user intent separate from Playwright, Appium, WinAppDriver, and other runtime-specific engines.

## Implemented Components

- Added the canonical intent registry, compiler, parity report, and schema compatibility services in `nexus-backend/src/modules/intent`.
- Added platform capability contracts for `web`, `android`, `ios`, `desktop`, `api`, and `db`.
- Added mapping contracts that describe adapter, node type, required params, and support status per platform.
- Added versioned schema metadata and compatibility negotiation in the NestJS control plane.
- Added NestJS intent routes:
  - `GET /intent/catalog`
  - `GET /intent/schema`
  - `GET /intent/capability-matrix`
  - `POST /intent/compile`
  - `GET /intent/parity-report`
- Converted the legacy Python `/api/intents/*` routes into a compatibility shim that forwards to `nexus-backend`.
- Moved the production business-flow validation fixtures into `nexus-backend/src/modules/intent/fixtures/business-flow.fixtures.ts`.
- Updated the frontend intent/parity/runtime API hooks to use the NestJS control plane through a dedicated Next.js proxy route.

## Intent Catalog

- `nav.open`
- `ui.click`
- `form.fill`
- `form.select`
- `form.submit`
- `ui.assert_text`
- `ui.assert_visible`
- `data.extract`
- `evidence.screenshot`
- `api.request`
- `api.assert_status`
- `db.query`
- `db.assert_rows`

## Platform Contract Behavior

Web and API-backed intents can compile into existing executable node types where those plugins already exist.

Mobile and desktop mappings are intentionally marked `partial` or `unsupported` until Phase 8 introduces runtime adapters. This satisfies the Phase 7 contract requirement without pretending Appium or WinAppDriver execution is available.

## Validation Contract

`POST /intent/compile` accepts a target platform, ordered intent steps, and an optional client schema version, then returns:

- `valid`
- `platform`
- `schemaVersion`
- `compiledNodes`
- `unsupported`
- `partial`
- `missing_params`

The Python compatibility shim still exposes `POST /api/intents/validate` and forwards it to the NestJS compile endpoint, so older callers keep working while compiler authority lives in one place.

## Validation Fixtures

- The canonical business-flow fixtures now live in the NestJS module and are covered by backend Jest tests.
- The QA regression suite re-exports those fixtures instead of owning a separate copy.
- Schema manifest and compatibility behavior are covered by backend tests in the TypeScript project.

## Exit Criteria Status

The same intent can now be evaluated and compiled through platform-specific adapter contracts under NestJS ownership, with versioned schema metadata and production validation fixtures in the TypeScript control plane. Full mobile and desktop runtime execution remains blocked until Phase 8.
