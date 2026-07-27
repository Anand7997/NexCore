'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { PluginInfo, PluginNodeSpec } from './types';

export const pluginKeys = {
  list: ['plugins'] as const,
  nodeTypes: ['plugins', 'node-types'] as const,
};

interface PluginsResponse {
  plugins: PluginInfo[];
}

export function usePlugins() {
  return useQuery({
    queryKey: pluginKeys.list,
    queryFn: () => api.get<PluginsResponse>('/plugins/'),
    staleTime: 60_000,
  });
}

export function useNodeTypes() {
  return useQuery({
    queryKey: pluginKeys.nodeTypes,
    queryFn: () => api.get<PluginNodeSpec[]>('/plugins/node-types'),
    staleTime: 60_000,
  });
}
