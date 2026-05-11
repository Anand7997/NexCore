'use client';
import { create } from 'zustand';
import type { Execution, LogEntry, AIInsight } from '@/types';

interface ExecutionStore {
  executions: Execution[];
  selectedExecution: Execution | null;
  logs: LogEntry[];
  insights: AIInsight[];

  setSelectedExecution: (e: Execution | null) => void;
  addLog: (log: LogEntry) => void;
  updateExecutionStatus: (id: string, status: Execution['status']) => void;
  updateExecutionProgress: (id: string, completedNodes: number) => void;
  addExecution: (execution: Execution) => void;
  addInsight: (insight: AIInsight) => void;
}

export const useExecutionStore = create<ExecutionStore>((set) => ({
  executions: [],
  selectedExecution: null,
  logs: [],
  insights: [],

  setSelectedExecution: (selectedExecution) => set({ selectedExecution }),
  addLog: (log) => set((s) => ({ logs: [log, ...s.logs].slice(0, 500) })),
  updateExecutionStatus: (id, status) =>
    set((s) => ({
      executions: s.executions.map((e) => (e.id === id ? { ...e, status } : e)),
    })),
  updateExecutionProgress: (id, completedNodes) =>
    set((s) => ({
      executions: s.executions.map((e) =>
        e.id === id ? { ...e, completedNodes: Math.min(completedNodes, e.nodeCount) } : e,
      ),
    })),
  addExecution: (execution) =>
    set((s) => {
      const executions = [execution, ...s.executions];
      const completed = executions.filter((e) => e.status === 'success' || e.status === 'failed');
      if (executions.length > 20 && completed.length > 0) {
        const lastCompleted = completed[completed.length - 1];
        return { executions: executions.filter((e) => e.id !== lastCompleted.id) };
      }
      return { executions };
    }),
  addInsight: (insight) =>
    set((s) => ({ insights: [insight, ...s.insights].slice(0, 20) })),
}));
