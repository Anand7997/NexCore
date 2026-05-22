'use client';

import { useTelemetry } from '@/lib/shell/useTelemetry';
import { Sparkline } from '../primitives/Sparkline';

export function TelemetryPanel() {
  const { snapshot, series } = useTelemetry();
  const rows = [
    { label: 'CPU',    value: `${Math.round(snapshot.cpu)}%`,    color: '#06b6d4', data: series.cpu },
    { label: 'MEM',    value: `${snapshot.mem.toFixed(2)} GB`,   color: '#a78bfa', data: series.mem },
    { label: 'P95',    value: `${Math.round(snapshot.p95)} ms`,  color: '#10b981', data: series.p95 },
    { label: 'ERR',    value: `${snapshot.errRate.toFixed(2)}%`, color: '#f59e0b', data: series.errRate },
    { label: 'RPS',    value: `${Math.round(snapshot.rps)}`,     color: '#06b6d4', data: series.rps },
    { label: 'UPTIME', value: `${snapshot.uptime}%`,             color: '#10b981', data: [] as number[] },
  ];

  return (
    <div className="space-y-3 p-4">
      <div className="font-mono text-[9px]" style={{ color: '#6b6c7a', letterSpacing: '0.16em' }}>▸ TELEMETRY · LIVE</div>
      {rows.map((r) => (
        <div key={r.label} className="rounded-lg border p-3"
          style={{ background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.15)' }}
        >
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[9px]" style={{ color: '#6b6c7a', letterSpacing: '0.14em' }}>{r.label}</span>
            <span className="text-[18px] font-semibold text-white">{r.value}</span>
          </div>
          {r.data.length > 0 && (
            <div className="mt-2">
              <Sparkline data={r.data} color={r.color} width={260} height={28} fill />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
