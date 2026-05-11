# Phase 10 Deployment Topology

## Docker Compose Baseline

Local and early enterprise deployments should run:

- API backend
- frontend
- SQLite or PostgreSQL
- runtime agents
- artifact volume
- optional Appium server
- optional WinAppDriver host

## Kubernetes Target

Recommended workloads:

- `nexus-api` Deployment
- `nexus-web-agent` Deployment
- `nexus-api-agent` Deployment
- `nexus-mobile-agent` Deployment
- `nexus-desktop-agent` Windows node pool
- `nexus-frontend` Deployment
- `postgres` managed service or StatefulSet
- artifact object storage
- ingress controller
- Keycloak or enterprise OIDC provider

## Scaling Rules

- Scale API pods by CPU and request latency.
- Scale runtime agents by execution queue depth.
- Scale Playwright workers by browser capacity.
- Scale Appium agents by device availability.
- Scale desktop agents by Windows VM capacity.

## Security Rules

- All user traffic enters through TLS ingress.
- Runtime agents authenticate before registration.
- Secrets are referenced by `secret_ref`; raw secrets must not be stored in integration configs.
- Enterprise routes require role checks.
- Audit logs must be retained according to tenant policy.

## Readiness Gates

- `/api/health` is healthy.
- `/api/enterprise/compliance/readiness` returns enabled controls.
- Runtime agents heartbeat within the accepted window.
- Execution queue dispatches to compatible agents.
- Audit logs are written for enterprise actions.
