import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { advancedApi } from './client';
import type {
  ExecutionDetail,
  ExecutionListItem,
  ExecutionNode,
  TimelineEntry,
  TriggerExecutionInput,
  TriggerExecutionResponse,
  TriggerTestCaseExecutionInput,
} from './types';

export const executionKeys = {
  all: ['advanced-executions'] as const,
  filtered: (workflowId?: string, status?: string) => ['advanced-executions', { workflowId, status }] as const,
  detail: (id: string) => ['advanced-executions', id] as const,
  nodes: (id: string) => ['advanced-executions', id, 'nodes'] as const,
  timeline: (id: string) => ['advanced-executions', id, 'timeline'] as const,
};

export function useExecutions(workflowId?: string, status?: string, limit = 50) {
  const params = new URLSearchParams();
  if (workflowId) params.set('workflow_id', workflowId);
  if (status) params.set('status', status);
  params.set('limit', String(limit));

  return useQuery({
    queryKey: executionKeys.filtered(workflowId, status),
    queryFn: () => advancedApi.get<ExecutionListItem[]>(`/executions/?${params.toString()}`),
    staleTime: 5_000,
    refetchInterval: 8_000,
  });
}

export function useExecution(id: string | null) {
  return useQuery({
    queryKey: executionKeys.detail(id ?? ''),
    queryFn: () => advancedApi.get<ExecutionDetail>(`/executions/${id}`),
    enabled: !!id,
    staleTime: 3_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3_000;
      return ['completed', 'failed', 'cancelled'].includes(data.status) ? false : 3_000;
    },
  });
}

export function useExecutionNodes(id: string | null) {
  return useQuery({
    queryKey: executionKeys.nodes(id ?? ''),
    queryFn: () => advancedApi.get<ExecutionNode[]>(`/executions/${id}/nodes`),
    enabled: !!id,
    staleTime: 2_000,
    refetchInterval: 2_000,
  });
}

export function useExecutionTimeline(id: string | null) {
  return useQuery({
    queryKey: executionKeys.timeline(id ?? ''),
    queryFn: () => advancedApi.get<TimelineEntry[]>(`/executions/${id}/timeline`),
    enabled: !!id,
    staleTime: 2_000,
    refetchInterval: 2_000,
  });
}

export function useTriggerExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerExecutionInput) => advancedApi.post<TriggerExecutionResponse>('/executions/', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: executionKeys.all });
    },
  });
}

export function useTriggerTestCaseExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerTestCaseExecutionInput) =>
      advancedApi.post<TriggerExecutionResponse>('/executions/test-cases', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: executionKeys.all });
    },
  });
}

export function useCancelExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => advancedApi.post<{ execution_id: string; status: string }>(`/executions/${id}/cancel`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: executionKeys.detail(id) });
      qc.invalidateQueries({ queryKey: executionKeys.all });
    },
  });
}

export function useDeleteExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => advancedApi.delete<{ execution_id: string; deleted: boolean }>(`/executions/${id}`),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: executionKeys.detail(id) });
      qc.invalidateQueries({ queryKey: executionKeys.all });
    },
  });
}
