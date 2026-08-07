import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { advancedApi } from './client';
import type {
  AIJobStatus,
  AIJobType,
  AIProviderStatus,
  AssistantQueryResponse,
  ExecutionAnalysis,
  FixSuggestion,
  ImplementFixResponse,
} from './types';

export function useAIProviderStatus(probe = false) {
  return useQuery({
    queryKey: ['advanced-intelligence', 'providers', probe],
    queryFn: () => advancedApi.get<AIProviderStatus[]>(`/intelligence/providers/status${probe ? '?probe=true' : ''}`),
    staleTime: probe ? 30_000 : 10_000,
    retry: false,
  });
}

export function useExecutionAnalysis(executionId: string | null) {
  return useQuery({
    queryKey: ['advanced-intelligence', 'execution', executionId],
    queryFn: () => advancedApi.get<ExecutionAnalysis>(`/intelligence/executions/${executionId}`),
    enabled: !!executionId,
    staleTime: 15_000,
    retry: false,
  });
}

export function useFixSuggestions(executionId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['advanced-intelligence', 'fixes', executionId],
    queryFn: () => advancedApi.get<FixSuggestion[]>(`/intelligence/executions/${executionId}/fix-suggestions`),
    enabled: !!executionId && enabled,
    staleTime: 5_000,
    retry: false,
  });
}

export function useImplementFixSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ executionId, nodeKey }: { executionId: string; nodeKey: string }) =>
      advancedApi.post<ImplementFixResponse>(
        `/intelligence/executions/${executionId}/fix-suggestions/${encodeURIComponent(nodeKey)}/implement`,
        {},
      ),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['advanced-intelligence', 'fixes', variables.executionId] });
      qc.invalidateQueries({ queryKey: ['advanced-intelligence', 'execution', variables.executionId] });
      qc.invalidateQueries({ queryKey: ['advanced-executions'] });
    },
  });
}

export function useImplementAllFixSuggestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ executionId, fixes }: { executionId: string; fixes: FixSuggestion[] }) => {
      const implementable = fixes.filter((fix) => fix.can_implement);
      const results: ImplementFixResponse[] = [];

      for (const fix of implementable) {
        results.push(
          await advancedApi.post<ImplementFixResponse>(
            `/intelligence/executions/${executionId}/fix-suggestions/${encodeURIComponent(fix.node_key)}/implement`,
            {},
          ),
        );
      }

      return {
        applied: results.length,
        skipped: fixes.length - implementable.length,
        results,
      };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['advanced-intelligence', 'fixes', variables.executionId] });
      qc.invalidateQueries({ queryKey: ['advanced-intelligence', 'execution', variables.executionId] });
      qc.invalidateQueries({ queryKey: ['advanced-executions'] });
    },
  });
}

export function useAskAIInspectAssistant() {
  return useMutation({
    mutationFn: ({
      executionId,
      question,
      preferredProvider,
      preferredModel,
    }: {
      executionId: string;
      question: string;
      preferredProvider?: 'openai' | 'claude';
      preferredModel?: string;
    }) =>
      advancedApi.post<AssistantQueryResponse>(`/intelligence/executions/${executionId}/assistant-query`, {
        question,
        preferred_provider: preferredProvider,
        preferred_model: preferredModel,
      }),
  });
}

export function useAIJobs(executionId: string | null) {
  return useQuery({
    queryKey: ['advanced-intelligence', 'jobs', executionId],
    queryFn: () => advancedApi.get<AIJobStatus[]>(`/intelligence/executions/${executionId}/jobs`),
    enabled: !!executionId,
    refetchInterval: (query) => {
      const jobs = query.state.data;
      if (!jobs?.length) return 10_000;
      return jobs.some((job) => job.status === 'queued' || job.status === 'running') ? 2_000 : 10_000;
    },
    retry: false,
  });
}

export function useTriggerAIAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ executionId, jobType = 'root_cause_analysis' }: { executionId: string; jobType?: AIJobType }) =>
      advancedApi.post<AIJobStatus>(`/intelligence/executions/${executionId}/analyze`, {
        job_type: jobType,
        tenant_id: 'default',
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['advanced-intelligence', 'jobs', variables.executionId] });
    },
  });
}
