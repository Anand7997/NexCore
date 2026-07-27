'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
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
  Brain,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bot,
  Layers,
  Zap,
  Activity,
  Play,
  Eye,
  TrendingUp,
  BarChart2,
  ChevronRight,
  Circle,
  Flame,
  Network,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeKind = 'intentNode' | 'tcNode' | 'moduleNode' | 'agentNode';

interface IntentNodeData extends Record<string, unknown> {
  label: string;
  type: 'intent';
  health: number;
}

interface TcNodeData extends Record<string, unknown> {
  label: string;
  health: number;
  flaky: boolean;
}

interface ModuleNodeData extends Record<string, unknown> {
  label: string;
  testCount: number;
}

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  active: boolean;
}

// ── Health utilities ──────────────────────────────────────────────────────────

function healthColor(h: number): { text: string; border: string; bg: string; hex: string } {
  if (h >= 90) return { text: 'text-emerald-400', border: 'border-emerald-500/60', bg: 'bg-emerald-500/10', hex: '#10b981' };
  if (h >= 75) return { text: 'text-amber-400',   border: 'border-amber-500/60',   bg: 'bg-amber-500/10',   hex: '#f59e0b' };
  return               { text: 'text-red-400',     border: 'border-red-500/60',     bg: 'bg-red-500/10',     hex: '#ef4444' };
}

// ── Custom node components ────────────────────────────────────────────────────

function IntentNodeComponent({ data, selected }: NodeProps<Node<IntentNodeData>>) {
  const hc = healthColor(data.health);
  return (
    <div
      className={cn(
        'relative rounded-2xl border-2 px-5 py-3 min-w-[160px] text-center transition-all',
        selected ? 'border-violet-400' : 'border-violet-500/60',
        'bg-violet-500/10',
      )}
      style={{ boxShadow: selected ? '0 0 20px rgba(139,92,246,0.45)' : '0 0 12px rgba(139,92,246,0.2)' }}
    >
      <Handle type="target" position={Position.Left}  style={{ background: 'rgba(139,92,246,0.6)', border: 'none', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: 'rgba(139,92,246,0.6)', border: 'none', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: 'rgba(139,92,246,0.6)', border: 'none', width: 8, height: 8 }} />
      <div className="flex items-center justify-center gap-1.5 mb-1.5">
        <Brain size={12} className="text-violet-400 shrink-0" />
        <span className="text-[9px] font-mono font-bold text-violet-400 uppercase">Intent</span>
      </div>
      <p className="text-[11px] font-semibold text-slate-100 leading-tight">{data.label}</p>
      <div className="mt-2 flex items-center justify-center gap-1.5">
        <div className="h-1 w-16 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${data.health}%`, background: hc.hex }} />
        </div>
        <span className={cn('text-[9px] font-mono font-bold', hc.text)}>{data.health}%</span>
      </div>
    </div>
  );
}

