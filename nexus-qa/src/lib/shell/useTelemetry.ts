'use client';

import { useEffect, useRef, useState } from 'react';
import { useExecutionStore } from '@/lib/stores/executionStore';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';

export interface TelemetrySnapshot {
  cpu: number;          // %
  mem: number;          // GB
  p95: number;          // ms
  errRate: number;      // %
  rps: number;          // requests / s (synthetic)
  uptime: number;       // % (always > 99)
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

const HISTORY = 20;

function jitter(prev: number, drift: number, min: number, max: number): number {
  const next = prev + (Math.random() - 0.5) * drift * 2;
  return Math.min(max, Math.max(min, next));
}

/**
 * Synthetic telemetry stream. When a real /api/telemetry endpoint exists,
 * replace the setInterval loop with a WebSocket subscription; the hook's
 * return shape is the contract.
 */
export function useTelemetry(): { snapshot: TelemetrySnapshot; series: TelemetrySeries } {
  const executions = useExecutionStore((s) => s.executions);
  const events = useRealtimeStore((s) => s.events);
  const seedRef = useRef<TelemetrySeries | null>(null);

  if (seedRef.current === null) {
    seedRef.current = {
      cpu:     Array.from({ length: HISTORY }, () => 30 + Math.random() * 10),
      mem:     Array.from({ length: HISTORY }, () => 4.5 + Math.random() * 0.8),
      p95:     Array.from({ length: HISTORY }, () => 130 + Math.random() * 30),
      errRate: Array.from({ length: HISTORY }, () => 0.2 + Math.random() * 0.5),
      rps:     Array.from({ length: HISTORY }, () => 700 + Math.random() * 250),
    };
  }

  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>({
    cpu: 32, mem: 4.8, p95: 138, errRate: 0.3, rps: 720, uptime: 99.97, runId: null, shard: 'us-west · 3/3',
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
