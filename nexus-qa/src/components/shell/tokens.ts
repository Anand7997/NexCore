// src/components/shell/tokens.ts
// JS-readable design tokens for the mission-control shell.
// CSS source of truth is globals.css; these mirror the values for component math.

export const shellTokens = {
  sidebarWidth:    72,
  topbarHeight:    40,
  telemetryHeight: 30,
  statusHeight:    32,
  pulseHeight:     18,
  rightPanelWidth: 320,
  cornerColor:     'rgba(139, 92, 246, 0.55)',
  violet:          '#8b5cf6',
  violetSoft:      '#a78bfa',
  cyan:            '#06b6d4',
  green:           '#10b981',
  amber:           '#f59e0b',
  red:             '#ef4444',
} as const;

export type StatusKind = 'ok' | 'warn' | 'err' | 'idle' | 'live';

export const STATUS_COLOR: Record<StatusKind, string> = {
  ok:   shellTokens.green,
  warn: shellTokens.amber,
  err:  shellTokens.red,
  idle: '#6b6c7a',
  live: shellTokens.cyan,
};
