'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  ExecutionListItem, ExecutionDetail, ExecutionNode, TimelineEntry,
  TriggerExecutionInput, TriggerExecutionResponse, TriggerTestCaseExecutionInput,
} from './types';

export const executionKeys = {
  all: ['executions'] as const,
  filtered: (workflowId?: string, status?: string) =>
    ['executions', { workflowId, status }] as const,
  detail: (id: string) => ['executions', id] as const,
  nodes: (id: string) => ['executions', id, 'nodes'] as const,
  timeline: (id: string) => ['executions', id, 'timeline'] as const,
};

export function useExecutions(workflowId?: string, status?: string, limit = 50) {
  const params = new URLSearchParams();
  if (workflowId) params.set('workflow_id', workflowId);
  if (status) params.set('status', status);
  params.set('limit', String(limit));

  return useQuery({
    queryKey: executionKeys.filtered(workflowId, status),
    queryFn: () => api.get<ExecutionListItem[]>(`/executions/?${params}`),
    staleTime: 5_000,
    refetchInterval: 8_000,
  });
}

export function useExecution(id: string | null) {
  return useQuery({
    queryKey: executionKeys.detail(id ?? ''),
    queryFn: () => api.get<ExecutionDetail>(`/executions/${id}`),
    enabled: !!id,
    staleTime: 3_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3_000;
      const terminal = ['completed', 'failed', 'cancelled'];
      return terminal.includes(data.status) ? false : 3_000;
    },
  });
}

export function useExecutionNodes(id: string | null) {
  return useQuery({
    queryKey: executionKeys.nodes(id ?? ''),
    queryFn: () => api.get<ExecutionNode[]>(`/executions/${id}/nodes`),
    enabled: !!id,
    staleTime: 2_000,
    refetchInterval: 2_000,
  });
}

export function useExecutionTimeline(id: string | null) {
  return useQuery({
    queryKey: executionKeys.timeline(id ?? ''),
    queryFn: () => api.get<TimelineEntry[]>(`/executions/${id}/timeline`),
    enabled: !!id,
    staleTime: 2_000,
    refetchInterval: 2_000,
  });
}

export function useTriggerExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerExecutionInput) =>
      api.post<TriggerExecutionResponse>('/executions/', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: executionKeys.all });
    },
  });
}

export function useTriggerTestCaseExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerTestCaseExecutionInput) =>
      api.post<TriggerExecutionResponse>('/executions/test-cases', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: executionKeys.all });
    },
  });
}

export function useCancelExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ execution_id: string; status: string }>(`/executions/${id}/cancel`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: executionKeys.detail(id) });
      qc.invalidateQueries({ queryKey: executionKeys.all });
    },
  });
}

export function useDeleteExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ execution_id: string; deleted: boolean }>(`/executions/${id}`),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: executionKeys.detail(id) });
      qc.invalidateQueries({ queryKey: executionKeys.all });
    },
  });
}
