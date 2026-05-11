'use client';
import { motion } from 'framer-motion';
import { cn, formatNumber } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  change?: number;
  icon: LucideIcon;
  iconColor?: string;
  glowColor?: string;
  delay?: number;
  sublabel?: string;
}

export default function MetricCard({
  label, value, unit, change, icon: Icon, iconColor = 'text-blue-400',
  glowColor = 'rgba(59,130,246,0.1)', delay = 0, sublabel,
}: MetricCardProps) {
  const displayValue = typeof value === 'number' ? formatNumber(value) : value;
  const isPositive = change !== undefined && change >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="glass rounded-xl p-4 relative overflow-hidden group transition-all duration-300 hover:border-white/10"
      style={{ '--glow': glowColor } as React.CSSProperties}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl"
        style={{ background: `radial-gradient(ellipse at top left, ${glowColor}, transparent 70%)` }}
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-lg bg-white/5">
            <Icon size={16} className={iconColor} />
          </div>
          {change !== undefined && (
            <span className={cn(
              'text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded',
              isPositive ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10',
            )}>
              {isPositive ? '+' : ''}{change.toFixed(1)}%
            </span>
          )}
        </div>

        <div className="space-y-0.5">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-white tracking-tight">{displayValue}</span>
            {unit && <span className="text-xs text-slate-400 font-mono">{unit}</span>}
          </div>
          <p className="text-xs text-slate-400 font-medium">{label}</p>
          {sublabel && <p className="text-[10px] text-slate-600 font-mono">{sublabel}</p>}
        </div>
      </div>
    </motion.div>
  );
}
