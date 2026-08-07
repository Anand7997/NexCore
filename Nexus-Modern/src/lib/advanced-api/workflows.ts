import { useQuery } from '@tanstack/react-query';
import { advancedApi } from './client';
import type { WorkflowListItem } from './types';

export function useWorkflows(status = 'active') {
  const effectiveStatus = status === 'all' ? '' : status;
  const params = effectiveStatus ? `?status=${effectiveStatus}` : '';

  return useQuery({
    queryKey: ['advanced-workflows', effectiveStatus || 'all'],
    queryFn: () => advancedApi.get<WorkflowListItem[]>(`/workflows/${params}`),
    staleTime: effectiveStatus === 'active' ? 2_000 : 10_000,
    refetchInterval: effectiveStatus === 'active' ? 5_000 : false,
    refetchOnWindowFocus: effectiveStatus === 'active' ? 'always' : true,
  });
}
