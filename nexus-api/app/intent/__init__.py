"""Business intent abstraction layer for NEXUS QA."""

from app.intent.registry import (
    INTENT_REGISTRY,
    PLATFORM_KEYS,
    build_capability_matrix,
    compile_intent_plan,
    list_intents,
)

__all__ = [
    "INTENT_REGISTRY",
    "PLATFORM_KEYS",
    "build_capability_matrix",
    "compile_intent_plan",
    "list_intents",
]
