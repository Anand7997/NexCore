'use client';
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import {
  Globe, Shield, Database, Smartphone, Monitor,
  Brain, GitBranch, RefreshCw, Timer, Zap, CheckSquare,
  MousePointer, TextCursorInput, List, Hourglass, Camera,
  Upload, Terminal as TerminalIcon, Copy, CloudDownload,
  CloudUpload, Trash, SearchCheck, Braces, BadgeCheck,
} from 'lucide-react';
import { NodeHealthIndicator } from '@/components/ui/NodeHealthIndicator';
import { glowPulseRunning } from '@/lib/motion/variants';
import { cn } from '@/lib/utils';
import type { ExecutionStatus } from '@/types';

const NODE_CONFIG: Record<string, {
  icon: React.ElementType;
  label: string;
  color: string;
  border: string;
  glow: string;
}> = {
  webAction:       { icon: Globe,       label: 'Web Action',    color: 'from-blue-500/20 to-blue-600/10',    border: 'border-blue-500/30',   glow: 'rgba(59,130,246,0.2)' },
  apiValidation:   { icon: Shield,      label: 'API Validation', color: 'from-cyan-500/20 to-cyan-600/10',   border: 'border-cyan-500/30',   glow: 'rgba(6,182,212,0.2)' },
  dbValidation:    { icon: Database,    label: 'DB Validation',  color: 'from-violet-500/20 to-violet-600/10', border: 'border-violet-500/30', glow: 'rgba(139,92,246,0.2)' },
  mobileAction:    { icon: Smartphone,  label: 'Mobile Action',  color: 'from-emerald-500/20 to-emerald-600/10', border: 'border-emerald-500/30', glow: 'rgba(16,185,129,0.2)' },
  desktopAction:   { icon: Monitor,     label: 'Desktop Action', color: 'from-indigo-500/20 to-indigo-600/10', border: 'border-indigo-500/30', glow: 'rgba(99,102,241,0.2)' },
  aiAnalysis:      { icon: Brain,       label: 'AI Analysis',   color: 'from-purple-500/20 to-pink-600/10',  border: 'border-purple-500/30',  glow: 'rgba(168,85,247,0.2)' },
  conditionalBranch: { icon: GitBranch, label: 'Condition',     color: 'from-amber-500/20 to-amber-600/10', border: 'border-amber-500/30',   glow: 'rgba(245,158,11,0.2)' },
  retryNode:       { icon: RefreshCw,   label: 'Retry',         color: 'from-orange-500/20 to-orange-600/10', border: 'border-orange-500/30', glow: 'rgba(249,115,22,0.2)' },
  delayNode:       { icon: Timer,       label: 'Delay',         color: 'from-slate-500/20 to-slate-600/10', border: 'border-slate-500/30',   glow: 'rgba(100,116,139,0.2)' },
  trigger:         { icon: Zap,         label: 'Trigger',       color: 'from-yellow-500/20 to-yellow-600/10', border: 'border-yellow-500/30', glow: 'rgba(234,179,8,0.2)' },
  assertion:       { icon: CheckSquare, label: 'Assertion',     color: 'from-teal-500/20 to-teal-600/10',   border: 'border-teal-500/30',    glow: 'rgba(20,184,166,0.2)' },

  // ── Plugin-driven node types (web.* / api.*) ───────────────────────────
  'web.navigate':     { icon: Globe,            label: 'Navigate',          color: 'from-blue-500/20 to-blue-600/10',     border: 'border-blue-500/30',     glow: 'rgba(59,130,246,0.2)' },
  'web.click':        { icon: MousePointer,     label: 'Click',             color: 'from-indigo-500/20 to-indigo-600/10', border: 'border-indigo-500/30',   glow: 'rgba(99,102,241,0.2)' },
  'web.fill':         { icon: TextCursorInput,  label: 'Fill Input',        color: 'from-violet-500/20 to-violet-600/10', border: 'border-violet-500/30',   glow: 'rgba(139,92,246,0.2)' },
  'web.select':       { icon: List,             label: 'Select',            color: 'from-purple-500/20 to-purple-600/10', border: 'border-purple-500/30',   glow: 'rgba(168,85,247,0.2)' },
  'web.wait':         { icon: Hourglass,        label: 'Wait',              color: 'from-amber-500/20 to-amber-600/10',   border: 'border-amber-500/30',    glow: 'rgba(245,158,11,0.2)' },
  'web.assert_text':  { icon: CheckSquare,      label: 'Assert Text',       color: 'from-emerald-500/20 to-emerald-600/10', border: 'border-emerald-500/30', glow: 'rgba(16,185,129,0.2)' },
  'web.extract_text': { icon: Copy,             label: 'Extract Text',      color: 'from-fuchsia-500/20 to-fuchsia-600/10', border: 'border-fuchsia-500/30', glow: 'rgba(217,70,239,0.2)' },
  'web.screenshot':   { icon: Camera,           label: 'Screenshot',        color: 'from-sky-500/20 to-sky-600/10',       border: 'border-sky-500/30',      glow: 'rgba(14,165,233,0.2)' },
  'web.upload':       { icon: Upload,           label: 'Upload',            color: 'from-teal-500/20 to-teal-600/10',     border: 'border-teal-500/30',     glow: 'rgba(20,184,166,0.2)' },
  'web.execute_js':   { icon: TerminalIcon,     label: 'Execute JS',        color: 'from-yellow-500/20 to-yellow-600/10', border: 'border-yellow-500/30',   glow: 'rgba(234,179,8,0.2)' },

  'api.get':                  { icon: CloudDownload, label: 'GET',           color: 'from-cyan-500/20 to-cyan-600/10',     border: 'border-cyan-500/30',     glow: 'rgba(6,182,212,0.2)' },
  'api.post':                 { icon: CloudUpload,   label: 'POST',          color: 'from-cyan-500/20 to-cyan-600/10',     border: 'border-cyan-500/30',     glow: 'rgba(6,182,212,0.2)' },
  'api.put':                  { icon: Upload,        label: 'PUT',           color: 'from-cyan-500/20 to-cyan-600/10',     border: 'border-cyan-500/30',     glow: 'rgba(6,182,212,0.2)' },
  'api.delete':               { icon: Trash,         label: 'DELETE',        color: 'from-rose-500/20 to-rose-600/10',     border: 'border-rose-500/30',     glow: 'rgba(244,63,94,0.2)' },
  'api.assert_status':        { icon: CheckSquare,   label: 'Assert Status', color: 'from-emerald-500/20 to-emerald-600/10', border: 'border-emerald-500/30', glow: 'rgba(16,185,129,0.2)' },
  'api.assert_json_path':     { icon: SearchCheck,   label: 'Assert JSON',   color: 'from-blue-500/20 to-blue-600/10',     border: 'border-blue-500/30',     glow: 'rgba(59,130,246,0.2)' },
  'api.extract':              { icon: Braces,        label: 'Extract',       color: 'from-purple-500/20 to-purple-600/10', border: 'border-purple-500/30',   glow: 'rgba(168,85,247,0.2)' },
  'api.assert_headers':       { icon: BadgeCheck,    label: 'Headers',       color: 'from-teal-500/20 to-teal-600/10',     border: 'border-teal-500/30',     glow: 'rgba(20,184,166,0.2)' },
  'api.assert_response_time': { icon: Timer,         label: 'Resp. Time',    color: 'from-amber-500/20 to-amber-600/10',   border: 'border-amber-500/30',    glow: 'rgba(245,158,11,0.2)' },
};

