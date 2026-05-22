'use client';

import { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  ariaLabel?: string;
}

export function Sparkline({
  data,
  width = 60,
  height = 16,
  color = '#06b6d4',
  fill = false,
  ariaLabel,
}: SparklineProps) {
  const path = useMemo(() => {
    if (data.length === 0) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / Math.max(data.length - 1, 1);
    return data
      .map((v, i) => {
        const x = i * stepX;
        const y = height - ((v - min) / range) * (height - 2) - 1;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data, width, height]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {fill && (
        <path
          d={`${path} L${width} ${height} L0 ${height} Z`}
          fill={color}
          opacity={0.12}
        />
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}
