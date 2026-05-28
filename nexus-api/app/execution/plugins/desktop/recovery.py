"""Desktop recovery classification and rule selection.

Enhanced with:
- Fallback node chain support: recovery actions can include a ``node_chain``
  that references a list of desktop workflow nodes to execute on failure.
- Outcome modes: recovery plans declare a ``failure_outcome`` of
  ``continue``, ``fail``, or ``quarantine`` for what to do if recovery does not
  restore the session.
- Fully configurable rule sets: callers can pass per-application, per-workflow,
  per-node-type, or per-error-type rule overrides.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class RecoveryPlan:
    category: str
    retryable: bool
    failure_outcome: str = "fail"  # "continue" | "fail" | "quarantine"
    actions: list[dict[str, Any]] = field(default_factory=list)
    node_chain: list[dict[str, Any]] = field(default_factory=list)
    reason: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "category": self.category,
            "retryable": self.retryable,
            "failure_outcome": self.failure_outcome,
            "actions": self.actions,
            "node_chain": self.node_chain,
            "reason": self.reason,
        }


DEFAULT_RECOVERY_RULES: list[dict[str, Any]] = [
    {
        "category": "object_not_found",
        "retryable": True,
        "failure_outcome": "fail",
        "actions": [
            {"type": "capture_evidence"},
            {"type": "retry_with_ranked_locators"},
            {"type": "suggest_repository_update"},
        ],
        "node_chain": [],
        "reason": "Element lookup failed; ranked locator fallback or repository maintenance may resolve it.",
    },
    {
        "category": "window_not_found",
        "retryable": True,
        "failure_outcome": "fail",
        "actions": [
            {"type": "capture_evidence"},
            {"type": "wait_window"},
            {"type": "attach_window"},
        ],
        "node_chain": [],
        "reason": "Expected desktop window was not available or focused.",
    },
    {
        "category": "app_crash",
        "retryable": True,
        "failure_outcome": "fail",
        "actions": [
            {"type": "capture_evidence"},
            {"type": "restart_app"},
        ],
        "node_chain": [],
        "reason": "The desktop session appears to be closed or the process stopped responding.",
    },
    {
        "category": "unexpected_modal",
        "retryable": True,
        "failure_outcome": "continue",
        "actions": [
            {"type": "capture_evidence"},
            {"type": "handle_modal"},
            {"type": "retry_step"},
        ],
        "node_chain": [],
        "reason": "An unexpected dialog or modal may be blocking the target control.",
    },
    {
        "category": "slow_launch",
        "retryable": True,
        "failure_outcome": "continue",
        "actions": [
            {"type": "capture_evidence"},
            {"type": "wait_window", "timeout_seconds": 30},
        ],
        "node_chain": [],
        "reason": "Application launch is taking longer than expected; waiting for main window.",
    },
    {
        "category": "blocked_window",
        "retryable": True,
        "failure_outcome": "continue",
        "actions": [
            {"type": "capture_evidence"},
            {"type": "handle_modal"},
            {"type": "attach_window"},
        ],
        "node_chain": [],
        "reason": "A blocking overlay or permission dialog may be preventing access to the window.",
    },
    {
        "category": "auth_prompt",
        "retryable": False,
        "failure_outcome": "quarantine",
        "actions": [
            {"type": "capture_evidence"},
            {"type": "press_key", "key": "Escape"},
        ],
        "node_chain": [],
        "reason": "An authentication prompt was detected; execution is quarantined for manual review.",
    },
    {
        "category": "assertion_failed",
        "retryable": False,
        "failure_outcome": "fail",
        "actions": [{"type": "capture_evidence"}],
        "node_chain": [],
        "reason": "The application returned a value that did not satisfy the checkpoint.",
    },
    {
        "category": "environment_error",
        "retryable": False,
        "failure_outcome": "fail",
        "actions": [{"type": "capture_evidence"}],
        "node_chain": [],
        "reason": "The runtime environment or configured application path appears invalid.",
    },
]


def classify_desktop_failure(error: str) -> str:
    text = str(error or "").lower()
    if any(token in text for token in ("not found", "no such element", "unable to locate", "element lookup")):
        if "window" in text:
            return "window_not_found"
        return "object_not_found"
    if any(token in text for token in ("window not", "attach", "focus", "foreground")):
        return "window_not_found"
    if any(token in text for token in ("modal", "dialog", "popup", "blocked by")):
        return "unexpected_modal"
    if any(token in text for token in ("blocked window", "overlay", "blocked_window")):
        return "blocked_window"
    if any(token in text for token in ("crash", "closed", "connection refused", "session deleted", "not responding")):
        return "app_crash"
    if any(token in text for token in ("slow_launch", "launch timeout", "startup timeout")):
        return "slow_launch"
    if any(token in text for token in ("auth", "login prompt", "credentials", "password prompt", "auth_prompt")):
        return "auth_prompt"
    if any(token in text for token in ("expected", "assert", "checkpoint")):
        return "assertion_failed"
    if any(token in text for token in ("path", "permission", "access denied", "file not found", "environment")):
        return "environment_error"
    return "unknown"


def recovery_plan_for_error(
    error: str,
    rules: list[dict[str, Any]] | None = None,
    *,
    node_type: str = "",
    application: str = "",
) -> RecoveryPlan:
    """Select the best recovery plan for a desktop failure.

    Rule matching priority:
    1. Custom rules scoped to ``node_type`` (most specific).
    2. Custom rules scoped to ``application``.
    3. Generic custom rules (matching only on category).
    4. Built-in DEFAULT_RECOVERY_RULES.
    """
    category = classify_desktop_failure(error)
    rule_set = list(rules or [])

    # Try scoped matches first
    for scope_key, scope_val in [("node_type", node_type), ("application", application)]:
        if scope_val:
            for rule in rule_set:
                if (
                    str(rule.get("category") or "") == category
                    and str(rule.get(scope_key) or "").lower() == scope_val.lower()
                ):
                    return _plan_from_rule(category, rule)

    # Generic custom rules
    for rule in rule_set:
        if str(rule.get("category") or "") == category and not rule.get("node_type") and not rule.get("application"):
            return _plan_from_rule(category, rule)

    # Built-in defaults
    for rule in DEFAULT_RECOVERY_RULES:
        if str(rule.get("category") or "") == category:
            return _plan_from_rule(category, rule)

    return RecoveryPlan(
        category=category,
        retryable=False,
        failure_outcome="fail",
        actions=[{"type": "capture_evidence"}],
        node_chain=[],
        reason="No recovery rule matched this desktop failure category.",
    )


def _plan_from_rule(category: str, rule: dict[str, Any]) -> RecoveryPlan:
    return RecoveryPlan(
        category=category,
        retryable=bool(rule.get("retryable", False)),
        failure_outcome=str(rule.get("failure_outcome") or "fail"),
        actions=list(rule.get("actions") or []),
        node_chain=list(rule.get("node_chain") or []),
        reason=str(rule.get("reason") or ""),
    )


def build_custom_rule(
    category: str,
    *,
    retryable: bool = False,
    failure_outcome: str = "fail",
    actions: list[dict[str, Any]] | None = None,
    node_chain: list[dict[str, Any]] | None = None,
    node_type: str = "",
    application: str = "",
    reason: str = "",
) -> dict[str, Any]:
    """Convenience factory for building a typed recovery rule dict."""
    rule: dict[str, Any] = {
        "category": category,
        "retryable": retryable,
        "failure_outcome": failure_outcome,
        "actions": actions or [{"type": "capture_evidence"}],
        "node_chain": node_chain or [],
        "reason": reason,
    }
    if node_type:
        rule["node_type"] = node_type
    if application:
        rule["application"] = application
    return rule
