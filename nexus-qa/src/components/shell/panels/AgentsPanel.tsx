'use client';

const AGENTS = [
  { id: 'agent-01', role: 'web',    load: 72, status: 'ok' as const },
  { id: 'agent-02', role: 'api',    load: 48, status: 'ok' as const },
  { id: 'agent-03', role: 'mobile', load: 92, status: 'warn' as const },
];

export function AgentsPanel() {
  return (
    <div className="space-y-2 p-4">
      <div className="mb-3 font-mono text-[9px]" style={{ color: '#6b6c7a', letterSpacing: '0.16em' }}>▸ AGENTS · LIVE</div>
      {AGENTS.map((a) => {
        const dotColor = a.status === 'ok' ? '#10b981' : '#f59e0b';
        const fillColor = a.load >= 90 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #10b981, #06b6d4)';
        return (
          <div key={a.id} className="flex items-center gap-3 rounded-lg border px-2 py-2"
            style={{ background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.15)' }}
          >
            <span className="h-[6px] w-[6px] rounded-full" style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
            <div className="flex-1 text-[11px]" style={{ color: '#e7e7ee' }}>{a.id} · <span style={{ color: '#8f90a0' }}>{a.role}</span></div>
            <div className="h-[3px] w-[30px] overflow-hidden rounded-full" style={{ background: 'rgba(139,92,246,0.20)' }}>
              <div className="h-full" style={{ width: `${a.load}%`, background: fillColor }} />
            </div>
            <span className="font-mono text-[10px]" style={{ color: '#a78bfa' }}>{a.load}%</span>
          </div>
        );
      })}
    </div>
  );
}
