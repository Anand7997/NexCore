'use client';

import { useState } from 'react';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';
import { cn } from '@/lib/utils';
import { AIPanel } from './panels/AIPanel';
import { AgentsPanel } from './panels/AgentsPanel';
import { EventsPanel } from './panels/EventsPanel';
import { TelemetryPanel } from './panels/TelemetryPanel';

type Tab = 'ai' | 'agents' | 'events' | 'telemetry';

export function RightPanel() {
  const [tab, setTab] = useState<Tab>('ai');
  const eventCount = useRealtimeStore((s) => s.events.length);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'ai',        label: 'AI',        count: 1 },
    { id: 'agents',    label: 'AGENTS',    count: 3 },
    { id: 'events',    label: 'EVENTS',    count: eventCount },
    { id: 'telemetry', label: 'TELEMETRY' },
  ];

  return (
    <div
      className="flex h-full flex-col"
      style={{
        borderLeft: '1px solid rgba(139,92,246,0.15)',
        background: 'linear-gradient(180deg, rgba(7,7,18,0.95) 0%, rgba(3,3,9,1) 100%)',
      }}
    >
      {/* Tabs */}
      <div className="flex gap-[2px] border-b px-2 pt-2"
        style={{ borderColor: 'rgba(139,92,246,0.10)' }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative flex-1 rounded-t-md px-2 py-2 font-mono text-[9px] transition-colors',
              tab === t.id ? 'text-white' : 'text-[#6b6c7a] hover:text-violet-300',
            )}
            style={{
              letterSpacing: '0.12em',
              background: tab === t.id ? 'rgba(139,92,246,0.10)' : undefined,
            }}
          >
            {t.label}
            {t.count != null && (
              <span className="ml-1 rounded-full px-1.5 text-[8px]"
                style={{ background: 'rgba(139,92,246,0.20)', color: '#a78bfa' }}
              >{t.count}</span>
            )}
            {tab === t.id && (
              <span className="absolute -bottom-[1px] left-2 right-2 h-[2px]"
                style={{ background: 'linear-gradient(90deg, transparent, #8b5cf6, transparent)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'ai'        && <AIPanel />}
        {tab === 'agents'    && <AgentsPanel />}
        {tab === 'events'    && <EventsPanel />}
        {tab === 'telemetry' && <TelemetryPanel />}
      </div>
    </div>
  );
}
