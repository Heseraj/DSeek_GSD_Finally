// Watchlist panel — add (200/409) and remove (204/404) with store pruning
// (UI-06, 03-05 Task 3 + 03-06 Task 1). Mirrors watchlist/router.py:32-73
// semantics verbatim: POST /api/watchlist -> 200 {ticker} | 409 duplicate;
// DELETE /api/watchlist/{ticker} -> 204 (no body) | 404. The add POST goes
// through apiFetch (a JSON body is expected); the per-row REMOVE lives in
// TickerRow (03-06 Task 1) as a RAW fetch — NOT apiFetch, whose unconditional
// res.json() rejects on the backend's 204 empty body (03-PATTERNS.md:143);
// res.status is checked BEFORE any body read. Rows are the real TickerRow
// composition (price + sparkline + flash + click-to-select + remove); the
// 03-05 self-contained row shell is replaced here by design (same-wave swap).
// Client pre-validation is UX-only (TickerStr ≤ 12 chars — backend Pydantic
// stays authoritative, threat T-03-08).
'use client';

import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useStore } from '../../store/useStore';
import { TickerRow } from './TickerRow';

const TICKER_RE = /^[A-Z0-9.]{1,12}$/;

/** Extract the HTTP status from apiFetch's `${path} -> ${status}` throw message. */
function statusFromError(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : '';
  const m = /-> (\d+)$/.exec(msg);
  return m ? Number(m[1]) : null;
}

export function WatchlistPanel() {
  const watchlist = useStore((s) => s.watchlist);
  const [ticker, setTicker] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const add = async () => {
    const t = ticker.trim().toUpperCase();
    if (!TICKER_RE.test(t)) {
      setError('Invalid ticker');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await apiFetch<{ ticker: string }>('/api/watchlist', {
        method: 'POST',
        body: JSON.stringify({ ticker: t }),
      });
      setTicker('');
      await useStore.getState().refetchWatchlist();
    } catch (err) {
      const status = statusFromError(err);
      if (status === 409) setError('already on watchlist');
      else setError('Failed to add ticker');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <input
          aria-label="Add ticker"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="TICKER"
          disabled={adding}
          className="flex-1 rounded border border-border bg-background px-2 py-1 font-mono text-sm uppercase text-foreground"
        />
        <button
          type="button"
          onClick={add}
          disabled={adding}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error && <div className="border-b border-border px-3 py-1 text-xs text-red-400">{error}</div>}
      <div className="flex-1 overflow-y-auto">
        {watchlist.map((w) => (
          <TickerRow key={w.ticker} ticker={w.ticker} fallbackPrice={w.price} />
        ))}
      </div>
    </div>
  );
}
