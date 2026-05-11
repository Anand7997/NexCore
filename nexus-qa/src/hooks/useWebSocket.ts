'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useExecutionStore } from '@/lib/stores/executionStore';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';
import { useUIStore } from '@/lib/stores/uiStore';
import { useExecutionStreamStore } from '@/lib/stores/executionStreamStore';
import type { RealtimeEvent, RealtimeEventType, LogEntry } from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000/ws';

let clientId: string | null = null;

function mapBackendEventType(type: string): RealtimeEventType {
  const map: Record<string, RealtimeEventType> = {
    // Existing
    execution_started: 'execution_started',
    execution_completed: 'execution_completed',
    execution_failed: 'execution_failed',
    node_started: 'node_started',
    node_completed: 'node_completed',
    node_failed: 'node_completed',
    ai_insight_generated: 'ai_insight_generated',
    terminal_line: 'log_added',
    execution_cancelled: 'execution_failed',
    // Backend dataclass names (from event.to_dict() type field)
    ExecutionStarted:   'execution_started',
    ExecutionCompleted: 'execution_completed',
    ExecutionFailed:    'execution_failed',
    ExecutionCancelled: 'execution_failed',
    NodeStarted:        'node_started',
    NodeCompleted:      'node_completed',
    NodeFailed:         'node_completed',
    NodeRetrying:       'execution_progress',
    NodeSkipped:        'execution_progress',
    TerminalLog:        'log_added',
    BrowserAction:      'execution_progress',
    ApiCall:            'execution_progress',
    ArtifactCaptured:   'execution_progress',
    VariableSet:        'execution_progress',
  };
  return (map[type] ?? 'execution_progress') as RealtimeEventType;
}

function severityFromType(type: string): RealtimeEvent['severity'] {
  if (type.includes('failed') || type.includes('error')) return 'error';
  if (type.includes('completed') || type.includes('success')) return 'success';
  if (type.includes('retrying') || type.includes('warn')) return 'warn';
  return 'info';
}

// Singleton WebSocket — survives React re-renders, shared across the app
let sharedSocket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let refCount = 0;

function getSocket(onMessage: (data: unknown) => void): WebSocket {
  if (sharedSocket && sharedSocket.readyState <= WebSocket.OPEN) {
    return sharedSocket;
  }
  sharedSocket = new WebSocket(WS_URL);
  sharedSocket.onmessage = (evt) => {
    try { onMessage(JSON.parse(evt.data)); } catch { /* ignore malformed */ }
  };
  sharedSocket.onclose = () => {
    sharedSocket = null;
    if (refCount > 0) {
      reconnectTimer = setTimeout(() => getSocket(onMessage), 3000);
    }
  };
  return sharedSocket;
}

