"""Qdrant vector store client and collection management for AI intelligence.

Collections
-----------
failures        — Failure patterns (error text + node context)
executions      — Execution summaries for trend detection
locators        — CSS/XPath/ARIA locators for locator-healing
investigations  — Completed investigation results for future retrieval

All collections use cosine distance over 384-dim or OpenAI 1536-dim vectors,
configurable via Settings.embedding_dim.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

# Collection names
COLLECTION_FAILURES = "failures"
COLLECTION_EXECUTIONS = "executions"
COLLECTION_LOCATORS = "locators"
COLLECTION_INVESTIGATIONS = "investigations"

_COLLECTIONS = [
    COLLECTION_FAILURES,
    COLLECTION_EXECUTIONS,
    COLLECTION_LOCATORS,
    COLLECTION_INVESTIGATIONS,
]


@dataclass
class SearchResult:
    id: str
    score: float
    payload: dict[str, Any]


class QdrantVectorStore:
    """Thin wrapper around the Qdrant Python client.

    The client is created lazily so the service can start even when Qdrant is
    not running — operations will raise RuntimeError on first use.
    """

    def __init__(
        self,
        url: str = "http://localhost:6333",
        api_key: str | None = None,
        embedding_dim: int = 384,
    ) -> None:
        self._url = url
        self._api_key = api_key
        self._embedding_dim = embedding_dim
        self._client: Any = None

    # ── Client ───────────────────────────────────────────────────────────────

    def _client_instance(self) -> Any:
        if self._client is None:
            try:
                from qdrant_client import QdrantClient
                self._client = QdrantClient(
                    url=self._url,
                    api_key=self._api_key,
                    prefer_grpc=False,
                )
            except Exception as exc:
                raise RuntimeError(f"Qdrant client unavailable: {exc}") from exc
        return self._client

    # ── Collection management ─────────────────────────────────────────────

    async def ensure_collections(self) -> None:
        """Create all required collections if they do not already exist."""
        from qdrant_client.http import models as qm
        client = self._client_instance()
        existing = {c.name for c in client.get_collections().collections}
        for name in _COLLECTIONS:
            if name not in existing:
                client.create_collection(
                    collection_name=name,
                    vectors_config=qm.VectorParams(
                        size=self._embedding_dim,
                        distance=qm.Distance.COSINE,
                    ),
                )
                logger.info("Qdrant: created collection '%s' (dim=%d)", name, self._embedding_dim)
            else:
                logger.debug("Qdrant: collection '%s' already exists", name)

    # ── CRUD ─────────────────────────────────────────────────────────────────

    async def upsert(
        self,
        collection: str,
        point_id: str,
        vector: list[float],
        payload: dict[str, Any],
    ) -> None:
        from qdrant_client.http import models as qm
        client = self._client_instance()
        client.upsert(
            collection_name=collection,
            points=[qm.PointStruct(id=point_id, vector=vector, payload=payload)],
        )

    async def search(
        self,
        collection: str,
        query_vector: list[float],
        limit: int = 5,
        score_threshold: float = 0.5,
        filter_payload: dict[str, Any] | None = None,
    ) -> list[SearchResult]:
        from qdrant_client.http import models as qm
        client = self._client_instance()

        qdrant_filter: qm.Filter | None = None
        if filter_payload:
            conditions = [
                qm.FieldCondition(key=k, match=qm.MatchValue(value=v))
                for k, v in filter_payload.items()
            ]
            qdrant_filter = qm.Filter(must=conditions)

        hits = client.search(
            collection_name=collection,
            query_vector=query_vector,
            limit=limit,
            score_threshold=score_threshold,
            query_filter=qdrant_filter,
        )
        return [
            SearchResult(id=str(h.id), score=h.score, payload=h.payload or {})
            for h in hits
        ]

    async def delete(self, collection: str, point_id: str) -> None:
        from qdrant_client.http import models as qm
        client = self._client_instance()
        client.delete(
            collection_name=collection,
            points_selector=qm.PointIdsList(points=[point_id]),
        )


# ── Singleton ────────────────────────────────────────────────────────────────

_vector_store: QdrantVectorStore | None = None


def get_vector_store() -> QdrantVectorStore:
    global _vector_store
    if _vector_store is None:
        from app.config import settings
        _vector_store = QdrantVectorStore(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key or None,
            embedding_dim=settings.embedding_dim,
        )
    return _vector_store
