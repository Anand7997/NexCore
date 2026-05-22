'use client';

import { Waveform } from './primitives/Waveform';

export function PulseRail() {
  return (
    <div
      className="flex h-full items-center gap-3 px-4"
      style={{
        background: '#02020a',
        borderTop: '1px solid rgba(139,92,246,0.18)',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#a78bfa', letterSpacing: '0.18em' }}>PULSE.AUX</span>
      <div className="flex-1">
        <Waveform width={1200} height={12} segments={32} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#a78bfa' }}>∿ 142Hz</span>
    </div>
  );
}
