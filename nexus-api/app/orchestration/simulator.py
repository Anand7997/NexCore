"""
Execution Simulator — makes orchestration feel alive before real automation engines exist.

Each node type has:
- realistic latency range
- base failure rate
- output variable templates

The simulator is entirely async and supports cancellation.
"""
from __future__ import annotations
import asyncio
import random
from dataclasses import dataclass, field
from typing import Any

from app.orchestration.context import ExecutionContext


@dataclass
class SimulationResult:
    success: bool
    duration_ms: int
    output: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


# Per-node-type simulation profiles
_PROFILES: dict[str, dict] = {
    "trigger":           {"min": 0.05, "max": 0.2,  "fail": 0.00},
    "webAction":         {"min": 0.8,  "max": 4.0,  "fail": 0.06},
    "apiValidation":     {"min": 0.15, "max": 1.0,  "fail": 0.04},
    "dbValidation":      {"min": 0.08, "max": 0.5,  "fail": 0.03},
    "mobileAction":      {"min": 1.5,  "max": 6.0,  "fail": 0.09},
    "desktopAction":     {"min": 1.5,  "max": 8.0,  "fail": 0.11},
    "aiAnalysis":        {"min": 0.8,  "max": 3.0,  "fail": 0.01},
    "conditionalBranch": {"min": 0.05, "max": 0.15, "fail": 0.00},
    "retryNode":         {"min": 0.05, "max": 0.1,  "fail": 0.00},
    "delayNode":         {"min": 1.0,  "max": 2.0,  "fail": 0.00},
    "assertion":         {"min": 0.3,  "max": 1.2,  "fail": 0.12},
}

_DEFAULT_PROFILE = {"min": 0.5, "max": 2.5, "fail": 0.05}

# Sample output templates per node type
_OUTPUT_TEMPLATES: dict[str, dict[str, Any]] = {
    "trigger":       {"triggered_at": "__now__", "trigger_id": "__uuid__"},
    "webAction":     {"screenshot_url": "https://cdn.nexus.io/shots/__uuid__.png", "page_title": "Loaded", "load_time_ms": "__rand_int__"},
    "apiValidation": {"status_code": 200, "response_time_ms": "__rand_int__", "validated": True},
    "dbValidation":  {"rows_checked": "__rand_int__", "schema_valid": True, "query_time_ms": "__rand_int__"},
    "mobileAction":  {"gesture_completed": True, "frame_rate": "__rand_int__"},
    "desktopAction": {"action_completed": True, "window_title": "App Window", "cpu_pct": "__rand_int__"},
    "aiAnalysis":    {"confidence": "__rand_float__", "anomaly_detected": False, "insight_count": "__rand_int__"},
    "assertion":     {"assertions_passed": "__rand_int__", "assertions_total": "__rand_int__"},
}

# Realistic error messages by node type
_ERROR_MESSAGES: dict[str, list[str]] = {
    "webAction":     [
        "Element not found: .primary-action (timeout 5000ms)",
        "Navigation timeout: page did not load in 8s",
        "Network error: ERR_CONNECTION_RESET",
        "Selector .result-value matched 0 elements",
    ],
    "apiValidation": [
        "API returned 503 Service Unavailable",
        "Response schema mismatch: expected string, got null at $.data.id",
        "Request timeout after 10s",
        "TLS handshake failed: certificate expired",
    ],
    "dbValidation":  [
        "Query timeout: statement exceeded 5000ms",
        "Constraint violation: NOT NULL constraint failed",
        "Row count mismatch: expected 1, got 0",
    ],
    "mobileAction":  [
        "Element not visible: coordinates (320, 480) not interactable",
        "App crash detected (signal 11)",
        "Gesture recognition timeout: swipe not registered",
    ],
    "assertion":     [
        "Assertion failed: expected 'Welcome' to equal 'Dashboard'",
        "Visual diff exceeded threshold: 8.4% != 2%",
        "Value assertion failed: expected value did not match actual value",
    ],
}
_DEFAULT_ERRORS = ["Internal error: unexpected exception in test runner"]


def _resolve_template(value: Any, rng: random.Random) -> Any:
    import uuid
    from datetime import datetime
    if value == "__now__":
        return datetime.utcnow().isoformat()
    if value == "__uuid__":
        return str(uuid.uuid4())[:8]
    if value == "__rand_int__":
        return rng.randint(1, 500)
    if value == "__rand_float__":
        return round(rng.uniform(0.7, 0.99), 3)
    return value


def _build_output(node_type: str, rng: random.Random) -> dict[str, Any]:
    tmpl = _OUTPUT_TEMPLATES.get(node_type, {})
    return {k: _resolve_template(v, rng) for k, v in tmpl.items()}


class NodeSimulator:
    """
    Simulates the execution of a single workflow node.
    Execution-engine-agnostic — pluggable when real engines are ready.
    """

    def __init__(self, seed: int | None = None) -> None:
        self._rng = random.Random(seed)

    async def run(
        self,
        node_key: str,
        node_type: str,
        config: dict[str, Any],
        context: ExecutionContext,
        cancellation_token: asyncio.Event | None = None,
    ) -> SimulationResult:
        """
        Simulate node execution.
        Respects cancellation via cancellation_token.
        """
        profile = _PROFILES.get(node_type, _DEFAULT_PROFILE)

        # Realistic latency
        delay = self._rng.uniform(profile["min"], profile["max"])

        # Check for configurable delay override
        if node_type == "delayNode":
            delay = float(config.get("delay_seconds", delay))

        # Simulate work (interruptible)
        start_ns = asyncio.get_event_loop().time()
        try:
            if cancellation_token:
                await asyncio.wait_for(
                    cancellation_token.wait(),
                    timeout=delay,
                )
                # If we get here, cancellation was requested
                return SimulationResult(success=False, duration_ms=0, error="Cancelled")
            else:
                await asyncio.sleep(delay)
        except asyncio.TimeoutError:
            pass  # Normal completion — timeout = delay elapsed

        duration_ms = int((asyncio.get_event_loop().time() - start_ns) * 1000)

        # Determine outcome
        failure_override = float(config.get("failure_rate", profile["fail"]))
        failed = self._rng.random() < failure_override

        if failed:
            errors = _ERROR_MESSAGES.get(node_type, _DEFAULT_ERRORS)
            return SimulationResult(
                success=False,
                duration_ms=duration_ms,
                error=self._rng.choice(errors),
            )

        # Build output variables
        output = _build_output(node_type, self._rng)
        # Allow config to inject static output values
        output.update(config.get("static_output", {}))

        return SimulationResult(success=True, duration_ms=duration_ms, output=output)
