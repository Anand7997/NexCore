export type ExecutionPlatform = 'web' | 'api' | 'android' | 'ios' | 'desktop';
export type ExecutionStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

export interface StartExecutionCommand {
  workflowId: string;
  platform: ExecutionPlatform;
  variables?: Record<string, unknown>;
  requiredCapabilities?: string[];
}

export interface ExecutionRunView {
  id: string;
  workflowId: string;
  platform: ExecutionPlatform;
  status: ExecutionStatus;
  variables: Record<string, unknown>;
  temporalWorkflowId?: string;
  temporalRunId?: string;
  createdAt: string;
}

export interface CancelExecutionCommand {
  reason?: string;
}

export type RuntimeAgentCommandType = 'startExecution' | 'cancelExecution' | 'renewLease';

export interface RuntimeAgentCommand {
  id: string;
  agentId: string;
  executionId: string;
  type: RuntimeAgentCommandType;
  payload: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

export type RuntimeAgentEventType =
  | 'execution.progress'
  | 'execution.completed'
  | 'execution.failed'
  | 'agent.heartbeat'
  | 'agent.registered'
  | 'agent.offline';

export interface RuntimeAgentEvent {
  eventId?: string;
  agentId: string;
  executionId?: string;
  type: RuntimeAgentEventType;
  payload: Record<string, unknown>;
  timestamp?: string;
}

export interface RuntimeAgentRegistration {
  tenantId?: string;
  name: string;
  capabilities: string[];
  maxConcurrency?: number;
  labels?: Record<string, string>;
}

export interface RuntimeAgentView {
  id: string;
  tenantId: string;
  name: string;
  status: 'idle' | 'ready' | 'busy' | 'offline';
  capabilities: string[];
  activeLeases: number;
  maxConcurrency: number;
  lastHeartbeatAt?: string;
}
