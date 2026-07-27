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
  execution_order?: number;
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
  result_id: string;
  result_count: number;
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

export interface DesktopRepositoryStep {
  id: string;
  repository_case_id: string;
  source_test_step_id?: string | null;
  step_order: number;
  name: string;
  description: string;
  action_type: string;
  page_id?: string | null;
  page_element_id?: string | null;
  api_endpoint_id?: string | null;
  input_value: string;
  expected_result: string;
  assertion_type: string;
  secondary_action: string;
  secondary_value: string;
  intent: string;
  target: string;
  test_data: Record<string, unknown>;
  tags: string[];
  bindings: Record<string, Record<string, unknown>>;
  is_enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DesktopRepositoryCase {
  id: string;
  source_test_case_id?: string | null;
  source_project_id?: string | null;
  source_module_id?: string | null;
  name: string;
  description: string;
  status: string;
  test_type: string;
  priority: string;
  execution_mode: string;
  platforms: string[];
  tags: string[];
  default_variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  step_count: number;
  created_at: string;
  updated_at: string;
  steps: DesktopRepositoryStep[];
}

export interface DesktopRepositorySaveInput {
  test_case_id: string;
  name?: string;
  description?: string;
  tags?: string[];
}

export interface DesktopRepositoryInsertInput {
  target_test_case_id: string;
  position?: number | null;
  include_disabled?: boolean;
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

export type LocatorStrategy =
  | 'xpath' | 'css' | 'id' | 'name' | 'text' | 'role' | 'testid'
  | 'accessibility id' | 'automation id' | 'class name' | 'ocr' | 'visual';

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
  discovery_metadata?: Record<string, unknown> | null;
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

export interface DesktopObject {
  id: string;
  page_id: string;
  object_key: string;
  name: string;
  application: string;
  application_path?: string;
  repository_scope: string;
  control_type: string;
  automation_id?: string;
  name_text?: string;
  class_name?: string;
  uia_path?: string;
  locator_strategy: string;
  primary_locator?: string;
  alternative_locators: LocatorCandidate[];
  window?: string;
  screen?: string;
  ui_framework?: string;
  process_name?: string;
  hierarchy_path?: string;
  bounding_box?: Record<string, unknown> | null;
  screenshot_url?: string;
  ocr_text?: string;
  ai_label?: string;
  confidence_score?: number | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DesktopObjectImpactStep {
  step_id: string;
  step_order: number;
  step_name: string;
  action_type: string;
  target: string;
  is_enabled: boolean;
  test_case_id: string;
  test_case_name: string;
  module_id: string;
  module_name: string;
  project_id: string;
  project_name: string;
  match_reasons: string[];
  risk: 'high' | 'medium' | 'low' | string;
  current_locator: string;
}

export interface DesktopObjectImpactWorkflowNode {
  workflow_id: string;
  workflow_name: string;
  node_key: string;
  node_type: string;
  node_label: string;
  test_step_id: string;
}

export interface DesktopObjectImpactResponse {
  object_key: string;
  object_name: string;
  application: string;
  page_id: string;
  element_id: string;
  impacted_step_count: number;
  workflow_node_count: number;
  risk_summary: Record<string, number>;
  steps: DesktopObjectImpactStep[];
  workflow_nodes: DesktopObjectImpactWorkflowNode[];
}

export interface DesktopObjectHistoryItem {
  id: string;
  page_id: string;
  element_id: string;
  object_key: string;
  action: string;
  source: string;
  actor: string;
  changed_fields: string[];
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown>;
  impact_summary: Record<string, unknown>;
  created_at: string;
}

export interface DesktopObjectLocatorCandidateProfile {
  strategy: string;
  locator: string;
  score: number;
  strength: string;
  reason: string;
  risk_flags: string[];
}

export interface DesktopObjectLocatorProfileResponse {
  object_key: string;
  object_name: string;
  application: string;
  page_id: string;
  element_id: string;
  stability_score: number;
  stale: boolean;
  stale_reasons: string[];
  suggestions: string[];
  primary_locator: string;
  best_strategy: string;
  history_count: number;
  locator_change_count: number;
  last_changed_at?: string | null;
  candidates: DesktopObjectLocatorCandidateProfile[];
}

export interface DesktopObjectHealingSuggestion {
  id: string;
  page_id: string;
  element_id: string;
  object_key: string;
  object_name: string;
  application: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  source: string;
  suggested_strategy: string;
  suggested_locator: string;
  suggested_field: string;
  confidence?: number | null;
  reason: string;
  evidence: Array<Record<string, unknown>>;
  preview_update: Record<string, unknown>;
  created_at: string;
  resolved_at?: string | null;
  resolved_by: string;
  resolution_note: string;
}

export interface DesktopObjectHealingSuggestionCreateInput {
  locator_attempts?: Array<Record<string, unknown>>;
  attempts?: Array<Record<string, unknown>>;
  successful_strategy?: string;
  successful_locator?: string;
  confidence?: number | null;
  source?: string;
  reason?: string;
  actor?: string;
  min_confidence?: number;
}

export interface DesktopObjectHealingSuggestionDecisionInput {
  approved: boolean;
  actor?: string;
  note?: string;
}

export interface DesktopObjectCreateInput {
  page_id?: string | null;
  application?: string;
  application_path?: string;
  repository_scope?: string;
  object_key: string;
  name: string;
  control_type?: string;
  automation_id?: string;
  name_text?: string;
  class_name?: string;
  uia_path?: string;
  locator_strategy?: string;
  primary_locator?: string;
  alternative_locators?: LocatorCandidate[];
  window?: string;
  screen?: string;
  ui_framework?: string;
  process_name?: string;
  hierarchy_path?: string;
  bounding_box?: Record<string, unknown> | null;
  screenshot_url?: string;
  ocr_text?: string;
  ai_label?: string;
  confidence_score?: number | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type DesktopObjectUpdateInput = Partial<DesktopObjectCreateInput>;

export interface DesktopWorkflowSyncInput {
  workflow_id?: string | null;
  session_id?: string | null;
  include_archived?: boolean;
  include_recording_sessions?: boolean;
  update_existing?: boolean;
}

export interface DesktopWorkflowSyncItem {
  object_key: string;
  name: string;
  application: string;
  action: string;
  reason: string;
  source: string;
  workflow_id: string;
  workflow_name: string;
  node_key: string;
  session_id: string;
  object?: DesktopObject | null;
}

export interface DesktopWorkflowSyncResponse {
  source: string;
  scanned_workflows: number;
  scanned_recording_sessions: number;
  created: number;
  updated: number;
  skipped: number;
  pages_created: number;
  objects: DesktopWorkflowSyncItem[];
}

export interface DesktopSpyCandidate {
  object_key: string;
  name: string;
  control_type: string;
  automation_id?: string;
  name_text?: string;
  class_name?: string;
  uia_path?: string;
  locator_strategy: string;
  primary_locator: string;
  alternative_locators: LocatorCandidate[];
    bounding_box?: Record<string, unknown> | null;
    ocr_text?: string;
    confidence_score: number;
    strength?: string;
    risk_flags?: string[];
    explanation?: string;
    metadata: Record<string, unknown>;
  }

export interface DesktopSpySnapshotInput {
  driver_type?: string;
  server_url?: string;
  app?: string;
  args?: string[] | string | null;
  window_title?: string;
  process_name?: string;
  timeout_ms?: number;
  close_after?: boolean;
  include_screenshot?: boolean;
  max_objects?: number;
}

export interface DesktopSpySnapshot {
  driver: string;
  attached: boolean;
  launched: boolean;
  window_title: string;
  process_name: string;
  screenshot_base64: string;
  screenshot_size_bytes: number;
  ui_tree: string;
  candidates: DesktopSpyCandidate[];
  capabilities: Record<string, unknown>;
}

export interface DesktopRecorderSessionCreate {
  name?: string;
  application?: string;
  application_path?: string;
  window_title?: string;
  process_name?: string;
  driver_type?: string;
  repository_page_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DesktopRecordedActionCreate {
  action_type: string;
  object_key?: string;
  object_name?: string;
  control_type?: string;
  automation_id?: string;
  name_text?: string;
  class_name?: string;
  uia_path?: string;
  locator_strategy?: string;
  value?: string;
  expected?: string;
  property_name?: string;
  variable?: string;
  window_title?: string;
  screen?: string;
  x?: number | null;
  y?: number | null;
  duration_ms?: number | null;
  locators?: LocatorCandidate[];
  screenshot_artifact_id?: string;
  ui_tree_artifact_id?: string;
  metadata?: Record<string, unknown>;
}

export interface DesktopRecordedActionUpdate extends Partial<DesktopRecordedActionCreate> {
  action_order?: number;
}

export interface DesktopRecordedAction extends DesktopRecordedActionCreate {
  id: string;
  session_id: string;
  action_order: number;
  created_at: string;
}

export interface DesktopRecorderSession {
  id: string;
  name: string;
  status: string;
  application: string;
  application_path: string;
  window_title: string;
  process_name: string;
  driver_type: string;
  repository_page_id?: string | null;
  metadata: Record<string, unknown>;
  action_count: number;
  started_at?: string | null;
  stopped_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesktopRecorderSessionDetail extends DesktopRecorderSession {
  actions: DesktopRecordedAction[];
}

export interface MasterSheetIssue {
  severity: 'error' | 'warning' | string;
  section: string;
  key: string;
  field: string;
  message: string;
}

