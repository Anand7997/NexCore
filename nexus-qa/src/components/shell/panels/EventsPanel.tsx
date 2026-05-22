'use client';

import { useRealtimeStore } from '@/lib/stores/realtimeStore';

const SEVERITY_COLOR: Record<string, string> = {
  success: '#10b981',
  warn:    '#f59e0b',
  error:   '#ef4444',
  info:    '#a78bfa',
};

function eventTitle(type: string): string {
  switch (type) {
    case 'execution_started':   return 'Execution started';
    case 'execution_completed': return 'Execution completed';
    case 'execution_failed':    return 'Execution failed';
    case 'execution_cancelled': return 'Execution cancelled';
    case 'node_started':        return 'Node started';
    case 'node_completed':      return 'Node completed';
    case 'node_failed':         return 'Node failed';
    case 'log_added':           return 'Log entry';
    default:                    return type.replace(/_/g, ' ');
  }
}

export function EventsPanel() {
  const events = useRealtimeStore((s) => s.events).slice(0, 24);

  return (
    <div className="space-y-1 p-3">
      <div className="mb-2 px-1 font-mono text-[9px]" style={{ color: '#6b6c7a', letterSpacing: '0.16em' }}>▸ RECENT EVENTS</div>
      {events.length === 0 && (
        <div className="rounded-md border px-3 py-4 text-center text-[11px]"
          style={{ background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.12)', color: '#6b6c7a' }}
        >
          No events yet — they appear here in real time.
        </div>
      )}
      {events.map((ev) => {
        const color = SEVERITY_COLOR[ev.severity ?? 'info'] ?? '#a78bfa';
        const title = eventTitle(ev.type);
        const detail = ev.executionId ?? (ev.payload && typeof ev.payload === 'object' ? (ev.payload as { message?: string }).message : undefined);
        return (
          <div key={ev.id} className="flex items-start gap-3 rounded px-2 py-2"
            style={{ background: 'rgba(139,92,246,0.03)', borderLeft: `2px solid ${color}` }}
          >
            <span className="min-w-[50px] font-mono text-[9px]" style={{ color: '#6b6c7a' }}>
              {new Date(ev.timestamp).toLocaleTimeString([], { hour12: false }).slice(0, 8)}
            </span>
            <div className="flex-1 text-[11px]" style={{ color: '#e7e7ee' }}>
              {title}
              {detail ? <><br/><span style={{ fontSize: 9, color: '#8f90a0' }}>{String(detail)}</span></> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
