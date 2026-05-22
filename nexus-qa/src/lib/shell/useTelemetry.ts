'use client';

import { useEffect, useRef, useState } from 'react';
import { useExecutionStore } from '@/lib/stores/executionStore';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';

export interface TelemetrySnapshot {
  cpu: number;
  mem: number;
  p95: number;
  errRate: number;
  rps: number;
  uptime: number;
  runId: string | null;
  shard: string;
}

export interface TelemetrySeries {
  cpu: number[];
  mem: number[];
  p95: number[];
  errRate: number[];
  rps: number[];
}

const INITIAL_SERIES: TelemetrySeries = {
  cpu:     [34, 31, 36, 38, 33, 35, 37, 32, 30, 34, 39, 36, 33, 35, 31, 34, 37, 35, 32, 34],
  mem:     [4.7, 4.8, 4.6, 4.9, 5.0, 4.8, 4.7, 5.1, 4.9, 4.8, 4.6, 4.7, 5.0, 5.1, 4.9, 4.8, 4.7, 4.9, 5.0, 4.8],
  p95:     [142, 138, 151, 146, 134, 148, 156, 139, 132, 145, 150, 141, 136, 152, 158, 149, 140, 137, 144, 150],
  errRate: [0.25, 0.31, 0.22, 0.28, 0.35, 0.26, 0.30, 0.24, 0.21, 0.27, 0.33, 0.29, 0.23, 0.26, 0.32, 0.28, 0.24, 0.27, 0.31, 0.29],
  rps:     [720, 760, 742, 805, 790, 735, 770, 812, 845, 780, 752, 768, 830, 810, 775, 748, 792, 835, 806, 761],
};

function jitter(prev: number, drift: number, min: number, max: number): number {
  const next = prev + (Math.random() - 0.5) * drift * 2;
  return Math.min(max, Math.max(min, next));
}

/**
 * Synthetic telemetry stream. When a real /api/telemetry endpoint exists,
 * replace the interval loop with a WebSocket subscription; the hook's
 * return shape is the contract.
 */
export function useTelemetry(): { snapshot: TelemetrySnapshot; series: TelemetrySeries } {
  const executions = useExecutionStore((s) => s.executions);
  const events = useRealtimeStore((s) => s.events);
  const seedRef = useRef<TelemetrySeries>(INITIAL_SERIES);

  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>({
    cpu: 34,
    mem: 4.8,
    p95: 150,
    errRate: 0.29,
    rps: 761,
    uptime: 99.97,
    runId: null,
    shard: 'us-west / 3/3',
  });

  const [series, setSeries] = useState<TelemetrySeries>(seedRef.current);

  useEffect(() => {
    const id = setInterval(() => {
      setSnapshot((prev) => {
        const next: TelemetrySnapshot = {
          cpu:     jitter(prev.cpu,     6,  18, 78),
          mem:     jitter(prev.mem,     0.2, 3.5, 7.2),
          p95:     jitter(prev.p95,    18,  92, 280),
          errRate: jitter(prev.errRate, 0.15, 0,  3.5),
          rps:     jitter(prev.rps,   45,  240, 1200),
          uptime:  prev.uptime,
          runId:   executions.find((e) => e.status === 'running')?.id ?? null,
          shard:   prev.shard,
        };
        setSeries((s) => ({
          cpu:     [...s.cpu.slice(1),     next.cpu],
          mem:     [...s.mem.slice(1),     next.mem],
          p95:     [...s.p95.slice(1),     next.p95],
          errRate: [...s.errRate.slice(1), next.errRate],
          rps:     [...s.rps.slice(1),     next.rps],
        }));
        return next;
      });
    }, 2200);
    return () => clearInterval(id);
  }, [executions]);

  useEffect(() => {
    const recentErrors = events.filter((e) => e.severity === 'error').length;
    if (recentErrors > 0) {
      setSnapshot((s) => ({ ...s, errRate: Math.min(3.5, s.errRate + 0.05 * recentErrors) }));
    }
  }, [events]);

  return { snapshot, series };
}
