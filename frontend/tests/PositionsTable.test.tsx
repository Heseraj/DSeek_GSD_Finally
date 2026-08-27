// Component tests for PositionsTable (03-04 Task 3) — the positions table with
// a live SSE-driven current-price column (03-PATTERNS.md:279-281).
//
// Test 1 pins all seven columns per row (ticker/quantity/avg_cost/current_price/
// market_value/unrealized_pnl/unrealized_pnl_percent).
// Test 2 pins the live price supersession: applyPrices for one ticker changes
// only that row's current_price column; tickers without an SSE frame fall back
// to position.current_price.
// Test 3 pins pnlColor classes on the pnl/pnl% cells and the empty state.
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { useStore } from '../store/useStore';
import { PositionsTable } from '../components/portfolio/PositionsTable';
import type { Position, PriceUpdate } from '../lib/types';

const pos = (overrides: Partial<Position>): Position => ({
  ticker: 'AAPL',
  quantity: 10,
  avg_cost: 140,
  current_price: 150,
  market_value: 5000,
  unrealized_pnl: 250,
  unrealized_pnl_percent: 3.57,
  ...overrides,
});

const frame = (overrides: Partial<PriceUpdate>): PriceUpdate => ({
  ticker: 'TSLA',
  price: 210,
  previous_price: 208,
  timestamp: 1756000000.5,
  change: 2,
  change_percent: 0.96,
  direction: 'up',
  ...overrides,
});

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

const seedPortfolio = (positions: Position[]) =>
  useStore.setState({
    portfolio: {
      cash_balance: 1000,
      positions,
      total_value: 10000,
      unrealized_pnl: 200,
    },
  });

beforeEach(() => {
  resetStore();
});

describe('PositionsTable', () => {
  it('Test 1: renders all seven columns for every position', () => {
    seedPortfolio([
      pos({
        ticker: 'AAPL',
        quantity: 10,
        avg_cost: 140,
        current_price: 150,
        market_value: 5000,
        unrealized_pnl: 250,
        unrealized_pnl_percent: 3.57,
      }),
      pos({
        ticker: 'TSLA',
        quantity: 5,
        avg_cost: 200,
        current_price: 190,
        market_value: 950,
        unrealized_pnl: -50,
        unrealized_pnl_percent: -5,
      }),
    ]);
    const { container } = render(<PositionsTable />);

    // column headers
    for (const header of ['Ticker', 'Qty', 'Avg Cost', 'Price', 'Mkt Value', 'Unrealized P&L', 'P&L %']) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }

    const aapl = within(container.querySelector('tr[data-ticker="AAPL"]')!);
    expect(aapl.getByText('AAPL')).toBeInTheDocument();
    expect(aapl.getByText('10')).toBeInTheDocument(); // quantity
    expect(aapl.getByText('$140.00')).toBeInTheDocument(); // avg_cost
    expect(aapl.getByText('$150.00')).toBeInTheDocument(); // current_price (no SSE price yet)
    expect(aapl.getByText('$5,000.00')).toBeInTheDocument(); // market_value
    expect(aapl.getByText('$250.00')).toBeInTheDocument(); // unrealized_pnl
    expect(aapl.getByText('3.57%')).toBeInTheDocument(); // unrealized_pnl_percent

    const tsla = within(container.querySelector('tr[data-ticker="TSLA"]')!);
    expect(tsla.getByText('5')).toBeInTheDocument();
    expect(tsla.getByText('$950.00')).toBeInTheDocument();
    expect(tsla.getByText('-$50.00')).toBeInTheDocument();
    expect(tsla.getByText('-5.00%')).toBeInTheDocument();
  });

  it('Test 2: live SSE price supersedes current_price; fallback for tickers without a frame', () => {
    seedPortfolio([
      pos({ ticker: 'AAPL', current_price: 150 }),
      pos({ ticker: 'TSLA', current_price: 190 }),
    ]);
    const { container } = render(<PositionsTable />);

    act(() => {
      useStore.getState().applyPrices({ TSLA: frame({ ticker: 'TSLA', price: 210, direction: 'up' }) });
    });

    // AAPL has no SSE frame → falls back to position.current_price
    const aapl = within(container.querySelector('tr[data-ticker="AAPL"]')!);
    expect(aapl.getByText('$150.00')).toBeInTheDocument();

    // TSLA row now shows the live SSE price
    const tsla = within(container.querySelector('tr[data-ticker="TSLA"]')!);
    expect(tsla.getByText('$210.00')).toBeInTheDocument();
    expect(tsla.queryByText('$190.00')).toBeNull();
  });

  it('Test 3: pnl cells carry emerald/red classes; empty portfolio shows No positions', () => {
    seedPortfolio([
      pos({ ticker: 'AAPL', unrealized_pnl: 250, unrealized_pnl_percent: 3.57 }),
      pos({ ticker: 'TSLA', unrealized_pnl: -50, unrealized_pnl_percent: -5 }),
    ]);
    const { container } = render(<PositionsTable />);

    const aapl = within(container.querySelector('tr[data-ticker="AAPL"]')!);
    expect(aapl.getByText('$250.00')).toHaveClass('text-emerald-400');
    expect(aapl.getByText('3.57%')).toHaveClass('text-emerald-400');

    const tsla = within(container.querySelector('tr[data-ticker="TSLA"]')!);
    expect(tsla.getByText('-$50.00')).toHaveClass('text-red-400');
    expect(tsla.getByText('-5.00%')).toHaveClass('text-red-400');

    // empty portfolio → No positions, no table
    resetStore();
    const empty = render(<PositionsTable />);
    expect(within(empty.container).getByText('No positions')).toBeInTheDocument();
    expect(empty.container.querySelector('table')).toBeNull();
  });
});
