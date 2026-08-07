import { useEffect, useMemo, useState } from 'react';
import { getAdvancedWebSocketUrl } from '@/lib/advanced-api/client';

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

export interface TerminalLog {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  source: string;
}

export interface ExecutionLiveBucket {
  browserActions: BrowserActionEvent[];
  apiCalls: ApiCallEvent[];
  artifacts: ArtifactEvent[];
  variables: VariableUpdate[];
  context: Record<string, unknown>;
}

const EMPTY_BUCKET: ExecutionLiveBucket = {
  browserActions: [],
  apiCalls: [],
  artifacts: [],
  variables: [],
  context: {},
};

const MAX_ITEMS = 200;

function cap<T>(items: T[]): T[] {
  return items.length > MAX_ITEMS ? items.slice(items.length - MAX_ITEMS) : items;
}

function normalizeEventType(type: string): string {
  const map: Record<string, string> = {
    ExecutionStarted: 'execution_started',
    ExecutionCompleted: 'execution_completed',
    ExecutionFailed: 'execution_failed',
    ExecutionCancelled: 'execution_cancelled',
    NodeStarted: 'node_started',
    NodeCompleted: 'node_completed',
    NodeFailed: 'node_failed',
    NodeRetrying: 'execution_progress',
    NodeSkipped: 'execution_progress',
    TerminalLog: 'terminal_line',
    BrowserAction: 'browser_action',
    ApiCall: 'api_call',
    ArtifactCaptured: 'artifact_captured',
    VariableSet: 'variable_set',
  };

  return map[type] ?? type;
}

export function useExecutionLiveStream(executionId: string | null) {
  const [bucket, setBucket] = useState<ExecutionLiveBucket>(EMPTY_BUCKET);
  const [logs, setLogs] = useState<TerminalLog[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setBucket(EMPTY_BUCKET);
    setLogs([]);
    setActiveNodeId(null);

    if (!executionId) {
      setConnected(false);
      return undefined;
    }

    const socket = new WebSocket(getAdvancedWebSocketUrl());

    socket.onopen = () => {
      setConnected(true);
      socket.send(JSON.stringify({ action: 'subscribe', execution_id: executionId }));
    };

    socket.onclose = () => {
      setConnected(false);
    };

    socket.onmessage = (event) => {
      let message: Record<string, unknown>;

      try {
        message = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        return;
      }

      const currentExecutionId = message.execution_id as string | undefined;
      if (currentExecutionId && currentExecutionId !== executionId) {
        return;
      }

      const type = normalizeEventType(String(message.event ?? message.type ?? ''));
      const timestamp = String(message.timestamp ?? new Date().toISOString());
      const nodeId = (message.node_id as string | undefined) ?? null;
      const payload = (message.payload as Record<string, unknown>) ?? {};

      if (nodeId && ['node_started', 'node_completed', 'node_failed', 'execution_progress', 'browser_action', 'api_call'].includes(type)) {
        setActiveNodeId(nodeId);
      }

      if (type === 'terminal_line') {
        setLogs((current) =>
          cap([
            ...current,
            {
              id: crypto.randomUUID(),
              timestamp,
              level: String(message.level ?? 'info'),
              message: String(message.message ?? payload.line ?? ''),
              source: String(message.source ?? message.node_id ?? 'engine'),
            },
          ]),
        );
        return;
      }

      if (type === 'browser_action' && nodeId) {
        setBucket((current) => ({
          ...current,
          browserActions: cap([
            ...current.browserActions,
            {
              id: String(message.id ?? crypto.randomUUID()),
              executionId,
              nodeId,
              action: String(message.action ?? 'unknown'),
              selector: (message.selector as string | null | undefined) ?? null,
              url: (message.url as string | null | undefined) ?? null,
              durationMs: Number(message.duration_ms ?? 0),
              metadata: (message.metadata as Record<string, unknown>) ?? {},
              timestamp,
            },
          ]),
        }));
        return;
      }

      if (type === 'api_call' && nodeId) {
        setBucket((current) => ({
          ...current,
          apiCalls: cap([
            ...current.apiCalls,
            {
              id: String(message.id ?? crypto.randomUUID()),
              executionId,
              nodeId,
              method: String(message.method ?? 'GET'),
              url: String(message.url ?? ''),
              statusCode: (message.status_code as number | null | undefined) ?? null,
              durationMs: Number(message.duration_ms ?? 0),
              requestSize: Number(message.request_size ?? 0),
              responseSize: Number(message.response_size ?? 0),
              error: (message.error as string | null | undefined) ?? null,
              timestamp,
            },
          ]),
        }));
        return;
      }

      if (type === 'artifact_captured') {
        setBucket((current) => ({
          ...current,
          artifacts: cap([
            ...current.artifacts,
            {
              id: String(message.id ?? crypto.randomUUID()),
              executionId,
              nodeId,
              artifactId: String(message.artifact_id ?? ''),
              kind: String(message.kind ?? 'binary'),
              name: String(message.name ?? 'artifact'),
              contentType: String(message.content_type ?? 'application/octet-stream'),
              sizeBytes: Number(message.size_bytes ?? 0),
              metadata: (message.metadata as Record<string, unknown>) ?? {},
              timestamp,
            },
          ]),
        }));
        return;
      }

      if (type === 'variable_set') {
        const variables = (message.variables as Record<string, unknown>) ?? {};
        setBucket((current) => ({
          ...current,
          variables: cap([
            ...current.variables,
            {
              id: String(message.id ?? crypto.randomUUID()),
              executionId,
              nodeId,
              variables,
              timestamp,
            },
          ]),
          context: { ...current.context, ...variables },
        }));
      }
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'unsubscribe', execution_id: executionId }));
      }
      socket.close();
    };
  }, [executionId]);

  return useMemo(
    () => ({
      bucket,
      logs,
      activeNodeId,
      connected,
    }),
    [activeNodeId, bucket, connected, logs],
  );
}
