export type AiJobType =
  | 'root_cause_analysis'
  | 'flaky_detection'
  | 'locator_healing'
  | 'anomaly_analysis'
  | 'execution_summary'
  | 'ocr_document_analysis'
  | 'computer_vision_assertion';

export interface EvidenceBundle {
  executionId: string;
  workflowId?: string;
  timeline: Array<Record<string, unknown>>;
  artifacts: Array<{ id: string; kind: string; uri: string; metadata?: Record<string, unknown> }>;
  telemetry: Record<string, unknown>;
  graphContext?: Record<string, unknown>;
}

export interface AiWorkerJob {
  id: string;
  tenantId: string;
  type: AiJobType;
  evidence: EvidenceBundle;
  policy: {
    allowWorkflowMutation: false;
    requireHumanApproval: true;
  };
}

export interface AiFinding {
  type: string;
  class?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'warning';
  description?: string;
  affected_nodes?: string[];
  error_excerpt?: string;
  evidence_link?: string;
  [key: string]: unknown;
}

export interface AiRecommendation {
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: string;
  evidence_link?: string;
  source?: string;
  [key: string]: unknown;
}

export interface AiWorkerResult {
  jobId: string;
  status: 'completed' | 'failed';
  confidence: number;
  summary: string;
  findings: AiFinding[];
  recommendations: AiRecommendation[];
  artifacts?: Array<{ kind: string; uri: string }>;
}

