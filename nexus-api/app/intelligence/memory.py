"""Historical failure memory — store and retrieve failure patterns via Qdrant.

FailureMemoryStore persists the output of each completed AI investigation as a
vector point so future analyses can retrieve similar past failures, reuse
recommendations, and build up a tenant-scoped knowledge base over time.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.intelligence.embeddings import get_embedding_service
from app.intelligence.vector_store import (
    COLLECTION_EXECUTIONS,
    COLLECTION_FAILURES,
    COLLECTION_INVESTIGATIONS,
    COLLECTION_LOCATORS,
    SearchResult,
    get_vector_store,
)

logger = logging.getLogger(__name__)


# ── Domain models ─────────────────────────────────────────────────────────────

@dataclass
class FailureMemoryRecord:
    execution_id: str
    tenant_id: str
    workflow_id: str
    node_type: str
    error_summary: str
    root_cause_type: str
    confidence: float
    recommendations: list[dict[str, Any]] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class SimilarFailure:
    failure_id: str
    score: float
    execution_id: str
    workflow_id: str
    error_summary: str
    root_cause_type: str
    confidence: float
    recommendations: list[dict[str, Any]]


# ── Store ─────────────────────────────────────────────────────────────────────

class FailureMemoryStore:
    """Stores and retrieves execution failure patterns using vector similarity."""

    # ── Failures ─────────────────────────────────────────────────────────────

    async def store_failure(self, record: FailureMemoryRecord) -> str:
        store = get_vector_store()
        svc = get_embedding_service()
        text = f"{record.node_type} {record.error_summary} {record.root_cause_type}"
        emb = await svc.embed(text)
        point_id = str(
            uuid.uuid5(uuid.NAMESPACE_DNS, f"{record.execution_id}:{record.node_type}")
        )
        payload: dict[str, Any] = {
            "execution_id": record.execution_id,
            "tenant_id": record.tenant_id,
            "workflow_id": record.workflow_id,
            "node_type": record.node_type,
            "error_summary": record.error_summary,
            "root_cause_type": record.root_cause_type,
            "confidence": record.confidence,
            "recommendations": record.recommendations,
            "created_at": record.created_at,
        }
        await store.upsert(COLLECTION_FAILURES, point_id, emb.vector, payload)
        logger.debug("Stored failure memory: %s (point=%s)", record.execution_id, point_id)
        return point_id

    async def find_similar_failures(
        self,
        error_text: str,
        tenant_id: str | None = None,
        limit: int = 5,
        score_threshold: float = 0.6,
    ) -> list[SimilarFailure]:
        store = get_vector_store()
        svc = get_embedding_service()
        emb = await svc.embed(error_text)
        filter_payload = {"tenant_id": tenant_id} if tenant_id else None
        hits = await store.search(
            COLLECTION_FAILURES,
            emb.vector,
            limit=limit,
            score_threshold=score_threshold,
            filter_payload=filter_payload,
        )
        return [
            SimilarFailure(
                failure_id=h.id,
                score=h.score,
                execution_id=h.payload.get("execution_id", ""),
                workflow_id=h.payload.get("workflow_id", ""),
                error_summary=h.payload.get("error_summary", ""),
                root_cause_type=h.payload.get("root_cause_type", ""),
                confidence=h.payload.get("confidence", 0.0),
                recommendations=h.payload.get("recommendations", []),
            )
            for h in hits
        ]

    # ── Locators ─────────────────────────────────────────────────────────────

    async def store_locator(self, locator_data: dict[str, Any]) -> str:
        store = get_vector_store()
        svc = get_embedding_service()
        text = svc.build_locator_text(locator_data)
        emb = await svc.embed(text)
        raw_key = locator_data.get("selector") or text
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, raw_key[:200]))
        await store.upsert(COLLECTION_LOCATORS, point_id, emb.vector, locator_data)
        return point_id

    async def find_similar_locators(
        self,
        description: str,
        limit: int = 5,
        score_threshold: float = 0.5,
    ) -> list[SearchResult]:
        store = get_vector_store()
        svc = get_embedding_service()
        emb = await svc.embed(description)
        return await store.search(
            COLLECTION_LOCATORS, emb.vector, limit=limit, score_threshold=score_threshold
        )

    # ── Executions ───────────────────────────────────────────────────────────

    async def store_execution_summary(self, execution_data: dict[str, Any]) -> str:
        store = get_vector_store()
        svc = get_embedding_service()
        text = svc.build_execution_text(execution_data)
        emb = await svc.embed(text)
        execution_id = execution_data.get("execution_id", "")
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, execution_id or text[:200]))
        await store.upsert(COLLECTION_EXECUTIONS, point_id, emb.vector, execution_data)
        return point_id

    # ── Investigations ────────────────────────────────────────────────────────

    async def store_investigation(self, investigation: dict[str, Any]) -> str:
        store = get_vector_store()
        svc = get_embedding_service()
        text = " ".join(filter(None, [
            investigation.get("job_type", ""),
            investigation.get("summary", ""),
            investigation.get("root_cause", ""),
        ]))
        emb = await svc.embed(text)
        key = investigation.get("job_id") or text[:200]
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, key))
        await store.upsert(COLLECTION_INVESTIGATIONS, point_id, emb.vector, investigation)
        return point_id

    async def find_similar_investigations(
        self,
        summary: str,
        limit: int = 3,
        score_threshold: float = 0.5,
    ) -> list[SearchResult]:
        store = get_vector_store()
        svc = get_embedding_service()
        emb = await svc.embed(summary)
        return await store.search(
            COLLECTION_INVESTIGATIONS, emb.vector, limit=limit, score_threshold=score_threshold
        )


# ── Singleton ────────────────────────────────────────────────────────────────

_memory_store: FailureMemoryStore | None = None


def get_memory_store() -> FailureMemoryStore:
    global _memory_store
    if _memory_store is None:
        _memory_store = FailureMemoryStore()
    return _memory_store
