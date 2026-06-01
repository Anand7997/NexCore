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

import asyncio
import json
import logging
import inspect
import importlib.util
from typing import Any, Awaitable, Callable, Optional, TypedDict
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


def _select_openai_model(settings: Any) -> str:
    from app.config import DEFAULT_OPENAI_MODEL

    configured = str(settings.default_ai_model or "").strip()
    return configured if configured.lower().startswith("gpt") else DEFAULT_OPENAI_MODEL


def _select_claude_model(settings: Any) -> str:
    from app.config import DEFAULT_CLAUDE_MODEL

    configured = str(settings.default_ai_model or "").strip()
    if "claude" in configured.lower():
        return configured
    return str(settings.default_claude_model or DEFAULT_CLAUDE_MODEL).strip() or DEFAULT_CLAUDE_MODEL


# ── Structured LLM Pydantic Schemas ───────────────────────────────────────────

class FailureClassification(BaseModel):
    failure_class: str = Field(
        description="Class of failure. Must be one of: selector_failure, timeout_failure, auth_failure, server_error, assertion_failure, network_failure, flaky_test, anomaly, unknown_failure"
    )
    confidence: float = Field(description="Confidence score between 0.0 and 1.0")
    reason: str = Field(description="Reasoning behind this classification")


class FindingItem(BaseModel):
    type: str = Field(description="Type of finding (e.g. primary_failure, duration_anomaly, historical_pattern, flaky_pattern, locator_failure)")
    description: str = Field(description="Detailed description of what went wrong or patterns identified")
    severity: str = Field(description="Severity (critical, warning, info)")
    evidence_link: str = Field(description="Pointer to the source of evidence (e.g. execution:timeline)")


class RecommendationItem(BaseModel):
    type: str = Field(description="Type of recommendation (e.g. locator_strategy, timeout_tuning, service_health, assertion_review, stabilizes_test)")
    priority: str = Field(description="Priority (critical, high, medium, low)")
    action: str = Field(description="Actionable step to fix the failure")
    evidence_link: str = Field(description="Link to the finding that triggered this recommendation")


class RootCauseAnalysis(BaseModel):
    findings: list[FindingItem] = Field(description="List of detailed findings from the evidence")
    recommendations: list[RecommendationItem] = Field(description="List of actionable recommendations to fix/prevent the issue")
    root_cause: str = Field(description="Comprehensive summary of the root cause")
    confidence: float = Field(description="Confidence score of the analysis between 0.0 and 1.0")


# ── AI Provider Helper ────────────────────────────────────────────────────────

def _get_ai_provider() -> Any:
    try:
        from app.config import settings
        provider_name = settings.default_ai_provider.lower()
        has_openai = importlib.util.find_spec("openai") is not None
        has_anthropic = importlib.util.find_spec("anthropic") is not None
        if provider_name == "openai" and settings.openai_api_key and has_openai:
            from app.ai_workflow.providers.openai_provider import OpenAIProvider
            return OpenAIProvider(api_key=settings.openai_api_key, model=_select_openai_model(settings))
        elif provider_name in ("claude", "anthropic") and settings.anthropic_api_key and has_anthropic:
            from app.ai_workflow.providers.claude_provider import ClaudeProvider
            return ClaudeProvider(api_key=settings.anthropic_api_key, model=_select_claude_model(settings))
        
        # Fallback to whatever key is present
        if settings.openai_api_key and has_openai:
            from app.ai_workflow.providers.openai_provider import OpenAIProvider
            return OpenAIProvider(api_key=settings.openai_api_key, model=_select_openai_model(settings))
        elif settings.anthropic_api_key and has_anthropic:
            from app.ai_workflow.providers.claude_provider import ClaudeProvider
            return ClaudeProvider(api_key=settings.anthropic_api_key, model=_select_claude_model(settings))
    except Exception as exc:
        logger.warning("Could not load AI provider config: %s", exc)
    return None


def _provider_error_status(error: str) -> str:
    text = str(error or "").lower()
    if any(token in text for token in ("quota", "insufficient_quota", "credit", "exhaust", "rate_limit", "429")):
        return "quota_exhausted"
    if any(token in text for token in ("api key", "authentication", "unauthorized", "invalid x-api-key", "401")):
        return "auth_failed"
    if any(token in text for token in ("timeout", "timed out")):
        return "timeout"
    return "failed"


