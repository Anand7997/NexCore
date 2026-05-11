'use client';
import { create } from 'zustand';
import type { RealtimeEvent } from '@/types';

interface RealtimeStore {
  isRunning: boolean;
  tickCount: number;
  lastTickAt: number | null;
  events: RealtimeEvent[];
  activeNodeMap: Record<string, string>;

  setRunning: (v: boolean) => void;
  incrementTick: () => void;
  addEvent: (event: RealtimeEvent) => void;
  clearEvents: () => void;
  setActiveNode: (executionId: string, nodeId: string) => void;
}

export const useRealtimeStore = create<RealtimeStore>((set) => ({
  isRunning: false,
  tickCount: 0,
  lastTickAt: null,
  events: [],
  activeNodeMap: {},

  setRunning: (v) => set({ isRunning: v }),
  incrementTick: () => set((s) => ({ tickCount: s.tickCount + 1, lastTickAt: Date.now() })),
  addEvent: (event) =>
    set((s) => ({ events: [event, ...s.events].slice(0, 100) })),
  clearEvents: () => set({ events: [] }),
  setActiveNode: (executionId, nodeId) =>
    set((s) => ({ activeNodeMap: { ...s.activeNodeMap, [executionId]: nodeId } })),
}));
