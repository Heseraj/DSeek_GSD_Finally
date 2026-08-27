// Chart lifecycle tests (03-03 Task 1) — MainChart + useLightweightChart under
// the hoisted lightweight-charts mock from tests/setup.ts. Proves the four
// v5-lifecycle behaviors (03-03-PLAN.md Task 1 <behavior>):
//   1. createChart exactly once on mount with the dark-theme layout + explicit width
//   2. appended history points stream via series.update({time: Math.floor(ts), value})
//      — never setData after the initial seed (03-RESEARCH.md:248, Pitfall 3)
//   3. ticker switch re-seeds with setData for the new ticker's history,
//      subsequent growth uses update()
//   4. unmount calls chart.remove() and removes the resize listener
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { createChart } from 'lightweight-charts';
import type { PriceUpdate } from '../lib/types';
import { useStore } from '../store/useStore';
import { MainChart } from '../components/chart/MainChart';

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

// The mock's createChart options, typed loosely so the dark-theme assertions
// compile (the real v5 ChartOptions uses DeepPartial unions on background).
interface ChartOptionsLoose {
  layout: { background: { type: string; color: string }; textColor: string };
  width: number;
  height: number;
}

const frame = (overrides: Partial<PriceUpdate> = {}): PriceUpdate => ({
  ticker: 'AAPL',
  price: 150.25,
  previous_price: 149.8,
  timestamp: 1756000000.5, // backend float Unix seconds (Pitfall 3)
  change: 0.45,
  change_percent: 0.3,
  direction: 'up',
  ...overrides,
});

const getCharts = (): ChartSpy[] =>
  vi.mocked(createChart).mock.results.map((r) => r.value as unknown as ChartSpy);

const getSeries = (chart: ChartSpy): SeriesSpy =>
  chart.addSeries.mock.results[0].value as unknown as SeriesSpy;

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

describe('MainChart', () => {
  it('Test 1: creates the chart once on mount with the dark theme and explicit width', () => {
    useStore.setState({ selectedTicker: 'AAPL', histories: { AAPL: [150.25] }, prices: { AAPL: frame() } });
    const { container } = render(<MainChart />);

    const charts = getCharts();
    expect(charts).toHaveLength(1); // exactly one chart instance

    const [, options] = vi.mocked(createChart).mock.calls[0] as [HTMLElement, ChartOptionsLoose];
    expect(options.layout.background.color).toBe('#0d1117');
    expect(options.layout.textColor).toBe('#c9d1d9');
    const containerEl = container.firstElementChild as HTMLElement;
    expect(options.width).toBe(containerEl.clientWidth); // explicit width from the ref
  });

  it('Test 2: streams appended points via series.update with integer time — never setData per tick', () => {
    useStore.setState({ selectedTicker: 'AAPL', histories: { AAPL: [150.25] }, prices: { AAPL: frame() } });
    render(<MainChart />);
    const chart = getCharts()[0];
    const series = getSeries(chart);

    // initial seed — index-based time
    expect(series.setData).toHaveBeenCalledTimes(1);
    expect(series.setData).toHaveBeenCalledWith([{ time: 0, value: 150.25 }]);

    act(() => {
      useStore.getState().applyPrices({ AAPL: frame({ price: 151.0 }) });
    });

    // streamed point — Math.floor(float timestamp) at the series boundary
    expect(series.update).toHaveBeenCalledWith({ time: Math.floor(1756000000.5), value: 151.0 });
    expect(series.setData).toHaveBeenCalledTimes(1); // never setData on the per-tick path
  });

  it('Test 3: re-seeds with setData on ticker switch, then streams via update', () => {
    useStore.setState({
      selectedTicker: 'AAPL',
      histories: { AAPL: [150.25], MSFT: [400.0, 401.0] },
      prices: { AAPL: frame(), MSFT: frame({ ticker: 'MSFT', price: 401.0 }) },
    });
    render(<MainChart />);
    const chart = getCharts()[0];
    const series = getSeries(chart);
    expect(series.setData).toHaveBeenCalledWith([{ time: 0, value: 150.25 }]);

    act(() => useStore.getState().selectTicker('MSFT'));
    expect(series.setData).toHaveBeenLastCalledWith([
      { time: 0, value: 400.0 },
      { time: 1, value: 401.0 },
    ]);

    act(() => {
      useStore.getState().applyPrices({ MSFT: frame({ ticker: 'MSFT', price: 402.0 }) });
    });
    expect(series.update).toHaveBeenCalledWith({ time: Math.floor(1756000000.5), value: 402.0 });
  });

  it('Test 4: unmount removes the chart and the resize listener', () => {
    useStore.setState({ selectedTicker: 'AAPL', histories: { AAPL: [150.25] }, prices: { AAPL: frame() } });
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<MainChart />);
    const chart = getCharts()[0];

    unmount();

    expect(chart.remove).toHaveBeenCalledTimes(1);
    expect(removeListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeListenerSpy.mockRestore();
  });
});
