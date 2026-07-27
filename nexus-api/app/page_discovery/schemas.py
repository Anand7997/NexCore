"""Pydantic schemas for the Element Discovery Agent request/response."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# ── Request ──────────────────────────────────────────────────────────────────

class DiscoveryRequest(BaseModel):
    """Trigger the Element Discovery Agent for a given URL."""

    url: str = Field(..., description="Full URL to navigate to and inspect")
    page_name: str = Field(..., description="Human-readable name for the page in the repository")
    platform: str = Field("web", description="Platform identifier (web, mobile, etc.)")
    save_mode: str = Field("auto", description="'auto' to save automatically, 'preview' to return without saving")
    min_confidence: float = Field(0.75, ge=0.0, le=1.0, description="Minimum confidence threshold for auto-save")
    include_hidden: bool = Field(False, description="Whether to include hidden/non-visible elements")
    page_id: Optional[str] = Field(None, description="Existing page ID to update; if omitted, creates a new page")
    step_intents: list[dict[str, Any]] = Field(default_factory=list, description="Generated test-step intents used to limit discovery")

    @field_validator("url")
    @classmethod
    def validate_url_shape(cls, value: str) -> str:
        lowered = value.lower()
        if not (lowered.startswith("http://") or lowered.startswith("https://")):
            raise ValueError("url must start with http:// or https://")
        return value


# ── Response ─────────────────────────────────────────────────────────────────

class LocatorCandidate(BaseModel):
    """A single locator candidate with its verification result."""

    strategy: str
    locator: str
    verified: bool
    element_count: int
    score: float
    reason: str = ""


class DiscoveredElement(BaseModel):
    """One discovered UI element with its best locator and alternatives."""

    name: str = Field(..., description="Human-readable name derived from attributes")
    element_type: str = Field("element", description="Semantic type: button, input, link, etc.")
    description: str = ""
    best_locator: str = ""
    locator_strategy: str = "xpath"
    xpath: str = ""
    css_selector: str = ""
    id_attr: str = ""
    name_attr: str = ""
    input_type: str = ""
    placeholder: str = ""
    label: str = ""
    test_data_hints: dict[str, Any] = Field(default_factory=dict)
    confidence_score: float = 0.0
    alternative_locators: list[LocatorCandidate] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class DiscoverySummary(BaseModel):
    """High-level summary of the discovery run."""

    url: str
    elements_found: int
    elements_saved: int
    low_confidence: int
    duration_ms: int
    has_error: bool = False
    error: str = ""


class DiscoveryResponse(BaseModel):
    """Full result of a discovery run."""

    page: dict[str, Any] = Field(default_factory=dict)
    summary: DiscoverySummary
    elements: list[DiscoveredElement] = Field(default_factory=list)
