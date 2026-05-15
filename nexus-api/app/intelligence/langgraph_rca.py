"""LangGraph Root Cause Analysis (RCA) workflow for AI investigation jobs.

Workflow graph
--------------
  gather_evidence
        │
  classify_failure
        │
  retrieve_memory          ← Qdrant similarity search for past failures
        │
  analyze_root_cause
        │
  generate_recommendations
        │
  validate_results
        │
       END

Each node returns a dict that is merged into the shared RCAState.  The graph
supports all four AI job types (root_cause_analysis, flaky_detection,
locator_healing, anomaly_analysis) by branching logic inside nodes.
"""
from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Optional, TypedDict

logger = logging.getLogger(__name__)


# ── State ─────────────────────────────────────────────────────────────────────

class RCAState(TypedDict, total=False):
    # ── Input ─────────────────────────────────────────────────────
    job_id: str
    job_type: str
    tenant_id: str
    evidence: dict[str, Any]
    # ── Derived ───────────────────────────────────────────────────
    execution_id: str
    error_text: str
    failed_nodes: list[dict[str, Any]]
    failure_class: str
    similar_failures: list[dict[str, Any]]
    root_cause: str
    findings: list[dict[str, Any]]
    recommendations: list[dict[str, Any]]
    confidence: float
    analysis_steps: list[str]
    # ── Output ────────────────────────────────────────────────────
    summary: str
    artifacts: list[dict[str, Any]]


# ── Node helpers ──────────────────────────────────────────────────────────────

def _steps(state: RCAState, msg: str) -> list[str]:
    return list(state.get("analysis_steps") or []) + [msg]


# ── Nodes ─────────────────────────────────────────────────────────────────────

def gather_evidence(state: RCAState) -> dict[str, Any]:
    evidence: dict[str, Any] = state.get("evidence") or {}
    timeline: list[dict[str, Any]] = evidence.get("timeline") or []
    artifacts: list[dict[str, Any]] = evidence.get("artifacts") or []

    failed_nodes = [
        t for t in timeline
        if isinstance(t, dict) and t.get("status") in {"failed", "error"}
    ]
    error_parts = [
        str(n.get("error") or n.get("message") or "")[:300]
        for n in failed_nodes[:5]
        if n.get("error") or n.get("message")
    ]
    return {
        "execution_id": evidence.get("executionId", "unknown"),
        "failed_nodes": failed_nodes,
        "error_text": " | ".join(error_parts) or "no explicit error captured",
        "artifacts": list(artifacts),
        "analysis_steps": _steps(state, "gather_evidence: loaded evidence bundle"),
    }


def classify_failure(state: RCAState) -> dict[str, Any]:
    job_type: str = state.get("job_type") or "root_cause_analysis"
    error_text: str = (state.get("error_text") or "").lower()

    # Pattern-match against common failure signatures
    if any(k in error_text for k in ("selector", "locator", "element not found", "xpath", "css")):
        cls = "selector_failure"
    elif any(k in error_text for k in ("timeout", "timed out", "wait exceeded")):
        cls = "timeout_failure"
    elif any(k in error_text for k in ("401", "403", "authentication", "unauthori", "forbidden")):
        cls = "auth_failure"
    elif any(k in error_text for k in ("500", "502", "503", "server error", "internal error")):
        cls = "server_error"
    elif any(k in error_text for k in ("assertion", "expected", "mismatch", "not equal", "assert")):
        cls = "assertion_failure"
    elif any(k in error_text for k in ("network", "connection refused", "econnrefused", "dns")):
        cls = "network_failure"
    elif job_type == "flaky_detection":
        cls = "flaky_test"
    elif job_type == "anomaly_analysis":
        cls = "anomaly"
    elif job_type == "locator_healing":
        cls = "selector_failure"
    else:
        cls = "unknown_failure"

    return {
        "failure_class": cls,
        "analysis_steps": _steps(state, f"classify_failure: classified as {cls}"),
    }


async def retrieve_memory(state: RCAState) -> dict[str, Any]:
    error_text: str = state.get("error_text") or ""
    tenant_id: str | None = state.get("tenant_id")
    similar: list[dict[str, Any]] = []

    try:
        from app.intelligence.memory import get_memory_store
        results = await get_memory_store().find_similar_failures(
            error_text, tenant_id=tenant_id, limit=3, score_threshold=0.6
        )
        similar = [
            {
                "failure_id": r.failure_id,
                "score": round(r.score, 3),
                "execution_id": r.execution_id,
                "error_summary": r.error_summary,
                "root_cause_type": r.root_cause_type,
                "recommendations": r.recommendations,
            }
            for r in results
        ]
        msg = f"retrieve_memory: found {len(similar)} similar failure(s)"
    except Exception as exc:
        logger.warning("Memory retrieval skipped: %s", exc)
        msg = "retrieve_memory: skipped (Qdrant unavailable)"

    return {
        "similar_failures": similar,
        "analysis_steps": _steps(state, msg),
    }


