'use client';

import { useMemo } from 'react';

interface WaveformProps {
  width?: number;
  height?: number;
  color?: string;
  segments?: number;
  className?: string;
}

/**
 * Static EKG-style waveform pattern, repeated 2x and animated by CSS translation.
 * Lightweight — no per-frame JS.
 */
export function Waveform({
  width = 600,
  height = 14,
  color = '#06b6d4',
  segments = 16,
  className,
}: WaveformProps) {
  const path = useMemo(() => {
    const baseline = height / 2;
    const segW = width / segments;
    const parts: string[] = [`M0 ${baseline}`];
    for (let i = 0; i < segments; i++) {
      const x0 = i * segW;
      parts.push(
        `L${(x0 + segW * 0.3).toFixed(1)} ${baseline}`,
        `L${(x0 + segW * 0.4).toFixed(1)} ${baseline + 4}`,
        `L${(x0 + segW * 0.55).toFixed(1)} ${baseline - 5}`,
        `L${(x0 + segW * 0.7).toFixed(1)} ${baseline}`,
        `L${(x0 + segW).toFixed(1)} ${baseline}`,
      );
    }
    return parts.join(' ');
  }, [width, height, segments]);

  // Build doubled path for seamless loop
  const doubledPath = useMemo(() => {
    const baseline = height / 2;
    const segW = width / segments;
    const parts: string[] = [];
    for (let i = 0; i < segments * 2; i++) {
      const x0 = i * segW;
      if (i === 0) parts.push(`M${x0} ${baseline}`);
      parts.push(
        `L${(x0 + segW * 0.3).toFixed(1)} ${baseline}`,
        `L${(x0 + segW * 0.4).toFixed(1)} ${baseline + 4}`,
        `L${(x0 + segW * 0.55).toFixed(1)} ${baseline - 5}`,
        `L${(x0 + segW * 0.7).toFixed(1)} ${baseline}`,
        `L${(x0 + segW).toFixed(1)} ${baseline}`,
      );
    }
    return parts.join(' ');
  }, [width, height, segments]);

  // Reference path to ensure used (prevents lint noise)
  void path;

  return (
    <div
      className={className}
      data-mc-pulse-wave
      style={{
        height,
        overflow: 'hidden',
        width: '100%',
        position: 'relative',
      }}
    >
      <svg
        width={width * 2}
        height={height}
        viewBox={`0 0 ${width * 2} ${height}`}
        style={{
          display: 'block',
          animation: 'shell-pulse-wave 8s linear infinite',
          willChange: 'transform',
        }}
      >
        <path d={doubledPath} fill="none" stroke={color} strokeWidth={1.2} />
      </svg>
    </div>
  );
}
