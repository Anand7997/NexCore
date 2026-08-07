export type WorkflowStatus = 'active' | 'draft' | 'archived';
export type ExecutionStatus = 'created' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type NodeStatus =
  | 'created'
  | 'queued'
  | 'waiting'
  | 'running'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

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

export interface TestStep {
  id: string;
  step_order: number;
  name: string;
  description: string;
  action_type?: string;
  intent: string;
  target: string;
  expected_result: string;
  test_data: Record<string, unknown>;
  tags: string[];
  bindings: Record<string, Record<string, unknown>>;
  is_enabled: boolean;
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

export interface TestConfigurationTree {
  projects: TestProject[];
}

export type ArtifactKind =
  | 'screenshot'
  | 'video'
  | 'trace'
  | 'dom_snapshot'
  | 'network_log'
  | 'har'
  | 'http_request'
  | 'http_response'
  | 'log'
  | 'json'
  | 'text'
  | 'binary';

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

export interface IntelligenceInsight {
  id: string;
  type: 'root_cause' | 'anomaly' | 'suggestion' | 'pattern';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  confidence: number;
  evidence: string[];
  affected_nodes: string[];
  recommendation?: string | null;
}

export interface ExecutionAnalysis {
  execution_id: string;
  workflow_id: string;
  status: string;
  generated_at: string;
  summary: {
    status: string;
    node_count: number;
    completed_nodes: number;
    failed_nodes: number;
    artifact_count: number;
    insight_count: number;
    highest_severity: string;
  };
  insights: IntelligenceInsight[];
  evidence_counts: {
    nodes: number;
    timeline_entries: number;
    events: number;
    artifacts: number;
  };
}

export interface FixSuggestion {
  id: string;
  execution_id: string;
  node_key: string;
  node_label: string;
  scope: 'execution_quick_heal';
  category: 'minor_locator' | 'minor_element' | 'desktop_launch_config';
  title: string;
  rationale: string;
  target_type: 'page_element' | 'test_step' | 'workflow_node';
  target_id: string;
  field: string;
  old_value: string;
  new_value: string;
  confidence: number;
  can_implement: boolean;
  blocked_reason?: string | null;
}

export interface ImplementFixResponse {
  applied: boolean;
  suggestion: FixSuggestion;
  changed: Record<string, unknown>;
}

export interface AssistantSource {
  type: string;
  label: string;
  excerpt: string;
}

export interface AssistantQueryResponse {
  answer: string;
  intent: string;
  confidence: number;
  sources: AssistantSource[];
  fixes: FixSuggestion[];
  recommended_fix_id?: string | null;
  panels: Record<string, unknown>;
  answer_source?: 'llm' | 'fallback';
  provider?: string | null;
  model?: string | null;
  llm_error?: string | null;
  provider_results?: Record<string, unknown>[];
}

export type AIJobType =
  | 'root_cause_analysis'
  | 'flaky_detection'
  | 'locator_healing'
  | 'anomaly_analysis';

export interface AIJobStatus {
  id: string;
  execution_id: string;
  job_type: AIJobType;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_step: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AIProviderStatus {
  provider: 'openai' | 'claude';
  label: string;
  model: string;
  configured: boolean;
  package_available: boolean;
  status:
    | 'ready'
    | 'ok'
    | 'not_configured'
    | 'package_missing'
    | 'failed'
    | 'quota_exhausted'
    | 'auth_failed'
    | 'timeout';
  error?: string | null;
}
