"""Build a self-contained evidence bundle from a completed or failed execution.

The bundle is the sole input to the LangGraph RCA workflow.  Snapshotting it
at job-creation time means results are reproducible even after the execution
record is later modified or cleaned up.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    ArtifactModel,
    ExecutionModel,
    ExecutionNodeModel,
    ExecutionTimelineModel,
    WorkflowModel,
)


async def build_evidence_bundle(
    execution_id: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """Return a dict suitable for passing as ``evidence`` to LangGraph RCA.

    Raises ValueError if the execution does not exist.
    """
    # ── Execution record ─────────────────────────────────────────────────────
    result = await db.execute(
        select(ExecutionModel).where(ExecutionModel.id == execution_id)
    )
    execution = result.scalar_one_or_none()
    if execution is None:
        raise ValueError(f"Execution {execution_id!r} not found")

    # ── Workflow name ────────────────────────────────────────────────────────
    workflow_name = "unknown"
    if execution.workflow_id:
        r = await db.execute(
            select(WorkflowModel.name).where(WorkflowModel.id == execution.workflow_id)
        )
        row = r.first()
        if row:
            workflow_name = row[0]

    # ── Nodes ─────────────────────────────────────────────────────────────────
    r = await db.execute(
        select(ExecutionNodeModel).where(
            ExecutionNodeModel.execution_id == execution_id
        )
    )
    nodes = r.scalars().all()

    # ── Timeline ──────────────────────────────────────────────────────────────
    r = await db.execute(
        select(ExecutionTimelineModel)
        .where(ExecutionTimelineModel.execution_id == execution_id)
        .order_by(ExecutionTimelineModel.timestamp)
    )
    timeline = r.scalars().all()

    # ── Artifacts ─────────────────────────────────────────────────────────────
    r = await db.execute(
        select(ArtifactModel).where(ArtifactModel.execution_id == execution_id)
    )
    artifacts = r.scalars().all()

    # ── Build bundle ──────────────────────────────────────────────────────────
    duration_ms: int | None = None
    if execution.started_at and execution.completed_at:
        duration_ms = int(
            (execution.completed_at - execution.started_at).total_seconds() * 1000
        )

    failed_nodes = [
        _node_dict(n) for n in nodes if n.status in ("failed", "skipped")
    ]

    # Enrich timeline entries with their status for the classifier
    timeline_entries = []
    for t in timeline:
        entry: dict[str, Any] = {
            "nodeId": t.node_key,
            "phase": t.phase,
            "metadata": t.metadata_ or {},
            "timestamp": t.timestamp.isoformat() if t.timestamp else None,
        }
        # Propagate duration / error from metadata so the classifier can use them
        meta = t.metadata_ or {}
        if "duration_ms" in meta:
            entry["duration_ms"] = meta["duration_ms"]
        if "error" in meta:
            entry["error"] = meta["error"]
            entry["status"] = "failed"
        elif t.phase in ("failed",):
            entry["status"] = "failed"
        elif t.phase in ("completed",):
            entry["status"] = "completed"
        timeline_entries.append(entry)

    return {
        "executionId": execution_id,
        "workflowId": execution.workflow_id,
        "workflowName": workflow_name,
        "status": execution.status,
        "platform": execution.platform,
        "environment": execution.environment,
        "startedAt": execution.started_at.isoformat() if execution.started_at else None,
        "completedAt": execution.completed_at.isoformat() if execution.completed_at else None,
        "duration_ms": duration_ms,
        "errorSummary": execution.error or "",
        "nodes": [_node_dict(n) for n in nodes],
        "failedNodes": failed_nodes,
        "timeline": timeline_entries,
        "artifacts": [
            {
                "id": a.id,
                "kind": a.kind,
                "name": a.name,
                "contentType": a.content_type,
                "sizeBytes": a.size_bytes,
                "nodeKey": a.node_key,
            }
            for a in artifacts
        ],
        # Convenience counts for LangGraph classify node
        "totalNodes": len(nodes),
        "failedCount": len(failed_nodes),
        "artifactCount": len(artifacts),
    }


def _node_dict(n: ExecutionNodeModel) -> dict[str, Any]:
    return {
        "nodeId": n.node_key,
        "nodeLabel": n.node_label,
        "nodeType": n.node_type,
        "status": n.status,
        "error": n.error,
        "attempts": n.attempt_count,
        "duration_ms": n.duration_ms,
        "output": n.output or {},
    }
