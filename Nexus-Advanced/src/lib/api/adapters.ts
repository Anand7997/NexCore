'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export type AdapterRuntimeStatus = 'available' | 'configured' | 'unavailable';

export interface AdapterRuntime {
  platform: string;
  adapter: string;
  runtime: string;
  status: AdapterRuntimeStatus;
  endpoint: string | null;
  command_path: string | null;
  missing_env: string[];
  isolation: string[];
  capabilities: string[];
  diagnostics: string[];
}

export interface AdapterRuntimeResponse {
  runtimes: AdapterRuntime[];
}

export const adapterKeys = {
  runtimes: ['adapters', 'runtimes'] as const,
};

export function useAdapterRuntimes() {
  return useQuery({
    queryKey: adapterKeys.runtimes,
    queryFn: () => api.get<AdapterRuntimeResponse>('/adapters/runtimes'),
    staleTime: 30_000,
    retry: false,
  });
}
