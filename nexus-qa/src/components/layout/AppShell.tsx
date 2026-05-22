'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import TerminalDock from './TerminalDock';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { useUIStore } from '@/lib/stores/uiStore';
import { notificationSlide } from '@/lib/motion/variants';
import { cn } from '@/lib/utils';
import { useWebSocket } from '@/hooks/useWebSocket';
import { AppFrame } from '@/components/shell/AppFrame';
import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';
import { TelemetryStrip } from '@/components/shell/TelemetryStrip';
import { ViewportChrome } from '@/components/shell/ViewportChrome';
import { MiniRadar } from '@/components/shell/MiniRadar';
import { QuickDock } from '@/components/shell/QuickDock';
import { StatusStrip } from '@/components/shell/StatusStrip';
import { PulseRail } from '@/components/shell/PulseRail';
import { RightPanel } from '@/components/shell/RightPanel';
import { CommandPalette } from '@/components/shell/CommandPalette';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { inspectorOpen, notifications, dismissNotification, theme, setTheme } = useUIStore();
  useWebSocket();

  useEffect(() => {
    const saved = localStorage.getItem('nexcore-theme') as 'dark' | 'light' | null;
    if (saved && saved !== theme) setTheme(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nexcore-theme', theme);
  }, [theme]);

  return (
    <TooltipProvider delayDuration={400}>
      <AppFrame
        sidebar={<Sidebar />}
        topbar={<TopBar />}
        telemetry={<TelemetryStrip />}
        viewport={
          <ViewportChrome>
            {children}
            <MiniRadar />
            <QuickDock />
          </ViewportChrome>
        }
        rightPanel={inspectorOpen ? <RightPanel /> : undefined}
        statusStrip={<StatusStrip />}
        pulseRail={<PulseRail />}
      />

      {/* Terminal dock (existing) — overlays the bottom of the viewport when open */}
      <TerminalDock />

      {/* Command palette */}
      <CommandPalette />

      {/* Notification stack */}
      <div className="pointer-events-none fixed bottom-16 right-4 z-[70] flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              variants={notificationSlide}
              initial="hidden" animate="visible" exit="exit"
              className={cn(
                'pointer-events-auto flex min-w-[280px] max-w-[340px] items-start gap-3 rounded-xl px-3.5 py-3 glass-md',
                n.severity === 'error'   && 'border border-red-500/20',
                n.severity === 'success' && 'border border-emerald-500/20',
                n.severity === 'warn'    && 'border border-amber-500/20',
                n.severity === 'info'    && 'border border-violet-500/20',
              )}
              style={{ boxShadow: 'var(--shadow-pop)' }}
            >
              <span className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
                n.severity === 'error'   && 'bg-red-500/15 text-red-400',
                n.severity === 'success' && 'bg-emerald-500/15 text-emerald-400',
                n.severity === 'warn'    && 'bg-amber-500/15 text-amber-400',
                n.severity === 'info'    && 'bg-violet-500/15 text-violet-400',
              )}>
                {n.severity === 'error' ? '!' : n.severity === 'success' ? '✓' : n.severity === 'warn' ? '!' : 'i'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold" style={{ color: '#e7e7ee' }}>{n.title}</p>
                <p className="mt-0.5 text-[10px]" style={{ color: '#b6b7c3' }}>{n.message}</p>
              </div>
              <button onClick={() => dismissNotification(n.id)}
                className="mt-0.5 shrink-0 transition-colors hover:text-white"
                style={{ color: '#6b6c7a' }}
              ><X size={12} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
