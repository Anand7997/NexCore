'use client';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Agent } from '@/types';

const STATUS_CONFIG = {
  online: { color: 'bg-emerald-400', text: 'text-emerald-400', label: 'ONLINE' },
  busy: { color: 'bg-blue-400 animate-pulse', text: 'text-blue-400', label: 'BUSY' },
  offline: { color: 'bg-slate-500', text: 'text-slate-500', label: 'OFFLINE' },
  error: { color: 'bg-red-400 animate-pulse', text: 'text-red-400', label: 'ERROR' },
};

const TYPE_ICON: Record<string, string> = {
  web: 'WEB',
  android: 'AND',
  ios: 'IOS',
  desktop: 'DESK',
};

export default function AgentHealth() {
  const agents: Agent[] = [];

  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-white/4 bg-white/2 px-3 py-4 text-center">
        <p className="text-[11px] font-mono text-slate-500">No agents registered</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {agents.map((agent, i) => {
        const cfg = STATUS_CONFIG[agent.status];
        return (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/2 border border-white/4 hover:bg-white/4 transition-all group"
          >
            <span className="text-[9px] font-mono text-slate-500">{TYPE_ICON[agent.type]}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-300 truncate">{agent.name}</span>
                <span className={cn('text-[9px] font-mono font-bold', cfg.text)}>{cfg.label}</span>
              </div>
              <div className="text-[9px] text-slate-600 font-mono">{agent.region}</div>
            </div>

            {agent.status !== 'offline' && (
              <div className="w-16 shrink-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] font-mono text-slate-600">{agent.load}%</span>
                </div>
                <div className="h-1 bg-white/6 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${agent.load}%` }}
                    transition={{ duration: 0.8, delay: i * 0.05 }}
                    className={cn(
                      'h-full rounded-full',
                      agent.load > 80 ? 'bg-red-400' : agent.load > 60 ? 'bg-amber-400' : 'bg-emerald-400',
                    )}
                  />
                </div>
              </div>
            )}

            <div className={cn('w-2 h-2 rounded-full shrink-0', cfg.color)} />
          </motion.div>
        );
      })}
    </div>
  );
}
