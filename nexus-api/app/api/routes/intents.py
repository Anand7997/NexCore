"""Business intent registry and platform capability endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.intent import build_capability_matrix, compile_intent_plan, list_intents

router = APIRouter(prefix="/intents", tags=["intents"])


class IntentStepInput(BaseModel):
    intent: str
    label: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)


class IntentValidationRequest(BaseModel):
    platform: str
    steps: list[IntentStepInput]


@router.get("/")
async def list_registered_intents() -> dict[str, Any]:
    return {"intents": list_intents()}


@router.get("/capability-matrix")
async def get_capability_matrix() -> dict[str, Any]:
    return build_capability_matrix()


@router.post("/validate")
async def validate_intent_plan(payload: IntentValidationRequest) -> dict[str, Any]:
    steps = [step.model_dump() for step in payload.steps]
    return compile_intent_plan(payload.platform, steps)