interface NexusNodeData {
  label: string;
  nodeType: string;
  status?: ExecutionStatus;
  duration?: number;
  retries?: number;
  traversalCount?: number;
}

function NexusNode({ data, selected }: NodeProps & { data: NexusNodeData }) {
  const nodeType = data.nodeType as keyof typeof NODE_CONFIG;
  const cfg = NODE_CONFIG[nodeType] || NODE_CONFIG.webAction;
  const Icon = cfg.icon;
  const status = data.status;
  const progress = status && data.duration ? Math.min(1, data.duration / 5000) : 0;
  const showHealth = !!status && !!data.duration;

  return (
    <div
      className={cn(
        'relative rounded-xl border bg-linear-to-br transition-all duration-300 min-w-35',
        cfg.color, cfg.border,
        status === 'running'  && 'glow-state-running',
        status === 'success'  && 'glow-state-success',
        status === 'failed'   && 'glow-state-failed',
        status === 'retrying' && 'glow-state-retrying',
        status === 'queued'   && 'glow-state-queued',
        selected && 'ring-2 ring-indigo-400/80',
        'hover:scale-105',
      )}
      style={!status ? { boxShadow: `0 0 12px ${cfg.glow}` } : undefined}
    >
      {/* Running overlay glow */}
      {status === 'running' && (
        <motion.div
          variants={glowPulseRunning}
          initial="initial"
          animate="animate"
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ background: 'rgba(59,130,246,0.08)' }}
        />
      )}

      {/* traversalCount badge */}
      {data.traversalCount != null && data.traversalCount > 0 && (
        <span className="absolute -top-2 -right-2 min-w-4.5 h-4.5 rounded-full bg-indigo-600 border border-indigo-400/40 text-[9px] font-bold text-white flex items-center justify-center px-1 z-10">
          ×{data.traversalCount}
        </span>
      )}

      <Handle type="target" position={Position.Top} className="w-2! h-2! border-2! border-white/30! bg-slate-900!" />

      <div className="px-3 py-2.5 relative z-10">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            {showHealth ? (
              <NodeHealthIndicator status={status!} progress={progress} size={22} strokeWidth={2} />
            ) : (
              <div className={cn(
                'p-1 rounded-md',
                status === 'running'  ? 'bg-blue-500/20' :
                status === 'success'  ? 'bg-emerald-500/20' :
                status === 'failed'   ? 'bg-red-500/20' : 'bg-white/10',
              )}>
                <Icon size={12} className={cn(
                  status === 'running'  ? 'text-blue-400 animate-pulse' :
                  status === 'success'  ? 'text-emerald-400' :
                  status === 'failed'   ? 'text-red-400' : 'text-slate-400',
                )} />
              </div>
            )}
            <span className="text-[10px] text-slate-400 font-mono">{cfg.label}</span>
          </div>
        </div>

        <p className="text-xs font-semibold text-white leading-tight">{data.label}</p>

        {status && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              status === 'running'  ? 'bg-blue-400 animate-pulse' :
              status === 'success'  ? 'bg-emerald-400' :
              status === 'failed'   ? 'bg-red-400' :
              status === 'retrying' ? 'bg-violet-400 animate-pulse' : 'bg-slate-400',
            )} />
            <span className={cn(
              'text-[9px] font-mono font-bold uppercase tracking-wider',
              status === 'running'  ? 'text-blue-400' :
              status === 'success'  ? 'text-emerald-400' :
              status === 'failed'   ? 'text-red-400' :
              status === 'retrying' ? 'text-violet-400' : 'text-slate-400',
            )}>
              {status}
            </span>
            {data.duration && (
              <span className="text-[9px] text-slate-600 font-mono ml-auto">
                {(data.duration / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="w-2! h-2! border-2! border-white/30! bg-slate-900!" />
    </div>
  );
}

export const nodeTypes = {
  nexusNode: memo(NexusNode),
};
