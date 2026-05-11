export type ExecutionStatus = 'running' | 'success' | 'failed' | 'queued' | 'retrying' | 'skipped' | 'cancelled';

export type Platform = 'web' | 'android' | 'ios' | 'desktop';

export interface Execution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  startedAt: string;
  duration: number;
  platform: Platform;
  environment: string;
  triggeredBy: string;
  correlationId: string;
  nodeCount: number;
  completedNodes: number;
  failedNode?: string;
  tags: string[];
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  status?: ExecutionStatus;
  duration?: number;
  retries?: number;
  traversalCount?: number;
}

export type NodeType =
  | 'webAction'
  | 'apiValidation'
  | 'dbValidation'
  | 'mobileAction'
  | 'desktopAction'
  | 'aiAnalysis'
  | 'conditionalBranch'
  | 'retryNode'
  | 'delayNode'
  | 'trigger'
  | 'assertion';

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'draft' | 'archived';
  lastExecuted?: string;
  successRate: number;
  avgDuration: number;
  executions: number;
  tags: string[];
  platforms: Platform[];
  nodes: WorkflowNode[];
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  type: Platform;
  status: 'online' | 'offline' | 'busy' | 'error';
  region: string;
  currentExecution?: string;
  lastSeen: string;
  capabilities: string[];
  load: number;
}

export interface AIInsight {
  id: string;
  executionId: string;
  type: 'root_cause' | 'anomaly' | 'suggestion' | 'pattern';
  title: string;
  description: string;
  confidence: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  evidence: string[];
  suggestedFix?: string;
  affectedNodes: string[];
  timestamp: string;
}

export interface MetricSeries {
  timestamp: string;
  value: number;
}

export interface ExecutionMetrics {
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  activeExecutions: number;
  queuedExecutions: number;
  failedToday: number;
  p95Duration: number;
  throughput: number;
}

export interface PlatformCapability {
  feature: string;
  web: boolean | 'partial';
  android: boolean | 'partial';
  ios: boolean | 'partial';
  desktop: boolean | 'partial';
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  message: string;
  source: string;
  executionId?: string;
}

export interface HeatmapCell {
  hour: number;
  day: number;
  value: number;
}

export type RealtimeEventType =
  | 'execution_started'
  | 'execution_completed'
  | 'execution_failed'
  | 'node_started'
  | 'node_completed'
  | 'log_added'
  | 'ai_insight_generated'
  | 'agent_status_changed'
  | 'execution_progress';

export interface RealtimeEvent {
  id: string;
  timestamp: string;
  type: RealtimeEventType;
  executionId?: string;
  workflowName?: string;
  payload: Record<string, unknown>;
  severity: 'info' | 'warn' | 'error' | 'success';
}

export interface ExecutionProgress {
  executionId: string;
  currentNode: string;
  completedNodes: number;
  totalNodes: number;
  estimatedCompletion?: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warn' | 'error' | 'success';
  timestamp: string;
  executionId?: string;
}
