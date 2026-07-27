'use client';
import { motion } from 'framer-motion';
import { Bot, Globe, Smartphone, Monitor, Cpu, Wifi, WifiOff, AlertCircle, RefreshCw } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useRuntimeAgents, type RuntimeAgent } from '@/lib/api/runtime';

const TYPE_CONFIG: Record<string, { icon: typeof Globe; color: string; bg: string; label: string }> = {
  web:     { icon: Globe,       color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',    label: 'Web'     },
  android: { icon: Smartphone,  color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Android' },
  ios:     { icon: Smartphone,  color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/20',  label: 'iOS'     },
  desktop: { icon: Monitor,     color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-500/20',    label: 'Desktop' },
  generic: { icon: Cpu,         color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-500/20',  label: 'Generic' },
};

const STATUS_CONFIG: Record<string, { icon: typeof Wifi; color: string; bg: string; label: string; dot: string }> = {
  online:       { icon: Wifi,       color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'ONLINE',  dot: 'bg-emerald-400' },
  idle:         { icon: Wifi,       color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'IDLE',    dot: 'bg-emerald-400' },
  ready:        { icon: Wifi,       color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'READY',   dot: 'bg-emerald-400' },
  busy:         { icon: Cpu,        color: 'text-blue-400',    bg: 'bg-blue-500/10',    label: 'BUSY',    dot: 'bg-blue-400 animate-pulse' },
  offline:      { icon: WifiOff,    color: 'text-slate-500',   bg: 'bg-slate-500/10',   label: 'OFFLINE', dot: 'bg-slate-500' },
  disconnected: { icon: WifiOff,    color: 'text-slate-500',   bg: 'bg-slate-500/10',   label: 'OFFLINE', dot: 'bg-slate-500' },
  error:        { icon: AlertCircle, color: 'text-red-400',    bg: 'bg-red-500/10',     label: 'ERROR',   dot: 'bg-red-400 animate-pulse' },
};

const ONLINE_STATUSES = new Set(['online', 'idle', 'ready']);
const OFFLINE_STATUSES = new Set(['offline', 'disconnected']);

function resolveType(agentType: string) {
  return TYPE_CONFIG[agentType] ?? TYPE_CONFIG.generic;
}

function resolveStatus(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.offline;
}

function loadPercent(agent: RuntimeAgent): number {
  if (!agent.max_concurrency) return 0;
  return Math.round((agent.active_leases / agent.max_concurrency) * 100);
}

export default function AgentsPage() {
  const { data: agents = [], isLoading, isError, refetch } = useRuntimeAgents();

  const summary = {
    online:  agents.filter((a) => ONLINE_STATUSES.has(a.status)).length,
    busy:    agents.filter((a) => a.status === 'busy').length,
    offline: agents.filter((a) => OFFLINE_STATUSES.has(a.status)).length,
    error:   agents.filter((a) => a.status === 'error').length,
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Bot size={20} className="text-indigo-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Agent Fleet</h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{agents.length} registered agents</p>
        </div>
        <button
          onClick={() => refetch()}
          className="ml-auto p-1.5 rounded-lg bg-white/5 border border-white/8 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          title="Refresh"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </motion.div>

      {/* Summary counters */}
      <div className="grid grid-cols-4 gap-3">
        {(Object.entries(summary) as [keyof typeof summary, number][]).map(([key, count], i) => {
          const cfgKey = key === 'online' ? 'online' : key === 'offline' ? 'offline' : key;
          const cfg = STATUS_CONFIG[cfgKey] ?? STATUS_CONFIG.offline;
          return (
            <GlassCard key={key} className="p-4" delay={i * 0.05}>
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

      {isError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-mono text-red-400">
          Failed to load agents — ensure the runtime API is reachable.
        </div>
      )}

      {/* Agent grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {!isLoading && agents.length === 0 && (
          <GlassCard className="col-span-full p-8 text-center">
            <p className="text-sm text-slate-400">No agents registered yet</p>
            <p className="mt-1 text-[11px] font-mono text-slate-600">Connected execution agents will appear here.</p>
          </GlassCard>
        )}
        {agents.map((agent, i) => {
          const type   = resolveType(agent.agent_type);
          const status = resolveStatus(agent.status);
          const load   = loadPercent(agent);
          const isOffline = OFFLINE_STATUSES.has(agent.status);

          return (
            <GlassCard key={agent.id} className="p-4" delay={i * 0.05}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl border ${type.bg}`}>
                    <type.icon size={15} className={type.color} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white font-mono">{agent.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{agent.version} · {type.label}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${status.bg}`}>
                  <div className={cn('w-1.5 h-1.5 rounded-full', status.dot)} />
                  <span className={`text-[9px] font-mono font-bold ${status.color}`}>{status.label}</span>
                </div>
              </div>

              {!isOffline && (
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] font-mono mb-1">
                    <span className="text-slate-500">Active / Max</span>
                    <span className={load > 80 ? 'text-red-400' : load > 60 ? 'text-amber-400' : 'text-emerald-400'}>
                      {agent.active_leases}/{agent.max_concurrency}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${load}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                      className={cn(
                        'h-full rounded-full',
                        load > 80 ? 'bg-red-400' : load > 60 ? 'bg-amber-400' : 'bg-emerald-400',
                      )}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1 mb-3">
                {agent.capabilities.map((cap) => (
                  <span key={cap} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/4 border border-white/6 text-slate-500">
                    {cap}
                  </span>
                ))}
                {agent.capabilities.length === 0 && (
                  <span className="text-[9px] font-mono text-slate-600">no capabilities listed</span>
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-600">
                <span>Last seen: {agent.last_heartbeat_at ? timeAgo(agent.last_heartbeat_at) : 'never'}</span>
                {agent.active_leases > 0 && (
                  <span className="text-blue-400">{agent.active_leases} active lease{agent.active_leases > 1 ? 's' : ''}</span>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
