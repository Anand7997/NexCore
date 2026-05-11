"""
Variable interpolation engine.

Supports both `{{var}}` (Mustache-style — primary) and legacy `${var}` syntax
within strings, dicts, and lists. Used by execution plugins to substitute
shared-context values like:

    {"url": "https://api.example.com/bookings/{{booking_id}}"}
    {"headers": {"Authorization": "Bearer {{auth_token}}"}}

Dotted paths (`{{user.profile.email}}`) walk into nested dicts.
"""
from __future__ import annotations

import re
from typing import Any, Mapping

# Match {{ var }} OR ${ var }. Allows dotted paths (a.b.c) and digits/underscores.
_TEMPLATE_RE = re.compile(r"\{\{\s*([A-Za-z0-9_.\[\]]+)\s*\}\}|\$\{\s*([A-Za-z0-9_.\[\]]+)\s*\}")


class VariableInterpolator:
    """Stateless interpolation helper."""

    @staticmethod
    def _resolve_path(path: str, vars_: Mapping[str, Any]) -> Any:
        """Walk a dotted path against vars_; returns None on miss."""
        parts = path.split(".")
        current: Any = vars_
        for part in parts:
            if isinstance(current, Mapping) and part in current:
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

    @classmethod
    def interpolate_str(cls, template: str, vars_: Mapping[str, Any]) -> str:
        def _replace(match: re.Match) -> str:
            key = match.group(1) or match.group(2)
            value = cls._resolve_path(key, vars_)
            return str(value) if value is not None else match.group(0)
        return _TEMPLATE_RE.sub(_replace, template)

    @classmethod
    def interpolate(cls, value: Any, vars_: Mapping[str, Any]) -> Any:
        """Recursively interpolate strings inside dicts/lists."""
        if isinstance(value, str):
            return cls.interpolate_str(value, vars_)
        if isinstance(value, Mapping):
            return {k: cls.interpolate(v, vars_) for k, v in value.items()}
        if isinstance(value, list):
            return [cls.interpolate(v, vars_) for v in value]
        return value

    @classmethod
    def has_template(cls, value: Any) -> bool:
        if isinstance(value, str):
            return bool(_TEMPLATE_RE.search(value))
        if isinstance(value, Mapping):
            return any(cls.has_template(v) for v in value.values())
        if isinstance(value, list):
            return any(cls.has_template(v) for v in value)
        return False
