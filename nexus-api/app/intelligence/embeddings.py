"""Embedding generation from execution logs, artifacts, and error messages.

Supports:
- sentence-transformers (local, default) — model: all-MiniLM-L6-v2, dim=384
- OpenAI text-embedding-3-small (opt-in via settings.use_openai_embeddings)

Falls back to zero vectors if no embedding library is available so the rest of
the intelligence stack can function without ML deps in constrained environments.
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 384  # all-MiniLM-L6-v2 default dimension
OPENAI_EMBEDDING_DIM = 1536  # text-embedding-3-small


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


@dataclass
class EmbeddingResult:
    text: str
    vector: list[float]
    text_hash: str
    model: str
    dim: int


class EmbeddingService:
    """Generates text embeddings using sentence-transformers or OpenAI."""

    def __init__(
        self,
        model_name: str = "all-MiniLM-L6-v2",
        use_openai: bool = False,
    ) -> None:
        self._model_name = model_name
        self._use_openai = use_openai
        self._model: Any = None
        self._openai_client: Any = None
        self._dim: int = OPENAI_EMBEDDING_DIM if use_openai else EMBEDDING_DIM

    # ── Lazy initialisation ──────────────────────────────────────────────────

    def _ensure_model(self) -> None:
        if self._model is not None or self._openai_client is not None:
            return
        if self._use_openai:
            try:
                from openai import AsyncOpenAI
                self._openai_client = AsyncOpenAI()
                logger.info("EmbeddingService: using OpenAI text-embedding-3-small")
                return
            except Exception:
                logger.warning("OpenAI unavailable, falling back to sentence-transformers")
        try:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self._model_name)
            self._dim = EMBEDDING_DIM
            logger.info("EmbeddingService: loaded %s (dim=%d)", self._model_name, self._dim)
        except Exception:
            logger.warning(
                "sentence-transformers unavailable — using zero embeddings (dim=%d)", self._dim
            )

    # ── Public API ───────────────────────────────────────────────────────────

    def embed_sync(self, text: str) -> EmbeddingResult:
        self._ensure_model()
        text = text.strip()[:8192]
        vector = self._encode_sync(text)
        return EmbeddingResult(
            text=text,
            vector=vector,
            text_hash=_hash_text(text),
            model=self._model_name,
            dim=len(vector),
        )

    async def embed(self, text: str) -> EmbeddingResult:
        self._ensure_model()
        text = text.strip()[:8192]
        if self._use_openai and self._openai_client is not None:
            try:
                resp = await self._openai_client.embeddings.create(
                    model="text-embedding-3-small", input=text
                )
                vector: list[float] = resp.data[0].embedding
                return EmbeddingResult(
                    text=text,
                    vector=vector,
                    text_hash=_hash_text(text),
                    model="text-embedding-3-small",
                    dim=len(vector),
                )
            except Exception as exc:
                logger.warning("OpenAI embedding failed, falling back: %s", exc)
        vector = await self._encode_async(text)
        return EmbeddingResult(
            text=text,
            vector=vector,
            text_hash=_hash_text(text),
            model=self._model_name,
            dim=len(vector),
        )

    # ── Text builders (domain-specific) ─────────────────────────────────────

    def build_failure_text(self, node_data: dict[str, Any]) -> str:
        """Build embedding text from a failed execution node."""
        parts = [
            f"node_type:{node_data.get('node_type', 'unknown')}",
            f"status:{node_data.get('status', 'unknown')}",
        ]
        if node_data.get("error"):
            parts.append(f"error:{node_data['error'][:400]}")
        for a in (node_data.get("artifacts") or [])[:3]:
            parts.append(f"artifact:{a.get('kind', '')} {a.get('metadata', {})}")
        return " | ".join(parts)

    def build_execution_text(self, execution_data: dict[str, Any]) -> str:
        """Build embedding text summarising an entire execution."""
        parts = [
            f"workflow:{execution_data.get('workflow_id', '')}",
            f"status:{execution_data.get('status', '')}",
            f"platform:{execution_data.get('platform', '')}",
        ]
        failed = [n for n in execution_data.get("nodes", []) if n.get("status") == "failed"]
        for n in failed[:5]:
            parts.append(f"failed:{n.get('node_type', '')} err:{str(n.get('error', ''))[:100]}")
        return " | ".join(parts)

    def build_locator_text(self, locator_data: dict[str, Any]) -> str:
        """Build embedding text for a locator / CSS/XPath selector."""
        return (
            f"selector:{locator_data.get('selector', '')} "
            f"strategy:{locator_data.get('strategy', '')} "
            f"page:{locator_data.get('page_url', '')} "
            f"description:{locator_data.get('description', '')}"
        )

    # ── Internal ─────────────────────────────────────────────────────────────

    def _encode_sync(self, text: str) -> list[float]:
        if self._model is not None:
            try:
                return self._model.encode(text, show_progress_bar=False).tolist()
            except Exception:
                pass
        return [0.0] * self._dim

    async def _encode_async(self, text: str) -> list[float]:
        if self._model is not None:
            try:
                import asyncio
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(
                    None, lambda: self._model.encode(text, show_progress_bar=False).tolist()
                )
            except Exception:
                pass
        return [0.0] * self._dim


# ── Singleton ────────────────────────────────────────────────────────────────

_embedding_service: EmbeddingService | None = None


def get_embedding_service() -> EmbeddingService:
    global _embedding_service
    if _embedding_service is None:
        from app.config import settings
        _embedding_service = EmbeddingService(
            model_name=settings.embedding_model,
            use_openai=settings.use_openai_embeddings,
        )
    return _embedding_service
