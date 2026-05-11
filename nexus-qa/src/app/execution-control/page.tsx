'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
  type NodeProps,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Bot,
  RotateCcw,
  Eye,
  StopCircle,
  ChevronRight,
  Circle,
  Zap,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

// ── Types ─────────────────────────────────────────────────────────────────────

type ExecStatus = 'running' | 'queued' | 'passing' | 'failed' | 'retrying';
type NodeState = 'completed' | 'running' | 'queued' | 'failed';

interface Execution {
  id: string;
  name: string;
  status: ExecStatus;
  progress: number;
  agent: string;
  duration: string;
  tcCount: number;
  currentStep: string | null;
  priority: 'critical' | 'high' | 'medium';
}

interface DagNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  state: NodeState;
}

interface LogEntry {
  time: string;
  text: string;
}

// ── Initial mock data ─────────────────────────────────────────────────────────

const INITIAL_EXECUTIONS: Execution[] = [
  { id: 'exec-001', name: 'Book International Flight — Regression', status: 'running',  progress: 65, agent: 'Agent Alpha',  duration: '2m 14s', tcCount: 14, currentStep: 'Payment Processing', priority: 'critical' },
  { id: 'exec-002', name: 'Payment Suite — Full Run',               status: 'queued',   progress: 0,  agent: 'Agent Beta',   duration: '—',      tcCount: 8,  currentStep: null,               priority: 'high'     },
  { id: 'exec-003', name: 'Auth & Registration — Smoke',            status: 'passing',  progress: 100,agent: 'Agent Gamma',  duration: '1m 42s', tcCount: 4,  currentStep: null,               priority: 'medium'   },
  { id: 'exec-004', name: 'Invoice Generation — Daily',             status: 'failed',   progress: 78, agent: 'Agent Alpha',  duration: '3m 05s', tcCount: 5,  currentStep: 'PDF Export',       priority: 'high'     },
  { id: 'exec-005', name: 'Mobile Booking — iOS Smoke',             status: 'retrying', progress: 45, agent: 'Mobile-1',     duration: '4m 20s', tcCount: 6,  currentStep: 'Seat Selection',   priority: 'high'     },
];

// ── DAG nodes / edges ─────────────────────────────────────────────────────────

const BASE_DAG_NODES: Node<DagNodeData>[] = [
  { id: '1', position: { x: 50,  y: 100 }, data: { label: 'Navigate',      type: 'web.navigate', state: 'completed' }, type: 'dagNode' },
  { id: '2', position: { x: 210, y: 40  }, data: { label: 'Fill Origin',   type: 'web.fill',     state: 'completed' }, type: 'dagNode' },
  { id: '3', position: { x: 210, y: 160 }, data: { label: 'API Auth',      type: 'api.post',     state: 'completed' }, type: 'dagNode' },
  { id: '4', position: { x: 370, y: 100 }, data: { label: 'Search',        type: 'web.click',    state: 'running'   }, type: 'dagNode' },
  { id: '5', position: { x: 530, y: 50  }, data: { label: 'Select Flight', type: 'web.click',    state: 'queued'    }, type: 'dagNode' },
  { id: '6', position: { x: 530, y: 150 }, data: { label: 'Validate API',  type: 'api.assert',   state: 'queued'    }, type: 'dagNode' },
  { id: '7', position: { x: 690, y: 100 }, data: { label: 'Payment',       type: 'web.fill',     state: 'queued'    }, type: 'dagNode' },
];

