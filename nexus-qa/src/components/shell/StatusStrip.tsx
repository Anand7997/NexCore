'use client';

import { useUIStore } from '@/lib/stores/uiStore';
import { Waveform } from './primitives/Waveform';

export function StatusStrip() {
  const { toggleTerminal } = useUIStore();
  return (
    <div
      className="flex h-full items-center gap-3 px-4"
      style={{
        background: 'linear-gradient(180deg, rgba(8,8,20,0.95), rgba(2,2,8,1))',
        borderTop: '1px solid rgba(139,92,246,0.20)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: '#8f90a0',
      }}
    >
      <Service label="SYS"    value="ONLINE"     tone="ok" />
      <Sep />
      <Service label="DB"     value="PG·12ms"    tone="ok" />
      <Sep />
      <Service label="CACHE"  value="REDIS·96%"  tone="ok" />
      <Sep />
      <Service label="VECTOR" value="QDRANT"     tone="ok" />
      <Sep />
      <Service label="QUEUE"  value="014"        tone="neutral" />
      <Sep />
      <Service label="WS"     value="142 CLIENTS" tone="ok" />
      <Sep />
      <div className="flex items-center gap-2">
        <span style={{ color: '#6b6c7a', letterSpacing: '0.10em', fontSize: 9 }}>PULSE</span>
        <div style={{ width: 80 }}>
          <Waveform width={80} height={12} segments={6} />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span><span style={{ color: '#6b6c7a' }}>BUILD</span> <span style={{ color: '#c4b5fd' }}>2.0.7</span></span>
        <Sep />
        <button onClick={toggleTerminal} className="flex items-center gap-1 transition-colors hover:text-violet-300">
          <span>▸</span><span style={{ color: '#c4b5fd' }}>Terminal · ⌃`</span>
        </button>
      </div>
    </div>
  );
}

function Service({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'err' | 'neutral' }) {
  const color = tone === 'ok' ? '#10b981' : tone === 'warn' ? '#f59e0b' : tone === 'err' ? '#ef4444' : '#c4b5fd';
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: '#6b6c7a', letterSpacing: '0.10em', fontSize: 9 }}>{label}</span>
      <span style={{ color }}>{tone === 'ok' ? '● ' : ''}{value}</span>
    </div>
  );
}

function Sep() {
  return <span style={{ color: 'rgba(139,92,246,0.25)' }}>│</span>;
}
