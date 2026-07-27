'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { Artifact } from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

export const artifactKeys = {
  forExecution: (id: string) => ['artifacts', 'execution', id] as const,
  detail:       (id: string) => ['artifacts', id] as const,
};

export function useExecutionArtifacts(
  executionId: string | null,
  filters?: { node_key?: string; kind?: string },
) {
  const params = new URLSearchParams();
  if (filters?.node_key) params.set('node_key', filters.node_key);
  if (filters?.kind) params.set('kind', filters.kind);
  const qs = params.toString();
  const path = `/executions/${executionId}/artifacts${qs ? '?' + qs : ''}`;

  return useQuery({
    queryKey: [...artifactKeys.forExecution(executionId ?? ''), filters?.node_key, filters?.kind],
    queryFn: () => api.get<Artifact[]>(path),
    enabled: !!executionId,
    staleTime: 2_000,
    refetchInterval: 4_000,
  });
}

export function useArtifact(id: string | null) {
  return useQuery({
    queryKey: artifactKeys.detail(id ?? ''),
    queryFn: () => api.get<Artifact>(`/artifacts/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

/** Direct content URL for embedding (img.src, video.src, anchor.href). */
export function artifactContentUrl(artifactId: string): string {
  return `${BASE_URL}/artifacts/${artifactId}/content`;
}
