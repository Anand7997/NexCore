"""Contracts consumed by the TypeScript/NestJS control plane."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

WorkerJobType = Literal[
    "root_cause_analysis",
    "flaky_detection",
    "locator_healing",
    "anomaly_analysis",
    "execution_summary",
    "ocr_document_analysis",
    "computer_vision_assertion",
    "pytest_validation",
]


@dataclass(frozen=True)
class WorkerJob:
    id: str
    tenant_id: str
    type: WorkerJobType
    evidence: dict[str, Any]
    policy: dict[str, Any] = field(default_factory=lambda: {
        "allow_workflow_mutation": False,
        "require_human_approval": True,
    })


@dataclass(frozen=True)
class WorkerResult:
    job_id: str
    status: Literal["completed", "failed"]
    confidence: float
    summary: str
    findings: list[dict[str, Any]] = field(default_factory=list)
    recommendations: list[dict[str, Any]] = field(default_factory=list)
    artifacts: list[dict[str, Any]] = field(default_factory=list)