export function useWebSocket(subscribeToExecution?: string | null) {
  const onMessageRef = useRef<(data: unknown) => void>(() => {});

  const handleMessage = useCallback((raw: unknown) => {
    const msg = raw as Record<string, unknown>;
    // Backend sends `event` (class name) at top level, alongside all dataclass
    // fields (execution_id, node_id, …). Legacy `type` is kept for compatibility.
    const type = (msg.event as string) ?? (msg.type as string);

    if (type === 'connected') {
      clientId = msg.client_id as string;
      return;
    }
    if (type === 'pong' || type === 'heartbeat' || type === 'subscribed') return;

    // Domain fields live at the root of the WS message now.
    const root = msg as Record<string, unknown>;
    const payload = (root.payload as Record<string, unknown>) ?? {};
    const execId = (root.execution_id as string | undefined);
    const nodeId = (root.node_id as string | undefined);
    const workflowName = root.workflow_name as string | undefined;

    const realtimeEvent: RealtimeEvent = {
      id: (root.id as string) ?? crypto.randomUUID(),
      timestamp: (root.timestamp as string) ?? new Date().toISOString(),
      type: mapBackendEventType(type),
      executionId: execId,
      workflowName,
      payload: { ...payload, ...root },
      severity: severityFromType(type),
    };

    useRealtimeStore.getState().addEvent(realtimeEvent);

    // ── Active node tracking ─────────────────────────────────────────────
    if (
      type === 'NodeStarted' || type === 'NodeCompleted' || type === 'NodeFailed' ||
      type === 'NodeRetrying' || type === 'BrowserAction' || type === 'ApiCall' ||
      type === 'node_started' || type === 'node_completed' || type === 'node_failed'
    ) {
      if (execId && nodeId) useRealtimeStore.getState().setActiveNode(execId, nodeId);
    }

    if (
      type === 'ExecutionCompleted' || type === 'ExecutionFailed' || type === 'ExecutionCancelled' ||
      type === 'execution_completed' || type === 'execution_failed' || type === 'execution_cancelled'
    ) {
      if (execId) {
        const status = type === 'ExecutionCompleted' || type === 'execution_completed' ? 'success' : 'failed';
        useExecutionStore.getState().updateExecutionStatus(execId, status as never);
      }
    }

    // ── Terminal log lines (xterm.js stream) ────────────────────────────
    if (type === 'TerminalLog' || type === 'terminal_line') {
      const message = (root.message as string) ?? (payload.line as string) ?? '';
      const level = (root.level as string) ?? 'info';
      const log: LogEntry = {
        id: crypto.randomUUID(),
        timestamp: realtimeEvent.timestamp,
        level: (level as LogEntry['level']) ?? 'info',
        message,
        source: (root.source as string) ?? (root.node_id as string) ?? 'engine',
        executionId: execId,
      };
      useExecutionStore.getState().addLog(log);
    }

    // ── Plugin-emitted execution-evidence events ────────────────────────
    const stream = useExecutionStreamStore.getState();
    if (type === 'BrowserAction' && execId && nodeId) {
      stream.addBrowserAction({
        id: realtimeEvent.id,
        executionId: execId,
        nodeId,
        action: (root.action as string) ?? 'unknown',
        selector: root.selector as string | null | undefined,
        url: root.url as string | null | undefined,
        durationMs: (root.duration_ms as number) ?? 0,
        metadata: (root.metadata as Record<string, unknown>) ?? {},
        timestamp: realtimeEvent.timestamp,
      });
    }
    if (type === 'ApiCall' && execId && nodeId) {
      stream.addApiCall({
        id: realtimeEvent.id,
        executionId: execId,
        nodeId,
        method: (root.method as string) ?? 'GET',
        url: (root.url as string) ?? '',
        statusCode: (root.status_code as number | null | undefined),
        durationMs: (root.duration_ms as number) ?? 0,
        requestSize: (root.request_size as number) ?? 0,
        responseSize: (root.response_size as number) ?? 0,
        error: root.error as string | null | undefined,
        timestamp: realtimeEvent.timestamp,
      });
    }
    if (type === 'ArtifactCaptured' && execId) {
      stream.addArtifact({
        id: realtimeEvent.id,
        executionId: execId,
        nodeId: nodeId ?? null,
        artifactId: (root.artifact_id as string) ?? '',
        kind: (root.kind as string) ?? 'binary',
        name: (root.name as string) ?? 'artifact',
        contentType: (root.content_type as string) ?? 'application/octet-stream',
        sizeBytes: (root.size_bytes as number) ?? 0,
        metadata: (root.metadata as Record<string, unknown>) ?? {},
        timestamp: realtimeEvent.timestamp,
      });
    }
    if (type === 'VariableSet' && execId) {
      stream.addVariableUpdate({
        id: realtimeEvent.id,
        executionId: execId,
        nodeId: nodeId ?? null,
        variables: (root.variables as Record<string, unknown>) ?? {},
        timestamp: realtimeEvent.timestamp,
      });
    }

    // ── Notifications for important events ──────────────────────────────
    if (
      type === 'ExecutionCompleted' || type === 'ExecutionFailed' ||
      type === 'execution_completed' || type === 'execution_failed'
    ) {
      const isSuccess = type === 'ExecutionCompleted' || type === 'execution_completed';
      useUIStore.getState().addNotification({
        title: isSuccess ? 'Execution Complete' : 'Execution Failed',
        message: `${workflowName ?? execId ?? 'Execution'} ${isSuccess ? 'completed successfully' : 'failed'}`,
        severity: isSuccess ? 'success' : 'error',
        executionId: execId,
      });
    }
  }, []);

  useEffect(() => { onMessageRef.current = handleMessage; });

  useEffect(() => {
    refCount++;
    const sock = getSocket((data) => onMessageRef.current(data));

    const sendWhenReady = (msg: object) => {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify(msg));
      } else {
        sock.addEventListener('open', () => sock.send(JSON.stringify(msg)), { once: true });
      }
    };

    if (subscribeToExecution) {
      sendWhenReady({ action: 'subscribe', execution_id: subscribeToExecution });
    }

    return () => {
      refCount--;
      if (subscribeToExecution) {
        try { sock.send(JSON.stringify({ action: 'unsubscribe', execution_id: subscribeToExecution })); } catch { /* ignore */ }
      }
      if (refCount === 0) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        sock.close();
        sharedSocket = null;
      }
    };
  }, [subscribeToExecution]);

  const send = useCallback((msg: object) => {
    if (sharedSocket?.readyState === WebSocket.OPEN) {
      sharedSocket.send(JSON.stringify(msg));
    }
  }, []);

  return { send, clientId };
}
