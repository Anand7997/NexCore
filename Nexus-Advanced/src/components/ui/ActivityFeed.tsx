'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { fadeInDown } from '@/lib/motion/variants';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { RealtimeEvent } from '@/types';

const EVENT_STYLE: Record<string, { icon: string; color: string }> = {
  execution_started:    { icon: '▶', color: 'text-blue-400' },
  execution_completed:  { icon: '✓', color: 'text-emerald-400' },
  execution_failed:     { icon: '✗', color: 'text-red-400' },
  node_started:         { icon: '○', color: 'text-slate-400' },
  node_completed:       { icon: '●', color: 'text-indigo-400' },
  log_added:            { icon: '·', color: 'text-slate-500' },
  ai_insight_generated: { icon: '⬡', color: 'text-violet-400' },
  agent_status_changed: { icon: '⚡', color: 'text-amber-400' },
  execution_progress:   { icon: '◐', color: 'text-cyan-400' },
};

interface ActivityFeedProps {
  maxItems?: number;
  filter?: RealtimeEvent['type'][];
  className?: string;
}

export function ActivityFeed({ maxItems = 50, filter, className }: ActivityFeedProps) {
  const events = useRealtimeStore((s) => s.events);

  const visible = events
    .filter((e) => !filter || filter.includes(e.type))
    .slice(0, maxItems);

  return (
    <div className={cn('flex flex-col gap-0.5 overflow-hidden', className)}>
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map((event) => {
          const style = EVENT_STYLE[event.type] ?? { icon: '·', color: 'text-slate-500' };
          return (
            <motion.div
              key={event.id}
              variants={fadeInDown}
              initial="hidden"
              animate="visible"
              exit="exit"
              layout
              className="flex items-start gap-2 px-2 py-1 rounded hover:bg-white/3 transition-colors group"
            >
              <span className={cn('text-[11px] mt-0.5 shrink-0 font-mono w-3 text-center', style.color)}>
                {style.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-300 truncate">
                  {event.workflowName && (
                    <span className="text-white font-medium">{event.workflowName} </span>
                  )}
                  <span className="text-slate-500">{event.type.replace(/_/g, ' ')}</span>
                </p>
                {event.executionId && (
                  <p className="text-[10px] text-slate-600 font-mono">{event.executionId}</p>
                )}
              </div>
              <span className="text-[10px] text-slate-600 shrink-0 mt-0.5 group-hover:text-slate-500 transition-colors">
                {timeAgo(event.timestamp)}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {visible.length === 0 && (
        <div className="flex items-center justify-center h-20 text-xs text-slate-600">
          Waiting for events...
        </div>
      )}
    </div>
  );
}
