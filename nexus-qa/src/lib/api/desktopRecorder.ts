'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL, ApiError, api } from './client';
import type {
  DesktopRecordedAction,
  DesktopRecordedActionCreate,
  DesktopMcpCommandInput,
  DesktopMcpCommandResponse,
  DesktopRecorderAgentCommandInput,
  DesktopRecorderAgentCommandResponse,
  DesktopRecorderCompileResponse,
  DesktopRecorderSession,
  DesktopRecorderSessionCreate,
  DesktopRecorderSessionDetail,
} from './types';

const keys = {
  all: ['desktop-recorder'] as const,
  sessions: ['desktop-recorder', 'sessions'] as const,
  detail: (id: string) => ['desktop-recorder', 'sessions', id] as const,
  compile: (id: string) => ['desktop-recorder', 'sessions', id, 'compile'] as const,
};

export function useDesktopRecorderSessions() {
  return useQuery({
    queryKey: keys.sessions,
    queryFn: () => api.get<DesktopRecorderSession[]>('/desktop-recorder/sessions'),
    staleTime: 10_000,
  });
}

export function useDesktopRecorderSession(sessionId: string | null, live = false) {
  return useQuery({
    queryKey: keys.detail(sessionId ?? ''),
    queryFn: () => api.get<DesktopRecorderSessionDetail>(`/desktop-recorder/sessions/${sessionId}`),
    enabled: !!sessionId,
    staleTime: 5_000,
    refetchInterval: live ? 2_000 : false,
  });
}

export function useCreateDesktopRecorderSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DesktopRecorderSessionCreate) =>
      api.post<DesktopRecorderSessionDetail>('/desktop-recorder/sessions', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useStopDesktopRecorderSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      api.post<DesktopRecorderSessionDetail>(`/desktop-recorder/sessions/${sessionId}/stop`),
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: keys.sessions });
      qc.invalidateQueries({ queryKey: keys.detail(session.id) });
    },
  });
}

export function useAddDesktopRecordedAction(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DesktopRecordedActionCreate) =>
      api.post<DesktopRecordedAction>(`/desktop-recorder/sessions/${sessionId}/actions`, input),
    onSuccess: () => {
      if (sessionId) qc.invalidateQueries({ queryKey: keys.detail(sessionId) });
      qc.invalidateQueries({ queryKey: keys.sessions });
    },
  });
}

export function useCompileDesktopRecording(sessionId: string | null) {
  return useMutation({
    mutationFn: () =>
      api.post<DesktopRecorderCompileResponse>(`/desktop-recorder/sessions/${sessionId}/compile`),
  });
}

export function useDesktopRecorderAgentCommand() {
  return useMutation({
    mutationFn: (input: DesktopRecorderAgentCommandInput) =>
      api.post<DesktopRecorderAgentCommandResponse>('/desktop-recorder/agent-command', input),
  });
}

export function useDesktopMcpCommand() {
  return useMutation({
    mutationFn: (input: DesktopMcpCommandInput) =>
      api.post<DesktopMcpCommandResponse>('/desktop-recorder/mcp-command', input),
  });
}

function filenameFromDisposition(disposition: string | null): string {
  if (!disposition) return 'nexcore-desktop-recorder-agent.zip';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? 'nexcore-desktop-recorder-agent.zip';
}

export async function downloadDesktopRecorderAgentPackage(input: DesktopRecorderAgentCommandInput) {
  const response = await fetch(`${API_BASE_URL}/desktop-recorder/agent-package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new ApiError(response.status, text);
  }
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get('content-disposition')),
  };
}

export async function downloadDesktopMcpPackage(input: DesktopMcpCommandInput) {
  const response = await fetch(`${API_BASE_URL}/desktop-recorder/mcp-package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new ApiError(response.status, text);
  }
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get('content-disposition')),
  };
}