def analyze_root_cause(state: RCAState) -> dict[str, Any]:
    failure_class: str = state.get("failure_class") or "unknown_failure"
    failed_nodes: list[dict[str, Any]] = state.get("failed_nodes") or []
    error_text: str = state.get("error_text") or ""
    similar: list[dict[str, Any]] = state.get("similar_failures") or []
    job_type: str = state.get("job_type") or "root_cause_analysis"
    evidence: dict[str, Any] = state.get("evidence") or {}

    findings: list[dict[str, Any]] = []
    confidence = 0.4

    # Primary failure finding
    findings.append({
        "type": "primary_failure",
        "class": failure_class,
        "affected_nodes": [n.get("nodeId") or n.get("node_id", "") for n in failed_nodes[:5]],
        "error_excerpt": error_text[:200],
        "severity": "critical" if failed_nodes else "warning",
        "evidence_link": "execution:timeline",
    })

    # Historical pattern evidence
    if similar:
        confidence = min(confidence + 0.15 * min(len(similar), 3), 0.85)
        findings.append({
            "type": "historical_pattern",
            "description": f"Found {len(similar)} similar past failure(s)",
            "similar_executions": [s["execution_id"] for s in similar[:3]],
            "evidence_link": f"failure:{similar[0]['failure_id']}",
            "confidence_boost": round(0.15 * min(len(similar), 3), 2),
        })

    # Job-type-specific analysis
    if job_type == "flaky_detection":
        retry_nodes = [n for n in failed_nodes if (n.get("attempts") or 1) > 1]
        if retry_nodes:
            findings.append({
                "type": "flaky_pattern",
                "description": f"{len(retry_nodes)} node(s) required retries",
                "nodes": [n.get("nodeId", "") for n in retry_nodes],
                "evidence_link": "execution:retry_timeline",
            })
            confidence = min(confidence + 0.2, 0.9)

    elif job_type == "locator_healing":
        selectors = [
            n.get("metadata", {}).get("selector", "")
            for n in failed_nodes
            if n.get("metadata")
        ]
        findings.append({
            "type": "locator_failure",
            "description": "Element selector(s) failed — DOM may have changed",
            "failed_selectors": [s for s in selectors if s][:5],
            "evidence_link": "execution:timeline",
        })
        confidence = min(confidence + 0.25, 0.88)

    elif job_type == "anomaly_analysis":
        timeline: list[dict[str, Any]] = evidence.get("timeline") or []
        durations = [n.get("duration_ms", 0) for n in timeline if n.get("duration_ms")]
        if len(durations) > 1:
            avg_dur = sum(durations) / len(durations)
            anomalies = [n for n in timeline if n.get("duration_ms", 0) > avg_dur * 2.5]
            findings.append({
                "type": "duration_anomaly",
                "description": f"{len(anomalies)} node(s) exceeded 2.5× average duration",
                "anomalous_nodes": [n.get("nodeId", "") for n in anomalies[:5]],
                "avg_duration_ms": round(avg_dur, 2),
                "evidence_link": "execution:timeline",
            })
            if anomalies:
                confidence = min(confidence + 0.2, 0.85)

    if failure_class != "unknown_failure":
        confidence = min(confidence + 0.1, 0.9)

    return {
        "findings": findings,
        "root_cause": _summarize_root_cause(failure_class, failed_nodes, job_type),
        "confidence": round(confidence, 3),
        "analysis_steps": _steps(state, f"analyze_root_cause: {len(findings)} finding(s)"),
    }


