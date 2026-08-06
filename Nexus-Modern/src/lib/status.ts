export type StatusTone = 'success' | 'active' | 'warning' | 'danger' | 'neutral';

const TONE_COLOR: Record<StatusTone, string> = {
  success: '#34d399',
  active: '#38bdf8',
  warning: '#fbbf24',
  danger: '#f87171',
  neutral: '#64748b',
};

const TONE_KEYWORDS: Array<[StatusTone, string[]]> = [
  ['danger', ['error', 'failed', 'offline', 'blocked', 'unhealthy', 'unavailable']],
  ['warning', ['degraded', 'queued', 'pending', 'retry']],
  ['active', ['running', 'busy', 'live', 'in_progress', 'in progress']],
  ['success', ['success', 'healthy', 'ready', 'online', 'ok', 'completed', 'passed', 'up']],
  ['neutral', ['skipped', 'cancelled', 'unknown', 'idle', 'empty']],
];

export function getStatusTone(status: string | null | undefined): StatusTone {
  const value = (status ?? '').toLowerCase();
  for (const [tone, keywords] of TONE_KEYWORDS) {
    if (keywords.some((keyword) => value.includes(keyword))) {
      return tone;
    }
  }
  return 'neutral';
}

export function getStatusColor(status: string | null | undefined): string {
  return TONE_COLOR[getStatusTone(status)];
}
