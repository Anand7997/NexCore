'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface ExecutionSummary {
  window_days: number;
  executions: {
    total: number;
    success: number;
    failed: number;
    running: number;
    success_rate: number;
  };
  runtime_agents: {
    total: number;
    active: number;
  };
}

export interface Integration {
  id: string;
  name: string;
  integration_type: string;
  config: Record<string, unknown>;
  secret_ref: string | null;
  tenant_id: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  user_id: string | null;
  tenant_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export const enterpriseKeys = {
  summary: (days: number) => ['enterprise', 'summary', days] as const,
  integrations: () => ['enterprise', 'integrations'] as const,
  audit: (tenantId?: string) => ['enterprise', 'audit', tenantId] as const,
};

export function useExecutionSummary(days = 7) {
  return useQuery({
    queryKey: enterpriseKeys.summary(days),
    queryFn: () => api.get<ExecutionSummary>(`/enterprise/reports/execution-summary?days=${days}`),
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useIntegrations() {
  return useQuery({
    queryKey: enterpriseKeys.integrations(),
    queryFn: () => api.get<Integration[]>('/enterprise/integrations'),
    retry: false,
    staleTime: 30_000,
  });
}

export function useAuditLogs(tenantId?: string) {
  return useQuery({
    queryKey: enterpriseKeys.audit(tenantId),
    queryFn: () => api.get<AuditLog[]>(`/enterprise/audit${tenantId ? `?tenant_id=${tenantId}` : ''}`),
    retry: false,
    staleTime: 30_000,
  });
}
