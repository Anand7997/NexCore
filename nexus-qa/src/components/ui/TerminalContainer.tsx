'use client';
import { useEffect, useRef } from 'react';
import { useExecutionStore } from '@/lib/stores/executionStore';
import { cn } from '@/lib/utils';

const ANSI = {
  info:    '\x1b[34m',
  warn:    '\x1b[33m',
  error:   '\x1b[31m',
  debug:   '\x1b[90m',
  success: '\x1b[32m',
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bold:    '\x1b[1m',
};

type LogLevel = keyof typeof ANSI;

interface TerminalContainerProps {
  className?: string;
  initialLines?: string[];
}

function formatLine(ts: string, level: string, source: string, msg: string): string {
  const time = new Date(ts).toTimeString().slice(0, 8);
  const col = ANSI[level as LogLevel] ?? ANSI.info;
  const lvl = level.toUpperCase().slice(0, 4).padEnd(4);
  return `${ANSI.dim}${time}${ANSI.reset} ${col}${lvl}${ANSI.reset} ${ANSI.dim}[${source}]${ANSI.reset} ${msg}`;
}

export function TerminalContainer({ className, initialLines }: TerminalContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const termRef = useRef<any>(null);
  const prevLogCount = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    (async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');
      await import('@xterm/xterm/css/xterm.css');

      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        theme: {
          background: 'transparent',
          foreground: '#94a3b8',
          cursor: '#8b5cf6',
          cursorAccent: '#050505',
          black: '#0f0f1a',
          red: '#ef4444',
          green: '#10b981',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#8b5cf6',
          cyan: '#06b6d4',
          white: '#e2e8f0',
          brightBlack: '#475569',
          brightWhite: '#f1f5f9',
        },
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        lineHeight: 1.5,
        cursorStyle: 'bar',
        cursorBlink: true,
        scrollback: 2000,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(containerRef.current);
      fitAddon.fit();

      term.writeln(`${ANSI.bold}\x1b[35mNEXUS QA${ANSI.reset} ${ANSI.dim}— execution terminal ready${ANSI.reset}`);
      term.writeln('');

      const logs = useExecutionStore.getState().logs;
      const slice = initialLines ?? [...logs].reverse().slice(-60).map((l) => formatLine(l.timestamp, l.level, l.source, l.message));
      for (const line of slice) {
        term.writeln(line);
      }
      prevLogCount.current = logs.length;

      termRef.current = { term, fitAddon };

      const observer = new ResizeObserver(() => fitAddon.fit());
      observer.observe(containerRef.current!);

      return () => observer.disconnect();
    })();

    return () => {
      disposed = true;
      termRef.current?.term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsub = useExecutionStore.subscribe((state) => {
      const { term } = termRef.current ?? {};
      if (!term) return;

      const newLogs = state.logs.slice(0, state.logs.length - prevLogCount.current);
      if (newLogs.length === 0) return;

      prevLogCount.current = state.logs.length;
      for (const log of [...newLogs].reverse()) {
        term.writeln(formatLine(log.timestamp, log.level, log.source, log.message));
      }
    });

    return unsub;
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn('w-full h-full min-h-0 overflow-hidden', className)}
    />
  );
}
