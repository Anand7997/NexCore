"""Explainable execution intelligence heuristics."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    ArtifactModel,
    ExecutionEventModel,
    ExecutionModel,
    ExecutionNodeModel,
    ExecutionTimelineModel,
)


@dataclass
class IntelligenceInsight:
    id: str
    type: str
    severity: str
    title: str
    description: str
    confidence: float
    evidence: list[str] = field(default_factory=list)
    affected_nodes: list[str] = field(default_factory=list)
    recommendation: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "confidence": self.confidence,
            "evidence": self.evidence,
            "affected_nodes": self.affected_nodes,
            "recommendation": self.recommendation,
        }


class ExecutionIntelligenceAnalyzer:
    """Produces deterministic investigation insights from persisted evidence."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def analyze(self, execution_id: str) -> dict[str, Any] | None:
        execution = await self.db.get(ExecutionModel, execution_id)
        if not execution:
            return None

        nodes = await self._nodes(execution_id)
        timeline = await self._timeline(execution_id)
        events = await self._events(execution_id)
        artifacts = await self._artifacts(execution_id)

        insights: list[IntelligenceInsight] = []
        insights.extend(self._root_cause_insights(nodes, artifacts))
        insights.extend(self._retry_insights(nodes, timeline))
        insights.extend(self._duration_insights(nodes))
        insights.extend(self._artifact_correlation_insights(nodes, artifacts))
        insights.extend(self._event_error_insights(events))

        return {
            "execution_id": execution.id,
            "workflow_id": execution.workflow_id,
            "status": execution.status,
            "generated_at": datetime.utcnow().isoformat(),
            "summary": self._summary(execution, nodes, artifacts, insights),
            "insights": [insight.to_dict() for insight in insights],
            "evidence_counts": {
                "nodes": len(nodes),
                "timeline_entries": len(timeline),
                "events": len(events),
                "artifacts": len(artifacts),
            },
        }

    async def _nodes(self, execution_id: str) -> list[ExecutionNodeModel]:
        result = await self.db.execute(
            select(ExecutionNodeModel)
            .where(ExecutionNodeModel.execution_id == execution_id)
            .order_by(ExecutionNodeModel.started_at.asc())
        )
        return list(result.scalars().all())

    async def _timeline(self, execution_id: str) -> list[ExecutionTimelineModel]:
        result = await self.db.execute(
            select(ExecutionTimelineModel)
            .where(ExecutionTimelineModel.execution_id == execution_id)
            .order_by(ExecutionTimelineModel.timestamp.asc())
        )
        return list(result.scalars().all())

    async def _events(self, execution_id: str) -> list[ExecutionEventModel]:
        result = await self.db.execute(
            select(ExecutionEventModel)
            .where(ExecutionEventModel.execution_id == execution_id)
            .order_by(ExecutionEventModel.timestamp.asc())
        )
        return list(result.scalars().all())

    async def _artifacts(self, execution_id: str) -> list[ArtifactModel]:
        result = await self.db.execute(
            select(ArtifactModel)
            .where(ArtifactModel.execution_id == execution_id)
            .order_by(ArtifactModel.created_at.asc())
        )
        return list(result.scalars().all())

    def _root_cause_insights(
        self,
        nodes: list[ExecutionNodeModel],
        artifacts: list[ArtifactModel],
    ) -> list[IntelligenceInsight]:
        insights: list[IntelligenceInsight] = []
        artifacts_by_node = self._artifacts_by_node(artifacts)
        failed_nodes = [node for node in nodes if node.status == "failed"]

        for node in failed_nodes:
            error = node.error or "Unknown node failure"
            lower = error.lower()
            evidence = [
                f"Node {node.node_key} ended with status failed.",
                f"Error: {error}",
            ]
            node_artifacts = artifacts_by_node.get(node.node_key, [])
            if node_artifacts:
                evidence.append(
                    "Artifacts captured: "
                    + ", ".join(sorted({artifact.kind for artifact in node_artifacts}))
                )

            if "selector" in lower or "element" in lower:
                title = "Selector or element lookup failure"
                description = (
                    "The failed node error indicates the browser could not find or interact "
                    "with a required element."
                )
                recommendation = "Inspect the latest screenshot and DOM snapshot, then update the selector or wait condition."
                confidence = 0.88
            elif "timeout" in lower or "timed out" in lower:
                title = "Timeout during node execution"
                description = "The failed node exceeded its allowed wait or execution time."
                recommendation = "Compare node timeout, network timing, and dependency readiness before increasing limits."
                confidence = 0.82
            elif "status" in lower or "http" in lower:
                title = "API response contract failure"
                description = "The failed node appears to have received an unexpected HTTP response."
                recommendation = "Open the request and response artifacts and verify status, headers, and body contract."
                confidence = 0.8
            else:
                title = "Node failure requires evidence review"
                description = "The execution has a failed node with persisted error context."
                recommendation = "Start with the node timeline, terminal logs, and node artifacts."
                confidence = 0.64

            insights.append(IntelligenceInsight(
                id=f"root-cause-{node.node_key}",
                type="root_cause",
                severity="high",
                title=title,
                description=description,
                confidence=confidence,
                evidence=evidence,
                affected_nodes=[node.node_key],
                recommendation=recommendation,
            ))

        return insights

    def _retry_insights(
        self,
        nodes: list[ExecutionNodeModel],
        timeline: list[ExecutionTimelineModel],
    ) -> list[IntelligenceInsight]:
        retrying_nodes = [node for node in nodes if (node.attempt_count or 0) > 1]
        if not retrying_nodes:
            return []

        retry_phases = [entry for entry in timeline if entry.phase == "retrying"]
        return [
            IntelligenceInsight(
                id="retry-pattern",
                type="pattern",
                severity="medium",
                title="Retry activity detected",
                description="One or more nodes required multiple attempts during execution.",
                confidence=0.78,
                evidence=[
                    f"{len(retrying_nodes)} nodes have attempt_count > 1.",
                    f"{len(retry_phases)} retry timeline entries were recorded.",
                ],
                affected_nodes=[node.node_key for node in retrying_nodes],
                recommendation="Review flaky dependencies before raising retry limits.",
            )
        ]

    def _duration_insights(self, nodes: list[ExecutionNodeModel]) -> list[IntelligenceInsight]:
        completed = [node for node in nodes if node.duration_ms is not None]
        if len(completed) < 3:
            return []

        durations = sorted(node.duration_ms or 0 for node in completed)
        median = durations[len(durations) // 2]
        slow = [
            node for node in completed
            if (node.duration_ms or 0) > max(3000, median * 2.5)
        ]
        if not slow:
            return []

        return [
            IntelligenceInsight(
                id="duration-anomaly",
                type="anomaly",
                severity="medium",
                title="Slow node anomaly",
                description="Some nodes took significantly longer than the execution median.",
                confidence=0.72,
                evidence=[
                    f"Median completed-node duration: {median} ms.",
                    "Slow nodes: " + ", ".join(f"{n.node_key}={n.duration_ms}ms" for n in slow),
                ],
                affected_nodes=[node.node_key for node in slow],
                recommendation="Inspect network, wait conditions, and downstream service timing for slow nodes.",
            )
        ]

    def _artifact_correlation_insights(
        self,
        nodes: list[ExecutionNodeModel],
        artifacts: list[ArtifactModel],
    ) -> list[IntelligenceInsight]:
        failed = {node.node_key for node in nodes if node.status == "failed"}
        if not failed:
            return []

        by_node = self._artifacts_by_node(artifacts)
        missing = sorted(node_key for node_key in failed if not by_node.get(node_key))
        if not missing:
            return []

        return [
            IntelligenceInsight(
                id="missing-failure-evidence",
                type="suggestion",
                severity="medium",
                title="Failed nodes without captured artifacts",
                description="Some failed nodes do not have linked evidence artifacts.",
                confidence=0.69,
                evidence=[f"Missing artifact evidence for: {', '.join(missing)}"],
                affected_nodes=missing,
                recommendation="Ensure plugin failure handlers capture screenshot, DOM, request, response, or logs.",
            )
        ]

    def _event_error_insights(self, events: list[ExecutionEventModel]) -> list[IntelligenceInsight]:
        error_events = [event for event in events if event.severity == "error"]
        if not error_events:
            return []

        affected = sorted({event.node_key for event in error_events if event.node_key})
        return [
            IntelligenceInsight(
                id="error-event-cluster",
                type="pattern",
                severity="medium",
                title="Error event cluster",
                description="The execution emitted error-severity events that should be reviewed with the timeline.",
                confidence=0.7,
                evidence=[
                    f"{len(error_events)} error events recorded.",
                    "Event types: " + ", ".join(sorted({event.event_type for event in error_events})),
                ],
                affected_nodes=affected,
                recommendation="Use the event stream to locate the first error before cascading failures.",
            )
        ]

    def _summary(
        self,
        execution: ExecutionModel,
        nodes: list[ExecutionNodeModel],
        artifacts: list[ArtifactModel],
        insights: list[IntelligenceInsight],
    ) -> dict[str, Any]:
        failed = [node for node in nodes if node.status == "failed"]
        completed = [node for node in nodes if node.status == "completed"]
        return {
            "status": execution.status,
            "node_count": len(nodes),
            "completed_nodes": len(completed),
            "failed_nodes": len(failed),
            "artifact_count": len(artifacts),
            "insight_count": len(insights),
            "highest_severity": self._highest_severity(insights),
        }

    def _highest_severity(self, insights: list[IntelligenceInsight]) -> str:
        order = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
        if not insights:
            return "info"
        return max(insights, key=lambda insight: order.get(insight.severity, 0)).severity

    def _artifacts_by_node(
        self,
        artifacts: list[ArtifactModel],
    ) -> dict[str, list[ArtifactModel]]:
        by_node: dict[str, list[ArtifactModel]] = {}
        for artifact in artifacts:
            if artifact.node_key:
                by_node.setdefault(artifact.node_key, []).append(artifact)
        return by_node

