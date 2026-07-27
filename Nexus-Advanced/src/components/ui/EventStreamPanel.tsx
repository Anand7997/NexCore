'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fadeInDown } from '@/lib/motion/variants';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';
import { useExecutionStore } from '@/lib/stores/executionStore';
import { cn } from '@/lib/utils';
import type { RealtimeEvent, LogEntry } from '@/types';

type FilterType = 'all' | 'events' | 'logs';

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  info:    'text-blue-400',
  warn:    'text-amber-400',
  error:   'text-red-400',
  debug:   'text-slate-500',
  success: 'text-emerald-400',
};

function fmtMs(iso: string) {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function EventStreamPanel({ className }: { className?: string }) {
  const events = useRealtimeStore((s) => s.events);
  const logs = useExecutionStore((s) => s.logs);
  const [filter, setFilter] = useState<FilterType>('all');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [events.length, logs.length]);

  type Row =
    | { kind: 'event'; data: RealtimeEvent; ts: number }
    | { kind: 'log'; data: LogEntry; ts: number };

  const rows: Row[] = [
    ...(filter !== 'logs' ? events.map((e) => ({ kind: 'event' as const, data: e, ts: new Date(e.timestamp).getTime() })) : []),
    ...(filter !== 'events' ? logs.slice(0, 60).map((l) => ({ kind: 'log' as const, data: l, ts: new Date(l.timestamp).getTime() })) : []),
  ].sort((a, b) => b.ts - a.ts).slice(0, 80);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="shrink-0 border-b border-white/6 px-2 py-1.5 flex items-center gap-1">
        {(['all', 'events', 'logs'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'text-[10px] font-mono px-1.5 py-0.5 rounded uppercase transition-colors',
              filter === f ? 'bg-indigo-600/30 text-indigo-300' : 'text-slate-600 hover:text-slate-400',
            )}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[9px] text-emerald-600 font-mono uppercase">LIVE</span>
        </div>
      </div>

      {/* Stream */}
      <div className="flex-1 overflow-y-auto font-mono text-[10px] leading-relaxed">
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((row) => (
            <motion.div
              key={row.kind === 'event' ? row.data.id : (row.data as LogEntry).id}
              variants={fadeInDown}
              initial="hidden"
              animate="visible"
              exit="exit"
              layout
              className="flex items-start gap-1.5 px-2 py-0.5 hover:bg-white/3 border-b border-white/3"
            >
              <span className="shrink-0 text-slate-700">{fmtMs(row.kind === 'event' ? row.data.timestamp : (row.data as LogEntry).timestamp)}</span>
              {row.kind === 'event' ? (
                <>
                  <span className="shrink-0 text-indigo-500">[EVT]</span>
                  <span className="text-slate-400">{row.data.type}</span>
                  {row.data.executionId && (
                    <span className="text-slate-600">{row.data.executionId}</span>
                  )}
                </>
              ) : (
                <>
                  <span className={cn('shrink-0', LEVEL_COLOR[(row.data as LogEntry).level])}>
                    [{(row.data as LogEntry).level.toUpperCase().slice(0, 3)}]
                  </span>
                  <span className="text-slate-400 truncate">{(row.data as LogEntry).message}</span>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
