'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Brain, Sparkles, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const COPILOT_SUGGESTIONS: Record<string, string[]> = {
  '/':                  ['Review execution health', 'Check failed test runs', 'Open latest report'],
  '/architecture':      ['Analyze component dependencies', 'Detect orphan nodes', 'Suggest test boundaries'],
  '/intent-studio':     ['Refine ambiguous intents', 'Generate acceptance criteria', 'Map to test scenarios'],
  '/testcases':         ['Generate edge cases with AI', 'Identify coverage gaps', 'Cluster similar tests'],
  '/test-designer':     ['Auto-complete step sequence', 'Suggest assertions', 'Convert to data-driven'],
  '/execution-control': ['Parallelize slow test suite', 'Prioritize flaky tests', 'Schedule nightly run'],
  '/ai-investigation':  ['Root cause analysis', 'Compare with last passing run', 'Correlate error patterns'],
  '/knowledge-graph':   ['Expand coverage paths', 'Find untested entities', 'Trace impact chains'],
  '/matrix':            ['Identify parity gaps', 'Platform-specific failures', 'Generate parity report'],
  '/agents':            ['Rebalance agent load', 'Scale for peak load', 'Diagnose idle agents'],
  '/ai-workflow':       ['Adjust heal threshold', 'Investigate flaky locators', 'Compare with last run'],
  '/settings':          ['Validate API connections', 'Audit environment config', 'Rotate credentials'],
  '/reports':           ['Generate executive summary', 'Export to PDF', 'Schedule weekly digest'],
};

interface ChatMessage { id: string; role: 'assistant' | 'user'; content: string; }

export function AIPanel() {
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'init', role: 'assistant', content: 'NEXCORE AI online. Context-aware. How can I assist?' },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const suggestions =
    COPILOT_SUGGESTIONS[pathname] ??
    COPILOT_SUGGESTIONS[Object.keys(COPILOT_SUGGESTIONS).find((k) => k !== '/' && pathname.startsWith(k)) ?? '/'] ??
    COPILOT_SUGGESTIONS['/'];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, partial]);

  function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    setInput('');
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', content }]);
    setStreaming(true);
    setPartial('');
    const reply = `Analyzing in context of ${pathname === '/' ? 'Command Center' : pathname}. Based on telemetry and recent events, I recommend reviewing the recent failures and cross-referencing the knowledge graph for root-cause patterns.`;
    let i = 0;
    const id = setInterval(() => {
      if (i >= reply.length) {
        clearInterval(id);
        setStreaming(false);
        setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: reply }]);
        setPartial('');
        return;
      }
      setPartial((p) => p + reply[i]);
      i++;
    }, 18);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: 'rgba(139,92,246,0.08)' }}
      >
        <span className="mc-orb relative flex h-8 w-8 items-center justify-center rounded-full">
          <span className="mc-orb-ring absolute -inset-[3px] rounded-full" aria-hidden />
        </span>
        <div>
          <div className="text-[12px] font-semibold text-white">NEXCORE AI</div>
          <div className="flex items-center gap-1 font-mono text-[9px]" style={{ color: '#10b981', letterSpacing: '0.08em' }}>
            <span className="h-[5px] w-[5px] rounded-full" style={{ background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
            Context-aware · {pathname}
          </div>
        </div>
      </div>

      {/* Suggestions */}
      <div className="px-4 pt-3">
        <div className="mb-2 font-mono text-[9px]" style={{ color: '#6b6c7a', letterSpacing: '0.16em' }}>▸ SUGGESTIONS</div>
        <div className="flex flex-col gap-1.5">
          {suggestions.slice(0, 3).map((s) => (
            <button key={s} disabled={streaming} onClick={() => send(s)}
              className="flex items-center gap-2 rounded-md border border-transparent px-2.5 py-2 text-left text-[11px] transition-colors hover:bg-violet-500/[0.06] hover:border-violet-500/25 hover:text-white disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.02)', color: '#b6b7c3' }}
            >
              <Sparkles size={10} style={{ color: '#a78bfa' }} />
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn('max-w-[85%] rounded-lg px-3 py-2 text-[12px] leading-relaxed')}
              style={
                m.role === 'assistant'
                  ? { background: 'var(--color-surface-2)', border: '1px solid var(--color-line-subtle)', color: 'var(--color-fg-default)' }
                  : { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.20)', color: 'var(--color-fg-default)' }
              }
            >
              {m.role === 'assistant' && (
                <div className="mb-1 flex items-center gap-1">
                  <Brain size={9} style={{ color: '#a78bfa' }} />
                  <span className="font-mono text-[9px]" style={{ color: '#a78bfa' }}>AI</span>
                </div>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {streaming && partial && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg border border-[var(--color-line-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-fg-default)]">
              <div className="mb-1 flex items-center gap-1">
                <Brain size={9} className="animate-pulse" style={{ color: '#a78bfa' }} />
                <span className="font-mono text-[9px]" style={{ color: '#a78bfa' }}>AI</span>
              </div>
              {partial}<span className="ml-0.5 inline-block h-3 w-[2px] animate-blink-caret align-middle" style={{ background: '#a78bfa' }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3" style={{ borderColor: 'rgba(139,92,246,0.15)' }}>
        <div className="flex items-end gap-2 rounded-lg border p-2"
          style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-line-default)' }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask NEXCORE AI…"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none bg-transparent text-[12px] outline-none placeholder:text-[var(--color-fg-subtle)] disabled:opacity-50"
          />
          <button onClick={() => send()} disabled={!input.trim() || streaming}
            className="flex h-6 w-6 items-center justify-center rounded-md text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.6), rgba(6,182,212,0.4))' }}
          >
            <Zap size={11} />
          </button>
        </div>
        <p className="mt-1.5 text-center font-mono text-[9px]" style={{ color: '#6b6c7a' }}>↵ send · shift+↵ newline</p>
      </div>
    </div>
  );
}
