'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  DiscoverRequestInput, DiscoverResponse,
  ElementCreateInput, ElementUpdateInput,
  PageCreateInput, PageDetail, PageElement, PageListItem, PageUpdateInput,
} from './types';

const KEYS = {
  all:  ['page-repository'] as const,
  list: ['page-repository', 'list'] as const,
  tree: ['page-repository', 'all'] as const,
  page: (id: string) => ['page-repository', 'page', id] as const,
};

export function usePageList(platform?: string) {
  const q = platform ? `?platform=${platform}` : '';
  return useQuery({
    queryKey: [...KEYS.list, platform],
    queryFn: () => api.get<PageListItem[]>(`/page-repository/pages${q}`),
    staleTime: 15_000,
  });
}

export function usePage(pageId: string | null) {
  return useQuery({
    queryKey: KEYS.page(pageId ?? ''),
    queryFn: () => api.get<PageDetail>(`/page-repository/pages/${pageId}`),
    enabled: !!pageId,
    staleTime: 15_000,
  });
}

export function useAllPages() {
  return useQuery({
    queryKey: KEYS.tree,
    queryFn: () => api.get<PageDetail[]>('/page-repository/all'),
    staleTime: 30_000,
  });
}

export function useCreatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PageCreateInput) => api.post<PageDetail>('/page-repository/pages', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdatePage(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PageUpdateInput) => api.put<PageDetail>(`/page-repository/pages/${pageId}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeletePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) => api.delete(`/page-repository/pages/${pageId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useCreateElement(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ElementCreateInput) =>
      api.post<PageElement>(`/page-repository/pages/${pageId}/elements`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateElement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ elementId, input }: { elementId: string; input: ElementUpdateInput }) =>
      api.put<PageElement>(`/page-repository/elements/${elementId}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteElement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (elementId: string) => api.delete(`/page-repository/elements/${elementId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

// ── Element Discovery Agent ────────────────────────────────────────────────

export function useDiscoverElements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DiscoverRequestInput) =>
      api.post<DiscoverResponse>('/page-repository/discover', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
