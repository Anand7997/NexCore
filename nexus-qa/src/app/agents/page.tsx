'use client';
import { motion } from 'framer-motion';
import { Bot, Globe, Smartphone, Monitor, Cpu, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Agent } from '@/types';

const TYPE_CONFIG = {
  web: { icon: Globe, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', label: 'Web' },
  android: { icon: Smartphone, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Android' },
  ios: { icon: Smartphone, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', label: 'iOS' },
  desktop: { icon: Monitor, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20', label: 'Desktop' },
};

const STATUS_CONFIG = {
  online: { icon: Wifi, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'ONLINE', dot: 'bg-emerald-400' },
  busy: { icon: Cpu, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'BUSY', dot: 'bg-blue-400 animate-pulse' },
  offline: { icon: WifiOff, color: 'text-slate-500', bg: 'bg-slate-500/10', label: 'OFFLINE', dot: 'bg-slate-500' },
  error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'ERROR', dot: 'bg-red-400 animate-pulse' },
};

export default function AgentsPage() {
  const agents: Agent[] = [];
  const summary = {
    online: agents.filter((a) => a.status === 'online').length,
    busy: agents.filter((a) => a.status === 'busy').length,
    offline: agents.filter((a) => a.status === 'offline').length,
    error: agents.filter((a) => a.status === 'error').length,
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Bot size={20} className="text-indigo-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Agent Fleet</h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{agents.length} registered agents</p>
        </div>
      </motion.div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(summary).map(([status, count], i) => {
          const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
          return (
            <GlassCard key={status} className="p-4" delay={i * 0.05}>
              <div className="flex items-center gap-2 mb-2">
                <cfg.icon size={13} className={cfg.color} />
                <span className={`text-[10px] font-mono font-bold ${cfg.color}`}>{cfg.label}</span>
              </div>
              <div className="text-2xl font-bold text-white font-mono">{count}</div>
              <div className="text-[10px] text-slate-500 font-mono">agents</div>
            </GlassCard>
          );
        })}
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.length === 0 && (
          <GlassCard className="col-span-full p-8 text-center">
            <p className="text-sm text-slate-400">No agents registered yet</p>
            <p className="mt-1 text-[11px] font-mono text-slate-600">Connected execution agents will appear here.</p>
          </GlassCard>
        )}
        {agents.map((agent, i) => {
          const type = TYPE_CONFIG[agent.type];
          const status = STATUS_CONFIG[agent.status];
          return (
            <GlassCard key={agent.id} className="p-4" delay={i * 0.05}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl border ${type.bg}`}>
                    <type.icon size={15} className={type.color} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white font-mono">{agent.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{agent.region}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${status.bg}`}>
                  <div className={cn('w-1.5 h-1.5 rounded-full', status.dot)} />
                  <span className={`text-[9px] font-mono font-bold ${status.color}`}>{status.label}</span>
                </div>
              </div>

              {/* Load */}
              {agent.status !== 'offline' && (
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] font-mono mb-1">
                    <span className="text-slate-500">CPU Load</span>
                    <span className={agent.load > 80 ? 'text-red-400' : agent.load > 60 ? 'text-amber-400' : 'text-emerald-400'}>
                      {agent.load}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
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

              {/* Capabilities */}
              <div className="flex flex-wrap gap-1 mb-3">
                {agent.capabilities.map((cap) => (
                  <span key={cap} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/4 border border-white/6 text-slate-500">
                    {cap}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-600">
                <span>Last seen: {timeAgo(agent.lastSeen)}</span>
                {agent.currentExecution && (
                  <span className="text-blue-400">{agent.currentExecution}</span>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
