import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface MetricTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  glow?: string;
  delay?: number;
}

export function MetricTile({ label, value, icon: Icon, glow = '#38bdf8', delay = 0 }: MetricTileProps) {
  const reduceMotion = useReducedMotion();

  const content = (
    <div className="cp-glass rounded-xl p-4 relative overflow-hidden group">
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${glow}22, transparent 70%)` }}
      />
      <div className="relative z-10 flex items-start justify-between">
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${glow}1a` }}>
          <Icon size={18} style={{ color: glow }} />
        </div>
      </div>
      <div className="relative z-10 mt-3 space-y-0.5">
        <p className="cp-mono text-2xl font-semibold" style={{ color: 'var(--cp-fg)' }}>
          {value}
        </p>
        <p className="text-xs font-medium" style={{ color: 'var(--cp-fg-muted)' }}>
          {label}
        </p>
      </div>
    </div>
  );

  if (reduceMotion) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {content}
    </motion.div>
  );
}

export default MetricTile;
