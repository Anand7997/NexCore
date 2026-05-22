'use client';

import { useRouter } from 'next/navigation';
import { Play, Search, Plus, Sparkles, Pause } from 'lucide-react';
import { useUIStore } from '@/lib/stores/uiStore';

export function QuickDock() {
  const router = useRouter();
  const { toggleCommandPalette } = useUIStore();

  const buttons = [
    { icon: Play,      label: 'Executions',  action: () => router.push('/executions'),    primary: false },
    { icon: Search,    label: 'Search (⌘K)', action: toggleCommandPalette,                primary: false },
    { icon: Plus,      label: 'Create',      action: () => router.push('/workspace/new'), primary: true  },
    { icon: Sparkles,  label: 'AI Workflow', action: () => router.push('/ai-workflow'),   primary: false },
    { icon: Pause,     label: 'Pause All',   action: () => { /* placeholder */ },         primary: false },
  ];

  return (
    <div
      className="pointer-events-auto absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full p-[5px]"
      style={{
        background: 'rgba(4,4,12,0.85)',
        border: '1px solid rgba(139,92,246,0.30)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 24px rgba(139,92,246,0.18)',
      }}
    >
      {buttons.map((b) => {
        const Icon = b.icon;
        return (
          <button
            key={b.label}
            onClick={b.action}
            aria-label={b.label}
            title={b.label}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            style={
              b.primary
                ? {
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.6), rgba(6,182,212,0.4))',
                    color: '#fff',
                    boxShadow: '0 0 16px rgba(139,92,246,0.40)',
                  }
                : { color: '#8f90a0' }
            }
            onMouseEnter={(e) => { if (!b.primary) e.currentTarget.style.color = '#c4b5fd'; }}
            onMouseLeave={(e) => { if (!b.primary) e.currentTarget.style.color = '#8f90a0'; }}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
