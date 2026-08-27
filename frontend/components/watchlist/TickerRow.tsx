// Watchlist row — Pattern 3 flash-by-key-remount (03-RESEARCH.md:379-390,
// 03-PATTERNS.md:223-236). Per-row selectors ONLY (Pitfall 6): a 20Hz tick
// stream re-renders just this row. The price span is keyed by per-ticker
// tickSeq so a direction-changing frame remounts the element and restarts the
// CSS flash animation. Remove button wired in 03-05; sparkline embedded in 03-03.
'use client';

import { useStore } from '../../store/useStore';
import { fmtCurrency, fmtPercent, pnlColor } from '../../lib/format';
import type { PriceUpdate } from '../../lib/types';
import { Sparkline } from './Sparkline';

function flashClass(direction: PriceUpdate['direction']): string {
  if (direction === 'up') return 'flash-up';
  if (direction === 'down') return 'flash-down';
  return '';
}

export function TickerRow({ ticker }: { ticker: string }) {
  const update = useStore((s) => s.prices[ticker]); // per-ticker price slice
  const seq = useStore((s) => s.tickSeq[ticker]); // flash remount key
  const selected = useStore((s) => s.selectedTicker); // selection slice

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
        {update ? (
          <span key={`${ticker}-${seq}`} className={`font-mono text-sm ${flashClass(update.direction)}`}>
            {fmtCurrency(update.price)}
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

      {/* Remove button — wired to DELETE /api/watchlist in 03-05 */}
      <button
        type="button"
        aria-label={`Remove ${ticker}`}
        className="ml-2 rounded px-1.5 text-xs text-gray-500 transition-colors hover:text-red-400"
      >
        ×
      </button>
    </div>
  );
}
