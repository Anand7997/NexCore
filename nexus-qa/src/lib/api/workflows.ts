'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  WorkflowListItem, WorkflowDetail,
  WorkflowCreateInput, WorkflowUpdateInput,
} from './types';

export const workflowKeys = {
  all: ['workflows'] as const,
  detail: (id: string) => ['workflows', id] as const,
};

export function useWorkflows(status?: string) {
  const params = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: [...workflowKeys.all, status],
    queryFn: () => api.get<WorkflowListItem[]>(`/workflows/${params}`),
    staleTime: status === 'active' ? 2_000 : 10_000,
    refetchInterval: status === 'active' ? 5_000 : false,
    refetchOnWindowFocus: status === 'active' ? 'always' : true,
  });
}

export function useWorkflow(id: string | null) {
  return useQuery({
    queryKey: workflowKeys.detail(id ?? ''),
    queryFn: () => api.get<WorkflowDetail>(`/workflows/${id}`),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkflowCreateInput) =>
      api.post<WorkflowDetail>('/workflows/', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowKeys.all }),
  });
}

export function useUpdateWorkflow(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkflowUpdateInput) =>
      api.put<WorkflowDetail>(`/workflows/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowKeys.all });
      qc.invalidateQueries({ queryKey: workflowKeys.detail(id) });
    },
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/workflows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowKeys.all }),
  });
}
