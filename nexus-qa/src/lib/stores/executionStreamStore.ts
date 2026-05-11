'use client';
import { create } from 'zustand';

/**
 * Live stream of plugin-emitted events for the active execution monitor.
 * Separate from the global RealtimeEvent store so the evidence panel can
 * filter/subscribe without re-rendering on unrelated events.
 *
 * Events are bucketed per executionId. Buckets are pruned when an execution
 * is no longer being watched (UI calls `clearExecution`).
 */

export interface BrowserActionEvent {
  id: string;
  executionId: string;
  nodeId: string;
  action: string;
  selector?: string | null;
  url?: string | null;
  durationMs: number;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface ApiCallEvent {
  id: string;
  executionId: string;
  nodeId: string;
  method: string;
  url: string;
  statusCode?: number | null;
  durationMs: number;
  requestSize: number;
  responseSize: number;
  error?: string | null;
  timestamp: string;
}

export interface ArtifactEvent {
  id: string;
  executionId: string;
  nodeId?: string | null;
  artifactId: string;
  kind: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface VariableUpdate {
  id: string;
  executionId: string;
  nodeId?: string | null;
  variables: Record<string, unknown>;
  timestamp: string;
}

interface Bucket {
  browserActions: BrowserActionEvent[];
  apiCalls: ApiCallEvent[];
  artifacts: ArtifactEvent[];
  variables: VariableUpdate[];
  context: Record<string, unknown>; // accumulated shared context
}

const emptyBucket = (): Bucket => ({
  browserActions: [],
  apiCalls: [],
  artifacts: [],
  variables: [],
  context: {},
});

interface ExecutionStreamStore {
  buckets: Record<string, Bucket>;

  addBrowserAction: (e: BrowserActionEvent) => void;
  addApiCall:       (e: ApiCallEvent) => void;
  addArtifact:      (e: ArtifactEvent) => void;
  addVariableUpdate:(e: VariableUpdate) => void;
  clearExecution:   (executionId: string) => void;
  clearAll:         () => void;
}

const MAX_PER_BUCKET = 200;

const cap = <T,>(arr: T[]): T[] =>
  arr.length > MAX_PER_BUCKET ? arr.slice(arr.length - MAX_PER_BUCKET) : arr;

export const useExecutionStreamStore = create<ExecutionStreamStore>((set) => ({
  buckets: {},

  addBrowserAction: (e) =>
    set((s) => {
      const b = s.buckets[e.executionId] ?? emptyBucket();
      return {
        buckets: {
          ...s.buckets,
          [e.executionId]: { ...b, browserActions: cap([...b.browserActions, e]) },
        },
      };
    }),

  addApiCall: (e) =>
    set((s) => {
      const b = s.buckets[e.executionId] ?? emptyBucket();
      return {
        buckets: {
          ...s.buckets,
          [e.executionId]: { ...b, apiCalls: cap([...b.apiCalls, e]) },
        },
      };
    }),

  addArtifact: (e) =>
    set((s) => {
      const b = s.buckets[e.executionId] ?? emptyBucket();
      return {
        buckets: {
          ...s.buckets,
          [e.executionId]: { ...b, artifacts: cap([...b.artifacts, e]) },
        },
      };
    }),

  addVariableUpdate: (e) =>
    set((s) => {
      const b = s.buckets[e.executionId] ?? emptyBucket();
      return {
        buckets: {
          ...s.buckets,
          [e.executionId]: {
            ...b,
            variables: cap([...b.variables, e]),
            context: { ...b.context, ...e.variables },
          },
        },
      };
    }),

  clearExecution: (executionId) =>
    set((s) => {
      const next = { ...s.buckets };
      delete next[executionId];
      return { buckets: next };
    }),

  clearAll: () => set({ buckets: {} }),
}));

export const selectBucket = (executionId: string | null | undefined) =>
  (state: ExecutionStreamStore): Bucket =>
    (executionId ? state.buckets[executionId] : undefined) ?? emptyBucket();
