'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  AIBrdExtractResponse,
  AIModelsResponse,
  AIReviewResponse,
  AIScenarioConfirmRequest,
  AIWorkflowCreateRequest,
  AIWorkflowRollbackRequest,
  AIWorkflowStateResponse,
} from './types';

export const aiWorkflowKeys = {
  all: ['ai-workflows'] as const,
  detail: (id: string) => ['ai-workflows', id] as const,
  models: ['ai-workflows', 'models'] as const,
  review: (id: string) => ['ai-workflows', id, 'review'] as const,
};

export function useAIModels() {
  return useQuery({
    queryKey: aiWorkflowKeys.models,
    queryFn: () => api.get<AIModelsResponse>('/ai-workflows/models'),
    staleTime: 60_000,
  });
}

export function extractAIBrdFile(file: File) {
  const body = new FormData();
  body.append('file', file);
  return api.postForm<AIBrdExtractResponse>('/ai-workflows/brd/extract', body);
}

export function useAIWorkflow(workflowId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: workflowId ? aiWorkflowKeys.detail(workflowId) : aiWorkflowKeys.all,
    queryFn: () => api.get<AIWorkflowStateResponse>(`/ai-workflows/${workflowId}`),
    enabled: !!workflowId && enabled,
    refetchInterval: 2000,
    staleTime: 0,
  });
}

export function useCreateAIWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AIWorkflowCreateRequest) =>
      api.post<AIWorkflowStateResponse>('/ai-workflows', req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiWorkflowKeys.all });
    },
  });
}

export function useGenerateScenarios(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { ai_provider?: string; ai_model?: string }) =>
      api.post<AIWorkflowStateResponse>(
        `/ai-workflows/${workflowId}/scenarios/generate`,
        opts ?? {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiWorkflowKeys.detail(workflowId) });
    },
  });
}

export function useConfirmScenarios(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AIScenarioConfirmRequest) =>
      api.post<AIWorkflowStateResponse>(
        `/ai-workflows/${workflowId}/scenarios/confirm`,
        req,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiWorkflowKeys.detail(workflowId) });
    },
  });
}

export function useGenerateTestCases(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<AIWorkflowStateResponse>(`/ai-workflows/${workflowId}/testcases/generate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiWorkflowKeys.detail(workflowId) });
    },
  });
}

export function useRollbackAIWorkflow(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AIWorkflowRollbackRequest) =>
      api.post<AIWorkflowStateResponse>(`/ai-workflows/${workflowId}/rollback`, req),
    onSuccess: (data) => {
      qc.setQueryData(aiWorkflowKeys.detail(workflowId), data);
      qc.invalidateQueries({ queryKey: aiWorkflowKeys.detail(workflowId) });
      qc.invalidateQueries({ queryKey: aiWorkflowKeys.review(workflowId) });
    },
  });
}

export function useStopAIWorkflow(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<AIWorkflowStateResponse>(`/ai-workflows/${workflowId}/stop`),
    onSuccess: (data) => {
      qc.setQueryData(aiWorkflowKeys.detail(workflowId), data);
      qc.invalidateQueries({ queryKey: aiWorkflowKeys.detail(workflowId) });
      qc.invalidateQueries({ queryKey: aiWorkflowKeys.review(workflowId) });
    },
  });
}

export function useAIWorkflowReview(workflowId: string | null) {
  return useQuery({
    queryKey: workflowId ? aiWorkflowKeys.review(workflowId) : aiWorkflowKeys.all,
    queryFn: () => api.get<AIReviewResponse>(`/ai-workflows/${workflowId}/review`),
    enabled: !!workflowId,
    staleTime: 30_000,
  });
}
