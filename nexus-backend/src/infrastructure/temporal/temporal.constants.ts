export const EXECUTION_TASK_QUEUE = 'nexus-execution' as const;
export const EXECUTION_WORKFLOW_TYPE = 'executionWorkflow' as const;
export const DAG_EXECUTION_WORKFLOW_TYPE = 'dagExecutionWorkflow' as const;

// Signal names
export const CANCEL_EXECUTION_SIGNAL = 'cancelExecution' as const;
export const AGENT_HEARTBEAT_SIGNAL = 'agentHeartbeat' as const;
export const CANCEL_DAG_EXECUTION_SIGNAL = 'cancelDagExecution' as const;

// Query names
export const GET_EXECUTION_STATUS_QUERY = 'getExecutionStatus' as const;
export const GET_DAG_EXECUTION_STATUS_QUERY = 'getDagExecutionStatus' as const;
