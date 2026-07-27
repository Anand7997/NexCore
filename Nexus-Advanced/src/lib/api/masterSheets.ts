'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type {
  MasterSheetPreviewInput,
  MasterSheetPreviewResponse,
  MasterSheetRepositorySyncInput,
  MasterSheetRepositorySyncResponse,
  MasterSheetTemplateResponse,
} from './types';

const KEYS = {
  template: ['master-sheets', 'template'] as const,
};

export function useMasterSheetTemplate() {
  return useQuery({
    queryKey: KEYS.template,
    queryFn: () => api.get<MasterSheetTemplateResponse>('/master-sheets/template'),
    staleTime: 60_000,
  });
}

export function usePreviewMasterSheet() {
  return useMutation({
    mutationFn: (input: MasterSheetPreviewInput) =>
      api.post<MasterSheetPreviewResponse>('/master-sheets/preview', input),
  });
}

export function useUploadMasterSheet() {
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api.postForm<MasterSheetPreviewResponse>('/master-sheets/upload', body);
    },
  });
}

export function useSyncMasterSheetDesktopRepository() {
  return useMutation({
    mutationFn: (input: MasterSheetRepositorySyncInput) =>
      api.post<MasterSheetRepositorySyncResponse>('/master-sheets/sync-desktop-repository', input),
  });
}
