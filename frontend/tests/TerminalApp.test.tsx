// Shell integration test (03-02 Task 2) — renders page.tsx end-to-end under
// jsdom with mocked fetch + the capture-instance EventSource mock from
// tests/setup.ts. Asserts: header cash + live total, connection dot mapping
// open/error events, the five section slots, watchlist rows, SSE-frame live
// total update, and the XSS guard (forged store strings stay text — T-03-04).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { PortfolioResponse, PriceUpdate, WatchlistResponse } from '../lib/types';
import { useStore } from '../store/useStore';
import { MockEventSource } from './setup';
import Home from '../app/page';

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
  ],
  total_value: 11500,
  unrealized_pnl: 100,
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
  ],
};

const mockFetch = () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.includes('/api/portfolio')) {
      return { ok: true, status: 200, json: async () => portfolio } as Response;
    }
    if (url.includes('/api/watchlist')) {
      return { ok: true, status: 200, json: async () => watchlist } as Response;
    }
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
    // no SSE price yet -> live total falls back to current_price: 10000 + 10×150
    expect(await screen.findByText('$10,000.00')).toBeInTheDocument();
    expect(await screen.findByText('$11,500.00')).toBeInTheDocument();
  });

  it('Test 3: an SSE frame updates the header live total (selector isolation)', async () => {
    render(<Home />);
    await screen.findByText('$11,500.00');
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

    // 10000 + 10×160 = 11600
    expect(await screen.findByText('$11,600.00')).toBeInTheDocument();
    expect(screen.queryByText('$11,500.00')).not.toBeInTheDocument();
  });

  it('renders the five section slots and a watchlist row per mocked ticker', async () => {
    render(<Home />);
    expect(screen.getByTestId('header-slot')).toBeInTheDocument();
    expect(screen.getByTestId('main-chart-slot')).toBeInTheDocument();
    expect(screen.getByTestId('portfolio-slot')).toBeInTheDocument();
    expect(screen.getByTestId('trade-bar-slot')).toBeInTheDocument();
    expect(screen.getByTestId('chat-slot')).toBeInTheDocument();

    expect(await screen.findByText('AAPL')).toBeInTheDocument();
    expect(await screen.findByText('MSFT')).toBeInTheDocument();
    expect(screen.getByTestId('sparkline-AAPL')).toBeInTheDocument();
  });

  it('XSS guard: a forged HTML-shaped string renders as text, never DOM', async () => {
    const { container } = render(<Home />);
    await screen.findByText('$10,000.00');

    // T-03-04: client store state is cosmetic (backend re-validates every
    // mutation) — but a forged value must still never become markup.
    const evil = '<img src=x onerror=alert(1)>';
    act(() => useStore.setState({ watchlist: [{ ticker: evil }] }));

    // The string renders as a TEXT node (React-escaped in HTML), never as
    // parsed markup. Note: the raw string may appear inside attribute VALUES
    // (data-ticker/testid/aria-label) — React assigns those via setAttribute,
    // so the browser never parses them as HTML. The security property is
    // element-level: no element was materialized from the string.
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelectorAll('img').length).toBe(0);
    expect(container.querySelectorAll('script').length).toBe(0);
    expect(container.querySelectorAll('[onerror]').length).toBe(0);
  });
});
