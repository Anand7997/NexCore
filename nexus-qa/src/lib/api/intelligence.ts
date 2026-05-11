'use client';

import { useQuery } from '@tanstack/react-query';
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

export const intelligenceKeys = {
  execution: (id: string | null) => ['intelligence', 'execution', id] as const,
};

export function useExecutionAnalysis(executionId: string | null) {
  return useQuery({
    queryKey: intelligenceKeys.execution(executionId),
    queryFn: () => api.get<ExecutionAnalysis>(`/intelligence/executions/${executionId}`),
    enabled: !!executionId,
    staleTime: 15_000,
    retry: false,
  });
}

