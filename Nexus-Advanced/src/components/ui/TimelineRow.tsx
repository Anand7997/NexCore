'use client';
import { motion } from 'framer-motion';
import { staggerItem } from '@/lib/motion/variants';
import { StatusPulse } from './StatusPulse';
import { formatDuration } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { ExecutionStatus } from '@/types';

interface TimelineRowProps {
  label: string;
  status: ExecutionStatus;
  duration?: number;
  isActive?: boolean;
  isLast?: boolean;
  index?: number;
}

export function TimelineRow({ label, status, duration, isActive, isLast }: TimelineRowProps) {
  return (
    <motion.div variants={staggerItem} className="flex gap-3 min-h-[36px]">
      {/* Connector column */}
      <div className="flex flex-col items-center shrink-0 w-4">
        <StatusPulse status={status} size="sm" showRing={isActive} />
        {!isLast && (
          <motion.div
            className="w-px flex-1 mt-1 rounded-full"
            style={{ background: isActive ? '#6366f1' : 'rgba(255,255,255,0.08)' }}
            initial={{ scaleY: 0, originY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex items-start justify-between flex-1 pb-3 gap-2">
        <span
          className={cn(
            'text-xs leading-tight',
            isActive ? 'text-white' : 'text-slate-400',
          )}
        >
          {label}
        </span>
        {duration != null && (
          <span className="text-[10px] font-mono text-slate-600 shrink-0 mt-0.5">
            {formatDuration(duration)}
          </span>
        )}
      </div>
    </motion.div>
  );
}
