'use client';
import { motion } from 'framer-motion';
import { getStatusColor } from '@/lib/utils';
import type { ExecutionStatus } from '@/types';

interface NodeHealthIndicatorProps {
  status: ExecutionStatus;
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function NodeHealthIndicator({
  status,
  progress,
  size = 40,
  strokeWidth = 3,
  className,
}: NodeHealthIndicatorProps) {
  const color = getStatusColor(status);
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const clampedProgress = Math.max(0, Math.min(1, progress));

  return (
    <svg
      width={size}
      height={size}
      className={className}
      style={{ filter: `drop-shadow(0 0 4px ${color}60)` }}
    >
      {/* Track */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      {/* Animated fill arc */}
      <motion.circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - clampedProgress) }}
        transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        transform={`rotate(-90 ${cx} ${cx})`}
      />
      {/* Center progress label */}
      <text
        x={cx}
        y={cx}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={size < 36 ? 8 : 10}
        fontFamily="JetBrains Mono, monospace"
        fontWeight="600"
      >
        {Math.round(clampedProgress * 100)}%
      </text>
    </svg>
  );
}
