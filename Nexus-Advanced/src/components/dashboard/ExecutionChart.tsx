'use client';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';
import type { MetricSeries } from '@/types';

interface ExecutionChartProps {
  data: MetricSeries[];
  color?: string;
  gradientId?: string;
  unit?: string;
  height?: number;
}

function CustomTooltip({ active, payload, label, unit }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 border border-white/10 text-xs">
      <div className="text-slate-400 font-mono mb-1">{label}</div>
      <div className="text-white font-bold font-mono">
        {payload[0].value.toLocaleString()}{unit && <span className="text-slate-400 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

export default function ExecutionChart({
  data, color = '#6366f1', gradientId = 'grad1', unit, height = 80,
}: ExecutionChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    label: format(new Date(d.timestamp), 'HH:mm'),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: '#475569', fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={false}
          interval={5}
        />
        <YAxis hide />
        <Tooltip content={<CustomTooltip unit={unit} />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
