"""
Artifact capture pipeline — execution evidence collection.

Every plugin can record artifacts (screenshots, traces, request/response
payloads, DOM snapshots, videos, logs) and link them to:
- the execution
- a specific node within that execution
- the timeline phase that produced them

Artifacts are written to disk (settings.artifact_dir/{execution_id}/) and
indexed in the database (ArtifactModel). The frontend fetches them via
GET /api/artifacts/{id}/content.

This module is intentionally storage-agnostic: future swap-outs
(S3, GCS, etc.) only touch the ArtifactStore class.
"""
from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


# ── Artifact taxonomy ───────────────────────────────────────────────────────

class ArtifactKind(str, Enum):
    SCREENSHOT       = "screenshot"
    VIDEO            = "video"
    TRACE            = "trace"
    DOM_SNAPSHOT     = "dom_snapshot"
    NETWORK_LOG      = "network_log"
    HAR              = "har"
    HTTP_REQUEST     = "http_request"
    HTTP_RESPONSE    = "http_response"
    LOG              = "log"
    JSON             = "json"
    TEXT             = "text"
    BINARY           = "binary"


@dataclass
class Artifact:
    """In-memory artifact record. Mirrored into ArtifactModel for persistence."""
    id: str
    execution_id: str
    node_key: str | None
    kind: ArtifactKind
    name: str
    relative_path: str           # under artifact_dir
    content_type: str
    size_bytes: int
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "execution_id": self.execution_id,
            "node_key": self.node_key,
            "kind": self.kind.value,
            "name": self.name,
            "relative_path": self.relative_path,
            "content_type": self.content_type,
            "size_bytes": self.size_bytes,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
        }


# ── Filesystem-backed store ─────────────────────────────────────────────────

class ArtifactStore:
    """
    Filesystem store under `root/{execution_id}/{kind}/{filename}`.

    Thread-safe (asyncio-level). The store does NOT touch the DB — that is the
    recorder's job, so this layer can be reused for ephemeral storage too.
    """

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()

    def _exec_dir(self, execution_id: str) -> Path:
        path = self.root / execution_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    async def write(
        self,
        execution_id: str,
        kind: ArtifactKind,
        filename: str,
        data: bytes,
    ) -> tuple[Path, str]:
        """Write bytes to disk; returns (full_path, relative_path)."""
        async with self._lock:
            kind_dir = self._exec_dir(execution_id) / kind.value
            kind_dir.mkdir(parents=True, exist_ok=True)
            full = kind_dir / filename
            await asyncio.to_thread(full.write_bytes, data)
            relative = full.relative_to(self.root).as_posix()
            return full, relative

    async def read(self, relative_path: str) -> bytes:
        full = (self.root / relative_path).resolve()
        # Defence-in-depth — never escape the artifact root.
        if not str(full).startswith(str(self.root)):
            raise PermissionError("Artifact path outside store root")
        return await asyncio.to_thread(full.read_bytes)

    def absolute(self, relative_path: str) -> Path:
        full = (self.root / relative_path).resolve()
        if not str(full).startswith(str(self.root)):
            raise PermissionError("Artifact path outside store root")
        return full


# Module-level singleton — initialized in main.py lifespan.
_store: ArtifactStore | None = None


def init_artifact_store(root: str | Path) -> ArtifactStore:
    global _store
    _store = ArtifactStore(root)
    return _store


def get_artifact_store() -> ArtifactStore:
    if _store is None:
        raise RuntimeError("ArtifactStore not initialized")
    return _store


# ── Per-execution recorder ──────────────────────────────────────────────────

class ArtifactRecorder:
    """
    Per-node artifact capture facade exposed to plugins.

    The engine creates one recorder per node, scoped to that execution_id +
    node_key, then delegates to the singleton ArtifactStore. The recorder also
    persists Artifact rows via a callback so the API engine and the DB stay
    decoupled (this module never imports SQLAlchemy).
    """

    def __init__(
        self,
        execution_id: str,
        node_key: str | None,
        store: ArtifactStore,
        on_record: "OnRecordCallback | None" = None,
    ) -> None:
        self.execution_id = execution_id
        self.node_key = node_key
        self._store = store
        self._on_record = on_record
        self._recorded: list[Artifact] = []

    @property
    def recorded(self) -> list[Artifact]:
        return list(self._recorded)

    async def record_bytes(
        self,
        kind: ArtifactKind,
        filename: str,
        data: bytes,
        *,
        content_type: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Artifact:
        artifact_id = str(uuid.uuid4())
        # Disambiguate filename so concurrent attempts don't collide.
        safe_name = f"{artifact_id[:8]}-{filename}"
        full, relative = await self._store.write(
            self.execution_id, kind, safe_name, data
        )

        ct = content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        artifact = Artifact(
            id=artifact_id,
            execution_id=self.execution_id,
            node_key=self.node_key,
            kind=kind,
            name=filename,
            relative_path=relative,
            content_type=ct,
            size_bytes=len(data),
            metadata=metadata or {},
        )
        self._recorded.append(artifact)
        if self._on_record is not None:
            await self._on_record(artifact)
        return artifact

    async def record_text(
        self,
        kind: ArtifactKind,
        filename: str,
        text: str,
        *,
        content_type: str = "text/plain; charset=utf-8",
        metadata: dict[str, Any] | None = None,
    ) -> Artifact:
        return await self.record_bytes(
            kind, filename, text.encode("utf-8"),
            content_type=content_type,
            metadata=metadata,
        )

    async def record_json(
        self,
        kind: ArtifactKind,
        filename: str,
        data: Any,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> Artifact:
        body = json.dumps(data, indent=2, default=str).encode("utf-8")
        return await self.record_bytes(
            kind, filename, body,
            content_type="application/json",
            metadata=metadata,
        )

    async def record_file(
        self,
        kind: ArtifactKind,
        path: str | os.PathLike[str],
        *,
        rename_to: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Artifact:
        """Move/copy a file already on disk into the artifact store."""
        src = Path(path)
        data = await asyncio.to_thread(src.read_bytes)
        name = rename_to or src.name
        return await self.record_bytes(
            kind, name, data, metadata=metadata,
        )


# Type for the persistence callback — engine plugs in a SQLAlchemy writer.
from typing import Awaitable, Callable, TypeAlias  # noqa: E402

OnRecordCallback: TypeAlias = Callable[[Artifact], Awaitable[None]]
