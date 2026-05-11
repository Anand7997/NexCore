# Phase 5 Web and API Execution Plugins

## Scope

Phase 5 enables real web and API execution while preserving the orchestration boundary established in Phase 1.

Out of scope:

- Mobile execution.
- Desktop execution.
- Intent abstraction.
- Autonomous AI remediation.

## API Plugin

Implemented in:

- `nexus-api/app/execution/plugins/api/plugin.py`

Runtime:

- `httpx.AsyncClient`

Lifecycle:

- One async HTTP client per execution.
- Client is created on execution start or first use.
- Client is closed on execution end.

Node types:

- `api.get`
- `api.post`
- `api.put`
- `api.delete`
- `api.assert_status`
- `api.assert_json_path`
- `api.extract`
- `api.assert_headers`
- `api.assert_response_time`

Capabilities:

- Template interpolation against execution context.
- Request and response artifact capture.
- Status assertions.
- JSON path assertions.
- Header assertions.
- Response time assertions.
- Response value extraction into shared context.
- `ApiCall` evidence events.
- Terminal logs.

## Web Plugin

Implemented in:

- `nexus-api/app/execution/plugins/web/plugin.py`
- `nexus-api/app/execution/plugins/web/session.py`

Runtime:

- Playwright.

Lifecycle:

- Browser session is lazy-created on first web node.
- One browser context and page per execution.
- Session stores cookies and page state across nodes.
- Session is isolated per execution.
- Trace, video, and network logs can be finalized at teardown.

Node types:

- `web.navigate`
- `web.click`
- `web.fill`
- `web.select`
- `web.wait`
- `web.assert_text`
- `web.extract_text`
- `web.screenshot`
- `web.upload`
- `web.execute_js`

Capabilities:

- Template interpolation against execution context.
- Browser action evidence events.
- Screenshot capture.
- Failure screenshot capture.
- DOM snapshot capture on assertion failure.
- Trace and video artifact support.
- Network log support.
- Terminal logs.

## Artifact Pipeline

Implemented in:

- `nexus-api/app/execution/artifacts.py`
- `nexus-api/app/orchestration/engine.py`

Artifact kinds:

- `screenshot`
- `video`
- `trace`
- `dom_snapshot`
- `network_log`
- `har`
- `http_request`
- `http_response`
- `log`
- `json`
- `text`
- `binary`

Behavior:

- Artifacts are written under the configured artifact root.
- Artifact metadata is persisted to database through the engine callback.
- Artifact capture emits `ArtifactCaptured`.

## Runtime Variable Interpolation

Implemented in:

- `nexus-api/app/execution/interpolation.py`
- `nexus-api/app/orchestration/context.py`

Supported syntax:

- `{{variable}}`
- `${variable}`
- Dotted paths such as `{{user.profile.email}}`

Behavior:

- Plugin configs interpolate before execution.
- Plugin outputs update shared execution context.
- Variable snapshots persist after node completion.

## Plugin Discovery

Implemented in:

- `nexus-api/app/api/routes/plugins.py`
- `nexus-api/app/execution/registry.py`

Routes:

- `/api/plugins/`
- `/api/plugins/node-types`

Behavior:

- Frontend can discover plugin node specs.
- Node palette can render plugin-owned node types.

## Phase 5 Hardening Change

Implemented in:

- `nexus-api/app/config.py`

Change:

- Local config now accepts `DEBUG=release`, `DEBUG=prod`, and `DEBUG=production` as `False`.

Why:

- The existing local `.env` used `DEBUG=release`, which prevented clean backend imports and restarts.

## Verification

Commands run:

```powershell
python -c "from app.config import settings; print(settings.debug)"
```

Result:

- Printed `False` with existing `.env`.

```powershell
python -c "import ast, pathlib; [ast.parse(p.read_text(encoding='utf-8')) for p in pathlib.Path('app').rglob('*.py')]; print('AST OK')"
```

Result:

- Python AST parse passed.

```powershell
python -c "from app.main import app; print('\n'.join(sorted(getattr(r, 'path', '') for r in app.routes if 'plugins' in getattr(r, 'path', ''))))"
```

Result:

- `/api/plugins/`
- `/api/plugins/node-types`

Runtime note:

- A pre-existing process is listening on `localhost:8000` and currently returns 404 for `/api/plugins/`. The source app exposes the route, so that backend process likely needs a restart to pick up the current code.

