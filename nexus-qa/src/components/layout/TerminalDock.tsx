'use client';
import { useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Terminal, Filter } from 'lucide-react';
import { useUIStore } from '@/lib/stores/uiStore';
import { TerminalContainer } from '@/components/ui/TerminalContainer';

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;

export default function TerminalDock() {
  const { terminalOpen, terminalHeight, toggleTerminal, setTerminalHeight } = useUIStore();
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = terminalHeight;

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const delta = startY.current - ev.clientY;
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startH.current + delta));
      setTerminalHeight(next);
    }

    function onUp() {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [terminalHeight, setTerminalHeight]);

  return (
    <AnimatePresence>
      {terminalOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: terminalHeight, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass shrink-0 border-t border-white/5 flex flex-col overflow-hidden"
          style={{ minHeight: 0 }}
        >
          {/* Drag handle */}
          <div
            onMouseDown={onDragStart}
            className="group h-1 w-full shrink-0 cursor-ns-resize transition-colors hover:bg-indigo-500/30"
            title="Drag to resize"
          >
            <div className="mx-auto mt-0.5 w-8 h-0.5 rounded-full bg-white/10 group-hover:bg-indigo-500/60 transition-colors" />
          </div>

          {/* Header */}
          <div className="shrink-0 border-b border-white/5 px-4 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={12} className="text-violet-400" />
              <span className="text-[10px] font-mono text-slate-400 tracking-widest">EXECUTION CONSOLE</span>
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[9px] font-mono text-blue-400">LIVE</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1 text-slate-500 hover:text-slate-300 transition-colors rounded">
                <Filter size={11} />
              </button>
              <button
                onClick={toggleTerminal}
                className="p-1 text-slate-500 hover:text-slate-300 transition-colors rounded"
              >
                <Minus size={11} />
              </button>
              <button
                onClick={toggleTerminal}
                className="p-1 text-slate-500 hover:text-red-400 transition-colors rounded"
              >
                <X size={11} />
              </button>
            </div>
          </div>

          {/* xterm.js terminal */}
          <div className="flex-1 min-h-0 px-2 py-1 overflow-hidden">
            <TerminalContainer className="h-full" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
