'use client';
import { AnimatePresence, motion } from 'framer-motion';
import * as Tabs from '@radix-ui/react-tabs';
import { panelSlide } from '@/lib/motion/variants';
import { cn } from '@/lib/utils';

interface FloatingInspectorProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  tabs?: Array<{ id: string; label: string; content: React.ReactNode }>;
  className?: string;
}

export function FloatingInspector({ open, children, tabs, className }: FloatingInspectorProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="inspector"
          variants={panelSlide}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={cn(
            'flex flex-col glass-md border-l border-white/6 overflow-hidden shrink-0',
            'w-90',
            className,
          )}
        >
          {tabs ? (
            <Tabs.Root defaultValue={tabs[0]?.id} className="flex flex-col h-full">
              <Tabs.List className="flex border-b border-white/6 px-3 gap-0 shrink-0">
                {tabs.map((t) => (
                  <Tabs.Trigger
                    key={t.id}
                    value={t.id}
                    className={cn(
                      'text-[11px] px-3 py-2.5 text-slate-500 border-b-2 border-transparent',
                      'hover:text-slate-300 transition-colors',
                      'data-[state=active]:text-indigo-400 data-[state=active]:border-indigo-500',
                    )}
                  >
                    {t.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              {tabs.map((t) => (
                <Tabs.Content key={t.id} value={t.id} className="flex-1 overflow-y-auto min-h-0">
                  {t.content}
                </Tabs.Content>
              ))}
            </Tabs.Root>
          ) : (
            <div className="flex-1 overflow-y-auto">{children}</div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
