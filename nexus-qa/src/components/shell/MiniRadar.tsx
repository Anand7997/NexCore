'use client';

import { useMemo } from 'react';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';

export function MiniRadar() {
  const events = useRealtimeStore((s) => s.events);
  const blips = useMemo(() => {
    const recent = events.slice(0, 10).filter((e) => e.severity === 'error' || e.severity === 'warn');
    const max = Math.min(3, recent.length);
    return Array.from({ length: max }, (_, i) => ({
      x: 20 + ((i * 23 + 7) % 60),
      y: 20 + ((i * 31 + 13) % 60),
      color: i === 0 ? '#06b6d4' : i === 1 ? '#a78bfa' : '#06b6d4',
    }));
  }, [events]);

  return (
    <div
      className="pointer-events-auto absolute bottom-5 right-5 z-10 grid h-[130px] w-[130px] place-items-center rounded-full"
      style={{
        border: '1px solid rgba(139,92,246,0.30)',
        background: 'radial-gradient(circle, rgba(6,182,212,0.08), transparent 70%), rgba(4,4,12,0.6)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 0 24px rgba(139,92,246,0.18), inset 0 0 24px rgba(139,92,246,0.06)',
      }}
      aria-label={`Radar — ${blips.length} detected`}
    >
      <span className="absolute inset-3 rounded-full border border-dashed" style={{ borderColor: 'rgba(139,92,246,0.20)' }} />
      <span className="absolute inset-[26px] rounded-full border" style={{ borderColor: 'rgba(139,92,246,0.15)' }} />

      {/* Rotating sweep */}
      <span
        data-mc-radar-sweep
        className="absolute"
        style={{
          top: '50%', left: '50%',
          width: '50%', height: '1.5px',
          background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.7), rgba(6,182,212,1))',
          transformOrigin: '0% 50%',
          animation: 'shell-radar-sweep 4s linear infinite',
          boxShadow: '0 0 8px rgba(6,182,212,0.6)',
          willChange: 'transform',
        }}
        aria-hidden
      />

      {/* Blips */}
      {blips.map((b, i) => (
        <span key={i} className="absolute h-[5px] w-[5px] rounded-full"
          style={{ top: `${b.y}%`, left: `${b.x}%`, background: b.color, boxShadow: `0 0 8px ${b.color}` }}
        />
      ))}

      <span className="absolute left-[6px] top-[6px] font-mono text-[8px]" style={{ color: '#06b6d4', letterSpacing: '0.18em' }}>▸ RADAR</span>
      <span className="absolute bottom-[6px] right-[6px] font-mono text-[8px]" style={{ color: '#a78bfa' }}>{blips.length} det</span>
    </div>
  );
}
