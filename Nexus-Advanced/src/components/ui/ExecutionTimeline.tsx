'use client';
import { motion } from 'framer-motion';
import { staggerContainer } from '@/lib/motion/variants';
import { TimelineRow } from './TimelineRow';
import type { Execution, WorkflowNode } from '@/types';

interface ExecutionTimelineProps {
  execution: Execution;
  nodes?: WorkflowNode[];
  activeNodeId?: string;
}

export function ExecutionTimeline({ execution, nodes, activeNodeId }: ExecutionTimelineProps) {
  const rows = nodes ?? [];

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-white/5 bg-white/2 px-3 py-4 text-center">
        <p className="text-[11px] font-mono text-slate-500">
          No execution nodes recorded for {execution.id.slice(0, 8)}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col"
    >
      {rows.map((node, i) => (
        <TimelineRow
          key={node.id}
          label={node.label}
          status={node.status ?? 'queued'}
          duration={node.duration}
          isActive={node.id === activeNodeId || node.status === 'running'}
          isLast={i === rows.length - 1}
          index={i}
        />
      ))}
    </motion.div>
  );
}
