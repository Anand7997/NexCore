'use client';
import { motion } from 'framer-motion';
import { StatusPulse } from './StatusPulse';
import { cn } from '@/lib/utils';
import type { Execution } from '@/types';

interface ExecutionChipProps {
  execution: Execution;
  onClick?: () => void;
  className?: string;
}

export function ExecutionChip({ execution, onClick, className }: ExecutionChipProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] font-mono',
        'glass border border-white/8 text-slate-300 hover:text-white hover:border-white/15',
        'transition-colors cursor-pointer',
        className,
      )}
    >
      <StatusPulse status={execution.status} size="sm" showRing={false} />
      <span className="text-slate-500">{execution.id}</span>
      <span className="text-slate-400">·</span>
      <span className="truncate max-w-[120px]">{execution.workflowName}</span>
    </motion.button>
  );
}