function TcNodeComponent({ data, selected }: NodeProps<Node<TcNodeData>>) {
  const hc = healthColor(data.health);
  return (
    <div
      className={cn(
        'relative rounded-xl border px-3 py-2 min-w-[130px] transition-all',
        selected ? `${hc.border} ring-1 ring-offset-0` : hc.border,
        hc.bg,
      )}
      style={{ boxShadow: selected ? `0 0 14px ${hc.hex}60` : 'none' }}
    >
      <Handle type="target" position={Position.Top}    style={{ background: hc.hex, border: 'none', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: hc.hex, border: 'none', width: 6, height: 6 }} />
      <Handle type="target" position={Position.Left}   style={{ background: hc.hex, border: 'none', width: 6, height: 6 }} />
      <div className="flex items-center gap-1.5 mb-1">
        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', hc.hex === '#10b981' ? 'bg-emerald-400' : hc.hex === '#f59e0b' ? 'bg-amber-400' : 'bg-red-400')} />
        <span className={cn('text-[9px] font-mono font-bold', hc.text)}>
          {data.label.split(':')[0]}
        </span>
        {data.flaky && (
          <span className="ml-auto text-[7px] font-mono font-bold px-1 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-400">
            FLAKY
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-300 leading-tight truncate">{data.label.split(':')[1]?.trim() ?? data.label}</p>
      <div className="mt-1.5 h-0.5 rounded-full bg-white/8 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${data.health}%`, background: hc.hex }} />
      </div>
    </div>
  );
}

function ModuleNodeComponent({ data, selected }: NodeProps<Node<ModuleNodeData>>) {
  return (
    <div
      className={cn(
        'relative rounded-xl border-2 px-4 py-3 min-w-[140px] transition-all',
        selected ? 'border-cyan-400' : 'border-cyan-500/50',
        'bg-cyan-500/8',
      )}
      style={{ boxShadow: selected ? '0 0 16px rgba(6,182,212,0.35)' : '0 0 8px rgba(6,182,212,0.12)' }}
    >
      <Handle type="source" position={Position.Bottom} style={{ background: 'rgba(6,182,212,0.7)', border: 'none', width: 8, height: 8 }} />
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1 rounded-md bg-cyan-500/20 border border-cyan-500/30">
          <Layers size={10} className="text-cyan-400" />
        </div>
        <span className="text-[8px] font-mono font-bold text-cyan-400 uppercase">Module</span>
      </div>
      <p className="text-[11px] font-semibold text-slate-100">{data.label}</p>
      <div className="mt-1 text-[8px] font-mono text-slate-500">{data.testCount} test cases</div>
    </div>
  );
}

function AgentNodeComponent({ data, selected }: NodeProps<Node<AgentNodeData>>) {
  return (
    <div
      className={cn(
        'relative rounded-full border-2 w-[90px] h-[90px] flex flex-col items-center justify-center transition-all',
        selected      ? (data.active ? 'border-amber-400' : 'border-slate-400') :
        data.active   ? 'border-amber-500/70' : 'border-slate-600/50',
        data.active ? 'bg-amber-500/10' : 'bg-white/3',
      )}
      style={{ boxShadow: data.active ? (selected ? '0 0 20px rgba(245,158,11,0.5)' : '0 0 12px rgba(245,158,11,0.2)') : 'none' }}
    >
      <Handle type="target" position={Position.Top} style={{ background: data.active ? 'rgba(245,158,11,0.7)' : 'rgba(100,100,100,0.5)', border: 'none', width: 6, height: 6 }} />
      {data.active && <div className="absolute inset-0 rounded-full border-2 border-amber-400/30 animate-ping" />}
      <Bot size={18} className={data.active ? 'text-amber-400' : 'text-slate-500'} />
      <span className={cn('text-[8px] font-mono font-bold mt-1 text-center px-1 leading-tight', data.active ? 'text-amber-400' : 'text-slate-500')}>
        {data.label}
      </span>
      {data.active && (
        <div className="mt-0.5 flex items-center gap-0.5">
          <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[7px] font-mono text-emerald-400">LIVE</span>
        </div>
      )}
    </div>
  );
}

const nodeTypes = {
  intentNode: IntentNodeComponent,
  tcNode:     TcNodeComponent,
  moduleNode: ModuleNodeComponent,
  agentNode:  AgentNodeComponent,
};

// ── Graph data ─────────────────────────────────────────────────────────────────

const KG_NODES: Node[] = [
  // Intent nodes
  { id: 'i1', type: 'intentNode', position: { x: 280, y: 220 }, data: { label: 'Book International Flight', type: 'intent', health: 87 } },
  { id: 'i2', type: 'intentNode', position: { x: 700, y: 220 }, data: { label: 'Process Payment', type: 'intent', health: 72 } },

  // Testcase nodes
  { id: 't1', type: 'tcNode', position: { x: 100, y: 390 }, data: { label: 'TC-001: Valid Login',    health: 98,  flaky: false } },
  { id: 't2', type: 'tcNode', position: { x: 280, y: 420 }, data: { label: 'TC-002: Flight Search',  health: 87,  flaky: true  } },
  { id: 't3', type: 'tcNode', position: { x: 460, y: 390 }, data: { label: 'TC-003: Payment 3DS',   health: 72,  flaky: false } },
  { id: 't4', type: 'tcNode', position: { x: 700, y: 390 }, data: { label: 'TC-004: Invoice PDF',   health: 100, flaky: false } },

  // Module nodes
  { id: 'm1', type: 'moduleNode', position: { x: 80,  y: 100 }, data: { label: 'Authentication',  testCount: 4  } },
  { id: 'm2', type: 'moduleNode', position: { x: 420, y: 80  }, data: { label: 'Booking Engine',  testCount: 14 } },
  { id: 'm3', type: 'moduleNode', position: { x: 800, y: 100 }, data: { label: 'Payment',         testCount: 8  } },

  // Agent nodes
  { id: 'a1', type: 'agentNode', position: { x: 80,  y: 530 }, data: { label: 'Agent Alpha', active: true  } },
  { id: 'a2', type: 'agentNode', position: { x: 600, y: 530 }, data: { label: 'Agent Beta',  active: false } },
];

const KG_EDGES: Edge[] = [
  // module → intent (dashed gray)
  { id: 'em1-i1', source: 'm1', target: 'i1', style: { stroke: 'rgba(139,139,160,0.3)', strokeDasharray: '5 4', strokeWidth: 1.5 }, label: 'contains', labelStyle: { fontSize: 8, fill: 'rgba(139,139,160,0.5)' } },
  { id: 'em2-i1', source: 'm2', target: 'i1', style: { stroke: 'rgba(139,139,160,0.3)', strokeDasharray: '5 4', strokeWidth: 1.5 } },
  { id: 'em2-i2', source: 'm2', target: 'i2', style: { stroke: 'rgba(139,139,160,0.3)', strokeDasharray: '5 4', strokeWidth: 1.5 } },
  { id: 'em3-i2', source: 'm3', target: 'i2', style: { stroke: 'rgba(139,139,160,0.3)', strokeDasharray: '5 4', strokeWidth: 1.5 } },

  // intent → tc (solid)
  { id: 'ei1-t1', source: 'i1', target: 't1', sourceHandle: 'bottom', style: { stroke: 'rgba(139,92,246,0.45)', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(139,92,246,0.45)' } },
  { id: 'ei1-t2', source: 'i1', target: 't2', sourceHandle: 'bottom', style: { stroke: 'rgba(139,92,246,0.45)', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(139,92,246,0.45)' } },
  { id: 'ei1-t3', source: 'i1', target: 't3', sourceHandle: 'bottom', style: { stroke: 'rgba(139,92,246,0.45)', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(139,92,246,0.45)' } },
  { id: 'ei2-t4', source: 'i2', target: 't4', sourceHandle: 'bottom', style: { stroke: 'rgba(139,92,246,0.45)', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(139,92,246,0.45)' } },

  // tc → agent (dotted)
  { id: 'et1-a1', source: 't1', target: 'a1', style: { stroke: 'rgba(245,158,11,0.3)', strokeDasharray: '3 3', strokeWidth: 1 } },
  { id: 'et2-a1', source: 't2', target: 'a1', style: { stroke: 'rgba(245,158,11,0.3)', strokeDasharray: '3 3', strokeWidth: 1 } },
  { id: 'et3-a2', source: 't3', target: 'a2', style: { stroke: 'rgba(245,158,11,0.3)', strokeDasharray: '3 3', strokeWidth: 1 } },
  { id: 'et4-a2', source: 't4', target: 'a2', style: { stroke: 'rgba(245,158,11,0.3)', strokeDasharray: '3 3', strokeWidth: 1 } },

  // tc → tc failure impact (red animated)
  { id: 'et2-t3', source: 't2', target: 't3', animated: true, style: { stroke: 'rgba(239,68,68,0.55)', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(239,68,68,0.55)' }, label: 'impacts', labelStyle: { fontSize: 8, fill: 'rgba(239,68,68,0.6)' } },
];

// ── Node detail data ──────────────────────────────────────────────────────────

const NODE_DETAIL: Record<string, {
  name: string; kind: string; health?: number; description: string;
  relations: string[]; impact: string; recentRuns?: { result: string; time: string }[];
}> = {
  i1: { name: 'Book International Flight', kind: 'Intent',  health: 87, description: 'Core booking workflow intent covering search, seat selection, and payment.', relations: ['Authentication', 'Booking Engine', 'TC-001', 'TC-002', 'TC-003'], impact: 'Failure impacts 14 downstream test cases', recentRuns: [{ result: 'pass', time: '2m ago' }, { result: 'pass', time: '12m ago' }, { result: 'fail', time: '1h ago' }, { result: 'pass', time: '3h ago' }, { result: 'pass', time: '5h ago' }] },
  i2: { name: 'Process Payment',           kind: 'Intent',  health: 72, description: 'Payment processing intent covering credit card, 3DS auth, and confirmation.', relations: ['Payment', 'Booking Engine', 'TC-003', 'TC-004'], impact: 'Failure impacts 8 downstream test cases', recentRuns: [{ result: 'fail', time: '5m ago' }, { result: 'fail', time: '25m ago' }, { result: 'pass', time: '2h ago' }, { result: 'pass', time: '4h ago' }, { result: 'pass', time: '6h ago' }] },
  t1: { name: 'TC-001: Valid Login',       kind: 'TC Node', health: 98, description: 'Tests user login with valid credentials across web and mobile.', relations: ['Authentication', 'Agent Alpha', 'i1'], impact: 'No downstream impact', recentRuns: [{ result: 'pass', time: '3m ago' }, { result: 'pass', time: '15m ago' }, { result: 'pass', time: '45m ago' }, { result: 'pass', time: '2h ago' }, { result: 'pass', time: '4h ago' }] },
  t2: { name: 'TC-002: Flight Search',     kind: 'TC Node', health: 87, description: 'Validates flight search results, filters, and sort order. Marked flaky.', relations: ['Booking Engine', 'TC-003', 'Agent Alpha'], impact: 'Failure impacts TC-003 (Payment 3DS)', recentRuns: [{ result: 'pass', time: '4m ago' }, { result: 'pass', time: '22m ago' }, { result: 'fail', time: '1h ago' }, { result: 'pass', time: '3h ago' }, { result: 'pass', time: '5h ago' }] },
  t3: { name: 'TC-003: Payment 3DS',       kind: 'TC Node', health: 72, description: 'Validates 3DS payment submission. Currently failing due to locator change.', relations: ['Payment', 'TC-002', 'Agent Beta'], impact: 'Blocks 3 downstream tests', recentRuns: [{ result: 'fail', time: '5m ago' }, { result: 'fail', time: '35m ago' }, { result: 'pass', time: '2h ago' }, { result: 'fail', time: '5h ago' }, { result: 'pass', time: '8h ago' }] },
  t4: { name: 'TC-004: Invoice PDF',       kind: 'TC Node', health: 100, description: 'Validates PDF invoice generation and download after booking.', relations: ['Payment', 'Agent Beta'], impact: 'No downstream impact', recentRuns: [{ result: 'pass', time: '6m ago' }, { result: 'pass', time: '30m ago' }, { result: 'pass', time: '1h ago' }, { result: 'pass', time: '3h ago' }, { result: 'pass', time: '6h ago' }] },
  m1: { name: 'Authentication',            kind: 'Module',  description: '4 test cases covering login, logout, token refresh, and 2FA.', relations: ['TC-001', 'Intent: Book Flight'], impact: 'Failure impacts 4 test cases', recentRuns: [] },
  m2: { name: 'Booking Engine',            kind: 'Module',  description: '14 test cases spanning search, availability, pricing, and seat selection.', relations: ['TC-002', 'Intent: Book Flight', 'Intent: Process Payment'], impact: 'Failure impacts 14 test cases', recentRuns: [] },
  m3: { name: 'Payment',                   kind: 'Module',  description: '8 test cases covering credit card, 3DS, refunds, and invoices.', relations: ['TC-003', 'TC-004', 'Intent: Process Payment'], impact: 'Failure impacts 8 test cases', recentRuns: [] },
  a1: { name: 'Agent Alpha',               kind: 'Agent',   description: 'Active agent running regression suite. Executing Book International Flight.', relations: ['TC-001', 'TC-002'], impact: 'Running 2 active test cases', recentRuns: [] },
  a2: { name: 'Agent Beta',                kind: 'Agent',   description: 'Standby agent. Last used 4 hours ago for Payment Suite run.', relations: ['TC-003', 'TC-004'], impact: 'Idle', recentRuns: [] },
};

const VIEW_MODES = ['All', 'Failing Only', 'Flaky Clusters', 'Critical Path'] as const;
type ViewMode = typeof VIEW_MODES[number];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KnowledgeGraphPage() {
  const [nodes, , onNodesChange] = useNodesState(KG_NODES);
  const [edges, , onEdgesChange] = useEdgesState(KG_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('All');
  const [heatOverlay, setHeatOverlay] = useState(false);
  const [layout, setLayout] = useState<'force' | 'hierarchical' | 'radial'>('force');

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const selectedDetail = selectedNodeId ? NODE_DETAIL[selectedNodeId] : null;

  // Filter nodes for non-All views
  const visibleNodes = useMemo(() => {
    if (viewMode === 'All') return nodes;
    if (viewMode === 'Failing Only') return nodes.filter((n) => {
      const d = n.data as TcNodeData & IntentNodeData;
      return d.health !== undefined && d.health < 80;
    });
    if (viewMode === 'Flaky Clusters') return nodes.filter((n) => {
      const d = n.data as TcNodeData;
      return d.flaky || n.type === 'agentNode';
    });
    return nodes; // critical path — show all for now
  }, [nodes, viewMode]);

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-base)] overflow-hidden">

      {/* ── Header + controls ──────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-4 px-6 py-3 border-b border-white/6 bg-[var(--color-surface-1)]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30">
            <Network size={14} className="text-violet-400" />
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500">Intelligence Layer</p>
            <h1 className="text-base font-bold text-slate-100 tracking-tight">Execution Knowledge Graph</h1>
          </div>
        </div>

        {/* View mode toggles */}
        <div className="flex items-center gap-1 ml-4 bg-white/4 rounded-lg p-0.5 border border-white/8">
          {VIEW_MODES.map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={cn(
                'px-3 py-1.5 rounded-md text-[9px] font-mono transition-all whitespace-nowrap',
                viewMode === m
                  ? 'bg-violet-500/25 border border-violet-500/40 text-violet-300'
                  : 'text-slate-500 hover:text-slate-300',
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Heat overlay toggle */}
        <button
          onClick={() => setHeatOverlay((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-mono transition-all',
            heatOverlay
              ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
              : 'bg-white/4 border-white/10 text-slate-500 hover:text-slate-300',
          )}
        >
          <Flame size={9} />
          Heat Overlay
        </button>

        {/* Layout buttons */}
        <div className="flex items-center gap-1 ml-auto">
          {(['force', 'hierarchical', 'radial'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className={cn(
                'px-2.5 py-1.5 rounded-md text-[9px] font-mono capitalize transition-all border',
                layout === l
                  ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                  : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main split ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Graph canvas */}
        <div className="flex-1 relative min-w-0">
          {heatOverlay && (
            <div className="absolute inset-0 pointer-events-none z-10">
              {/* Red heat zones over low-health areas */}
              <div className="absolute" style={{ left: '40%', top: '35%', width: 200, height: 160, background: 'radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)', borderRadius: '50%' }} />
              <div className="absolute" style={{ left: '60%', top: '25%', width: 160, height: 140, background: 'radial-gradient(circle, rgba(239,68,68,0.07) 0%, transparent 70%)', borderRadius: '50%' }} />
              <div className="absolute" style={{ left: '20%', top: '35%', width: 140, height: 120, background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
            </div>
          )}

          <ReactFlow
            nodes={visibleNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.3}
            maxZoom={2}
          >
            <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.035)" gap={24} size={1} />
            <Controls className="!bg-[var(--color-surface-2)] !border-white/10" />
            <MiniMap
              className="!bg-[var(--color-surface-2)] !border-white/10"
              nodeColor={(n) => {
                if (n.type === 'intentNode') return '#8b5cf6';
                if (n.type === 'moduleNode') return '#06b6d4';
                if (n.type === 'agentNode')  return '#f59e0b';
                const d = n.data as TcNodeData;
                return d.health !== undefined ? healthColor(d.health).hex : '#5a5b67';
              }}
              maskColor="rgba(6,6,9,0.65)"
            />
          </ReactFlow>

          {/* Legend overlay */}
          <div className="absolute bottom-4 left-4 z-20 bg-[var(--color-surface-2)]/95 backdrop-blur-sm rounded-xl border border-white/8 p-3 space-y-3">
            <p className="text-[8px] font-mono uppercase tracking-widest text-slate-600">Legend</p>
            <div className="space-y-1.5">
              <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider mb-1">Nodes</p>
              {[
                { color: 'bg-violet-500/60', label: 'Intent' },
                { color: 'bg-cyan-500/60',   label: 'Module' },
                { color: 'bg-emerald-400',   label: 'TC (Healthy ≥90%)' },
                { color: 'bg-amber-400',     label: 'TC (Warning 75–89%)' },
                { color: 'bg-red-400',       label: 'TC (Critical <75%)' },
                { color: 'bg-amber-500/60',  label: 'Agent' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={cn('w-2.5 h-2.5 rounded-sm', item.color)} />
                  <span className="text-[8px] font-mono text-slate-500">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 border-t border-white/6 pt-2">
              <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider mb-1">Edges</p>
              {[
                { dash: true,  color: 'rgba(139,139,160,0.6)', label: 'Module contains' },
                { dash: false, color: '#8b5cf6',               label: 'Intent defines TC' },
                { dash: true,  color: '#f59e0b',               label: 'Executed by Agent' },
                { dash: false, color: '#ef4444',               label: 'Failure impact' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <svg width="18" height="6" className="shrink-0">
                    <line
                      x1="0" y1="3" x2="18" y2="3"
                      stroke={item.color}
                      strokeWidth="1.5"
                      strokeDasharray={item.dash ? '4 3' : 'none'}
                    />
                  </svg>
                  <span className="text-[8px] font-mono text-slate-500">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel: Node intelligence */}
        <div className="w-72 shrink-0 flex flex-col border-l border-white/6 bg-[var(--color-surface-1)] overflow-y-auto">
          <div className="shrink-0 px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
            <Brain size={10} className="text-violet-400" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Node Intelligence</span>
          </div>

          <AnimatePresence mode="wait">
            {selectedDetail ? (
              <motion.div
                key={selectedNodeId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="flex-1 p-4 space-y-4"
              >
                {/* Node name + type */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/25 text-violet-400 uppercase">
                      {selectedDetail.kind}
                    </span>
                  </div>
                  <h2 className="text-sm font-bold text-slate-100 leading-tight">{selectedDetail.name}</h2>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{selectedDetail.description}</p>
                </div>

                {/* Health gauge (if applicable) */}
                {selectedDetail.health !== undefined && (
                  <div className="rounded-xl border border-white/8 bg-white/3 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Health Score</span>
                      <span className={cn('text-lg font-bold font-mono', healthColor(selectedDetail.health).text)}>
                        {selectedDetail.health}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: healthColor(selectedDetail.health).hex }}
                        initial={{ width: 0 }}
                        animate={{ width: `${selectedDetail.health}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      {selectedDetail.health >= 90
                        ? <CheckCircle2 size={10} className="text-emerald-400" />
                        : selectedDetail.health >= 75
                        ? <AlertTriangle size={10} className="text-amber-400" />
                        : <XCircle size={10} className="text-red-400" />}
                      <span className={cn('text-[9px] font-mono', healthColor(selectedDetail.health).text)}>
                        {selectedDetail.health >= 90 ? 'Healthy' : selectedDetail.health >= 75 ? 'Degraded' : 'Critical'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Recent runs */}
                {selectedDetail.recentRuns && selectedDetail.recentRuns.length > 0 && (
                  <div className="rounded-xl border border-white/8 bg-white/3 p-3">
                    <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                      <Activity size={8} />
                      Last 5 Runs
                    </p>
                    <div className="space-y-1">
                      {selectedDetail.recentRuns.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className={cn('w-2 h-2 rounded-full shrink-0', r.result === 'pass' ? 'bg-emerald-400' : 'bg-red-400')} />
                          <span className={cn('text-[9px] font-mono font-semibold', r.result === 'pass' ? 'text-emerald-400' : 'text-red-400')}>{r.result.toUpperCase()}</span>
                          <span className="text-[9px] font-mono text-slate-600 ml-auto">{r.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Related nodes */}
                <div className="rounded-xl border border-white/8 bg-white/3 p-3">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                    <Network size={8} />
                    Related Nodes
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedDetail.relations.map((r) => (
                      <span key={r} className="text-[8px] font-mono px-1.5 py-0.5 rounded-md bg-white/6 border border-white/10 text-slate-400">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Impact analysis */}
                <div className="rounded-xl border border-white/8 bg-white/3 p-3">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                    <TrendingUp size={8} />
                    Impact Analysis
                  </p>
                  <p className="text-[10px] text-slate-300">{selectedDetail.impact}</p>
                </div>

                {/* Quick actions */}
                <div className="space-y-2">
                  <Button variant="glass" size="sm" className="w-full justify-start gap-2">
                    <Eye size={10} />
                    View in Designer
                  </Button>
                  <Button variant="neon" size="sm" className="w-full justify-start gap-2">
                    <Play size={10} />
                    Run Now
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                    <Brain size={10} />
                    Investigate
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col items-center justify-center p-6 text-center"
              >
                <div className="p-4 rounded-2xl bg-violet-500/8 border border-violet-500/15 mb-4">
                  <Network size={28} className="text-violet-400/60" />
                </div>
                <p className="text-sm text-slate-500">Click a node to explore</p>
                <p className="text-[10px] font-mono text-slate-600 mt-1">intelligence, relationships,<br />and execution history</p>

                {/* Global stats while empty */}
                <div className="mt-6 w-full space-y-2">
                  {[
                    { label: 'Total Nodes',    value: '11',  icon: BarChart2, color: 'text-violet-400' },
                    { label: 'Test Cases',      value: '26',  icon: CheckCircle2, color: 'text-emerald-400' },
                    { label: 'Active Agents',   value: '1/2', icon: Bot,      color: 'text-amber-400'  },
                    { label: 'Avg Health',       value: '87%', icon: Activity, color: 'text-blue-400'   },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/3 border border-white/6">
                      <s.icon size={10} className={s.color} />
                      <span className="text-[9px] font-mono text-slate-500 flex-1">{s.label}</span>
                      <span className={cn('text-[10px] font-mono font-bold', s.color)}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