  export interface MasterSheetPreviewInput {
    master_sheet?: Record<string, unknown>;
    master_sheet_path?: string;
    master_sheet_url?: string;
    master_sheet_headers?: Record<string, string>;
    db_connection_string?: string;
    db_query?: string;
    repository_source?: boolean;
  }

export interface MasterSheetPreviewResponse {
  source: string;
  saved_path: string;
  filename: string;
  summary: Record<string, number>;
  issues: MasterSheetIssue[];
  normalized: Record<string, Record<string, Record<string, unknown>> | unknown>;
  valid: boolean;
}

export interface MasterSheetTemplateResponse {
  supported_extensions: string[];
  required_sections: string[];
  template: Record<string, unknown>;
}

export interface MasterSheetRepositorySyncInput extends MasterSheetPreviewInput {
  application_key?: string;
  repository_scope?: string;
  update_existing?: boolean;
  skip_invalid?: boolean;
}

export interface MasterSheetRepositorySyncItem {
  object_key: string;
  name: string;
  application: string;
  action: string;
  reason: string;
  object?: DesktopObject | null;
}

export interface MasterSheetRepositorySyncResponse {
  source: string;
  created: number;
  updated: number;
  skipped: number;
  pages_created: number;
  issues: MasterSheetIssue[];
  objects: MasterSheetRepositorySyncItem[];
}

export interface DesktopRecorderAgentCommandInput {
  api_url?: string;
  session_id?: string;
  name?: string;
  application?: string;
  application_path?: string;
  window_title?: string;
  process_name?: string;
  driver_type?: string;
  stop_hotkey?: string;
  pause_hotkey?: string;
  flush_interval_ms?: number;
}

export interface DesktopMcpCommandInput extends DesktopRecorderAgentCommandInput {
  mode?: 'stdio' | 'watch';
}

