import { useQuery } from '@tanstack/react-query';
import { advancedApi, getAdvancedApiBaseUrl } from './client';
import type { Artifact } from './types';

export function useExecutionArtifacts(executionId: string | null, filters?: { node_key?: string; kind?: string }) {
  const params = new URLSearchParams();
  if (filters?.node_key) params.set('node_key', filters.node_key);
  if (filters?.kind) params.set('kind', filters.kind);
  const qs = params.toString();
  const path = `/executions/${executionId}/artifacts${qs ? `?${qs}` : ''}`;

  return useQuery({
    queryKey: ['advanced-artifacts', executionId, filters?.node_key, filters?.kind],
    queryFn: () => advancedApi.get<Artifact[]>(path),
    enabled: !!executionId,
    staleTime: 2_000,
    refetchInterval: 4_000,
  });
}

export function artifactContentUrl(artifactId: string): string {
  return `${getAdvancedApiBaseUrl()}/artifacts/${artifactId}/content`;
}
