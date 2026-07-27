'use client';
import { useState } from 'react';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';
import { ActivityFeed } from '@/components/ui/ActivityFeed';
import { cn } from '@/lib/utils';
import type { RealtimeEvent } from '@/types';

type FilterMode = 'all' | 'executions' | 'ai';

const EXEC_TYPES: RealtimeEvent['type'][] = [
  'execution_started', 'execution_completed', 'execution_failed', 'execution_progress',
];
const AI_TYPES: RealtimeEvent['type'][] = ['ai_insight_generated'];

export function ActivityFeedWidget({ className }: { className?: string }) {
  const events = useRealtimeStore((s) => s.events);
  const [mode, setMode] = useState<FilterMode>('all');

  const filter = mode === 'executions' ? EXEC_TYPES : mode === 'ai' ? AI_TYPES : undefined;

  return (
    <div className={cn('glass rounded-xl flex flex-col overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white">Activity Feed</span>
          <span className="text-[10px] font-mono text-slate-600 bg-white/5 px-1.5 py-0.5 rounded">
            {events.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {(['all', 'executions', 'ai'] as FilterMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'text-[9px] font-mono px-2 py-0.5 rounded uppercase transition-colors',
                mode === m ? 'bg-indigo-600/30 text-indigo-300' : 'text-slate-600 hover:text-slate-400',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        <ActivityFeed filter={filter} maxItems={30} />
      </div>
    </div>
  );
}
