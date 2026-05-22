'use client';

import { ReactNode } from 'react';
import { CornerBrackets } from './primitives/CornerBrackets';

interface AppFrameProps {
  sidebar: ReactNode;
  topbar: ReactNode;
  telemetry: ReactNode;
  viewport: ReactNode;
  rightPanel?: ReactNode;
  statusStrip: ReactNode;
  pulseRail: ReactNode;
}

export function AppFrame({
  sidebar, topbar, telemetry, viewport, rightPanel, statusStrip, pulseRail,
}: AppFrameProps) {
  const rightPresent = rightPanel != null;
  const shellScale = 0.9;

  return (
    <div className="h-screen w-screen overflow-hidden" style={{ background: '#02020a' }}>
      <div
        className="relative grid overflow-hidden"
        style={{
          width: `calc(100vw / ${shellScale})`,
          height: `calc(100vh / ${shellScale})`,
          transform: `scale(${shellScale})`,
          transformOrigin: 'top left',
          background: '#02020a',
          gridTemplateColumns: rightPresent
            ? 'var(--shell-sidebar-w) 1fr var(--shell-rightpanel-w)'
            : 'var(--shell-sidebar-w) 1fr',
          gridTemplateRows:
            'var(--shell-topbar-h2) var(--shell-telemetry-h) 1fr var(--shell-statusstrip-h) var(--shell-pulserail-h)',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-0 z-[60] h-[2px]"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(139,92,246,0.55) 25%, rgba(6,182,212,0.50) 50%, rgba(139,92,246,0.55) 75%, transparent)',
          }}
        />

        <CornerBrackets />
        <span aria-hidden className="mc-scanline" />

        <div style={{ gridColumn: 1, gridRow: '1 / -1', position: 'relative', zIndex: 10 }}>
          {sidebar}
        </div>

        <div style={{ gridColumn: rightPresent ? '2 / 4' : '2 / 3', gridRow: 1, position: 'relative', zIndex: 9 }}>
          {topbar}
        </div>

        <div style={{ gridColumn: rightPresent ? '2 / 4' : '2 / 3', gridRow: 2, position: 'relative', zIndex: 8 }}>
          {telemetry}
        </div>

        <div style={{ gridColumn: 2, gridRow: 3, position: 'relative', overflow: 'hidden', zIndex: 5 }}>
          {viewport}
        </div>

        {rightPresent && (
          <div style={{ gridColumn: 3, gridRow: 3, position: 'relative', zIndex: 6, overflow: 'hidden' }}>
            {rightPanel}
          </div>
        )}

        <div style={{ gridColumn: rightPresent ? '2 / 4' : '2 / 3', gridRow: 4, position: 'relative', zIndex: 7 }}>
          {statusStrip}
        </div>

        <div style={{ gridColumn: '1 / -1', gridRow: 5, position: 'relative', zIndex: 7 }}>
          {pulseRail}
        </div>
      </div>
    </div>
  );
}
