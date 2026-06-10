from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.ai_workflow.state import WorkflowState


class WorkflowCreateRequest(BaseModel):
    brd_text: str
    webpage_url: str
    project_name: str
    module_name: str | None = None
    page_name: str | None = None
    platform: str = "web"
    save_mode: str = "auto"
    ai_provider: str
    ai_model: str

    @field_validator("brd_text")
    @classmethod
    def validate_brd_text(cls, value: str) -> str:
        if "\x00" in value or value.startswith(("PK\x03\x04", "%PDF")):
            raise ValueError(
                "BRD text appears to contain binary file data. Upload or paste plain text."
            )
        return value

    @field_validator(
        "webpage_url",
        "project_name",
        "module_name",
        "page_name",
        "platform",
        "save_mode",
        "ai_provider",
        "ai_model",
    )
    @classmethod
    def reject_null_bytes(cls, value: str | None) -> str | None:
        if isinstance(value, str) and "\x00" in value:
            raise ValueError("Text fields cannot contain null bytes.")
        return value


class BrdExtractResponse(BaseModel):
    filename: str
    text: str
    characters: int


class ScenarioPreview(BaseModel):
    scenario_id: str
    title: str
    business_requirement: str
    priority: Literal["high", "medium", "low"]
    test_type: Literal["functional", "regression", "smoke", "e2e"]
    classification: Literal["positive", "negative", "edge"]
    pages_involved: list[str]
    estimated_test_cases: int
    confidence: float
    selected: bool = False


class WorkflowActivityItem(BaseModel):
    timestamp: str
    state: str
    message: str
    detail: str | None = None


class ScrapedCandidatePreview(BaseModel):
    candidate_id: str
    name: str
    element_type: str = "element"
    locator_strategy: str = "xpath"
    best_locator: str = ""
    xpath: str = ""
    css_selector: str = ""
    confidence_score: float = 0.0
    tags: list[str] = []
    selected: bool = False
    match_reason: str | None = None
    matched_steps: list[str] = []


class WorkflowStateResponse(BaseModel):
    workflow_id: str
    state: WorkflowState
    progress_percent: int
    current_message: str
    project_id: str | None = None
    module_id: str | None = None
    page_id: str | None = None
    page_name: str | None = None
    platform: str = "web"
    elements_saved: int = 0
    scenarios: list[ScenarioPreview] = []
    testcases_created: int = 0
    teststeps_created: int = 0
    unmapped_steps: int = 0
    low_confidence_locators: int = 0
    errors: list[str] = []
    activity_log: list[WorkflowActivityItem] = []
    scraped_candidates: list[ScrapedCandidatePreview] = []
    selected_elements: list[ScrapedCandidatePreview] = []


class LocatorCandidate(BaseModel):
    strategy: str
    locator: str
    verified: bool
    element_count: int
    score: float
    reason: str = ""


class DiscoveredElement(BaseModel):
    tag: str
    role: str | None = None
    label: str | None = None
    placeholder: str | None = None
    id: str | None = None
    name: str | None = None
    test_id: str | None = None
    text: str | None = None
    css_selector: str = ""
    xpath: str = ""
    is_visible: bool = True
    is_enabled: bool = True
    bounding_box: dict[str, float] = Field(default_factory=dict)
    locator_candidates: list[LocatorCandidate] = Field(default_factory=list)
    best_locator: LocatorCandidate | None = None
    ai_suggested_name: str | None = None
    ai_suggested_action: str | None = None
    confidence: float = 0.0


class GeneratedTestStep(BaseModel):
    step_number: int
    description: str
    action_type: str
    page_id: str | None = None
    page_element_id: str | None = None
    input_value: str | None = None
    assertion_type: str | None = None
    expected_result: str | None = None
    test_data: dict[str, Any] | None = None
    tags: list[str] = Field(default_factory=list)
    needs_review: bool = False
    review_reason: str | None = None
    confidence: float = 1.0


class ScenarioConfirmRequest(BaseModel):
    scenario_ids: list[str]


class GenerateScenariosRequest(BaseModel):
    ai_provider: str | None = None
    ai_model: str | None = None


class ModelInfo(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    provider: str
    model_id: str
    display_name: str
    tier: Literal["fast", "balanced", "best"]
    best_for: str
    configured: bool = True
    setup_hint: str | None = None


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


class ReviewItem(BaseModel):
    testcase_name: str
    step_number: int
    description: str
    reason: str


class LowConfidenceLocator(BaseModel):
    element_name: str
    current_locator: str
    confidence: float
    strategy: str
    element_id: str


class ReviewResponse(BaseModel):
    workflow_id: str
    project_id: str | None = None
    module_id: str | None = None
    page_id: str | None = None
    elements_saved: int = 0
    scenarios_generated: int = 0
    scenarios_selected: int = 0
    testcases_created: int = 0
    teststeps_created: int = 0
    needs_review_items: list[ReviewItem] = Field(default_factory=list)
    low_confidence_locators: list[LowConfidenceLocator] = Field(default_factory=list)


# ── Internal AI response schemas ──────────────────────────────────────────────

class BRDAnalysis(BaseModel):
    summary: str
    key_features: list[str]
    modules_suggested: list[str]
    test_objectives: list[str]


class ScenarioList(BaseModel):
    scenarios: list[ScenarioPreview]


class GeneratedTestCase(BaseModel):
    title: str
    description: str
    test_type: str = "functional"
    priority: str = "medium"
    steps: list[GeneratedTestStep]


class TestCaseList(BaseModel):
    test_cases: list[GeneratedTestCase]


class ElementClassification(BaseModel):
    ai_suggested_name: str
    ai_suggested_action: str
    confidence: float
    locator_order: list[str]


class LocatorEnhancementItem(BaseModel):
    candidate_id: str
    recommended_strategy: str
    recommended_locator: str
    locator_order: list[str]
    rationale: str


class LocatorEnhancementList(BaseModel):
    items: list[LocatorEnhancementItem]


class StepElementBindingDecision(BaseModel):
    test_case_title: str
    step_number: int
    candidate_id: str | None = None
    action_type: str
    input_value: str | None = None
    assertion_type: str | None = None
    expected_result: str | None = None
    confidence: float = 0.0
    needs_review: bool = False
    reason: str = ""


class StepElementBindingDecisionList(BaseModel):
    items: list[StepElementBindingDecision]
