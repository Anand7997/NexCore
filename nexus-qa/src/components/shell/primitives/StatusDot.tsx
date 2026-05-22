'use client';

import { STATUS_COLOR, type StatusKind } from '../tokens';

interface StatusDotProps {
  status: StatusKind;
  size?: number;
  pulse?: boolean;
  ariaLabel?: string;
}

export function StatusDot({ status, size = 6, pulse = true, ariaLabel }: StatusDotProps) {
  const color = STATUS_COLOR[status];
  const showPulse = pulse && status !== 'idle';
  return (
    <span
      role={ariaLabel ? 'status' : undefined}
      aria-label={ariaLabel}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: status === 'idle' ? 'none' : `0 0 6px ${color}`,
        animation: showPulse ? 'pulse-violet 1.6s ease-out infinite' : undefined,
      }}
    />
  );
}