const DAG_EDGES: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: false, style: { stroke: 'rgba(16,185,129,0.5)', strokeWidth: 1.5 } },
  { id: 'e1-3', source: '1', target: '3', animated: false, style: { stroke: 'rgba(16,185,129,0.5)', strokeWidth: 1.5 } },
  { id: 'e2-4', source: '2', target: '4', animated: true,  style: { stroke: 'rgba(59,130,246,0.7)', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(59,130,246,0.7)' } },
  { id: 'e3-4', source: '3', target: '4', animated: true,  style: { stroke: 'rgba(59,130,246,0.7)', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(59,130,246,0.7)' } },
  { id: 'e4-5', source: '4', target: '5', animated: false, style: { stroke: 'rgba(139,92,246,0.35)', strokeWidth: 1 } },
  { id: 'e4-6', source: '4', target: '6', animated: false, style: { stroke: 'rgba(139,92,246,0.35)', strokeWidth: 1 } },
  { id: 'e5-7', source: '5', target: '7', animated: false, style: { stroke: 'rgba(139,92,246,0.35)', strokeWidth: 1 } },
  { id: 'e6-7', source: '6', target: '7', animated: false, style: { stroke: 'rgba(139,92,246,0.35)', strokeWidth: 1 } },
];

const INITIAL_LOG_LINES: LogEntry[] = [
  { time: '14:23:01', text: 'web.navigate → https://app.airline.com/search — 823ms' },
  { time: '14:23:02', text: 'web.fill #origin-input "LHR" — 312ms' },
  { time: '14:23:02', text: 'api.post /api/session/init — 200 OK — 445ms' },
  { time: '14:23:03', text: 'web.click #search-btn — 234ms' },
  { time: '14:23:04', text: 'API validation QUEUED...' },
];

const ROLLING_LOG_LINES = [
  'web.click #departure-date — 189ms',
  'web.assert .results-count "14 flights found" — ok',
  'web.click .flight-row:nth-child(1) — 201ms',
  'api.get /api/flights/availability — 200 OK — 567ms',
  'web.navigate → https://app.airline.com/booking/passenger — 712ms',
  'web.fill #passenger-name "John Smith" — 278ms',
  'web.fill #passport-number "GR1234567" — 192ms',
  'web.click #continue-btn — 145ms',
  'web.navigate → https://app.airline.com/payment — 634ms',
  'web.fill #card-number "4111 1111 1111 1111" — 312ms',
  'web.fill #cvv "123" — 98ms',
  'api.post /api/payment/submit — awaiting response...',
];

// ── DAG Node component ────────────────────────────────────────────────────────

const STATE_STYLES: Record<NodeState, { border: string; bg: string; glow: string; text: string }> = {
  completed: { border: 'border-emerald-500/60', bg: 'bg-emerald-500/10', glow: '0 0 10px rgba(16,185,129,0.3)', text: 'text-emerald-400' },
  running:   { border: 'border-blue-500/80',    bg: 'bg-blue-500/15',    glow: '0 0 14px rgba(59,130,246,0.45)', text: 'text-blue-300' },
  queued:    { border: 'border-white/15',        bg: 'bg-white/4',        glow: 'none', text: 'text-slate-400' },
  failed:    { border: 'border-red-500/60',      bg: 'bg-red-500/10',     glow: '0 0 10px rgba(239,68,68,0.3)', text: 'text-red-400' },
};

function DagNodeComponent({ data }: NodeProps<Node<DagNodeData>>) {
  const s = STATE_STYLES[data.state];
  return (
    <div
      className={cn('rounded-lg border px-3 py-2 w-[110px] flex flex-col gap-0.5', s.border, s.bg)}
      style={{ boxShadow: s.glow }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'rgba(139,92,246,0.5)', border: 'none', width: 6, height: 6 }} />
      <div className="flex items-center gap-1.5">
        {data.state === 'completed' && <CheckCircle2 size={9} className="text-emerald-400 shrink-0" />}
        {data.state === 'running'   && <Loader2 size={9} className="text-blue-400 animate-spin shrink-0" />}
        {data.state === 'queued'    && <Circle size={9} className="text-slate-500 shrink-0" />}
        {data.state === 'failed'    && <XCircle size={9} className="text-red-400 shrink-0" />}
        <span className={cn('text-[10px] font-semibold leading-tight truncate', s.text)}>{data.label}</span>
      </div>
      <span className="text-[8px] font-mono text-slate-600 truncate">{data.type}</span>
      <Handle type="source" position={Position.Right} style={{ background: 'rgba(139,92,246,0.5)', border: 'none', width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = { dagNode: DagNodeComponent };

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ExecStatus, { color: string; bg: string; border: string; glow: string; barColor: string; dot: string }> = {
  running:  { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    glow: '0 0 8px rgba(59,130,246,0.35)',   barColor: 'bg-blue-500',    dot: 'bg-blue-400' },
  queued:   { color: 'text-amber-400',   bg: 'bg-amber-500/8',    border: 'border-amber-500/20',   glow: 'none',                            barColor: 'bg-amber-500',   dot: 'bg-slate-500' },
  passing:  { color: 'text-emerald-400', bg: 'bg-emerald-500/8',  border: 'border-emerald-500/25', glow: '0 0 8px rgba(16,185,129,0.25)',   barColor: 'bg-emerald-500', dot: 'bg-emerald-400' },
  failed:   { color: 'text-red-400',     bg: 'bg-red-500/8',      border: 'border-red-500/25',     glow: '0 0 8px rgba(239,68,68,0.3)',     barColor: 'bg-red-500',     dot: 'bg-red-400' },
  retrying: { color: 'text-violet-400',  bg: 'bg-violet-500/8',   border: 'border-violet-500/25',  glow: '0 0 8px rgba(139,92,246,0.3)',    barColor: 'bg-violet-500',  dot: 'bg-violet-400' },
};

const PRIORITY_CFG: Record<Execution['priority'], string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/25',
  high:     'text-orange-400 bg-orange-500/10 border-orange-500/25',
  medium:   'text-blue-400 bg-blue-500/10 border-blue-500/25',
};

// ── Orchestration Timeline ────────────────────────────────────────────────────

const TIMELINE_COLORS: Record<string, string> = {
  'exec-001': '#3b82f6',
  'exec-002': '#f59e0b',
  'exec-003': '#10b981',
  'exec-004': '#ef4444',
  'exec-005': '#8b5cf6',
};

const TIMELINE_OFFSETS: Record<string, number> = {
  'exec-001': 0,
  'exec-002': 0.55,
  'exec-003': 0.1,
  'exec-004': 0.2,
  'exec-005': 0.35,
};

const TIMELINE_WIDTHS: Record<string, number> = {
  'exec-001': 0.45,
  'exec-002': 0.2,
  'exec-003': 0.35,
  'exec-004': 0.58,
  'exec-005': 0.4,
};

// ── Execution Row ─────────────────────────────────────────────────────────────

function ExecutionRow({ exec, selected, onSelect }: { exec: Execution; selected: boolean; onSelect: () => void }) {
  const cfg = STATUS_CFG[exec.status];
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={onSelect}
      className={cn(
        'group relative px-4 py-3 border-b border-white/5 cursor-pointer transition-all duration-150',
        selected ? 'bg-white/5 border-l-2 border-l-violet-500' : 'hover:bg-white/3',
      )}
    >
      {/* Status dot */}
      <div className="flex items-start gap-3">
        <div className="mt-1 shrink-0 relative">
          <div className={cn('w-2.5 h-2.5 rounded-full', cfg.dot)} />
          {exec.status === 'running' && (
            <div className={cn('absolute inset-0 rounded-full animate-ping opacity-60', cfg.dot)} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + priority */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold text-slate-200 truncate leading-tight">{exec.name}</span>
            <span className={cn('shrink-0 text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase', PRIORITY_CFG[exec.priority])}>
              {exec.priority}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1 rounded-full bg-white/8 overflow-hidden mb-1.5">
            <motion.div
              className={cn('h-full rounded-full', cfg.barColor)}
              initial={{ width: 0 }}
              animate={{ width: `${exec.progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 text-[9px] font-mono">
            <span className={cn('font-bold', cfg.color)}>{exec.progress}%</span>
            {exec.currentStep && (
              <span className="text-slate-500 truncate">↳ {exec.currentStep}</span>
            )}
            <span className="text-slate-600 ml-auto shrink-0">{exec.duration}</span>
          </div>

          {/* Agent + TC count + actions */}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/8">
              <Bot size={8} className="text-cyan-400" />
              <span className="text-[8px] font-mono text-slate-400">{exec.agent}</span>
            </div>
            <span className="text-[8px] font-mono text-slate-600">{exec.tcCount} TCs</span>
            <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onSelect(); }}
                className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-blue-400 transition-colors"
                title="View DAG"
              >
                <Eye size={9} />
              </button>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-red-400 transition-colors"
                title="Stop"
              >
                <StopCircle size={9} />
              </button>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-violet-400 transition-colors"
                title="Retry"
              >
                <RotateCcw size={9} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExecutionControlPage() {
  const [executions, setExecutions] = useState<Execution[]>(INITIAL_EXECUTIONS);
  const [selectedId, setSelectedId] = useState<string>('exec-001');
  const [logLines, setLogLines] = useState<LogEntry[]>(INITIAL_LOG_LINES);
  const [nodes, , onNodesChange] = useNodesState(BASE_DAG_NODES);
  const [edges, , onEdgesChange] = useEdgesState(DAG_EDGES);
  const logRef = useRef<HTMLDivElement>(null);
  const logIdx = useRef(0);
  const now = useRef(Date.now());

  // Simulate live execution progress
  useEffect(() => {
    const interval = setInterval(() => {
      setExecutions((prev) =>
        prev.map((ex) => {
          if (ex.status === 'running') {
            const inc = Math.floor(Math.random() * 3) + 1;
            const next = Math.min(ex.progress + inc, 99);
            return { ...ex, progress: next };
          }
          if (ex.status === 'queued' && Math.random() < 0.15) {
            return { ...ex, status: 'running' as ExecStatus, duration: '0m 01s' };
          }
          return ex;
        }),
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Append log lines
  useEffect(() => {
    const interval = setInterval(() => {
      const line = ROLLING_LOG_LINES[logIdx.current % ROLLING_LOG_LINES.length];
      logIdx.current += 1;
      const d = new Date();
      const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
      setLogLines((prev) => [...prev.slice(-40), { time, text: line }]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  const metrics = [
    { label: 'Running',  value: executions.filter((e) => e.status === 'running').length,  icon: Activity,     color: 'text-blue-400',    border: 'border-blue-500/25',    bg: 'bg-blue-500/8'    },
    { label: 'Queued',   value: executions.filter((e) => e.status === 'queued').length,   icon: Clock,        color: 'text-amber-400',   border: 'border-amber-500/25',   bg: 'bg-amber-500/8'   },
    { label: 'Passing',  value: 94,                                                        icon: CheckCircle2, color: 'text-emerald-400', border: 'border-emerald-500/25', bg: 'bg-emerald-500/8' },
    { label: 'Failed',   value: executions.filter((e) => e.status === 'failed').length,   icon: XCircle,      color: 'text-red-400',     border: 'border-red-500/25',     bg: 'bg-red-500/8'     },
    { label: 'Agents',   value: 5,                                                         icon: Bot,          color: 'text-cyan-400',    border: 'border-cyan-500/25',    bg: 'bg-cyan-500/8'    },
  ];

  const selected = executions.find((e) => e.id === selectedId);

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-base)] overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/6 bg-[var(--color-surface-1)]">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500">Mission Control</p>
            <h1 className="text-base font-bold text-slate-100 tracking-tight">Execution Control Center</h1>
          </div>
          {/* System status bar */}
          <div className="ml-6 flex items-center gap-4 px-3 py-1 rounded-lg bg-white/4 border border-white/6">
            <div className="flex items-center gap-1.5 text-[9px] font-mono">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">ORCHESTRATOR ONLINE</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500">
              <Zap size={8} className="text-amber-400" />
              <span>5/5 AGENTS</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <div className="text-[9px] font-mono text-slate-500">LATENCY 23ms</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="neon" size="sm">
            <Play size={10} />
            New Run
          </Button>
          <Button variant="glass" size="sm">
            <Pause size={10} />
            Pause All
          </Button>
          <Button variant="danger" size="sm">
            <Square size={10} />
            Stop All
          </Button>
          <Button variant="glass" size="sm">
            <RotateCcw size={10} />
            Retry
          </Button>
        </div>
      </div>

      {/* ── Metric strip ──────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-5 gap-px bg-white/5 border-b border-white/6">
        {metrics.map((m) => (
          <div key={m.label} className={cn('flex items-center gap-3 px-5 py-3 bg-[var(--color-surface-1)]', m.bg)}>
            <div className={cn('p-1.5 rounded-lg border', m.bg, m.border)}>
              <m.icon size={13} className={m.color} />
            </div>
            <div>
              <div className={cn('text-xl font-bold font-mono', m.color)}>{m.value}</div>
              <div className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left: Execution list */}
        <div className="w-[45%] shrink-0 flex flex-col border-r border-white/6 bg-[var(--color-surface-1)]">
          <div className="shrink-0 px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Active Executions</span>
            <RefreshCw size={10} className="text-slate-600 animate-spin" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {executions.map((exec) => (
              <ExecutionRow
                key={exec.id}
                exec={exec}
                selected={selectedId === exec.id}
                onSelect={() => setSelectedId(exec.id)}
              />
            ))}
          </div>
        </div>

        {/* Right: DAG + log */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* DAG header */}
          <div className="shrink-0 px-4 py-2.5 border-b border-white/5 flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Execution DAG</span>
            {selected && (
              <>
                <ChevronRight size={10} className="text-slate-600" />
                <span className="text-[10px] font-mono text-slate-400 truncate">{selected.name}</span>
                <span className={cn('ml-auto text-[9px] font-mono font-bold px-2 py-0.5 rounded border', STATUS_CFG[selected.status].color, STATUS_CFG[selected.status].border, STATUS_CFG[selected.status].bg)}>
                  {selected.status.toUpperCase()}
                </span>
              </>
            )}
          </div>

          {/* React Flow DAG */}
          <div className="flex-1 min-h-0" style={{ height: 'calc(100% - 200px)' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.04)" gap={20} size={1} />
              <Controls className="!bg-[var(--color-surface-2)] !border-white/10" />
            </ReactFlow>
          </div>

          {/* Log stream */}
          <div className="shrink-0 h-48 border-t border-[var(--color-line-default)] flex flex-col bg-[var(--color-surface-1)]">
            <div className="px-4 py-1.5 border-b border-[var(--color-line-default)] flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-[9px] font-mono uppercase tracking-widest text-slate-600">Live Execution Log</span>
            </div>
            <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-0.5">
              {logLines.map((line, i) => (
                <div key={i} className="flex items-start gap-2 font-mono text-[10px]">
                  <span className="text-slate-600 shrink-0">[{line.time}]</span>
                  <span className="text-slate-400">{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Orchestration Timeline ─────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/6 bg-[var(--color-surface-1)]" style={{ height: 120 }}>
        <div className="px-4 py-1.5 flex items-center justify-between border-b border-white/5">
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-600">Orchestration Timeline — Last 5 min</span>
          <span className="text-[9px] font-mono text-slate-600">Sliding window · live</span>
        </div>
        <div className="px-4 pt-2 pb-1">
          {executions.map((exec, idx) => {
            const color = TIMELINE_COLORS[exec.id] ?? '#8b8c97';
            const offset = TIMELINE_OFFSETS[exec.id] ?? 0;
            const width = TIMELINE_WIDTHS[exec.id] ?? 0.3;
            return (
              <div key={exec.id} className="flex items-center gap-2 mb-1">
                <div className="w-36 shrink-0 text-[8px] font-mono text-slate-500 truncate">{exec.name.split('—')[0].trim()}</div>
                <div className="flex-1 h-4 rounded-sm bg-white/4 relative overflow-hidden">
                  <motion.div
                    className="absolute top-0 h-full rounded-sm opacity-70"
                    style={{
                      left: `${offset * 100}%`,
                      width: `${width * 100}%`,
                      background: color,
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: exec.status === 'running' ? [0.55, 0.85, 0.55] : 0.55 }}
                    transition={{ repeat: exec.status === 'running' ? Infinity : 0, duration: 2 }}
                  />
                  {exec.status === 'running' && (
                    <motion.div
                      className="absolute top-0 h-full w-4 rounded-sm opacity-40"
                      style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
                      animate={{ left: ['0%', '100%'] }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Time labels */}
        <div className="px-4 flex justify-between">
          <div className="ml-[144px] flex-1 flex justify-between text-[8px] font-mono text-slate-600">
            <span>-5m</span><span>-4m</span><span>-3m</span><span>-2m</span><span>-1m</span><span>now</span>
          </div>
        </div>
      </div>
    </div>
  );
}
