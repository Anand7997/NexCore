'use client';
import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { useExecution, useExecutionNodes } from '@/lib/api/executions';
import { useUIStore } from '@/lib/stores/uiStore';

export function useExecutionMonitor(executionId: string | null) {
  const { send } = useWebSocket(executionId);
  const executionQuery = useExecution(executionId);
  const nodesQuery = useExecutionNodes(executionId);
  const { openInspectorFor } = useUIStore();

  useEffect(() => {
    if (executionId) {
      openInspectorFor(executionId);
      send({ action: 'subscribe', execution_id: executionId });
    }
  }, [executionId, openInspectorFor, send]);

  return {
    execution: executionQuery.data,
    nodes: nodesQuery.data ?? [],
    isLoading: executionQuery.isLoading,
    isRunning: executionQuery.data
      ? ['created', 'queued', 'running'].includes(executionQuery.data.status)
      : false,
  };
}
