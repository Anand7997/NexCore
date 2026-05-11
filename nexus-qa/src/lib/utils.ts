import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ExecutionStatus } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function getStatusColor(status: ExecutionStatus): string {
  const map: Record<ExecutionStatus, string> = {
    running: '#3b82f6',
    success: '#10b981',
    failed: '#ef4444',
    queued: '#f59e0b',
    retrying: '#8b5cf6',
    skipped: '#6b7280',
    cancelled: '#6b7280',
  };
  return map[status];
}

export function getStatusGlow(status: ExecutionStatus): string {
  const map: Record<ExecutionStatus, string> = {
    running: 'animate-pulse-blue',
    success: 'animate-pulse-green',
    failed: 'animate-pulse-red',
    queued: '',
    retrying: 'animate-pulse-violet',
    skipped: '',
    cancelled: '',
  };
  return map[status];
}

export function getStatusLabel(status: ExecutionStatus): string {
  const map: Record<ExecutionStatus, string> = {
    running: 'RUNNING',
    success: 'SUCCESS',
    failed: 'FAILED',
    queued: 'QUEUED',
    retrying: 'RETRYING',
    skipped: 'SKIPPED',
    cancelled: 'CANCELLED',
  };
  return map[status];
}

export function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}
