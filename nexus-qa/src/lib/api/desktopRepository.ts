'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import { testConfigurationKeys } from './testConfiguration';
import type {
  DesktopRepositoryCase,
  DesktopRepositoryInsertInput,
  DesktopRepositorySaveInput,
  TestCase,
} from './types';

export const desktopRepositoryKeys = {
  all: ['desktop-repository'] as const,
  cases: ['desktop-repository', 'cases'] as const,
  case: (id: string) => ['desktop-repository', 'case', id] as const,
};

export function useDesktopRepositoryCases(filters?: { search?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.status) params.set('status_filter', filters.status);
  const q = params.toString() ? `?${params.toString()}` : '';
  return useQuery({
    queryKey: [...desktopRepositoryKeys.cases, filters],
    queryFn: () => api.get<DesktopRepositoryCase[]>(`/desktop-repository/cases${q}`),
    staleTime: 15_000,
  });
}

export function useDesktopRepositoryCase(caseId: string | null) {
  return useQuery({
    queryKey: desktopRepositoryKeys.case(caseId ?? ''),
    queryFn: () => api.get<DesktopRepositoryCase>(`/desktop-repository/cases/${caseId}`),
    enabled: !!caseId,
    staleTime: 15_000,
  });
}

export function useSaveTestCaseToDesktopRepository() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DesktopRepositorySaveInput) =>
      api.post<DesktopRepositoryCase>('/desktop-repository/cases/from-test-case', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: desktopRepositoryKeys.all });
    },
  });
}

export function useInsertDesktopRepositoryCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, input }: { caseId: string; input: DesktopRepositoryInsertInput }) =>
      api.post<TestCase>(`/desktop-repository/cases/${encodeURIComponent(caseId)}/insert`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useDeleteDesktopRepositoryCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) =>
      api.delete(`/desktop-repository/cases/${encodeURIComponent(caseId)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: desktopRepositoryKeys.all });
    },
  });
}
