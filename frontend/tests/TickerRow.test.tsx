// Component tests for TickerRow (03-02 Task 1, 03-03 Task 2) — Tests 4 & 5
// from 03-02-PLAN.md <behavior> (formatted price + flash class per direction,
// key-remount on tickSeq change, click-to-select); Tests 6-8 from
// 03-03-PLAN.md Task 2 <behavior> (Sparkline slot testid, per-ticker history
// array isolation, update-on-append + remove-on-unmount via the setup.ts
// lightweight-charts mock).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createChart } from 'lightweight-charts';
import type { PriceUpdate } from '../lib/types';
import { useStore } from '../store/useStore';
import { TickerRow } from '../components/watchlist/TickerRow';

interface SeriesSpy {
  setData: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

interface ChartSpy {
  addSeries: ReturnType<typeof vi.fn>;
  timeScale: ReturnType<typeof vi.fn>;
  applyOptions: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

const getCharts = (): ChartSpy[] =>
  vi.mocked(createChart).mock.results.map((r) => r.value as unknown as ChartSpy);

const getSeries = (chart: ChartSpy): SeriesSpy =>
  chart.addSeries.mock.results[0].value as unknown as SeriesSpy;

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
  vi.mocked(createChart).mockClear();
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

  it('Test 6: renders the Sparkline container slot for its ticker', () => {
    render(<TickerRow ticker="AAPL" />);
    expect(screen.getByTestId('sparkline-AAPL')).toBeInTheDocument();
    expect(screen.queryByTestId('sparkline-MSFT')).not.toBeInTheDocument();
  });

  it('Test 7: the Sparkline receives only its ticker history array', () => {
    useStore.setState({ histories: { AAPL: [150.25, 151.0], MSFT: [400.0] } });
    render(<TickerRow ticker="AAPL" />);

    const chart = getCharts()[0];
    const series = getSeries(chart);
    // seeded from AAPL's array only — MSFT's points never reach this sparkline
    expect(series.setData).toHaveBeenCalledWith([
      { time: 0, value: 150.25 },
      { time: 1, value: 151.0 },
    ]);
  });

  it('Test 8: appending a history point streams via series.update; unmount removes the chart', () => {
    useStore.setState({ histories: { AAPL: [150.25] } });
    const { unmount } = render(<TickerRow ticker="AAPL" />);

    const chart = getCharts()[0];
    const series = getSeries(chart);
    expect(series.setData).toHaveBeenCalledWith([{ time: 0, value: 150.25 }]);

    act(() => {
      useStore.getState().applyPrices({ AAPL: frame({ price: 151.0 }) });
    });
    // index-based time: the appended point lives at data.length - 1
    expect(series.update).toHaveBeenCalledWith({ time: 1, value: 151.0 });

    unmount();
    expect(chart.remove).toHaveBeenCalledTimes(1);
  });
});