def _ai_provider_candidates() -> list[dict[str, Any]]:
    from app.config import settings

    candidates: list[dict[str, Any]] = []
    has_openai = importlib.util.find_spec("openai") is not None
    has_anthropic = importlib.util.find_spec("anthropic") is not None
    if settings.openai_api_key and has_openai:
        from app.ai_workflow.providers.openai_provider import OpenAIProvider
        model = _select_openai_model(settings)
        candidates.append({
            "provider": OpenAIProvider(api_key=settings.openai_api_key, model=model),
            "name": "openai",
            "label": "OpenAI",
            "model": model,
        })
    if settings.anthropic_api_key and has_anthropic:
        from app.ai_workflow.providers.claude_provider import ClaudeProvider
        model = _select_claude_model(settings)
        candidates.append({
            "provider": ClaudeProvider(api_key=settings.anthropic_api_key, model=model),
            "name": "claude",
            "label": "Claude",
            "model": model,
        })
    return candidates


async def _run_root_cause_provider(candidate: dict[str, Any], prompt: str) -> dict[str, Any]:
    name = str(candidate["name"])
    model = str(candidate["model"])
    try:
        result = await asyncio.wait_for(candidate["provider"].generate(prompt, RootCauseAnalysis), timeout=70)
        return {
            "provider": name,
            "label": candidate["label"],
            "model": model,
            "status": "ok",
            "confidence": round(result.confidence, 3),
            "root_cause": result.root_cause,
            "findings": [f.model_dump() for f in result.findings],
            "recommendations": [r.model_dump() for r in result.recommendations],
            "error": None,
        }
    except Exception as exc:  # pragma: no cover - provider/network/quota failures vary.
        message = str(exc)
        logger.warning("RCA provider %s/%s failed: %s", name, model, message)
        return {
            "provider": name,
            "label": candidate["label"],
            "model": model,
            "status": _provider_error_status(message),
            "confidence": 0.0,
            "root_cause": "",
            "findings": [],
            "recommendations": [],
            "error": message,
        }


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
    provider_results: list[dict[str, Any]]
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


async def classify_failure(state: RCAState) -> dict[str, Any]:
    job_type: str = state.get("job_type") or "root_cause_analysis"
    error_text: str = state.get("error_text") or ""

    provider = _get_ai_provider()
    if provider is not None:
        try:
            prompt = (
                f"Analyze the following failure error text and classify it into one of the failure classes:\n"
                f"- selector_failure (broken locator, element not found, css/xpath issue)\n"
                f"- timeout_failure (wait exceeded, timed out)\n"
                f"- auth_failure (unauthorized, 401, 403, login issue)\n"
                f"- server_error (internal server error, 500, 502, 503)\n"
                f"- assertion_failure (test assertion failed, expected/actual mismatch)\n"
                f"- network_failure (connection refused, DNS, network issue)\n"
                f"- flaky_test (non-deterministic failure)\n"
                f"- anomaly (performance duration anomaly)\n"
                f"- unknown_failure (none of the above)\n\n"
                f"Job Type: {job_type}\n"
                f"Error Text: {error_text}\n"
            )
            result = await provider.generate(prompt, FailureClassification)
            return {
                "failure_class": result.failure_class,
                "analysis_steps": _steps(state, f"classify_failure (LLM): classified as {result.failure_class} ({result.reason})"),
            }
        except Exception as exc:
            logger.warning("LLM classification failed, falling back to pattern matching: %s", exc)

    # Heuristic Pattern-match fallback
    error_text_lower = error_text.lower()
    if any(k in error_text_lower for k in ("selector", "locator", "element not found", "xpath", "css")):
        cls = "selector_failure"
    elif any(k in error_text_lower for k in ("timeout", "timed out", "wait exceeded")):
        cls = "timeout_failure"
    elif any(k in error_text_lower for k in ("401", "403", "authentication", "unauthori", "forbidden")):
        cls = "auth_failure"
    elif any(k in error_text_lower for k in ("500", "502", "503", "server error", "internal error")):
        cls = "server_error"
    elif any(k in error_text_lower for k in ("assertion", "expected", "mismatch", "not equal", "assert")):
        cls = "assertion_failure"
    elif any(k in error_text_lower for k in ("network", "connection refused", "econnrefused", "dns")):
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
        "analysis_steps": _steps(state, f"classify_failure (Heuristic): classified as {cls}"),
    }


async def retrieve_memory(state: RCAState) -> dict[str, Any]:
    error_text: str = state.get("error_text") or ""
    tenant_id: str | None = state.get("tenant_id")
    similar: list[dict[str, Any]] = []

    if importlib.util.find_spec("qdrant_client") is None:
        return {
            "similar_failures": similar,
            "analysis_steps": _steps(state, "retrieve_memory: skipped (Qdrant client unavailable)"),
        }

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


