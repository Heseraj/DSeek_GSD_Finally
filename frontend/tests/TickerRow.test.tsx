// Component tests for TickerRow (03-02 Task 1) — Tests 4 & 5 from
// 03-02-PLAN.md <behavior>: formatted price + flash class per direction,
// key-remount on tickSeq change (flash restart), click-to-select.
import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { PriceUpdate } from '../lib/types';
import { useStore } from '../store/useStore';
import { TickerRow } from '../components/watchlist/TickerRow';

const frame = (overrides: Partial<PriceUpdate>): PriceUpdate => ({
  ticker: 'AAPL',
  price: 150.25,
  previous_price: 149.8,
  timestamp: 1756000000.5,
  change: 0.45,
  change_percent: 0.3,
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

beforeEach(() => {
  resetStore();
});

describe('TickerRow', () => {
  it('Test 4: renders the formatted price with the direction flash class', () => {
    useStore.setState({ prices: { AAPL: frame({ direction: 'up' }) }, tickSeq: { AAPL: 1 } });
    const { rerender } = render(<TickerRow ticker="AAPL" />);

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('$150.25')).toHaveClass('flash-up');
    expect(screen.getByText('0.30%')).toHaveClass('text-emerald-400');
    expect(screen.getByRole('button', { name: 'Remove AAPL' })).toBeInTheDocument();

    act(() => useStore.setState({ prices: { AAPL: frame({ price: 149.1, direction: 'down' }) } }));
    rerender(<TickerRow ticker="AAPL" />);
    expect(screen.getByText('$149.10')).toHaveClass('flash-down');

    act(() => useStore.setState({ prices: { AAPL: frame({ price: 149.1, direction: 'flat' }) } }));
    rerender(<TickerRow ticker="AAPL" />);
    const flat = screen.getByText('$149.10');
    expect(flat).not.toHaveClass('flash-up');
    expect(flat).not.toHaveClass('flash-down');
  });

  it('Test 5: remounts the price span on tickSeq change and selects on click', () => {
    useStore.setState({ prices: { AAPL: frame({ direction: 'up' }) }, tickSeq: { AAPL: 0 } });
    render(<TickerRow ticker="AAPL" />);
    const span1 = screen.getByText('$150.25');

    // applyPrices with the opposite direction increments tickSeq → new key → remount
    act(() => {
      useStore.getState().applyPrices({ AAPL: frame({ price: 149.1, direction: 'down' }) });
    });
    expect(useStore.getState().tickSeq.AAPL).toBe(1);

    const span2 = screen.getByText('$149.10');
    expect(span2).not.toBe(span1); // keyed remount, not an in-place text update
    expect(span2).toHaveClass('flash-down');

    // clicking the row selects the ticker
    fireEvent.click(screen.getByText('AAPL'));
    expect(useStore.getState().selectedTicker).toBe('AAPL');
  });
});
