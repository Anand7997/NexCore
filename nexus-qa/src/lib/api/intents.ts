'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export type IntentSupportStatus = 'supported' | 'partial' | 'unsupported';
export type IntentPlatform = 'web' | 'android' | 'ios' | 'desktop';

export interface IntentCapabilityRow {
  intent: string;
  feature: string;
  category: string;
  description: string;
  web: IntentSupportStatus;
  android: IntentSupportStatus;
  ios: IntentSupportStatus;
  desktop: IntentSupportStatus;
  web_reason?: string;
  android_reason?: string;
  ios_reason?: string;
  desktop_reason?: string;
  web_adapter?: string;
  android_adapter?: string;
  ios_adapter?: string;
  desktop_adapter?: string;
  web_node_type?: string | null;
  android_node_type?: string | null;
  ios_node_type?: string | null;
  desktop_node_type?: string | null;
}

export interface IntentCapabilityMatrix {
  platforms: IntentPlatform[];
  capabilities: IntentCapabilityRow[];
}

export const intentKeys = {
  matrix: ['intents', 'capability-matrix'] as const,
};

export function useIntentCapabilityMatrix() {
  return useQuery({
    queryKey: intentKeys.matrix,
    queryFn: () => api.get<IntentCapabilityMatrix>('/intents/capability-matrix'),
    staleTime: 60_000,
    retry: false,
  });
}
