// Backend API types — mirrors backend Pydantic schemas

export type WorkflowStatus = 'active' | 'draft' | 'archived';
export type ExecutionStatus = 'created' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type NodeStatus =
  | 'created' | 'queued' | 'waiting' | 'running' | 'retrying'
  | 'completed' | 'failed' | 'cancelled' | 'skipped';

export interface RetryPolicy {
  max_attempts: number;
  backoff_base?: number;
  max_delay?: number;
  jitter?: boolean;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  node_key: string;
  type: string;
  label: string;
  description: string;
  config: Record<string, unknown>;
  position_x: number;
  position_y: number;
  timeout_seconds: number;
  retry_policy: RetryPolicy;
}

export interface WorkflowEdge {
  id: string;
  source_key: string;
  target_key: string;
  condition?: string | null;
}

export interface WorkflowListItem {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  tags: string[];
  platforms: string[];
  created_at: string;
  updated_at: string;
  node_count: number;
}

export interface WorkflowDetail extends WorkflowListItem {
  variables: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowNodeInput {
  node_key: string;
  type: string;
  label: string;
  description?: string;
  config?: Record<string, unknown>;
  position: NodePosition;
  timeout_seconds?: number;
  retry_policy?: Partial<RetryPolicy>;
}

export interface WorkflowEdgeInput {
  source_key: string;
  target_key: string;
  condition?: string;
}

export interface WorkflowCreateInput {
  name: string;
  description?: string;
  tags?: string[];
  platforms?: string[];
  variables?: Record<string, unknown>;
  nodes: WorkflowNodeInput[];
  edges: WorkflowEdgeInput[];
}

export interface WorkflowUpdateInput {
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  tags?: string[];
  platforms?: string[];
  variables?: Record<string, unknown>;
  nodes?: WorkflowNodeInput[];
  edges?: WorkflowEdgeInput[];
}

export interface ExecutionNode {
  id: string;
  node_key: string;
  node_label: string;
  node_type: string;
  status: NodeStatus;
  attempt_count: number;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  output: Record<string, unknown>;
  error?: string | null;
}

export interface TimelineEntry {
  id: string;
  node_key: string;
  phase: string;
  metadata_: Record<string, unknown>;
  timestamp: string;
}

export interface ExecutionListItem {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  project_name?: string;
  module_name?: string;
  test_case_name?: string;
  display_name?: string;
  status: ExecutionStatus;
  trigger: string;
  environment: string;
  platform: string;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  node_count: number;
  completed_nodes: number;
}

export interface ExecutionDetail extends ExecutionListItem {
  variables: Record<string, unknown>;
  nodes: ExecutionNode[];
  timeline: TimelineEntry[];
}

export interface TriggerExecutionInput {
  workflow_id: string;
  project_id?: string | null;
  module_id?: string | null;
  testing_type_id?: string | null;
  trigger?: string;
  environment?: string;
  platform?: string;
  variables?: Record<string, unknown>;
}

export interface TriggerTestCaseExecutionInput {
  test_case_ids: string[];
  project_id?: string | null;
  module_id?: string | null;
  trigger?: string;
  triggered_by?: string;
  environment?: string;
  platform?: string;
  variables?: Record<string, unknown>;
}

export interface TriggerExecutionResponse {
  execution_id: string;
  status: string;
  workflow_id?: string;
}

export interface TestTagCatalogDimension {
  key: string;
  label: string;
  values: string[];
}

export interface TestStep {
  id: string;
  step_order: number;
  name: string;
  description: string;
  action_type?: string;
  page_id?: string | null;
  page_element_id?: string | null;
  api_endpoint_id?: string | null;
  xpath?: string;
  path_location?: string;
  input_value?: string;
  assertion_type?: string;
  secondary_action?: string;
  secondary_value?: string;
  intent: string;
  target: string;
  expected_result: string;
  test_data: Record<string, unknown>;
  tags: string[];
  bindings: Record<string, Record<string, unknown>>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestCase {
  id: string;
  module_id: string;
  name: string;
  description: string;
  status: string;
  test_type: string;
  priority: string;
  execution_mode: string;
  platforms: string[];
  tags: string[];
  default_variables: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  test_steps: TestStep[];
}

export interface TestModule {
  id: string;
  project_id: string;
  name: string;
  description: string;
  status: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  test_cases: TestCase[];
}

export interface TestProject {
  id: string;
  name: string;
  description: string;
  status: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  modules: TestModule[];
}

export interface TestProjectListItem {
  id: string;
  name: string;
  description: string;
  status: string;
  tags: string[];
  module_count: number;
  case_count: number;
  step_count: number;
  created_at: string;
  updated_at: string;
}

export interface TestConfigurationTree {
  projects: TestProject[];
  tag_catalog: TestTagCatalogDimension[];
}

export interface TestProjectCreateInput {
  name: string;
  description?: string;
  status?: string;
  tags?: string[];
}

export interface TestProjectUpdateInput {
  name?: string;
  description?: string;
  status?: string;
  tags?: string[];
}

export interface TestModuleCreateInput {
  name: string;
  description?: string;
  status?: string;
  tags?: string[];
}

export interface TestModuleUpdateInput {
  name?: string;
  description?: string;
  status?: string;
  tags?: string[];
}

export interface TestCaseCreateInput {
  name: string;
  description?: string;
  status?: string;
  test_type?: string;
  priority?: string;
  execution_mode?: string;
  platforms?: string[];
  tags?: string[];
  default_variables?: Record<string, unknown>;
}

export interface TestCaseUpdateInput {
  name?: string;
  description?: string;
  status?: string;
  test_type?: string;
  priority?: string;
  execution_mode?: string;
  platforms?: string[];
  tags?: string[];
  default_variables?: Record<string, unknown>;
}

export interface TestStepCreateInput {
  name: string;
  description?: string;
  step_order?: number | null;
  action_type?: string;
  page_id?: string | null;
  page_element_id?: string | null;
  api_endpoint_id?: string | null;
  input_value?: string;
  assertion_type?: string;
  secondary_action?: string;
  secondary_value?: string;
  intent?: string;
  target?: string;
  expected_result?: string;
  test_data?: Record<string, unknown>;
  tags?: string[];
  bindings?: Record<string, Record<string, unknown>>;
  is_enabled?: boolean;
}

export interface TestStepUpdateInput {
  name?: string;
  description?: string;
  step_order?: number | null;
  action_type?: string;
  page_id?: string | null;
  page_element_id?: string | null;
  api_endpoint_id?: string | null;
  input_value?: string;
  assertion_type?: string;
  secondary_action?: string;
  secondary_value?: string;
  intent?: string;
  target?: string;
  expected_result?: string;
  test_data?: Record<string, unknown>;
  tags?: string[];
  bindings?: Record<string, Record<string, unknown>>;
  is_enabled?: boolean;
}

// ── Plugin / artifact types ─────────────────────────────────────────────────

export type ArtifactKind =
  | 'screenshot' | 'video' | 'trace' | 'dom_snapshot'
  | 'network_log' | 'har' | 'http_request' | 'http_response'
  | 'log' | 'json' | 'text' | 'binary';

export interface Artifact {
  id: string;
  execution_id: string;
  node_key?: string | null;
  kind: ArtifactKind;
  name: string;
  content_type: string;
  size_bytes: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PluginNodeSpec {
  type: string;
  plugin: string;
  label: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  config_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  supports_retry: boolean;
}

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  node_types: PluginNodeSpec[];
}

// WebSocket message types from backend
export interface WsConnected {
  type: 'connected';
  client_id: string;
}

export interface WsSubscribed {
  type: 'subscribed';
  execution_id: string;
}

export interface WsPong {
  type: 'pong';
}

export interface WsHeartbeat {
  type: 'heartbeat';
}

export interface WsEvent {
  type: string;
  [key: string]: unknown;
}

// ── Page Object Repository ──────────────────────────────────────────────────

export type LocatorStrategy = 'xpath' | 'css' | 'id' | 'name' | 'text' | 'role' | 'testid';

export type ElementType =
  | 'button' | 'input' | 'link' | 'dropdown' | 'checkbox' | 'radio'
  | 'textarea' | 'table' | 'label' | 'image' | 'div' | 'span' | 'element';

export interface PageElement {
  id: string;
  page_id: string;
  name: string;
  element_type: ElementType | string;
  description: string;
  xpath: string;
  css_selector: string;
  id_attr: string;
  name_attr: string;
  locator_strategy: LocatorStrategy | string;
  tags: string[];
  confidence_score?: number | null;
  alternative_locators?: LocatorCandidate[] | null;
  source_url?: string;
  last_verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageListItem {
  id: string;
  name: string;
  url_pattern: string;
  description: string;
  platform: string;
  tags: string[];
  element_count: number;
  created_at: string;
  updated_at: string;
}

export interface PageDetail extends PageListItem {
  elements: PageElement[];
}

export interface PageCreateInput {
  name: string;
  url_pattern?: string;
  description?: string;
  platform?: string;
  tags?: string[];
}

export interface PageUpdateInput {
  name?: string;
  url_pattern?: string;
  description?: string;
  platform?: string;
  tags?: string[];
}

export interface ElementCreateInput {
  name: string;
  element_type?: string;
  description?: string;
  xpath?: string;
  css_selector?: string;
  id_attr?: string;
  name_attr?: string;
  locator_strategy?: string;
  tags?: string[];
}

export interface ElementUpdateInput {
  name?: string;
  element_type?: string;
  description?: string;
  xpath?: string;
  css_selector?: string;
  id_attr?: string;
  name_attr?: string;
  locator_strategy?: string;
  tags?: string[];
}

// ── Element Discovery Agent ────────────────────────────────────────────────

export interface DiscoverRequestInput {
  url: string;
  page_name: string;
  platform?: string;
  save_mode?: 'auto' | 'preview';
  min_confidence?: number;
  include_hidden?: boolean;
  page_id?: string | null;
}

export interface LocatorCandidate {
  strategy: string;
  locator: string;
  verified: boolean;
  element_count: number;
  score: number;
  reason: string;
}

export interface DiscoveredElement {
  name: string;
  element_type: string;
  description: string;
  best_locator: string;
  locator_strategy: string;
  xpath: string;
  css_selector: string;
  id_attr: string;
  name_attr: string;
  confidence_score: number;
  alternative_locators: LocatorCandidate[];
  tags: string[];
}

export interface DiscoverSummary {
  url: string;
  elements_found: number;
  elements_saved: number;
  low_confidence: number;
  duration_ms: number;
  has_error?: boolean;
  error?: string;
}

export interface DiscoverResponse {
  page: Record<string, unknown>;
  summary: DiscoverSummary;
  elements: DiscoveredElement[];
}

// ── AI Workflow ────────────────────────────────────────────────────────────────

export type AIWorkflowState =
  | 'CREATED' | 'PROJECT_READY' | 'MODULE_READY' | 'PAGE_CREATED'
  | 'DISCOVERY_RUNNING' | 'DISCOVERY_DONE' | 'LOCATORS_RANKED' | 'PAGE_SAVED'
  | 'SCENARIOS_GENERATING' | 'SCENARIOS_READY' | 'AWAITING_CONFIRMATION'
  | 'TESTCASES_GENERATING' | 'TESTCASES_READY' | 'REVIEW_READY'
  | 'COMPLETED' | 'FAILED';

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
