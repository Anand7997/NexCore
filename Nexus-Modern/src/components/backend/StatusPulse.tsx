import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { getStatusColor, getStatusTone } from '@/lib/status';

interface StatusPulseProps {
  status: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE = {
  sm: { dot: 8, ring: 14, outer: 20 },
  md: { dot: 9, ring: 16, outer: 24 },
  lg: { dot: 11, ring: 20, outer: 28 },
};

export function StatusPulse({ status, label, size = 'md', className }: StatusPulseProps) {
  const color = getStatusColor(status);
  const tone = getStatusTone(status);
  const isAnimated = tone === 'active' || tone === 'warning';
  const reduceMotion = useReducedMotion();
  const s = SIZE[size];

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <span className="relative flex items-center justify-center shrink-0" style={{ width: s.outer, height: s.outer }}>
        {isAnimated && !reduceMotion && (
          <motion.span
            className="absolute rounded-full"
            style={{ width: s.outer, height: s.outer, backgroundColor: color, opacity: 0.3 }}
            animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <span
          className="absolute rounded-full border"
          style={{ width: s.ring, height: s.ring, borderColor: `${color}55` }}
        />
        <span
          className="rounded-full relative z-10"
          style={{ width: s.dot, height: s.dot, backgroundColor: color, boxShadow: `0 0 6px ${color}90` }}
        />
      </span>
      {label && (
        <span className="cp-mono text-xs uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
      )}
    </span>
  );
}

export default StatusPulse;
