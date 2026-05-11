'use client';
import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

interface ExecutionMetricCardProps {
  label: string;
  value: number;
  unit?: string;
  delta?: number;
  sparkData?: number[];
  icon?: React.ReactNode;
  color?: string;
  className?: string;
}

function useCountUp(target: number, duration = 600) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const from = display;

    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (target - from) * eased);
      if (progress < 1) raf.current = requestAnimationFrame(step);
    }

    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}

export function ExecutionMetricCard({
  label,
  value,
  unit,
  delta,
  sparkData,
  icon,
  color = '#6366f1',
  className,
}: ExecutionMetricCardProps) {
  const animated = useCountUp(value);
  const displayValue = value < 10 ? animated.toFixed(1) : Math.round(animated).toLocaleString();

  const sparkPoints = sparkData?.map((v) => ({ v })) ?? [];

  return (
    <div className={cn('glass rounded-xl p-4 flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</span>
        {icon && <span style={{ color }} className="opacity-60">{icon}</span>}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span
            className="text-2xl font-bold font-mono animate-count-up"
            style={{ color }}
          >
            {displayValue}
          </span>
          {unit && <span className="text-xs text-slate-500">{unit}</span>}
        </div>

        {delta != null && (
          <span className={cn('text-[10px] font-mono shrink-0 mb-0.5', delta >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
      </div>

      {sparkPoints.length > 0 && (
        <div className="h-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkPoints}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                strokeOpacity={0.7}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
