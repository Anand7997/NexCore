'use client';

import { ReactNode } from 'react';

interface ViewportChromeProps {
  children: ReactNode;
}

export function ViewportChrome({ children }: ViewportChromeProps) {
  return (
    <div
      className="relative h-full overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 50% 30% at 50% 0%, rgba(139,92,246,0.10), transparent 70%),' +
          'radial-gradient(ellipse 40% 20% at 80% 100%, rgba(6,182,212,0.06), transparent 70%),' +
          'linear-gradient(180deg, #060611 0%, #02020a 100%)',
      }}
    >
      <span aria-hidden className="mc-hex-floor pointer-events-none absolute inset-0" />

      {/* Edge tick rails */}
      <div className="pointer-events-none absolute left-1 top-[20%] bottom-[20%] flex w-[14px] flex-col items-start justify-around">
        {[0,1,2,3,4,5,6].map((i) => (
          <span key={i} className={`mc-rail-tick${i % 3 === 1 ? ' long' : ''}`} />
        ))}
      </div>
      <div className="pointer-events-none absolute right-1 top-[20%] bottom-[20%] flex w-[14px] flex-col items-end justify-around">
        {[0,1,2,3,4,5,6].map((i) => (
          <span key={i} className={`mc-rail-tick${i % 3 === 2 ? ' long' : ''}`} />
        ))}
      </div>

      {/* Particles */}
      <div className="pointer-events-none absolute inset-0">
        <span className="mc-particle" style={{ left: '12%', top: '78%', animationDelay: '0s' }} />
        <span className="mc-particle cyan" style={{ left: '28%', top: '70%', animationDelay: '1.2s' }} />
        <span className="mc-particle" style={{ left: '50%', top: '88%', animationDelay: '2.4s' }} />
        <span className="mc-particle cyan" style={{ left: '72%', top: '70%', animationDelay: '3.6s' }} />
        <span className="mc-particle" style={{ left: '88%', top: '82%', animationDelay: '4.8s' }} />
      </div>

      {/* Page content */}
      <div className="relative z-[2] h-full overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
