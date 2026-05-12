"""Compatibility shim for legacy Python intent endpoints."""
from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings

router = APIRouter(prefix="/intents", tags=["intents"])


class IntentStepInput(BaseModel):
    intent: str
    label: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)


class IntentValidationRequest(BaseModel):
    platform: str
    steps: list[IntentStepInput]
    clientSchemaVersion: str | None = None


async def _forward(
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base_url = settings.control_plane_url.rstrip("/")
    url = f"{base_url}{path}"

    try:
        async with httpx.AsyncClient(timeout=settings.api_plugin_default_timeout) as client:
            response = await client.request(method, url, json=payload)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"nexus_backend_unavailable: {exc.__class__.__name__}",
        ) from exc

    if response.status_code >= 400:
        try:
            detail: Any = response.json()
        except ValueError:
            detail = response.text or response.reason_phrase
        raise HTTPException(status_code=response.status_code, detail=detail)

    return response.json()


@router.get("/")
async def list_registered_intents() -> dict[str, Any]:
    return await _forward("GET", "/intent/catalog")


@router.get("/schema")
async def get_schema_manifest() -> dict[str, Any]:
    return await _forward("GET", "/intent/schema")


@router.get("/capability-matrix")
async def get_capability_matrix() -> dict[str, Any]:
    return await _forward("GET", "/intent/capability-matrix")


@router.post("/compile")
async def compile_intent_plan(payload: IntentValidationRequest) -> dict[str, Any]:
    return await _forward("POST", "/intent/compile", payload.model_dump())


@router.post("/validate")
async def validate_intent_plan(payload: IntentValidationRequest) -> dict[str, Any]:
    return await _forward("POST", "/intent/compile", payload.model_dump())
