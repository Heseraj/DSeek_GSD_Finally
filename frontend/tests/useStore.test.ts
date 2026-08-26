// Unit tests for the zustand store (03-01 Task 3) — nine behaviors from
// 03-01-PLAN.md <behavior>. Uses vanilla store access (no React harness):
// useStore.getState() / useStore.setState() work without rendering.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PriceUpdate, PortfolioResponse, WatchlistResponse } from '../lib/types';
import useStore, { selectLiveTotal } from '../store/useStore';

const frame = (overrides: Partial<PriceUpdate>): PriceUpdate => ({
  ticker: 'AAPL',
  price: 100,
  previous_price: 99,
  timestamp: 1000,
  change: 1,
  change_percent: 0.01,
  direction: 'up',
  ...overrides,
});

const up = (price: number, timestamp: number): PriceUpdate =>
  frame({ ticker: 'AAPL', price, previous_price: price - 1, timestamp, change: 1, change_percent: 0.01, direction: 'up' });
const down = (price: number, timestamp: number): PriceUpdate =>
  frame({ ticker: 'AAPL', price, previous_price: price + 1, timestamp, change: -1, change_percent: -0.01, direction: 'down' });
const flat = (price: number, timestamp: number): PriceUpdate =>
  frame({ ticker: 'AAPL', price, previous_price: price, timestamp, change: 0, change_percent: 0, direction: 'flat' });

beforeEach(() => {
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
  vi.mocked(fetch).mockReset();
});

describe('applyPrices', () => {
  it('Test 1: merges a frame into prices and appends to histories', () => {
    useStore.getState().applyPrices({ AAPL: up(100, 1000) });
    let s = useStore.getState();
    expect(s.prices.AAPL).toEqual(up(100, 1000));
    expect(s.histories.AAPL).toEqual([100]);

    useStore.getState().applyPrices({ AAPL: up(101, 1001) });
    s = useStore.getState();
    expect(s.prices.AAPL.price).toBe(101);
    expect(s.histories.AAPL).toEqual([100, 101]);
  });

  it('Test 2: histories[ticker] is capped at 100 points', () => {
    const s0 = useStore.getState();
    for (let i = 0; i < 101; i++) {
      s0.applyPrices({ AAPL: up(100 + i, 1000 + i) });
    }
    const s = useStore.getState();
    expect(s.histories.AAPL.length).toBe(100);
    expect(s.histories.AAPL[0]).toBe(101); // oldest dropped
    expect(s.histories.AAPL[99]).toBe(200); // newest retained
  });

  it('Test 3: tickSeq increments only when direction differs from current price', () => {
    const s0 = useStore.getState();
    s0.applyPrices({ AAPL: up(100, 1000) });
    s0.applyPrices({ AAPL: up(101, 1001) }); // same direction 'up' -> no increment
    expect(useStore.getState().tickSeq.AAPL).toBe(0);

    s0.applyPrices({ AAPL: down(100, 1002) }); // direction change -> increment
    expect(useStore.getState().tickSeq.AAPL).toBe(1);

    s0.applyPrices({ AAPL: down(99, 1003) }); // same direction 'down' -> no increment
    expect(useStore.getState().tickSeq.AAPL).toBe(1);

    s0.applyPrices({ AAPL: flat(99, 1004) }); // direction change -> increment
    expect(useStore.getState().tickSeq.AAPL).toBe(2);
  });

  it('skips malformed entries without corrupting state', () => {
    const s0 = useStore.getState();
    s0.applyPrices({ AAPL: up(100, 1000) });
    // Intentionally malformed payloads — bypassed the type system via unknown cast
    // so the runtime type guard is what protects state (threat T-03-02).
    const bad = { ticker: 'BAD', price: 1 } as unknown as Record<string, PriceUpdate>;
    const badDir = {
      ticker: 'BAD2',
      price: 1,
      previous_price: 2,
      timestamp: 3,
      change: -1,
      change_percent: -0.5,
      direction: 'sideways',
    } as unknown as Record<string, PriceUpdate>;
    s0.applyPrices(bad);
    s0.applyPrices(badDir);
    const s = useStore.getState();
    expect(s.prices.BAD).toBeUndefined();
    expect(s.prices.BAD2).toBeUndefined();
    expect(s.prices.AAPL.price).toBe(100); // good entry intact
  });
});

