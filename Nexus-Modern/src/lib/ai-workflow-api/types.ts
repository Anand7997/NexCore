export type AIWorkflowState =
  | 'CREATED' | 'PROJECT_READY' | 'MODULE_READY' | 'PAGE_CREATED'
  | 'DISCOVERY_RUNNING' | 'DISCOVERY_DONE' | 'LOCATORS_RANKED' | 'PAGE_SAVED'
  | 'SCENARIOS_GENERATING' | 'SCENARIOS_READY' | 'AWAITING_CONFIRMATION'
  | 'TESTCASES_GENERATING' | 'TESTCASES_READY' | 'REVIEW_READY'
  | 'COMPLETED' | 'STOPPED' | 'FAILED';

export interface AIScenarioPreview {
  scenario_id: string;
  title: string;
  business_requirement: string;
  priority: 'high' | 'medium' | 'low';
  test_type: 'functional' | 'regression' | 'smoke' | 'e2e';
  classification: 'positive' | 'negative' | 'edge';
  pages_involved: string[];
  estimated_test_cases: number;
  confidence: number;
  selected: boolean;
}

export interface AIWorkflowStateResponse {
  workflow_id: string;
  state: AIWorkflowState;
  progress_percent: number;
  current_message: string;
  project_id: string | null;
  module_id: string | null;
  page_id: string | null;
  page_name: string | null;
  platform: string;
  elements_saved: number;
  scenarios: AIScenarioPreview[];
  testcases_created: number;
  teststeps_created: number;
  unmapped_steps: number;
  low_confidence_locators: number;
  errors: string[];
  activity_log: AIWorkflowActivityItem[];
  scraped_candidates: AIScrapedCandidatePreview[];
  selected_elements: AIScrapedCandidatePreview[];
}

export interface AIWorkflowActivityItem {
  timestamp: string;
  state: string;
  message: string;
  detail?: string | null;
}

export interface AIScrapedCandidatePreview {
  candidate_id: string;
  name: string;
  element_type: string;
  locator_strategy: string;
  best_locator: string;
  xpath: string;
  css_selector: string;
  confidence_score: number;
  input_type?: string | null;
  placeholder?: string | null;
  label?: string | null;
  test_data_hints?: Record<string, unknown> | null;
  locator_quality?: string | null;
  tags: string[];
  selected: boolean;
  match_reason?: string | null;
  matched_steps: string[];
  element_id?: string;
}

export interface AIWorkflowCreateRequest {
  brd_text: string;
  webpage_url: string;
  project_name: string;
  module_name?: string;
  page_name?: string;
  platform?: string;
  save_mode?: string;
  ai_provider: string;
  ai_model: string;
}

export interface AIWorkflowRollbackRequest {
  target_stage: string;
}

export interface AIBrdExtractResponse {
  filename: string;
  text: string;
  characters: number;
}

export interface AIModelInfo {
  provider: string;
  model_id: string;
  display_name: string;
  tier: 'fast' | 'balanced' | 'best';
  best_for: string;
  configured: boolean;
  setup_hint?: string | null;
}

export interface AIModelsResponse {
  models: AIModelInfo[];
}

export interface AIScenarioConfirmRequest {
  scenario_ids: string[];
}

export interface AIReviewItem {
  testcase_name: string;
  step_number: number;
  description: string;
  reason: string;
}

export interface AILowConfidenceLocator {
  element_name: string;
  current_locator: string;
  confidence: number;
  strategy: string;
  element_id: string;
}

export interface AIReviewResponse {
  workflow_id: string;
  project_id: string | null;
  module_id: string | null;
  page_id: string | null;
  elements_saved: number;
  scenarios_generated: number;
  scenarios_selected: number;
  testcases_created: number;
  teststeps_created: number;
  needs_review_items: AIReviewItem[];
  low_confidence_locators: AILowConfidenceLocator[];
}