def generate_recommendations(state: RCAState) -> dict[str, Any]:
    failure_class: str = state.get("failure_class") or "unknown_failure"
    similar: list[dict[str, Any]] = state.get("similar_failures") or []
    job_type: str = state.get("job_type") or "root_cause_analysis"

    recs: list[dict[str, Any]] = list(_class_recommendations(failure_class))

    # Incorporate historical recommendations with evidence links
    for s in similar[:2]:
        for r in (s.get("recommendations") or [])[:2]:
            r_copy = dict(r)
            r_copy["source"] = "historical_pattern"
            r_copy["evidence_link"] = f"failure:{s['failure_id']}"
            recs.append(r_copy)

    # Job-type overrides
    if job_type == "locator_healing":
        recs.insert(0, {
            "type": "locator_strategy",
            "priority": "high",
            "action": "Replace brittle CSS/XPath locators with data-testid or aria-label attributes",
            "evidence_link": "finding:locator_failure",
        })
    elif job_type == "flaky_detection":
        recs.insert(0, {
            "type": "stabilize_test",
            "priority": "medium",
            "action": "Add explicit wait conditions and eliminate timing-dependent assertions",
            "evidence_link": "finding:flaky_pattern",
        })
    elif job_type == "anomaly_analysis":
        recs.insert(0, {
            "type": "performance_investigation",
            "priority": "medium",
            "action": "Profile slow nodes and verify external service SLA compliance",
            "evidence_link": "finding:duration_anomaly",
        })

    # Deduplicate by action text
    seen: set[str] = set()
    unique_recs: list[dict[str, Any]] = []
    for r in recs:
        key = r.get("action", str(r))
        if key not in seen:
            seen.add(key)
            unique_recs.append(r)

    return {
        "recommendations": unique_recs,
        "analysis_steps": _steps(
            state, f"generate_recommendations: {len(unique_recs)} recommendation(s)"
        ),
    }


def validate_results(state: RCAState) -> dict[str, Any]:
    findings: list[dict[str, Any]] = list(state.get("findings") or [])
    recommendations: list[dict[str, Any]] = list(state.get("recommendations") or [])
    confidence: float = max(0.0, min(1.0, state.get("confidence") or 0.0))
    root_cause: str = state.get("root_cause") or ""
    job_type: str = state.get("job_type") or "root_cause_analysis"
    execution_id: str = state.get("execution_id") or ""

    if not findings:
        findings = [{
            "type": "no_findings",
            "description": "Insufficient evidence to identify root cause",
            "severity": "info",
        }]
        confidence = min(confidence, 0.3)

    if not recommendations:
        recommendations = [{
            "type": "review",
            "priority": "low",
            "action": "Review execution logs manually for additional context",
        }]

    summary = (
        f"[{job_type.replace('_', ' ').upper()}] Execution {execution_id}: "
        f"{root_cause or 'Analysis complete'}. "
        f"{len(findings)} finding(s), {len(recommendations)} recommendation(s). "
        f"Confidence: {confidence:.0%}."
    )

    return {
        "findings": findings,
        "recommendations": recommendations,
        "confidence": round(confidence, 3),
        "summary": summary,
        "analysis_steps": _steps(state, "validate_results: complete"),
    }


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_rca_graph() -> Any:
    """Build and compile the LangGraph RCA state machine."""
    try:
        from langgraph.graph import StateGraph, END
    except ImportError as exc:
        raise ImportError(
            "langgraph is required: python -m pip install -r nexus-api/requirements-ai.txt"
        ) from exc

    builder: Any = StateGraph(RCAState)
    builder.add_node("gather_evidence", gather_evidence)
    builder.add_node("classify_failure", classify_failure)
    builder.add_node("retrieve_memory", retrieve_memory)
    builder.add_node("analyze_root_cause", analyze_root_cause)
    builder.add_node("generate_recommendations", generate_recommendations)
    builder.add_node("validate_results", validate_results)

    builder.set_entry_point("gather_evidence")
    builder.add_edge("gather_evidence", "classify_failure")
    builder.add_edge("classify_failure", "retrieve_memory")
    builder.add_edge("retrieve_memory", "analyze_root_cause")
    builder.add_edge("analyze_root_cause", "generate_recommendations")
    builder.add_edge("generate_recommendations", "validate_results")
    builder.add_edge("validate_results", END)
    return builder.compile()


_rca_graph: Any = None


def get_rca_graph() -> Any:
    global _rca_graph
    if _rca_graph is None:
        _rca_graph = build_rca_graph()
    return _rca_graph


def _make_initial_state(
    job_id: str,
    job_type: str,
    tenant_id: str,
    evidence: dict[str, Any],
) -> RCAState:
    return {
        "job_id": job_id,
        "job_type": job_type,
        "tenant_id": tenant_id,
        "evidence": evidence,
        "execution_id": evidence.get("executionId", ""),
        "error_text": "",
        "failed_nodes": [],
        "failure_class": "unknown_failure",
        "similar_failures": [],
        "root_cause": "",
        "findings": [],
        "recommendations": [],
        "confidence": 0.0,
        "analysis_steps": [],
        "summary": "",
        "artifacts": [],
    }


async def run_rca(
    job_id: str,
    job_type: str,
    tenant_id: str,
    evidence: dict[str, Any],
) -> dict[str, Any]:
    """Execute the RCA LangGraph workflow and return the completed state."""
    initial = _make_initial_state(job_id, job_type, tenant_id, evidence)
    graph = get_rca_graph()
    result: dict[str, Any] = await graph.ainvoke(initial)
    return result