describe('connection state', () => {
  it('Test 4: setConnection sets connection', () => {
    useStore.getState().setConnection('connected');
    expect(useStore.getState().connection).toBe('connected');
    useStore.getState().setConnection('reconnecting');
    expect(useStore.getState().connection).toBe('reconnecting');
    useStore.getState().setConnection('closed');
    expect(useStore.getState().connection).toBe('closed');
  });
});

describe('selectedTicker', () => {
  it('Test 5: selectTicker sets selectedTicker', () => {
    useStore.getState().selectTicker('MSFT');
    expect(useStore.getState().selectedTicker).toBe('MSFT');
    useStore.getState().selectTicker(null);
    expect(useStore.getState().selectedTicker).toBeNull();
  });
});

describe('pruneTicker', () => {
  it('Test 6: removes prices, histories, and tickSeq for a ticker', () => {
    const s0 = useStore.getState();
    s0.applyPrices({ AAPL: up(100, 1000) });
    s0.applyPrices({ MSFT: up(200, 1000) });
    useStore.getState().pruneTicker('AAPL');
    const s = useStore.getState();
    expect(s.prices.AAPL).toBeUndefined();
    expect(s.histories.AAPL).toBeUndefined();
    expect(s.tickSeq.AAPL).toBeUndefined();
    expect(s.prices.MSFT).toBeDefined(); // other tickers untouched
  });
});

describe('refetchPortfolio', () => {
  it('Test 7: GETs /api/portfolio via apiFetch and stores PortfolioResponse', async () => {
    const portfolio: PortfolioResponse = {
      cash_balance: 5000,
      positions: [
        {
          ticker: 'AAPL',
          quantity: 10,
          avg_cost: 90,
          current_price: 100,
          market_value: 1000,
          unrealized_pnl: 100,
          unrealized_pnl_percent: 0.1111,
        },
      ],
      total_value: 6000,
      unrealized_pnl: 100,
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => portfolio,
    } as Response);

    await useStore.getState().refetchPortfolio();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/portfolio'),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    );
    expect(useStore.getState().portfolio).toEqual(portfolio);
  });
});

describe('refetchWatchlist', () => {
  it('Test 8: GETs /api/watchlist and maps the union into WatchlistTicker[]', async () => {
    const resp: WatchlistResponse = {
      tickers: [
        { ticker: 'AAPL', price: 100, previous_price: 99, timestamp: 1000, change: 1, change_percent: 0.01, direction: 'up' },
        { ticker: 'MSFT' }, // bare {ticker} union arm
      ],
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => resp,
    } as Response);

    await useStore.getState().refetchWatchlist();

    expect(useStore.getState().watchlist).toEqual([
      { ticker: 'AAPL', price: 100 },
      { ticker: 'MSFT' },
    ]);
  });
});

describe('chat slices', () => {
  it('Test 9: appendChatMessage / setChatLoading update the chat slices', () => {
    useStore.getState().appendChatMessage({ role: 'user', content: 'buy 10 AAPL' });
    expect(useStore.getState().chatMessages).toEqual([{ role: 'user', content: 'buy 10 AAPL' }]);

    useStore.getState().setChatLoading(true);
    expect(useStore.getState().chatLoading).toBe(true);

    useStore.getState().appendChatMessage({ role: 'assistant', content: 'done', error: null });
    expect(useStore.getState().chatMessages[1]).toEqual({ role: 'assistant', content: 'done', error: null });

    useStore.getState().setChatLoading(false);
    expect(useStore.getState().chatLoading).toBe(false);
  });
});

describe('selectLiveTotal', () => {
  it('returns 0 when no portfolio', () => {
    expect(selectLiveTotal(useStore.getState())).toBe(0);
  });

  it('computes cash + Σ(qty × live SSE price) with current_price fallback', () => {
    useStore.setState({
      portfolio: {
        cash_balance: 5000,
        positions: [
          { ticker: 'AAPL', quantity: 10, avg_cost: 90, current_price: 100, market_value: 1000, unrealized_pnl: 100, unrealized_pnl_percent: 0.1111 },
          { ticker: 'MSFT', quantity: 2, avg_cost: 300, current_price: 310, market_value: 620, unrealized_pnl: 20, unrealized_pnl_percent: 0.0333 },
        ],
        total_value: 6620,
        unrealized_pnl: 120,
      },
      prices: { AAPL: up(110, 2000) }, // SSE price supersedes current_price for AAPL
    });
    // 5000 + 10×110 + 2×310 (MSFT has no SSE price -> current_price fallback)
    expect(selectLiveTotal(useStore.getState())).toBe(6720);
  });
});
