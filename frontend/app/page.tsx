// Terminal shell — the phase composition root (03-06 Task 1). 'use client'
// because lightweight-charts (03-03), recharts (03-04), and the EventSource
// hook are client-only (03-RESEARCH.md:244). Layout mirrors the architecture
// diagram (03-RESEARCH.md:119-135): Header across the top, WatchlistPanel
// left, MainChart / portfolio (Heatmap + PnlChart + PositionsTable) / TradeBar
// center, ChatPanel right. Every component keeps its own per-slice selector
// subscription — the page body reads NO store slice directly (20Hz re-render
// firewall, Pitfall 6, 03-RESEARCH.md:295-299). The five data-testid slot
// wrappers are stable integration anchors retained across the slot -> real
// component swaps (03-02 Task 1 decision).
'use client';

import { useEffect } from 'react';
import { usePriceStream } from '../hooks/usePriceStream';
import { Header } from '../components/header/Header';
import { WatchlistPanel } from '../components/watchlist/WatchlistPanel';
import { MainChart } from '../components/chart/MainChart';
import { Heatmap } from '../components/portfolio/Heatmap';
import { PnlChart } from '../components/portfolio/PnlChart';
import { PositionsTable } from '../components/portfolio/PositionsTable';
import { TradeBar } from '../components/trade/TradeBar';
import { ChatPanel } from '../components/chat/ChatPanel';
import { useStore } from '../store/useStore';

export default function Home() {
  usePriceStream(); // one EventSource consumer, opened in useEffect (StrictMode-safe)

  useEffect(() => {
    // Mount-time refetch of REST state — the SSE channel carries prices only.
    useStore.getState().refetchPortfolio();
    useStore.getState().refetchWatchlist();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header slot — real <Header /> (connection dot + live total + cash) */}
      <div data-testid="header-slot">
        <Header />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[16rem_1fr_20rem] overflow-hidden">
        {/* Left: watchlist — real rows (add form + TickerRow composition) */}
        <aside className="min-w-0 overflow-y-auto border-r border-border bg-panel">
          <WatchlistPanel />
        </aside>

        {/* Center: main chart, portfolio, trade bar */}
        <main className="flex min-w-0 flex-col overflow-hidden">
          <section data-testid="main-chart-slot" className="shrink-0 border-b border-border">
            <MainChart />
          </section>
          <section data-testid="portfolio-slot" className="flex-1 overflow-y-auto border-b border-border">
            <div className="grid min-w-0 grid-cols-2 gap-px border-b border-border bg-border">
              <div className="min-w-0 bg-panel">
                <Heatmap />
              </div>
              <div className="min-w-0 bg-panel">
                <PnlChart />
              </div>
            </div>
            <PositionsTable />
          </section>
          <section data-testid="trade-bar-slot" className="shrink-0 border-b border-border">
            <TradeBar />
          </section>
        </main>

        {/* Right: AI chat panel — fixed comfortable width with its own scroll */}
        <aside className="min-w-0 overflow-hidden border-l border-border bg-panel">
          <section data-testid="chat-slot" className="h-full">
            <ChatPanel />
          </section>
        </aside>
      </div>
    </div>
  );
}
