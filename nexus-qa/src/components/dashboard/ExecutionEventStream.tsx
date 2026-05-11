'use client';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';
import { EventStreamPanel } from '@/components/ui/EventStreamPanel';
import { Button } from '@/components/ui/Button';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ExecutionEventStream({ className }: { className?: string }) {
  const { clearEvents } = useRealtimeStore();

  return (
    <div className={cn('glass rounded-xl flex flex-col overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white">Event Stream</span>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] font-mono text-emerald-400">WS LIVE</span>
          </div>
        </div>
        <Button variant="ghost" size="xs" onClick={clearEvents}>
          <Trash2 size={10} />
          Clear
        </Button>
      </div>

      {/* Stream */}
      <div className="flex-1 overflow-hidden">
        <EventStreamPanel />
      </div>
    </div>
  );
}
