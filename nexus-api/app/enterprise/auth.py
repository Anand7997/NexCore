"""Enterprise auth context and RBAC helpers.

The current implementation accepts trusted gateway headers so local development
and future Keycloak/OIDC integration share one authorization contract.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, Header, HTTPException, status


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    tenant_id: str | None
    email: str
    roles: tuple[str, ...]

    def has_any_role(self, required: set[str]) -> bool:
        return bool(required.intersection(self.roles)) or "admin" in self.roles


async def get_auth_context(
    x_user_id: str | None = Header(default=None),
    x_tenant_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
    x_roles: str | None = Header(default=None),
) -> AuthContext:
    roles = tuple(role.strip() for role in (x_roles or "admin").split(",") if role.strip())
    return AuthContext(
        user_id=x_user_id or "local-admin",
        tenant_id=x_tenant_id,
        email=x_user_email or "local-admin@nexus.qa",
        roles=roles or ("admin",),
    )


def require_roles(*roles: str) -> Callable:
    required = set(roles)

    async def _dependency(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if required and not ctx.has_any_role(required):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(sorted(required))}",
            )
        return ctx

    return _dependency