async def run_rca_streaming(
    job_id: str,
    job_type: str,
    tenant_id: str,
    evidence: dict[str, Any],
    on_node_complete: Optional[Callable[[str, dict[str, Any]], Awaitable[None]]] = None,
) -> dict[str, Any]:
    """Execute the RCA workflow with per-node progress callbacks.

    Uses ``graph.astream()`` so ``on_node_complete`` is awaited after every
    LangGraph node, enabling real-time event publishing before the full result
    is ready.  Falls back to ``ainvoke`` if streaming is unavailable.

    Args:
        on_node_complete: async callable(node_name, state_delta).  Errors
            inside the callback are logged and swallowed so they never abort
            the analysis.
    """
    initial = _make_initial_state(job_id, job_type, tenant_id, evidence)
    graph = get_rca_graph()

    # Accumulate state deltas across all nodes
    final_state: dict[str, Any] = dict(initial)

    try:
        async for chunk in graph.astream(initial):
            # chunk: {node_name: state_delta_dict}
            node_name = next(iter(chunk))
            delta: dict[str, Any] = chunk[node_name]
            final_state.update(delta)

            if on_node_complete is not None:
                try:
                    await on_node_complete(node_name, delta)
                except Exception:
                    logger.exception("on_node_complete callback raised for node %s", node_name)

    except Exception as exc:
        # astream may not be available in older LangGraph builds — fall back.
        logger.warning("astream failed (%s), falling back to ainvoke", exc)
        final_state = await graph.ainvoke(initial)

    return final_state


# ── Helpers ───────────────────────────────────────────────────────────────────

def _summarize_root_cause(
    failure_class: str,
    failed_nodes: list[dict[str, Any]],
    job_type: str,
) -> str:
    labels: dict[str, str] = {
        "selector_failure": "Element selector failure — DOM structure may have changed",
        "timeout_failure": "Timeout exceeded — page/element/service did not respond in time",
        "auth_failure": "Authentication or authorisation failure",
        "server_error": "Backend server returned a 5xx error",
        "assertion_failure": "Test assertion failed — unexpected application state",
        "network_failure": "Network connectivity issue",
        "flaky_test": "Flaky test pattern — intermittent failures without a deterministic cause",
        "anomaly": "Execution time anomaly detected",
        "unknown_failure": "Root cause undetermined from available evidence",
    }
    base = labels.get(failure_class, "Root cause undetermined")
    if failed_nodes:
        n = len(failed_nodes)
        base += f" ({n} node{'s' if n > 1 else ''} failed)"
    return base


def _class_recommendations(failure_class: str) -> list[dict[str, Any]]:
    mapping: dict[str, list[dict[str, Any]]] = {
        "selector_failure": [
            {
                "type": "locator_fix",
                "priority": "high",
                "action": "Update element selectors to use data-testid or aria attributes",
                "evidence_link": "finding:primary_failure",
            },
            {
                "type": "locator_healing",
                "priority": "medium",
                "action": "Enable auto-locator healing to detect DOM changes proactively",
                "evidence_link": "finding:primary_failure",
            },
        ],
        "timeout_failure": [
            {
                "type": "timeout_tuning",
                "priority": "high",
                "action": "Increase timeout thresholds and add retry logic for slow resources",
                "evidence_link": "finding:primary_failure",
            },
            {
                "type": "network_check",
                "priority": "medium",
                "action": "Verify CDN and network latency during test execution",
                "evidence_link": "finding:primary_failure",
            },
        ],
        "auth_failure": [
            {
                "type": "credential_check",
                "priority": "critical",
                "action": "Verify test credentials are valid and not expired",
                "evidence_link": "finding:primary_failure",
            },
        ],
        "server_error": [
            {
                "type": "service_health",
                "priority": "high",
                "action": "Check backend service health and recent deployment status",
                "evidence_link": "finding:primary_failure",
            },
        ],
        "assertion_failure": [
            {
                "type": "assertion_review",
                "priority": "high",
                "action": "Review assertion expectations against current application behaviour",
                "evidence_link": "finding:primary_failure",
            },
        ],
        "network_failure": [
            {
                "type": "network_retry",
                "priority": "high",
                "action": "Add retry logic with exponential back-off for transient network failures",
                "evidence_link": "finding:primary_failure",
            },
        ],
        "flaky_test": [
            {
                "type": "stabilize_test",
                "priority": "medium",
                "action": "Audit timing dependencies and add deterministic waits",
                "evidence_link": "finding:flaky_pattern",
            },
        ],
    }
    return mapping.get(failure_class, [
        {
            "type": "manual_review",
            "priority": "medium",
            "action": "Manually review execution logs for additional context",
            "evidence_link": "finding:primary_failure",
        },
    ])
