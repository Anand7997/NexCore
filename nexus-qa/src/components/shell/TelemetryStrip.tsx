'use client';

import { useTelemetry } from '@/lib/shell/useTelemetry';
import { Sparkline } from './primitives/Sparkline';

export function TelemetryStrip() {
  const { snapshot, series } = useTelemetry();

  const cells = [
    { label: 'CPU',  value: `${Math.round(snapshot.cpu)}%`,             data: series.cpu,     color: '#06b6d4', tone: 'ok' as const },
    { label: 'MEM',  value: `${snapshot.mem.toFixed(1)}GB`,             data: series.mem,     color: '#a78bfa', tone: 'ok' as const },
    { label: 'P95',  value: `${Math.round(snapshot.p95)}ms`,            data: series.p95,     color: '#10b981', tone: snapshot.p95 > 220 ? 'warn' as const : 'ok' as const },
    { label: 'ERR',  value: `${snapshot.errRate.toFixed(2)}%`,          data: series.errRate, color: '#f59e0b', tone: snapshot.errRate > 1 ? 'warn' as const : 'ok' as const },
    { label: 'RPS',  value: `${Math.round(snapshot.rps)}`,              data: series.rps,     color: '#06b6d4', tone: 'ok' as const },
  ];

  return (
    <div
      className="flex h-full items-center gap-3 overflow-hidden px-4"
      style={{
        background: 'linear-gradient(180deg, rgba(4,4,12,0.95), rgba(2,2,8,1))',
        borderBottom: '1px solid rgba(139,92,246,0.10)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
      }}
    >
      {cells.map((c, i) => (
        <div key={c.label} className="flex items-center gap-2">
          <span style={{ color: '#6b6c7a', letterSpacing: '0.14em', fontSize: 9 }}>{c.label}</span>
          <span style={{ color: c.tone === 'warn' ? '#f59e0b' : '#fff', fontWeight: 600, fontSize: 11 }}>{c.value}</span>
          <Sparkline data={c.data} color={c.color} ariaLabel={`${c.label} sparkline`} />
          {i < cells.length - 1 && (
            <span aria-hidden className="ml-1 h-3 w-px" style={{ background: 'linear-gradient(180deg, transparent, rgba(139,92,246,0.30), transparent)' }} />
          )}
        </div>
      ))}
      <div className="ml-auto flex items-center gap-3">
        {snapshot.runId && (
          <div className="flex items-center gap-2">
            <span style={{ color: '#6b6c7a', letterSpacing: '0.14em', fontSize: 9 }}>RUN</span>
            <span style={{ color: '#c4b5fd', fontSize: 10 }}>{snapshot.runId.slice(0, 10)}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span style={{ color: '#6b6c7a', letterSpacing: '0.14em', fontSize: 9 }}>SHARD</span>
          <span style={{ color: '#c4b5fd', fontSize: 10 }}>{snapshot.shard}</span>
        </div>
      </div>
    </div>
  );
}
