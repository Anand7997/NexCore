import { useQuery } from '@tanstack/react-query';
import { advancedApi } from './client';
import type { TestConfigurationTree } from './types';

export function useTestConfigurationTree() {
  return useQuery({
    queryKey: ['advanced-test-configuration', 'tree'],
    queryFn: () => advancedApi.get<TestConfigurationTree>('/test-configuration/tree'),
    staleTime: 10_000,
  });
}
