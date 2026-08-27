// Trade bar — buy/sell with instant fill and inline error handling (UI-04,
// 03-05 Task 1). Client pre-validation is UX-only (ticker ≤ 12 chars via
// /^[A-Z0-9.]{1,12}$/, quantity > 0) — mirrors TradeRequest Field(gt=0) +
// TickerStr; the backend Pydantic schemas stay authoritative (03-RESEARCH.md:249,
// 527, threat T-03-08). On 200 the returned PortfolioResponse is set into the
// store for an instant fill (03-RESEARCH.md:26, 39) and the quantity input
// clears. 400/404 backend rejections render as inline errors.
'use client';

import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import type { PortfolioResponse } from '../../lib/types';
import { useStore } from '../../store/useStore';

const TICKER_RE = /^[A-Z0-9.]{1,12}$/;

/** Extract the HTTP status from apiFetch's `${path} -> ${status}` throw message. */
function statusFromError(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : '';
  const m = /-> (\d+)$/.exec(msg);
  return m ? Number(m[1]) : null;
}

export function TradeBar() {
  const selectedTicker = useStore((s) => s.selectedTicker); // per-slice selector (Pitfall 6)
  // Pre-fill from a pre-selected ticker at mount, then keep in sync on changes
  // (Test 5) — the React-recommended "adjust state during render" pattern (no
  // effect, so react-hooks/set-state-in-effect stays quiet):
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [ticker, setTicker] = useState(selectedTicker ?? '');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Pre-fill the ticker input whenever the store's selected ticker changes
  // (Test 5) — the React-recommended "adjust state during render" pattern
  // (no effect, so react-hooks/set-state-in-effect stays quiet):
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevSelected, setPrevSelected] = useState(selectedTicker);
  if (prevSelected !== selectedTicker) {
    setPrevSelected(selectedTicker);
    if (selectedTicker) setTicker(selectedTicker);
  }

  const submit = async (side: 'buy' | 'sell') => {
    const t = ticker.trim().toUpperCase();
    if (!TICKER_RE.test(t)) {
      setError('Invalid ticker');
      return;
    }
    if (Number(quantity) <= 0) {
      setError('Quantity must be positive');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const portfolio = await apiFetch<PortfolioResponse>('/api/portfolio/trade', {
        method: 'POST',
        body: JSON.stringify({ ticker: t, quantity: Number(quantity), side }),
      });
      // Instant fill — the returned portfolio IS the source of truth.
      useStore.setState({ portfolio });
      setQuantity('');
    } catch (err) {
      const status = statusFromError(err);
      if (status === 400) setError('Trade rejected: insufficient funds/shares');
      else if (status === 404) setError('Unknown ticker');
      else setError('Trade failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3 px-4 py-3">
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        Ticker
        <input
          aria-label="Ticker"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="AAPL"
          className="rounded border border-border bg-background px-2 py-1 font-mono text-sm uppercase text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        Quantity
        <input
          aria-label="Quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="0"
          className="rounded border border-border bg-background px-2 py-1 font-mono text-sm text-foreground"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit('buy')}
          className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          Buy
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit('sell')}
          className="rounded bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
        >
          Sell
        </button>
      </div>
      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}