async def analyze_root_cause(state: RCAState) -> dict[str, Any]:
    failure_class: str = state.get("failure_class") or "unknown_failure"
    failed_nodes: list[dict[str, Any]] = state.get("failed_nodes") or []
    error_text: str = state.get("error_text") or ""
    similar: list[dict[str, Any]] = state.get("similar_failures") or []
    job_type: str = state.get("job_type") or "root_cause_analysis"
    evidence: dict[str, Any] = state.get("evidence") or {}

    prompt = (
        f"You are an expert systems reliability and QA automation engineer. Perform a root cause analysis for the following test execution failure:\n\n"
        f"Job Type: {job_type}\n"
        f"Failure Class: {failure_class}\n"
        f"Error Message: {error_text}\n"
        f"Failed Timeline Nodes: {json.dumps(failed_nodes, indent=2)}\n"
        f"Similar Past Failures: {json.dumps(similar, indent=2)}\n"
        f"Full Evidence Context: {json.dumps(evidence, indent=2)[:4000]}\n"
    )
    provider_results: list[dict[str, Any]] = []
    candidates = _ai_provider_candidates()
    if candidates:
        provider_results = await asyncio.gather(
            *(_run_root_cause_provider(candidate, prompt) for candidate in candidates)
        )
        successful = [item for item in provider_results if item.get("status") == "ok"]
        if successful:
            best = max(
                successful,
                key=lambda item: (
                    float(item.get("confidence") or 0.0),
                    len(item.get("findings") or []),
                    1 if item.get("provider") == "openai" else 0,
                ),
            )
            findings: list[dict[str, Any]] = []
            recommendations: list[dict[str, Any]] = []
            for item in successful:
                for finding in item.get("findings") or []:
                    copied = dict(finding)
                    copied.setdefault("provider", item.get("provider"))
                    findings.append(copied)
                for recommendation in item.get("recommendations") or []:
                    copied = dict(recommendation)
                    copied.setdefault("provider", item.get("provider"))
                    recommendations.append(copied)
            provider_status = ", ".join(
                f"{item.get('label')}: {item.get('status')}" for item in provider_results
            )
            return {
                "findings": findings,
                "recommendations": recommendations,
                "root_cause": str(best.get("root_cause") or ""),
                "confidence": round(float(best.get("confidence") or 0.5), 3),
                "provider_results": provider_results,
                "analysis_steps": _steps(
                    state,
                    f"analyze_root_cause (AI council): selected {best.get('label')} from {provider_status}",
                ),
            }
        logger.warning(
            "All RCA providers failed, falling back to heuristics: %s",
            "; ".join(f"{item.get('label')}: {item.get('error')}" for item in provider_results),
        )

    # Heuristic fallback code
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
        "provider_results": provider_results,
        "analysis_steps": _steps(state, f"analyze_root_cause (Heuristic): {len(findings)} finding(s)"),
    }


def generate_recommendations(state: RCAState) -> dict[str, Any]:
    failure_class: str = state.get("failure_class") or "unknown_failure"
    similar: list[dict[str, Any]] = state.get("similar_failures") or []
    job_type: str = state.get("job_type") or "root_cause_analysis"
    llm_recs: list[dict[str, Any]] = state.get("recommendations") or []

    # Combine LLM recommendations first and fallback/class recommendations second
    recs: list[dict[str, Any]] = list(llm_recs) + list(_class_recommendations(failure_class))

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


async def _run_rca_linear(initial: RCAState) -> dict[str, Any]:
    """Run the RCA nodes sequentially when LangGraph is not installed."""
    state: dict[str, Any] = dict(initial)
    nodes = (
        gather_evidence,
        classify_failure,
        retrieve_memory,
        analyze_root_cause,
        generate_recommendations,
        validate_results,
    )
    for node in nodes:
        delta = await node(state) if inspect.iscoroutinefunction(node) else node(state)
        state.update(delta)
    return state


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
        "provider_results": [],
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
    try:
        graph = get_rca_graph()
        result: dict[str, Any] = await graph.ainvoke(initial)
        return result
    except ImportError as exc:
        logger.warning("LangGraph unavailable, running RCA linear fallback: %s", exc)
        return await _run_rca_linear(initial)


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
    try:
        graph = get_rca_graph()
    except ImportError as exc:
        logger.warning("LangGraph unavailable, running RCA linear fallback: %s", exc)
        final_state = await _run_rca_linear(initial)
        if on_node_complete is not None:
            try:
                await on_node_complete("linear_fallback", final_state)
            except Exception:
                logger.exception("on_node_complete callback raised for linear fallback")
        return final_state

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
