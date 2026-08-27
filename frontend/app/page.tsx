// Terminal shell — the phase tracer page (03-02 Task 1). 'use client' because
// lightweight-charts (03-03) and the EventSource hook are client-only
// (03-RESEARCH.md:244). Layout mirrors the architecture diagram
// (03-RESEARCH.md:119-135): Header across the top, watchlist left, main chart /
// portfolio / trade bar center, chat right. The five data-testid slots are
// replaced by real components in later plans (Header in 03-02 Task 2, the rest
// in 03-06). Per-slice selectors only — NEVER read the whole store (Pitfall 6).
'use client';

import { useEffect } from 'react';
import { usePriceStream } from '../hooks/usePriceStream';
import { Header } from '../components/header/Header';
import { TickerRow } from '../components/watchlist/TickerRow';
import { useStore } from '../store/useStore';

export default function Home() {
  usePriceStream(); // one EventSource consumer, opened in useEffect (StrictMode-safe)

  const watchlist = useStore((s) => s.watchlist); // per-slice selector only

  useEffect(() => {
    // Mount-time refetch of REST state — the SSE channel carries prices only.
    useStore.getState().refetchPortfolio();
    useStore.getState().refetchWatchlist();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header slot — the real <Header /> (connection dot + live total) */}
      <div data-testid="header-slot">
        <Header />
      </div>

      <div className="grid flex-1 grid-cols-[16rem_1fr_20rem] overflow-hidden">
        {/* Left: watchlist panel — TickerRow rows; add/remove UI lands in 03-05 */}
        <aside className="overflow-y-auto border-r border-border bg-panel">
          {watchlist.map((t) => (
            <TickerRow key={t.ticker} ticker={t.ticker} />
          ))}
        </aside>

        {/* Center: main chart, portfolio, trade bar */}
        <main className="flex flex-col overflow-hidden">
          <section data-testid="main-chart-slot" className="h-64 shrink-0 border-b border-border" />
          <section data-testid="portfolio-slot" className="flex-1 overflow-y-auto border-b border-border" />
          <section data-testid="trade-bar-slot" className="shrink-0 border-b border-border" />
        </main>

        {/* Right: AI chat panel */}
        <aside className="border-l border-border bg-panel">
          <section data-testid="chat-slot" className="h-full" />
        </aside>
      </div>
    </div>
  );
}
