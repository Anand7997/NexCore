"""
Shared execution context — variable propagation system.

Supports:
- workflow-level variables (set at trigger time)
- node output variables (set when a node completes)
- runtime template interpolation: ${variable_name}
- context snapshots (saved to DB after each node)
"""
from __future__ import annotations
import asyncio
import re
from copy import deepcopy
from typing import Any


# Supports both `{{var}}` (primary) and legacy `${var}` syntax. Dotted paths
# (`{{user.profile.email}}`) and digits/underscores allowed.
_TEMPLATE_RE = re.compile(
    r"\{\{\s*([A-Za-z0-9_.\[\]]+)\s*\}\}|\$\{\s*([A-Za-z0-9_.\[\]]+)\s*\}"
)


class ExecutionContext:
    """
    Thread-safe (asyncio-level) variable store for a single execution.
    All reads/writes go through the async API to allow future persistence hooks.
    """

    def __init__(self, initial_variables: dict[str, Any] | None = None) -> None:
        self._vars: dict[str, Any] = dict(initial_variables or {})
        self._lock = asyncio.Lock()
        self._snapshots: list[dict[str, Any]] = []

    async def set(self, key: str, value: Any) -> None:
        async with self._lock:
            self._vars[key] = value

    async def set_many(self, variables: dict[str, Any]) -> None:
        async with self._lock:
            self._vars.update(variables)

    async def get(self, key: str, default: Any = None) -> Any:
        async with self._lock:
            return self._vars.get(key, default)

    async def all(self) -> dict[str, Any]:
        async with self._lock:
            return deepcopy(self._vars)

    async def snapshot(self, node_key: str | None = None) -> dict[str, Any]:
        """Take a point-in-time snapshot of all variables."""
        snap = await self.all()
        self._snapshots.append({"node": node_key, "variables": snap})
        return snap

    @staticmethod
    def _walk(path: str, vars_: dict[str, Any]) -> Any:
        parts = path.split(".")
        current: Any = vars_
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
                continue
            if isinstance(current, list):
                try:
                    current = current[int(part)]
                    continue
                except (ValueError, IndexError):
                    return None
            return None
        return current

    async def resolve(self, template: str) -> str:
        """
        Resolve `{{var}}` and `${var}` placeholders. Dotted paths supported.
        Unknown variables are left as-is.
        """
        async with self._lock:
            vars_ = self._vars

            def _replace(match: re.Match) -> str:
                key = (match.group(1) or match.group(2)).strip()
                value = self._walk(key, vars_)
                return str(value) if value is not None else match.group(0)

            return _TEMPLATE_RE.sub(_replace, template)

    async def resolve_dict(self, data: Any) -> Any:
        """Recursively resolve template strings in a dict / list / str."""
        if isinstance(data, str):
            return await self.resolve(data)
        if isinstance(data, dict):
            return {k: await self.resolve_dict(v) for k, v in data.items()}
        if isinstance(data, list):
            return [await self.resolve_dict(v) for v in data]
        return data

    @property
    def snapshots(self) -> list[dict]:
        return list(self._snapshots)
