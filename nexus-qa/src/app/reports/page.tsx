'use client';
import { motion } from 'framer-motion';
import { BarChart3, Download, Calendar, TrendingUp, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import GlassCard from '@/components/ui/GlassCard';

const weeklyData = [
  { day: 'Mon', success: 342, failed: 18, skipped: 12 },
  { day: 'Tue', success: 289, failed: 24, skipped: 8 },
  { day: 'Wed', success: 401, failed: 11, skipped: 15 },
  { day: 'Thu', success: 376, failed: 29, skipped: 9 },
  { day: 'Fri', success: 432, failed: 15, skipped: 21 },
  { day: 'Sat', success: 198, failed: 8, skipped: 5 },
  { day: 'Sun', success: 156, failed: 6, skipped: 3 },
];

const platformData = [
  { name: 'Web', value: 58, color: '#3b82f6' },
  { name: 'Android', value: 21, color: '#10b981' },
  { name: 'iOS', value: 13, color: '#8b5cf6' },
  { name: 'Desktop', value: 8, color: '#06b6d4' },
];

const topWorkflows = [
  { name: 'API Contract Tests', executions: 28901, successRate: 99.1, avgDuration: '12s' },
  { name: 'User Auth Suite', executions: 12043, successRate: 98.7, avgDuration: '45s' },
  { name: 'Checkout Flow E2E', executions: 4821, successRate: 96.2, avgDuration: '72s' },
  { name: 'Payment Gateway', executions: 3892, successRate: 91.4, avgDuration: '58s' },
  { name: 'Mobile Onboarding', executions: 2341, successRate: 94.1, avgDuration: '2m' },
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 border border-white/10 text-xs">
      <div className="text-slate-400 font-mono mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2" style={{ color: p.color }}>
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="font-mono">{p.name}: {p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-violet-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Reports & Analytics</h1>
            <p className="text-xs text-slate-400 font-mono">Last 7 days • All platforms</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-slate-300 text-xs hover:bg-white/10 transition-all">
            <Calendar size={12} />
            Last 7 days
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-500/30 transition-all">
            <Download size={12} />
            Export PDF
          </button>
        </div>
      </motion.div>

      {/* Summary metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Executions', value: '2,794', change: '+12.4%', icon: TrendingUp, color: 'text-indigo-400' },
          { label: 'Success Rate', value: '94.3%', change: '+1.2%', icon: CheckCircle, color: 'text-emerald-400' },
          { label: 'Failed Today', value: '34', change: '-18%', icon: AlertTriangle, color: 'text-red-400' },
          { label: 'Avg Duration', value: '4.8s', change: '-8.3%', icon: Clock, color: 'text-violet-400' },
        ].map((m, i) => (
          <GlassCard key={m.label} className="p-4" delay={i * 0.05}>
            <div className="flex items-center justify-between mb-2">
              <m.icon size={13} className={m.color} />
              <span className={`text-[10px] font-mono font-bold ${
                m.change.startsWith('+') ? 'text-emerald-400' : 'text-red-400'
              }`}>{m.change}</span>
            </div>
            <div className="text-2xl font-bold text-white">{m.value}</div>
            <div className="text-[10px] text-slate-500">{m.label}</div>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Weekly bar chart */}
        <div className="col-span-2">
          <GlassCard className="p-4" delay={0.2}>
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Weekly Execution Volume</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#475569', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#475569', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="success" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="failed" fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Bar dataKey="skipped" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </div>

        {/* Platform distribution */}
        <GlassCard className="p-4" delay={0.25}>
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Platform Distribution</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={platformData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                paddingAngle={3}
                dataKey="value"
              >
                {platformData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [`${v}%`, '']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {platformData.map((p) => (
              <div key={p.name} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                <span className="text-xs text-slate-400 flex-1">{p.name}</span>
                <span className="text-xs font-mono" style={{ color: p.color }}>{p.value}%</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Top workflows */}
      <GlassCard className="overflow-hidden" delay={0.3}>
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-slate-200">Top Workflows by Volume</h3>
        </div>
        <div className="divide-y divide-white/4">
          {topWorkflows.map((wf, i) => (
            <motion.div
              key={wf.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.06 }}
              className="flex items-center gap-4 px-4 py-3 hover:bg-white/2 transition-colors"
            >
              <span className="text-sm font-mono text-slate-600 w-4">#{i + 1}</span>
              <span className="flex-1 text-sm text-slate-200">{wf.name}</span>
              <div className="hidden lg:flex items-center gap-6 text-xs font-mono">
                <span className="text-slate-400">{wf.executions.toLocaleString()} runs</span>
                <span className={wf.successRate >= 95 ? 'text-emerald-400' : wf.successRate >= 90 ? 'text-amber-400' : 'text-red-400'}>
                  {wf.successRate}%
                </span>
                <span className="text-slate-500">{wf.avgDuration}</span>
              </div>
              <div className="w-24">
                <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-indigo-500 to-cyan-500"
                    style={{ width: `${wf.successRate}%` }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