  export interface DesktopRecorderAgentCommandResponse {
    command: string;
    script_path: string;
    requirements: string[];
    stop_hotkey: string;
    pause_hotkey: string;
  }

export interface DesktopMcpCommandResponse extends DesktopRecorderAgentCommandResponse {
  mode: 'stdio' | 'watch';
  tools: string[];
}

  export interface DesktopReusableComponentSuggestion {
    component_key: string;
    name: string;
    description: string;
    component_type: string;
    confidence: number;
    reason: string;
    start_step: number;
    end_step: number;
    action_count: number;
    objects: string[];
    operations: string[];
    suggested_parameters: Array<Record<string, unknown>>;
    suggested_outputs: Array<Record<string, unknown>>;
    tags: string[];
    definition: Record<string, unknown>;
  }
  
  export interface DesktopRecorderCompileResponse {
    session_id: string;
    name: string;
    platform: 'desktop';
  keyword_steps: Array<{
    step: number;
    object: string;
    operation: string;
    value: string;
    assignment: string;
    checkpoint: string;
    comment: string;
    node_type: string;
  }>;
  workflow: {
    name: string;
    description: string;
    platforms: string[];
    nodes: WorkflowNodeInput[];
    edges: WorkflowEdgeInput[];
    };
    repository_suggestions: DesktopObjectCreateInput[];
    component_suggestions: DesktopReusableComponentSuggestion[];
    summary: Record<string, number>;
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
  confidence_score?: number | null;
  alternative_locators?: LocatorCandidate[] | null;
  discovery_metadata?: Record<string, unknown> | null;
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
  confidence_score?: number | null;
  alternative_locators?: LocatorCandidate[] | null;
  discovery_metadata?: Record<string, unknown> | null;
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
