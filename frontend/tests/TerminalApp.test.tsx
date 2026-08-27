// Terminal integration smoke test (03-06 Task 2) — renders the FULL page.tsx
// terminal under mocked fetch + the capture-instance EventSource mock from
// tests/setup.ts. Asserts (03-06-PLAN.md Task 2):
//   1. header cash + green connection dot after an open event; all panels
//      present: watchlist rows (real TickerRow composition), main chart,
//      heatmap, P&L chart, positions table, trade bar, chat panel
//   2. one SSE frame re-renders the header live total (cash + Σ qty × live price)
//   3. interaction smoke: watchlist row click -> store.selectedTicker set
//      (chart re-seed); trade click-through -> trade POST + portfolio reflected
//   4. remove click-through (UI-06): DELETE /api/watchlist/{ticker} on 204
//      prunes the ticker (row disappears); on 404 the store still prunes and
//      refetches (tolerated)
//   5. XSS guard at the composed-page level (T-03-01): a forged HTML-shaped
//      string renders as text, never parsed DOM.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HistoryResponse, PortfolioResponse, PriceUpdate, WatchlistResponse } from '../lib/types';
import { useStore } from '../store/useStore';
import { MockEventSource } from './setup';
import Home from '../app/page';

// Recharts 3.10.1 ResponsiveContainer (Heatmap, PnlChart) renders only once
// width/height are positive; jsdom has no layout engine, so stub
// ResizeObserver to fire a fixed size synchronously (same pattern as
// Heatmap.test.tsx / PnlChart.test.tsx).
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    this.callback([{ contentRect: { width: 640, height: 192 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  disconnect() {}
  unobserve() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

const portfolio: PortfolioResponse = {
  cash_balance: 10000,
  positions: [
    {
      ticker: 'AAPL',
      quantity: 10,
      avg_cost: 140,
      current_price: 150,
      market_value: 1500,
      unrealized_pnl: 100,
      unrealized_pnl_percent: 0.0714,
    },
    {
      ticker: 'TSLA',
      quantity: 5,
      avg_cost: 190,
      current_price: 200,
      market_value: 1000,
      unrealized_pnl: 50,
      unrealized_pnl_percent: 0.0526,
    },
  ],
  total_value: 12500,
  unrealized_pnl: 150,
};

const watchlist: WatchlistResponse = {
  tickers: [
    {
      ticker: 'AAPL',
      price: 150,
      previous_price: 149,
      timestamp: 1000,
      change: 1,
      change_percent: 0.67,
      direction: 'up',
    },
    { ticker: 'MSFT' }, // bare {ticker} union arm — no SSE price yet
    { ticker: 'TSLA' },
  ],
};

const history: HistoryResponse = {
  snapshots: [
    { recorded_at: '2026-08-26T10:00:00Z', total_value: 10000 },
    { recorded_at: '2026-08-26T10:30:00Z', total_value: 10500 },
  ],
};

const jsonResponse = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** URL-routed fetch mock (03-05 pattern): portfolio/watchlist/history GETs to
 *  canned 200s, trade POST to a deferred handler, DELETE 204 + refetch. */
const mockFetch = () => {
  let currentWatchlist = [...watchlist.tickers];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.includes('/api/portfolio/trade')) {
      return jsonResponse(200, {
        cash_balance: 9000,
        positions: [
          { ...portfolio.positions[0], quantity: 15, market_value: 2250, unrealized_pnl: 150 },
          portfolio.positions[1],
        ],
        total_value: 12250,
        unrealized_pnl: 200,
      });
    }
    if (url.includes('/api/portfolio/history')) return jsonResponse(200, history);
    if (url.includes('/api/portfolio')) return jsonResponse(200, portfolio);
    if (url.includes('/api/watchlist') && init?.method === 'DELETE') {
      const t = url.split('/').pop();
      currentWatchlist = currentWatchlist.filter((w) => w.ticker !== t);
      return jsonResponse(204, null); // bodyless — TickerRow checks res.status first
    }
    if (url.includes('/api/watchlist')) return jsonResponse(200, { tickers: currentWatchlist });
    throw new Error(`unexpected fetch: ${url}`);
  });
};

const resetStore = () =>
  useStore.setState({
    prices: {},
    histories: {},
    tickSeq: {},
    connection: 'closed',
    selectedTicker: null,
    portfolio: null,
    watchlist: [],
    chatMessages: [],
    chatLoading: false,
  });

beforeEach(() => {
  resetStore();
  MockEventSource.instances = [];
  mockFetch();
});

describe('TerminalApp', () => {
  it('Test 1: connection dot maps open/error events to green/yellow/red', async () => {
    render(<Home />);
    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();

    // initial store connection is 'closed' -> red
    const closedDot = screen.getByLabelText('connection: closed');
    expect(closedDot).toHaveClass('bg-red-500');

    act(() => es.__emit('open'));
    expect(await screen.findByLabelText('connection: connected')).toHaveClass('bg-emerald-500');

    act(() => es.__emit('error'));
    expect(await screen.findByLabelText('connection: reconnecting')).toHaveClass('bg-yellow-500');
  });

  it('Test 2: shows cash and live total from the refetched portfolio', async () => {
    render(<Home />);
    // no SSE price yet -> live total falls back to current_price:
    // 10000 + 10×150 + 5×200 = 12500
    expect(await screen.findByText('$10,000.00')).toBeInTheDocument();
    expect(await screen.findByText('$12,500.00')).toBeInTheDocument();
  });

  it('Test 3: an SSE frame updates the header live total (selector isolation)', async () => {
    render(<Home />);
    await screen.findByText('$12,500.00');
    const es = MockEventSource.instances[0];

    const frame: PriceUpdate = {
      ticker: 'AAPL',
      price: 160,
      previous_price: 150,
      timestamp: 1756000000.5,
      change: 10,
      change_percent: 6.67,
      direction: 'up',
    };
    act(() => es.__emit('message', { data: JSON.stringify({ AAPL: frame }) }));

    // 10000 + 10×160 + 5×200 = 12600
    expect(await screen.findByText('$12,600.00')).toBeInTheDocument();
    expect(screen.queryByText('$12,500.00')).not.toBeInTheDocument();
  });

  it('Test 4: the full terminal renders — all panels present', async () => {
    const { container } = render(<Home />);

    // header + section slots
    expect(screen.getByTestId('header-slot')).toBeInTheDocument();
    expect(screen.getByTestId('main-chart-slot')).toBeInTheDocument();
    expect(screen.getByTestId('portfolio-slot')).toBeInTheDocument();
    expect(screen.getByTestId('trade-bar-slot')).toBeInTheDocument();
    expect(screen.getByTestId('chat-slot')).toBeInTheDocument();

    // watchlist rows — real TickerRow composition (price + sparkline + remove)
    expect(await screen.findByTestId('sparkline-AAPL')).toBeInTheDocument();
    expect(await screen.findByTestId('sparkline-MSFT')).toBeInTheDocument();
    expect(await screen.findByTestId('sparkline-TSLA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove AAPL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove MSFT' })).toBeInTheDocument();

    // main chart container (lightweight-charts mock renderer)
    expect(container.querySelector('[class*="h-96"]')).not.toBeNull();

    // portfolio — heatmap cells + P&L curve + positions table
    expect(await screen.findByTestId('heatmap-cell-AAPL')).toBeInTheDocument();
    expect(screen.getByTestId('heatmap-cell-TSLA')).toBeInTheDocument();
    expect(container.querySelector('.recharts-line-curve')).not.toBeNull();
    expect(screen.getByText('Unrealized P&L')).toBeInTheDocument();
    expect(screen.getAllByText('AAPL').length).toBeGreaterThanOrEqual(2); // watchlist + positions + heatmap

    // trade bar + chat panel
    expect(screen.getByLabelText('Ticker')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sell' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask the AI to trade…')).toBeInTheDocument();
  });

  it('Test 5: ticker click -> chart re-seed (selectedTicker set) + trade click-through updates portfolio', async () => {
    render(<Home />);
    await screen.findByText('$12,500.00');

    // click the watchlist row -> store.selectedTicker set (MainChart re-seeds)
    fireEvent.click(screen.getAllByText('AAPL')[0]);
    expect(useStore.getState().selectedTicker).toBe('AAPL');

    // the selected ticker pre-fills the trade bar; type qty, click Buy
    await waitFor(() => expect(screen.getByLabelText('Ticker')).toHaveValue('AAPL'));
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));

    // the trade POST returns the new portfolio -> instant fill: cash 9000
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/portfolio/trade'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ ticker: 'AAPL', quantity: 5, side: 'buy' }),
        }),
      );
    });
    expect(await screen.findByText('$9,000.00')).toBeInTheDocument();
  });

  it('Test 6: remove click-through — DELETE on 204 prunes the ticker and refetches', async () => {
    render(<Home />);
    await screen.findByTestId('sparkline-AAPL');

    fireEvent.click(screen.getByRole('button', { name: 'Remove AAPL' }));

    // raw DELETE /api/watchlist/AAPL (method DELETE, no body read on 204)
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/watchlist/AAPL'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    // pruneTicker cleared prices/histories/tickSeq; the refetch dropped the row
    await waitFor(() => {
      const s = useStore.getState();
      expect(s.prices.AAPL).toBeUndefined();
      expect(s.histories.AAPL).toBeUndefined();
      expect(s.watchlist.some((w) => w.ticker === 'AAPL')).toBe(false);
    });
    expect(screen.queryByTestId('sparkline-AAPL')).not.toBeInTheDocument();
    expect(screen.getByTestId('sparkline-MSFT')).toBeInTheDocument();
  });

  it('Test 7: remove click-through — a 404 is tolerated (prune locally + refetch)', async () => {
    // DELETE /api/watchlist/AAPL -> 404 (ticker not on the watchlist). Route
    // everything else (mount portfolio/watchlist/history fetches) through the
    // default handler so PnlChart/Header still resolve normally.
    const defaultImpl = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementationOnce(async (input, init) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('/api/watchlist') && init?.method === 'DELETE') {
        return jsonResponse(404, { detail: 'Ticker not on watchlist: AAPL' });
      }
      return defaultImpl(input, init);
    });
    render(<Home />);
    await screen.findByTestId('sparkline-AAPL');

    fireEvent.click(screen.getByRole('button', { name: 'Remove AAPL' }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/watchlist/AAPL'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    // still pruned + refetched: the row disappears
    await waitFor(() => {
      const s = useStore.getState();
      expect(s.prices.AAPL).toBeUndefined();
      expect(s.watchlist.some((w) => w.ticker === 'AAPL')).toBe(false);
    });
    expect(screen.queryByTestId('sparkline-AAPL')).not.toBeInTheDocument();
  });

  it('Test 8: XSS guard — a forged HTML-shaped string renders as text, never DOM (T-03-01)', async () => {
    const { container } = render(<Home />);
    await screen.findByText('$10,000.00');

    // T-03-01: client store state is cosmetic (backend re-validates every
    // mutation) — but a forged value must still never become markup at the
    // composed-page level (carries 03-05's mitigation into the final tree).
    const evil = '<img src=x onerror=alert(1)>';
    act(() => useStore.setState({ watchlist: [{ ticker: evil }] }));

    // The string renders as TEXT nodes (React-escaped in HTML), never as
    // parsed markup. React assigns it via setAttribute/textContent, so the
    // browser never parses it as HTML. The security property is element-level:
    // no element was materialized from the string.
    expect(screen.getAllByText(evil).length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('img').length).toBe(0);
    expect(container.querySelectorAll('script').length).toBe(0);
    expect(container.querySelectorAll('[onerror]').length).toBe(0);
  });
});
