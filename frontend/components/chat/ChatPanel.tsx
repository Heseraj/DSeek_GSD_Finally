// AI chat panel — loading state, inline confirmations, the locked
// 503-with-ChatResponse contract, and text-only rendering (UI-05, 03-05
// Task 2). fetchChat is the SOLE apiFetch exemption (03-PATTERNS.md:142):
// POST /api/chat returns HTTP 503 WITH a valid ChatResponse body whenever the
// top-level error is set (02-03-SUMMARY.md:204-207, chat/router.py:33-34), so
// the body is read on BOTH 200 and 503 — any other status throws for the
// network-error banner (03-RESEARCH.md:284-288). LLM message/error content
// renders as TEXT via React auto-escaping — never dangerouslySetInnerHTML
// (threat T-03-01, ASVS V5); confirmations derive from the structured
// trades/watchlist_changes fields only. After any successful response the
// portfolio + watchlist are refetched (the AI may have traded/edited — Pattern
// 5, 03-RESEARCH.md:239).
'use client';

import { useState } from 'react';
import { apiUrl } from '../../lib/api';
import type { ChatResponse } from '../../lib/types';
import { useStore } from '../../store/useStore';

async function fetchChat(message: string): Promise<ChatResponse> {
  const res = await fetch(apiUrl('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (res.status !== 200 && res.status !== 503) {
    throw new Error(`/api/chat -> ${res.status}`);
  }
  return (await res.json()) as ChatResponse;
}

export function ChatPanel() {
  const messages = useStore((s) => s.chatMessages);
  const chatLoading = useStore((s) => s.chatLoading);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const message = input.trim();
    if (!message) return;
    setInput('');
    setError(null);
    useStore.getState().appendChatMessage({ role: 'user', content: message });
    useStore.getState().setChatLoading(true);
    try {
      const data = await fetchChat(message);
      useStore.getState().appendChatMessage({
        role: 'assistant',
        content: data.message,
        trades: data.trades,
        watchlist_changes: data.watchlist_changes,
        error: data.error,
      });
      // The AI may have traded/edited — reconcile. A refetch failure must not
      // turn a successful chat into a network-error banner.
      useStore.getState().refetchPortfolio().catch(() => {});
      useStore.getState().refetchWatchlist().catch(() => {});
    } catch {
      setError('Chat request failed');
    } finally {
      useStore.getState().setChatLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded px-2 py-1 text-sm ${m.role === 'user' ? 'bg-panel text-right' : 'text-left'}`}
          >
            {m.role === 'user' ? (
              <span className="text-foreground">{m.content}</span>
            ) : (
              <div className="space-y-1">
                {/* LLM content renders as text — React auto-escapes (T-03-01) */}
                <div className="text-foreground">{m.content}</div>
                {m.error ? <div className="text-xs text-red-400">{m.error}</div> : null}
                {m.trades && m.trades.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {m.trades.map((t, j) => (
                      <span
                        key={j}
                        className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                          t.status === 'executed'
                            ? 'bg-emerald-900/40 text-emerald-400'
                            : 'bg-red-900/40 text-red-400'
                        }`}
                      >
                        {t.status === 'executed'
                          ? `${t.ticker} ${t.side} ${t.quantity} — executed`
                          : `${t.ticker} ${t.side} ${t.quantity} — failed: ${t.error ?? 'error'}`}
                      </span>
                    ))}
                  </div>
                ) : null}
                {m.watchlist_changes && m.watchlist_changes.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {m.watchlist_changes.map((w, j) => (
                      <span
                        key={j}
                        className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                          w.status === 'executed'
                            ? 'bg-emerald-900/40 text-emerald-400'
                            : 'bg-red-900/40 text-red-400'
                        }`}
                      >
                        {w.status === 'executed'
                          ? `${w.ticker} ${w.action} — executed`
                          : `${w.ticker} ${w.action} — failed: ${w.error ?? 'error'}`}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
        {chatLoading && (
          <div aria-label="loading" className="flex items-center gap-2 text-xs text-gray-400">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
            Thinking…
          </div>
        )}
        {error && <div className="rounded bg-red-900/30 px-2 py-1 text-xs text-red-400">{error}</div>}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <input
          aria-label="Chat message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Ask the AI to trade…"
          disabled={chatLoading}
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
        />
        <button
          type="button"
          onClick={send}
          disabled={chatLoading}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
