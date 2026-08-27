// Watchlist panel — add (200/409) and remove (204/404) with store pruning
// (UI-06, 03-05 Task 3). Mirrors watchlist/router.py:32-73 semantics verbatim:
// POST /api/watchlist -> 200 {ticker} | 409 duplicate; DELETE
// /api/watchlist/{ticker} -> 204 (no body) | 404. The DELETE is a RAW fetch —
// NOT apiFetch, whose unconditional res.json() rejects on the backend's 204
// empty body (03-PATTERNS.md:143); res.status is checked BEFORE any body read.
// On a successful 204 the store prunes prices + histories + tickSeq for that
// ticker (Pitfall 5, 03-RESEARCH.md:290-293) and the watchlist refetches.
// Client pre-validation is UX-only (TickerStr ≤ 12 chars — backend Pydantic
// stays authoritative, threat T-03-08). Rows are a self-contained shell
// (per-row price selector, Pitfall 6); 03-06 Task 1 swaps in the real
// TickerRow composition (same-wave dependency risk).
'use client';

import { useState } from 'react';
import { apiFetch, apiUrl } from '../../lib/api';
import { fmtCurrency } from '../../lib/format';
import { useStore } from '../../store/useStore';

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
  const [removing, setRemoving] = useState<string | null>(null);

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

  const remove = async (t: string) => {
    setRemoving(t);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/watchlist/${t}`), { method: 'DELETE' });
      if (res.status === 204) {
        // Pitfall 5: prune prices + histories + tickSeq so no stale
        // sparkline/price residue survives a re-add.
        useStore.getState().pruneTicker(t);
        await useStore.getState().refetchWatchlist();
      } else if (res.status === 404) {
        setError(`Ticker not on watchlist: ${t}`);
      } else {
        setError('Failed to remove ticker');
      }
    } catch {
      setError('Failed to remove ticker');
    } finally {
      setRemoving(null);
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
          <Row
            key={w.ticker}
            ticker={w.ticker}
            fallback={w.price}
            removing={removing === w.ticker}
            onRemove={() => remove(w.ticker)}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  ticker,
  fallback,
  removing,
  onRemove,
}: {
  ticker: string;
  fallback?: number;
  removing: boolean;
  onRemove: () => void;
}) {
  const update = useStore((s) => s.prices[ticker]); // per-row price slice (Pitfall 6)
  return (
    <div data-ticker={ticker} className="flex items-center justify-between border-b border-border px-3 py-2">
      <span className="font-mono text-sm font-semibold text-foreground">{ticker}</span>
      <span className="font-mono text-sm text-foreground">
        {fmtCurrency(update?.price ?? fallback ?? 0)}
      </span>
      <button
        type="button"
        aria-label={`Remove ${ticker}`}
        disabled={removing}
        onClick={onRemove}
        className="rounded px-1.5 text-xs text-gray-500 transition-colors hover:text-red-400 disabled:opacity-50"
      >
        ×
      </button>
    </div>
  );
}
