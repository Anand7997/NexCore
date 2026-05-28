'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './client';
import type {
  DesktopObject, DesktopObjectCreateInput, DesktopObjectHealingSuggestion,
  DesktopObjectHealingSuggestionCreateInput, DesktopObjectHealingSuggestionDecisionInput,
  DesktopObjectHistoryItem, DesktopObjectImpactResponse,
  DesktopObjectLocatorProfileResponse, DesktopObjectUpdateInput,
  DesktopSpySnapshot, DesktopSpySnapshotInput,
  DiscoverRequestInput, DiscoverResponse,
  ElementCreateInput, ElementUpdateInput,
  PageCreateInput, PageDetail, PageElement, PageListItem, PageUpdateInput,
} from './types';

const KEYS = {
  all:  ['page-repository'] as const,
  list: ['page-repository', 'list'] as const,
  tree: ['page-repository', 'all'] as const,
  page: (id: string) => ['page-repository', 'page', id] as const,
  desktopObjects: ['page-repository', 'desktop-objects'] as const,
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
    mutationFn: async (pageId: string) => {
      try {
        await api.delete(`/page-repository/pages/${pageId}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return;
        throw err;
      }
    },
    onMutate: async (pageId: string) => {
      await qc.cancelQueries({ queryKey: KEYS.all });
      const snapshots = qc.getQueriesData({ queryKey: KEYS.all });
      for (const [queryKey, data] of snapshots) {
        if (!Array.isArray(data)) continue;
        qc.setQueryData(
          queryKey,
          data.filter((item: { id?: string }) => item.id !== pageId),
        );
      }
      return { snapshots };
    },
    onError: (_err, _pageId, context) => {
      for (const [queryKey, data] of context?.snapshots ?? []) {
        qc.setQueryData(queryKey, data);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.all }),
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

export function useDesktopObjects(filters?: { application?: string; window?: string; search?: string }) {
  const params = new URLSearchParams();
  if (filters?.application) params.set('application', filters.application);
  if (filters?.window) params.set('window', filters.window);
  if (filters?.search) params.set('search', filters.search);
  const q = params.toString() ? `?${params.toString()}` : '';
  return useQuery({
    queryKey: [...KEYS.desktopObjects, filters],
    queryFn: () => api.get<DesktopObject[]>(`/page-repository/desktop/objects${q}`),
    staleTime: 15_000,
  });
}

export function useCreateDesktopObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DesktopObjectCreateInput) =>
      api.post<DesktopObject>('/page-repository/desktop/objects', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateDesktopObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ objectKey, input }: { objectKey: string; input: DesktopObjectUpdateInput }) =>
      api.put<DesktopObject>(`/page-repository/desktop/objects/${encodeURIComponent(objectKey)}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteDesktopObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (objectKey: string) =>
      api.delete(`/page-repository/desktop/objects/${encodeURIComponent(objectKey)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDesktopObjectImpact() {
  return useMutation({
    mutationFn: (objectKey: string) =>
      api.get<DesktopObjectImpactResponse>(`/page-repository/desktop/objects/${encodeURIComponent(objectKey)}/impact`),
  });
}

export function useDesktopObjectHistory() {
  return useMutation({
    mutationFn: (objectKey: string) =>
      api.get<DesktopObjectHistoryItem[]>(`/page-repository/desktop/objects/${encodeURIComponent(objectKey)}/history`),
  });
}

export function useDesktopObjectLocatorProfile() {
  return useMutation({
    mutationFn: (objectKey: string) =>
      api.get<DesktopObjectLocatorProfileResponse>(`/page-repository/desktop/objects/${encodeURIComponent(objectKey)}/locator-profile`),
  });
}

export function useDesktopObjectHealingSuggestions() {
  return useMutation({
    mutationFn: (objectKey: string) =>
      api.get<DesktopObjectHealingSuggestion[]>(`/page-repository/desktop/objects/${encodeURIComponent(objectKey)}/healing-suggestions`),
  });
}

export function useCreateDesktopObjectHealingSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ objectKey, input }: { objectKey: string; input: DesktopObjectHealingSuggestionCreateInput }) =>
      api.post<DesktopObjectHealingSuggestion>(
        `/page-repository/desktop/objects/${encodeURIComponent(objectKey)}/healing-suggestions`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useResolveDesktopObjectHealingSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, input }: { suggestionId: string; input: DesktopObjectHealingSuggestionDecisionInput }) =>
      api.post<DesktopObjectHealingSuggestion>(
        `/page-repository/desktop/healing-suggestions/${encodeURIComponent(suggestionId)}/resolve`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDesktopSpySnapshot() {
  return useMutation({
    mutationFn: (input: DesktopSpySnapshotInput) =>
      api.post<DesktopSpySnapshot>('/desktop-spy/snapshot', input),
  });
}

export function useDiscoverElements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DiscoverRequestInput) =>
      api.post<DiscoverResponse>('/page-repository/discover', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
