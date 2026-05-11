"""Mobile and desktop adapter runtime endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.platform_adapters import adapter_status_report, validate_adapter_environment

router = APIRouter(prefix="/adapters", tags=["adapters"])


class AdapterValidationRequest(BaseModel):
    platform: str
    required_capabilities: list[str] = Field(default_factory=list)


@router.get("/runtimes")
async def list_adapter_runtimes() -> dict[str, Any]:
    return adapter_status_report()


@router.post("/validate")
async def validate_adapter(payload: AdapterValidationRequest) -> dict[str, Any]:
    return validate_adapter_environment(payload.platform, payload.required_capabilities)
