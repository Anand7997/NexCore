# Phase 6 Execution Intelligence

## Scope

Phase 6 adds explainable investigation intelligence over stable execution data sources from Phase 5.

Out of scope:

- Autonomous remediation.
- Autonomous planning.
- Intent compilation.
- Mobile or desktop runtime integration.

## Backend Intelligence Engine

Implemented in:

- `nexus-api/app/intelligence/analyzer.py`
- `nexus-api/app/api/routes/intelligence.py`
- `nexus-api/app/main.py`

Route:

- `GET /api/intelligence/executions/{execution_id}`

Inputs:

- Execution row.
- Execution nodes.
- Timeline entries.
- Execution events.
- Artifacts.

Outputs:

- Execution summary.
- Evidence counts.
- Explainable insights.
- Affected nodes.
- Recommendations linked to evidence.

## Implemented Heuristics

### Root Cause Heuristics

Detects:

- Selector or element lookup failures.
- Timeout failures.
- API response contract failures.
- General node failures.

Evidence:

- Failed node status.
- Node error text.
- Artifact kinds captured for the node.

### Retry Pattern Detection

Detects:

- Nodes with more than one attempt.
- Retry timeline entries.

Recommendation:

- Review flaky dependencies before increasing retry limits.

### Duration Anomaly Detection

Detects:

- Completed nodes that are substantially slower than median execution node duration.

Recommendation:

- Inspect network, wait conditions, and downstream service timing.

### Artifact Correlation

Detects:

- Failed nodes without linked artifacts.

Recommendation:

- Ensure plugins capture screenshot, DOM, request, response, or logs on failure.

### Error Event Cluster Detection

Detects:

- Error-severity event clusters.

Recommendation:

- Use the event stream to identify the first error before cascades.

## Frontend Investigation Workspace

Implemented in:

- `nexus-qa/src/lib/api/intelligence.ts`
- `nexus-qa/src/app/ai-analysis/page.tsx`

Behavior:

- Selects a recent failed execution when available.
- Fetches backend execution analysis.
- Maps backend intelligence insights into the existing investigation UI.
- Falls back to demo evidence if backend analysis is unavailable.
- Shows whether the workspace is using the real evidence engine or demo evidence.

## Verification

Backend:

```powershell
python -c "import ast, pathlib; [ast.parse(p.read_text(encoding='utf-8')) for p in pathlib.Path('app').rglob('*.py')]; print('AST OK')"
```

```powershell
python -c "from app.main import app; print('\n'.join(sorted(getattr(r, 'path', '') for r in app.routes if 'intelligence' in getattr(r, 'path', ''))))"
```

Frontend:

```powershell
npm run build
```

Results:

- Backend AST parse passed.
- Intelligence route is registered in the source app.
- Frontend production build passed.

Runtime note:

- The running backend process on port 8000 must be restarted before the frontend can consume newly added `/api/intelligence/...` and `/api/plugins/...` routes from the current source.

