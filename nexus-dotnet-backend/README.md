# NexCore .NET Control Backend

This is the first migrated .NET backend for the NexCore control plane. It is designed to take over the existing .NET Control API surface at `http://localhost:3001/api` while the Python AI/runtime service remains available at `http://localhost:8000`.

## Run

```powershell
dotnet run
```

## Migrated Surfaces

- `GET /api/health`, `/api/health/live`, `/api/health/ready`
- `/api/orchestration/executions`
- `/api/runtime/agents`
- `/api/runtime/queue`
- `/api/test-management/projects`
- `/api/test-management/modules`
- `/api/test-management/test-cases`
- `/api/test-management/test-suites`
- `/api/test-management/executions`

The current implementation uses in-memory stores so the frontend and agents can move to the .NET API contract first. The next migration step is wiring these stores to PostgreSQL and then moving Temporal/NATS integrations from the  .NET implementation.

## Compatibility Notes

- The API prefix stays `/api`.
- The default port stays `3001`.
- Tenant context is read from `x-tenant-id`, defaulting to `default`.
- Development principal context is read from `x-user-id`, `x-user-email`, and `x-user-roles`.

