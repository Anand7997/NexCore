'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface IntelligenceInsight {
  id: string;
  type: 'root_cause' | 'anomaly' | 'suggestion' | 'pattern';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  confidence: number;
  evidence: string[];
  affected_nodes: string[];
  recommendation?: string | null;
}

export interface ExecutionAnalysis {
  execution_id: string;
  workflow_id: string;
  status: string;
  generated_at: string;
  summary: {
    status: string;
    node_count: number;
    completed_nodes: number;
    failed_nodes: number;
    artifact_count: number;
    insight_count: number;
    highest_severity: string;
  };
  insights: IntelligenceInsight[];
  evidence_counts: {
    nodes: number;
    timeline_entries: number;
    events: number;
    artifacts: number;
  };
}

export interface FixSuggestion {
  id: string;
  execution_id: string;
  node_key: string;
  node_label: string;
  scope: 'execution_quick_heal';
  category: 'minor_locator' | 'minor_element' | 'desktop_launch_config';
  title: string;
  rationale: string;
  target_type: 'page_element' | 'test_step' | 'workflow_node';
  target_id: string;
  field: string;
  old_value: string;
  new_value: string;
  confidence: number;
  can_implement: boolean;
  blocked_reason?: string | null;
}

export interface ImplementFixResponse {
  applied: boolean;
  suggestion: FixSuggestion;
  changed: Record<string, unknown>;
}

export interface ImplementAllFixesResponse {
  applied: number;
  skipped: number;
  results: ImplementFixResponse[];
}

export interface AIProviderStatus {
  provider: 'openai' | 'claude';
  label: string;
  model: string;
  configured: boolean;
  package_available: boolean;
  status: 'ready' | 'ok' | 'not_configured' | 'package_missing' | 'failed' | 'quota_exhausted' | 'auth_failed' | 'timeout';
  error?: string | null;
}

export interface AssistantSource {
  type: string;
  label: string;
  excerpt: string;
}

export interface AssistantQueryResponse {
  answer: string;
  intent: string;
  confidence: number;
  sources: AssistantSource[];
  fixes: FixSuggestion[];
  recommended_fix_id?: string | null;
  panels: Record<string, unknown>;
  answer_source?: 'llm' | 'fallback';
  provider?: string | null;
  model?: string | null;
  llm_error?: string | null;
  provider_results?: Record<string, unknown>[];
}

export interface AssistantQueryRequest {
  executionId: string;
  question: string;
  preferredProvider?: 'openai' | 'claude';
  preferredModel?: string;
}

export type AIJobType =
  | 'root_cause_analysis'
  | 'flaky_detection'
  | 'locator_healing'
  | 'anomaly_analysis';

export interface AIJobStatus {
  id: string;
  execution_id: string;
  job_type: AIJobType;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_step: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export const intelligenceKeys = {
  execution: (id: string | null) => ['intelligence', 'execution', id] as const,
  fixes: (id: string | null) => ['intelligence', 'fixes', id] as const,
  jobs: (executionId: string | null) => ['intelligence', 'jobs', executionId] as const,
  job: (jobId: string | null) => ['intelligence', 'job', jobId] as const,
  providers: (probe: boolean) => ['intelligence', 'providers', probe] as const,
};

export function useAIProviderStatus(probe = false) {
  return useQuery({
    queryKey: intelligenceKeys.providers(probe),
    queryFn: () => api.get<AIProviderStatus[]>(`/intelligence/providers/status${probe ? '?probe=true' : ''}`),
    staleTime: probe ? 30_000 : 10_000,
    retry: false,
  });
}

export function useExecutionAnalysis(executionId: string | null) {
  return useQuery({
    queryKey: intelligenceKeys.execution(executionId),
    queryFn: () => api.get<ExecutionAnalysis>(`/intelligence/executions/${executionId}`),
    enabled: !!executionId,
    staleTime: 15_000,
    retry: false,
  });
}

export function useFixSuggestions(executionId: string | null, enabled = true) {
  return useQuery({
    queryKey: intelligenceKeys.fixes(executionId),
    queryFn: () => api.get<FixSuggestion[]>(`/intelligence/executions/${executionId}/fix-suggestions`),
    enabled: !!executionId && enabled,
    staleTime: 5_000,
    retry: false,
  });
}

export function useImplementFixSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ executionId, nodeKey }: { executionId: string; nodeKey: string }) =>
      api.post<ImplementFixResponse>(
        `/intelligence/executions/${executionId}/fix-suggestions/${encodeURIComponent(nodeKey)}/implement`,
        {},
      ),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: intelligenceKeys.fixes(variables.executionId) });
      qc.invalidateQueries({ queryKey: intelligenceKeys.execution(variables.executionId) });
      qc.invalidateQueries({ queryKey: ['executions', variables.executionId] });
      qc.invalidateQueries({ queryKey: ['test-configuration'] });
      qc.invalidateQueries({ queryKey: ['page-repository'] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
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
        results.push(await api.post<ImplementFixResponse>(
          `/intelligence/executions/${executionId}/fix-suggestions/${encodeURIComponent(fix.node_key)}/implement`,
          {},
        ));
      }
      return { applied: results.length, skipped: fixes.length - implementable.length, results } satisfies ImplementAllFixesResponse;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: intelligenceKeys.fixes(variables.executionId) });
      qc.invalidateQueries({ queryKey: intelligenceKeys.execution(variables.executionId) });
      qc.invalidateQueries({ queryKey: ['executions', variables.executionId] });
      qc.invalidateQueries({ queryKey: ['test-configuration'] });
      qc.invalidateQueries({ queryKey: ['page-repository'] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export function useAskAIInspectAssistant() {
  return useMutation({
    mutationFn: ({ executionId, question, preferredProvider, preferredModel }: AssistantQueryRequest) =>
      api.post<AssistantQueryResponse>(`/intelligence/executions/${executionId}/assistant-query`, {
        question,
        preferred_provider: preferredProvider,
        preferred_model: preferredModel,
      }),
  });
}

export function useAIJobs(executionId: string | null) {
  return useQuery({
    queryKey: intelligenceKeys.jobs(executionId),
    queryFn: () => api.get<AIJobStatus[]>(`/intelligence/executions/${executionId}/jobs`),
    enabled: !!executionId,
    refetchInterval: (query) => {
      const jobs = query.state.data;
      if (!jobs?.length) return 10_000;
      const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'running');
      return hasActive ? 2_000 : 10_000;
    },
    retry: false,
  });
}

export function useAIJob(jobId: string | null) {
  return useQuery({
    queryKey: intelligenceKeys.job(jobId),
    queryFn: () => api.get<AIJobStatus>(`/intelligence/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job) return 2_000;
      return job.status === 'queued' || job.status === 'running' ? 2_000 : false;
    },
    retry: false,
  });
}

export function useTriggerAIAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      executionId,
      jobType = 'root_cause_analysis',
    }: {
      executionId: string;
      jobType?: AIJobType;
    }) =>
      api.post<AIJobStatus>(`/intelligence/executions/${executionId}/analyze`, {
        job_type: jobType,
        tenant_id: 'default',
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: intelligenceKeys.jobs(variables.executionId) });
    },
  });
}

export function useCancelAIJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      api.delete<void>(`/intelligence/jobs/${jobId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intelligence', 'jobs'] });
    },
  });
}
