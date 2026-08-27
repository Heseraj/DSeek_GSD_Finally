// Watchlist row — Pattern 3 flash-by-key-remount (03-RESEARCH.md:379-390,
// 03-PATTERNS.md:223-236). Per-row selectors ONLY (Pitfall 6): a 20Hz tick
// stream re-renders just this row. The price span is keyed by per-ticker
// tickSeq so a direction-changing frame remounts the element and restarts the
// CSS flash animation. Remove button wired here (03-06 Task 1) — the UI-06
// remove path's single delivery point: a RAW fetch DELETE /api/watchlist/{ticker}
// (NOT apiFetch — its unconditional res.json() rejects on the backend's 204
// empty body; res.status is checked BEFORE any body read, 03-PATTERNS.md:143),
// then on success pruneTicker + refetchWatchlist. A 404 (ticker not on the
// watchlist) is tolerated: prune locally and refetch. Sparkline embedded in 03-03.
'use client';

import { useState } from 'react';
import { apiUrl } from '../../lib/api';
import { useStore } from '../../store/useStore';
import { fmtCurrency, fmtPercent, pnlColor } from '../../lib/format';
import type { PriceUpdate } from '../../lib/types';
import { Sparkline } from './Sparkline';

function flashClass(direction: PriceUpdate['direction']): string {
  if (direction === 'up') return 'flash-up';
  if (direction === 'down') return 'flash-down';
  return '';
}

export function TickerRow({ ticker, fallbackPrice }: { ticker: string; fallbackPrice?: number }) {
  const update = useStore((s) => s.prices[ticker]); // per-ticker price slice
  const seq = useStore((s) => s.tickSeq[ticker]); // flash remount key
  const selected = useStore((s) => s.selectedTicker); // selection slice
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation(); // the row div selects the ticker — remove must not
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/watchlist/${ticker}`), { method: 'DELETE' });
      if (res.status === 204) {
        // Pitfall 5: prune prices + histories + tickSeq so no stale
        // sparkline/price residue survives a re-add (03-RESEARCH.md:290-293).
        useStore.getState().pruneTicker(ticker);
        await useStore.getState().refetchWatchlist();
      } else if (res.status === 404) {
        // Ticker not on the watchlist — tolerate: prune locally and refetch.
        useStore.getState().pruneTicker(ticker);
        await useStore.getState().refetchWatchlist();
      } else {
        setError('Remove failed');
      }
    } catch {
      setError('Remove failed');
    } finally {
      setRemoving(false);
    }
  };

  const price = update?.price ?? fallbackPrice;

  return (
    <div
      data-ticker={ticker}
      onClick={() => useStore.getState().selectTicker(ticker)}
      className={`flex cursor-pointer items-center justify-between border-b border-border px-3 py-2 transition-colors ${
        selected === ticker ? 'bg-panel' : 'hover:bg-panel/60'
      }`}
    >
      <div className="flex min-w-0 flex-col">
        <span className="font-mono text-sm font-semibold text-foreground">{ticker}</span>
        {/* Sparkline — receives only this ticker's history array (Pitfall 6) */}
        <Sparkline ticker={ticker} data={useStore((s) => s.histories[ticker])} />
      </div>

      <div className="flex flex-col items-end">
        {price !== undefined ? (
          <span key={`${ticker}-${seq}`} className={`font-mono text-sm ${flashClass(update?.direction)}`}>
            {fmtCurrency(price)}
          </span>
        ) : (
          <span className="font-mono text-sm text-gray-500">--</span>
        )}
        {update ? (
          <span className={`text-xs ${pnlColor(update.change_percent)}`}>{fmtPercent(update.change_percent)}</span>
        ) : (
          <span className="text-xs text-gray-500">--</span>
        )}
      </div>

      {/* Remove button — wired to DELETE /api/watchlist/{ticker} (03-06 Task 1) */}
      <button
        type="button"
        aria-label={`Remove ${ticker}`}
        disabled={removing}
        onClick={remove}
        className="ml-2 rounded px-1.5 text-xs text-gray-500 transition-colors hover:text-red-400 disabled:opacity-50"
      >
        ×
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
