'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export type IntentSupportStatus = 'supported' | 'partial' | 'unsupported';
export type IntentPlatform = 'web' | 'android' | 'ios' | 'desktop' | 'api' | 'db';

export interface IntentCapabilityRow {
  intent: string;
  feature: string;
  category: string;
  description: string;
  web: IntentSupportStatus;
  android: IntentSupportStatus;
  ios: IntentSupportStatus;
  desktop: IntentSupportStatus;
  api: IntentSupportStatus;
  db: IntentSupportStatus;
}

export interface IntentCapabilityMatrix {
  schemaVersion: string;
  platforms: IntentPlatform[];
  capabilities: IntentCapabilityRow[];
}

// ── Parity report types ───────────────────────────────────────────────────────

export interface PlatformCoverage {
  platform: IntentPlatform;
  total: number;
  supported: number;
  partial: number;
  unsupported: number;
  coveragePct: number;
  adapter: string;
}

export interface IntentParityRow {
  intentId: string;
  label: string;
  category: string;
  description: string;
  platforms: Record<IntentPlatform, IntentSupportStatus>;
  adapters: Record<IntentPlatform, string>;
  nodeTypes: Record<IntentPlatform, string | null>;
  isUniversal: boolean;
  supportedOn: IntentPlatform[];
  partialOn: IntentPlatform[];
  unsupportedOn: IntentPlatform[];
}

export interface IntentParityReport {
  schemaVersion: string;
  generatedAt: string;
  platforms: IntentPlatform[];
  intents: IntentParityRow[];
  universalIntents: string[];
  gapIntents: string[];
  webApiOnly: string[];
  platformCoverage: PlatformCoverage[];
  overallCoveragePct: number;
}

export interface IntentParitySummary
  extends Pick<
    IntentParityReport,
    'platformCoverage' | 'overallCoveragePct' | 'universalIntents' | 'gapIntents' | 'webApiOnly' | 'generatedAt'
  > {}

// ── Runtime validator types ────────────────────────────────────────────────────

export type RuntimeReadinessLevel = 'ready' | 'configured' | 'partial' | 'unavailable';

export interface RuntimeStatus {
  platform: string;
  readiness: RuntimeReadinessLevel;
  serverUrl: string;
  serverReachable: boolean;
  diagnostics: string[];
  devices?: unknown[];
  missingEnv?: string[];
  suggestedCapabilities?: Record<string, unknown> | null;
}

export interface RuntimeValidationSummary {
  android: RuntimeStatus;
  ios: RuntimeStatus;
  desktop: RuntimeStatus;
  allReady: boolean;
  validatedAt: string;
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const intentKeys = {
  matrix: ['intents', 'capability-matrix'] as const,
  parityReport: ['intents', 'parity-report'] as const,
  paritySummary: ['intents', 'parity-report', 'summary'] as const,
  runtimeValidation: ['intents', 'runtime', 'validate'] as const,
  platformRuntime: (p: string) => ['intents', 'runtime', 'validate', p] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useIntentCapabilityMatrix() {
  return useQuery({
    queryKey: intentKeys.matrix,
    queryFn: () => api.get<IntentCapabilityMatrix>('/intent/capability-matrix'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useIntentParityReport() {
  return useQuery({
    queryKey: intentKeys.parityReport,
    queryFn: () => api.get<IntentParityReport>('/intent/parity-report'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useIntentParitySummary() {
  return useQuery({
    queryKey: intentKeys.paritySummary,
    queryFn: () => api.get<IntentParitySummary>('/intent/parity-report/summary'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useRuntimeValidation() {
  return useQuery({
    queryKey: intentKeys.runtimeValidation,
    queryFn: () => api.get<RuntimeValidationSummary>('/intent/runtime/validate'),
    staleTime: 15_000,
    retry: false,
  });
}

export function usePlatformRuntime(platform: 'android' | 'ios' | 'desktop') {
  return useQuery({
    queryKey: intentKeys.platformRuntime(platform),
    queryFn: () => api.get<RuntimeStatus>(`/intent/runtime/validate/${platform}`),
    staleTime: 15_000,
    retry: false,
  });
}

