'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface RuntimeAgent {
  id: string;
  name: string;
  status: string;
  agent_type: string;
  endpoint: string | null;
  version: string;
  capabilities: string[];
  labels: Record<string, unknown>;
  max_concurrency: number;
  active_leases: number;
  last_heartbeat_at: string | null;
  registered_at: string;
}

export interface RuntimeQueueItem {
  id: string;
  execution_id: string;
  status: string;
  platform: string;
  priority: number;
  required_capabilities: string[];
  assigned_agent_id: string | null;
  dispatch_reason: string;
  queued_at: string;
  dispatched_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface RuntimeLease {
  id: string;
  execution_id: string;
  agent_id: string;
  status: string;
  platform: string;
  acquired_at: string;
  released_at: string | null;
  heartbeat_at: string | null;
  lease_metadata: Record<string, unknown>;
}

export const runtimeKeys = {
  agents: () => ['runtime', 'agents'] as const,
  queue: (status?: string) => ['runtime', 'queue', status] as const,
  leases: (agentId?: string, status?: string) => ['runtime', 'leases', agentId, status] as const,
};

export function useRuntimeAgents() {
  return useQuery({
    queryKey: runtimeKeys.agents(),
    queryFn: () => api.get<RuntimeAgent[]>('/runtime/agents'),
    refetchInterval: 10_000,
    retry: false,
  });
}

export function useRuntimeQueue(status?: string) {
  return useQuery({
    queryKey: runtimeKeys.queue(status),
    queryFn: () => api.get<RuntimeQueueItem[]>(`/runtime/queue${status ? `?status=${status}` : ''}`),
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useRuntimeLeases(agentId?: string, status?: string) {
  const params = new URLSearchParams();
  if (agentId) params.set('agent_id', agentId);
  if (status) params.set('status', status);
  const qs = params.toString();
  return useQuery({
    queryKey: runtimeKeys.leases(agentId, status),
    queryFn: () => api.get<RuntimeLease[]>(`/runtime/leases${qs ? `?${qs}` : ''}`),
    refetchInterval: 10_000,
    retry: false,
  });
}
