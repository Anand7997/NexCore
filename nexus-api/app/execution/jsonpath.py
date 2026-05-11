"""
Lightweight dotted-path JSON traversal — no external dependency.

Supports:
    $                 → root
    $.a.b             → key access
    $.items[0]        → list index
    $.items[*].id     → wildcard (returns list)
    a.b.c             → leading $ optional

Designed for assertion + extraction nodes. Not a full JSONPath spec
implementation — keep it small, predictable, and fast.
"""
from __future__ import annotations

import re
from typing import Any

_TOKEN_RE = re.compile(r"([^.\[\]]+)|\[(\*|\d+)\]")


def _tokens(path: str) -> list[str]:
    if path.startswith("$"):
        path = path[1:]
        if path.startswith("."):
            path = path[1:]
    if not path:
        return []
    raw = []
    i = 0
    n = len(path)
    while i < n:
        m = _TOKEN_RE.match(path, i)
        if not m:
            break
        if m.group(1) is not None:
            raw.append(m.group(1))
        else:
            raw.append(f"[{m.group(2)}]")
        i = m.end()
        if i < n and path[i] == ".":
            i += 1
    return raw


def query(data: Any, path: str) -> Any:
    """
    Resolve a JSONPath-ish expression. Returns:
        - the matched value if path is unambiguous,
        - a list of values if a [*] wildcard was used,
        - None if the path could not be resolved.
    """
    tokens = _tokens(path)
    if not tokens:
        return data
    return _walk([data], tokens)


def _walk(values: list[Any], tokens: list[str]) -> Any:
    if not tokens:
        return values[0] if len(values) == 1 else values

    token = tokens[0]
    rest = tokens[1:]
    out: list[Any] = []

    for value in values:
        if token == "[*]":
            if isinstance(value, list):
                out.extend(value)
            elif isinstance(value, dict):
                out.extend(value.values())
        elif token.startswith("[") and token.endswith("]"):
            try:
                idx = int(token[1:-1])
                if isinstance(value, list) and -len(value) <= idx < len(value):
                    out.append(value[idx])
            except ValueError:
                pass
        else:
            if isinstance(value, dict) and token in value:
                out.append(value[token])

    if not out:
        return None
    return _walk(out, rest)
