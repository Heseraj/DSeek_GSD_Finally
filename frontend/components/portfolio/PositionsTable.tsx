// Positions table — seven columns with a live SSE-driven current-price column
// (UI-03, 03-PATTERNS.md:279-281). Leaf component: reads store.portfolio plus a
// per-row price slice; market_value renders the server's authoritative value
// (the price column alone reflects the live stream). Empty state when absent.
'use client';

import { useStore } from '../../store/useStore';
import { fmtCurrency, fmtPercent, pnlColor } from '../../lib/format';

const COLUMNS = ['Ticker', 'Qty', 'Avg Cost', 'Price', 'Mkt Value', 'Unrealized P&L', 'P&L %'];

// Per-row live price cell — subscribes ONLY to its own price slice (Pitfall 6),
// so a 20Hz tick stream re-renders just this cell; falls back to the server's
// current_price when no SSE frame has arrived for the ticker (03-PATTERNS.md:281).
function LivePriceCell({ ticker, fallback }: { ticker: string; fallback: number }) {
  const live = useStore((s) => s.prices[ticker]?.price);
  return <span className="font-mono">{fmtCurrency(live ?? fallback)}</span>;
}

export function PositionsTable() {
  const portfolio = useStore((s) => s.portfolio);

  if (!portfolio || portfolio.positions.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500">
        No positions
      </div>
    );
  }

  return (
    <table className="w-full border-collapse font-mono text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-gray-400">
          {COLUMNS.map((col) => (
            <th key={col} className="px-2 py-1.5 text-left font-medium">
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {portfolio.positions.map((pos) => (
          <tr key={pos.ticker} data-ticker={pos.ticker} className="border-b border-border/50">
            <td className="px-2 py-1.5 font-semibold text-foreground">{pos.ticker}</td>
            <td className="px-2 py-1.5 text-right text-gray-300">{pos.quantity}</td>
            <td className="px-2 py-1.5 text-right text-gray-300">{fmtCurrency(pos.avg_cost)}</td>
            <td className="px-2 py-1.5 text-right text-foreground">
              <LivePriceCell ticker={pos.ticker} fallback={pos.current_price} />
            </td>
            <td className="px-2 py-1.5 text-right text-gray-300">{fmtCurrency(pos.market_value)}</td>
            <td className={`px-2 py-1.5 text-right ${pnlColor(pos.unrealized_pnl)}`}>
              {fmtCurrency(pos.unrealized_pnl)}
            </td>
            <td className={`px-2 py-1.5 text-right ${pnlColor(pos.unrealized_pnl_percent)}`}>
              {fmtPercent(pos.unrealized_pnl_percent)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
