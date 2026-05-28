"""Enterprise Desktop Execution Agent Registration and Routing API.

Desktop agents (processes running on target machines) self-register here,
send heartbeats, and expose their capabilities. The routing endpoint selects
the best-matched agent for a given execution request.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import DesktopAgentModel
from app.database.session import get_db

router = APIRouter(prefix="/desktop-agents", tags=["desktop-agents"])

HEARTBEAT_TIMEOUT_SECONDS = 120  # agents not heard from in 2 min are considered offline


# ── Schemas ───────────────────────────────────────────────────────────────────

class AgentCapabilities(BaseModel):
    driver_types: list[str] = Field(default_factory=list)
    applications: list[str] = Field(default_factory=list)
    os: str = ""
    extension_packs: list[str] = Field(default_factory=list)
    max_parallel: int = 1
    active_sessions: int = 0
    session_isolation_mode: str = "shared_desktop"
    license_constraints: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class AgentRegisterRequest(BaseModel):
    hostname: str = Field(..., min_length=1)
    agent_version: str = ""
    os_version: str = ""
    capabilities: AgentCapabilities = Field(default_factory=AgentCapabilities)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    id: str
    hostname: str
    agent_version: str
    os_version: str
    status: str
    capabilities: dict[str, Any]
    registered_at: datetime
    last_heartbeat: datetime | None
    metadata: dict[str, Any]

    model_config = {"from_attributes": True}


class AgentRouteQuery(BaseModel):
    application: str = ""
    os_version: str = ""
    driver_type: str = ""
    extension_pack: str = ""
    session_isolation_mode: str = ""
    license_constraints: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class AgentRouteResponse(BaseModel):
    agent_id: str
    hostname: str
    match_score: float
    capabilities: dict[str, Any]
    reason: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _db_utcnow() -> datetime:
    """Return naive UTC for TIMESTAMP WITHOUT TIME ZONE columns."""
    return datetime.now(UTC).replace(tzinfo=None)


def _row_to_response(row: DesktopAgentModel) -> AgentResponse:
    return AgentResponse(
        id=row.id,
        hostname=row.hostname or "",
        agent_version=row.agent_version or "",
        os_version=row.os_version or "",
        status=row.status or "active",
        capabilities=dict(row.capabilities or {}),
        registered_at=row.registered_at,
        last_heartbeat=row.last_heartbeat,
        metadata=dict(row.agent_metadata or {}),
    )


def _is_alive(row: DesktopAgentModel) -> bool:
    if row.status in ("offline", "maintenance"):
        return False
    if row.last_heartbeat is None:
        # Just registered — treat as alive for a grace period
        age = _db_utcnow() - row.registered_at
        return age.total_seconds() < HEARTBEAT_TIMEOUT_SECONDS
    age = _db_utcnow() - row.last_heartbeat
    return age.total_seconds() < HEARTBEAT_TIMEOUT_SECONDS


def _score_agent(row: DesktopAgentModel, query: AgentRouteQuery) -> float:
    caps: dict[str, Any] = dict(row.capabilities or {})
    score = 0.0

    if query.application:
        apps: list[str] = [str(a).lower() for a in (caps.get("applications") or [])]
        if any(query.application.lower() in a or a in query.application.lower() for a in apps):
            score += 0.4

    if query.driver_type:
        drivers: list[str] = [str(d).lower() for d in (caps.get("driver_types") or [])]
        if query.driver_type.lower() in drivers:
            score += 0.3

    if query.extension_pack:
        packs: list[str] = [str(p).lower() for p in (caps.get("extension_packs") or [])]
        if query.extension_pack.lower() in packs:
            score += 0.2

    if query.session_isolation_mode:
        isolation = str(caps.get("session_isolation_mode") or "").lower()
        requested = query.session_isolation_mode.lower()
        if requested == isolation:
            score += 0.15
        elif requested in {"isolated_user", "dedicated_vm"} and isolation == "dedicated_vm":
            score += 0.1

    if query.os_version:
        agent_os = str(caps.get("os") or row.os_version or "").lower()
        if query.os_version.lower() in agent_os or agent_os in query.os_version.lower():
            score += 0.1

    if query.license_constraints:
        agent_licenses: set[str] = {str(item).lower() for item in (caps.get("license_constraints") or [])}
        matched_licenses = sum(1 for item in query.license_constraints if item.lower() in agent_licenses)
        if matched_licenses == len(query.license_constraints):
            score += 0.1

    if query.tags:
        agent_tags: set[str] = {str(t).lower() for t in (caps.get("tags") or [])}
        matched = sum(1 for t in query.tags if t.lower() in agent_tags)
        if matched:
            score += 0.05 * matched

    max_parallel = max(1, int(caps.get("max_parallel") or 1))
    active_sessions = max(0, int(caps.get("active_sessions") or 0))
    available_capacity = max_parallel - active_sessions
    if available_capacity > 0:
        score += min(available_capacity, 5) * 0.01

    # Prefer less busy agents (lower status rank: idle > active)
    if row.status == "idle":
        score += 0.02

    return round(score, 4)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def register_agent(
    body: AgentRegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    """Register or re-register a desktop execution agent."""
    # Upsert by hostname
    result = await db.execute(
        select(DesktopAgentModel).where(DesktopAgentModel.hostname == body.hostname).limit(1)
    )
    row = result.scalar_one_or_none()
    if row is not None:
        row.agent_version = body.agent_version
        row.os_version = body.os_version
        row.capabilities = body.capabilities.model_dump()
        row.status = "active"
        row.last_heartbeat = _db_utcnow()
        row.agent_metadata = body.metadata
    else:
        row = DesktopAgentModel(
            hostname=body.hostname,
            agent_version=body.agent_version,
            os_version=body.os_version,
            capabilities=body.capabilities.model_dump(),
            status="active",
            last_heartbeat=_db_utcnow(),
            agent_metadata=body.metadata,
        )
        db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row_to_response(row)


@router.post("/{agent_id}/heartbeat", response_model=AgentResponse)
async def agent_heartbeat(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    """Record a heartbeat from an active desktop agent."""
    result = await db.execute(
        select(DesktopAgentModel).where(DesktopAgentModel.id == agent_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    row.last_heartbeat = _db_utcnow()
    if row.status == "offline":
        row.status = "active"
    await db.commit()
    await db.refresh(row)
    return _row_to_response(row)


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
) -> list[AgentResponse]:
    """List all registered desktop agents."""
    stmt = select(DesktopAgentModel)
    if active_only:
        cutoff = _db_utcnow() - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS)
        stmt = stmt.where(DesktopAgentModel.status.not_in(["offline", "maintenance"]))
        stmt = stmt.where(
            (DesktopAgentModel.last_heartbeat >= cutoff)
            | (DesktopAgentModel.last_heartbeat.is_(None))
        )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_row_to_response(r) for r in rows]


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    result = await db.execute(
        select(DesktopAgentModel).where(DesktopAgentModel.id == agent_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _row_to_response(row)


@router.post("/route", response_model=AgentRouteResponse)
async def route_execution(
    body: AgentRouteQuery,
    db: AsyncSession = Depends(get_db),
) -> AgentRouteResponse:
    """Find the best-matched active desktop agent for a given execution requirement."""
    cutoff = _db_utcnow() - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS)
    stmt = (
        select(DesktopAgentModel)
        .where(DesktopAgentModel.status.not_in(["offline", "maintenance"]))
        .where(
            (DesktopAgentModel.last_heartbeat >= cutoff)
            | (DesktopAgentModel.last_heartbeat.is_(None))
        )
    )
    result = await db.execute(stmt)
    candidates = result.scalars().all()
    if not candidates:
        raise HTTPException(status_code=503, detail="No active desktop agents available")

    scored = sorted(candidates, key=lambda r: _score_agent(r, body), reverse=True)
    best = scored[0]
    score = _score_agent(best, body)

    caps: dict[str, Any] = dict(best.capabilities or {})
    reason_parts: list[str] = [f"Best score: {score}"]
    if body.application and any(
        body.application.lower() in str(a).lower()
        for a in (caps.get("applications") or [])
    ):
        reason_parts.append(f"Supports application '{body.application}'")
    if body.driver_type and body.driver_type.lower() in [str(d).lower() for d in (caps.get("driver_types") or [])]:
        reason_parts.append(f"Supports driver '{body.driver_type}'")
    if body.session_isolation_mode and body.session_isolation_mode == str(caps.get("session_isolation_mode") or ""):
        reason_parts.append(f"Supports session isolation '{body.session_isolation_mode}'")
    if best.status == "idle":
        reason_parts.append("Agent is idle (low load)")

    return AgentRouteResponse(
        agent_id=best.id,
        hostname=best.hostname or "",
        match_score=score,
        capabilities=caps,
        reason="; ".join(reason_parts),
    )


@router.post(
    "/{agent_id}/deregister",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def deregister_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Mark an agent as offline / deregistered."""
    result = await db.execute(
        select(DesktopAgentModel).where(DesktopAgentModel.id == agent_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    row.status = "offline"
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
