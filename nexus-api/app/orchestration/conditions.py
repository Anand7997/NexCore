"""Safe expression evaluation for workflow control flow."""
from __future__ import annotations

import ast
import re
from collections.abc import Mapping
from typing import Any, Callable


_BOOL_FIXUPS = (
    (re.compile(r"\btrue\b", re.IGNORECASE), "True"),
    (re.compile(r"\bfalse\b", re.IGNORECASE), "False"),
    (re.compile(r"\bnull\b", re.IGNORECASE), "None"),
)
_NOT_RE = re.compile(r"(?<![=!<>])!(?!=)")

_SAFE_FUNCTIONS: dict[str, Callable[..., Any]] = {
    "len": len,
    "int": int,
    "float": float,
    "str": str,
    "bool": bool,
    "min": min,
    "max": max,
    "sum": sum,
    "any": any,
    "all": all,
}

_ALLOWED_NODES = {
    ast.Expression,
    ast.BoolOp,
    ast.BinOp,
    ast.UnaryOp,
    ast.Compare,
    ast.Call,
    ast.Name,
    ast.Load,
    ast.Constant,
    ast.Attribute,
    ast.Subscript,
    ast.List,
    ast.Tuple,
    ast.Dict,
    ast.keyword,
    ast.Slice,
    ast.And,
    ast.Or,
    ast.Not,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
    ast.In,
    ast.NotIn,
    ast.Is,
    ast.IsNot,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Mod,
    ast.Pow,
    ast.FloorDiv,
    ast.UAdd,
    ast.USub,
}


class UnsafeExpressionError(ValueError):
    """Raised when a workflow expression uses an unsupported construct."""


def _normalize_expression(expression: str) -> str:
    normalized = str(expression or "").strip()
    normalized = normalized.replace("&&", " and ").replace("||", " or ")
    normalized = _NOT_RE.sub(" not ", normalized)
    for pattern, replacement in _BOOL_FIXUPS:
        normalized = pattern.sub(replacement, normalized)
    return normalized


def _get_path(variables: Mapping[str, Any], path: str, default: Any = None) -> Any:
    current: Any = variables
    for part in str(path or "").split("."):
        if isinstance(current, Mapping):
            if part not in current:
                return default
            current = current[part]
            continue
        if isinstance(current, list):
            try:
                current = current[int(part)]
                continue
            except (TypeError, ValueError, IndexError):
                return default
        try:
            current = getattr(current, part)
        except AttributeError:
            return default
    return current


class AttrMap(dict):
    """Dict wrapper that allows attribute access inside expressions."""

    def __getattr__(self, item: str) -> Any:
        try:
            return self[item]
        except KeyError as exc:
            raise AttributeError(item) from exc


def _wrap(value: Any) -> Any:
    if isinstance(value, AttrMap):
        return value
    if isinstance(value, Mapping):
        return AttrMap({key: _wrap(val) for key, val in value.items()})
    if isinstance(value, list):
        return [_wrap(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_wrap(item) for item in value)
    return value


def _validate(tree: ast.AST) -> None:
    for node in ast.walk(tree):
        if type(node) not in _ALLOWED_NODES:
            raise UnsafeExpressionError(
                f"Unsupported expression construct: {type(node).__name__}"
            )
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in _SAFE_FUNCTIONS:
                raise UnsafeExpressionError("Only safe helper functions are allowed in expressions")


def build_expression_scope(variables: Mapping[str, Any], extra: Mapping[str, Any] | None = None) -> dict[str, Any]:
    raw_scope = dict(variables or {})
    if extra:
        raw_scope.update(extra)
    scope = {key: _wrap(value) for key, value in raw_scope.items()}
    scope["get"] = lambda path, default=None: _get_path(raw_scope, str(path or ""), default)
    scope["contains"] = lambda container, value: value in container if container is not None else False
    scope["exists"] = lambda path: _get_path(raw_scope, str(path or ""), None) is not None
    scope.update(_SAFE_FUNCTIONS)
    return scope


def evaluate_expression(
    expression: str,
    variables: Mapping[str, Any],
    extra: Mapping[str, Any] | None = None,
) -> Any:
    normalized = _normalize_expression(expression)
    if not normalized:
        return False
    tree = ast.parse(normalized, mode="eval")
    _validate(tree)
    scope = build_expression_scope(variables, extra=extra)
    return eval(compile(tree, "<workflow-condition>", "eval"), {"__builtins__": {}}, scope)


def evaluate_condition(
    expression: str,
    variables: Mapping[str, Any],
    extra: Mapping[str, Any] | None = None,
) -> bool:
    return bool(evaluate_expression(expression, variables, extra=extra))

