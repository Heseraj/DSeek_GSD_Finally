// Component tests for Heatmap (03-04 Task 1) — a Recharts Treemap sized by
// market_value and colored by unrealized_pnl sign/intensity
// (03-PATTERNS.md:263-273, 03-RESEARCH.md:392-400).
//
// Test 1 pins the data mapping (positions -> {name, size, pnl}) by passing a
// spy `content` render function: Recharts invokes the custom content per node,
// and leaf nodes (depth 1) carry the mapped fields.
// Test 2 pins the pnl color scale: emerald rgba alpha-scaled by |pnl|/maxAbsPnl,
// red for losses, #30363d for zero.
// Test 3 pins the empty state.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useStore } from '../store/useStore';
import { Heatmap } from '../components/portfolio/Heatmap';
import type { HeatmapNodeProps } from '../components/portfolio/Heatmap';
import type { Position } from '../lib/types';

// Recharts 3.10.1 ResponsiveContainer renders its chart only once width/height
// are positive (ResponsiveContainer.js:25-47, Treemap.js:783-787); jsdom has no
// layout engine, so stub ResizeObserver to fire a fixed size synchronously on
// observe() — the standard jsdom pattern for Recharts size measurement.
class MockResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(_target: Element) {
    this.callback(
      [{ contentRect: { width: 640, height: 192 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  disconnect() {}
  unobserve() {}
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

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

describe('Heatmap', () => {
  it('Test 1: maps the store portfolio into Treemap data (name/size/pnl)', () => {
    useStore.setState({
      portfolio: {
        cash_balance: 1000,
        positions: [
          pos({ ticker: 'AAPL', market_value: 5000, unrealized_pnl: 250 }),
          pos({ ticker: 'TSLA', market_value: 3000, unrealized_pnl: -150 }),
        ],
        total_value: 9000,
        unrealized_pnl: 100,
      },
    });
    const spy = vi.fn(() => null);
    render(<Heatmap content={spy} />);

    const leaves = spy.mock.calls
      .map((c) => c[0] as HeatmapNodeProps)
      .filter((p) => p.depth === 1);
    expect(leaves).toHaveLength(2);
    const byName = Object.fromEntries(leaves.map((l) => [l.name, l]));
    expect(byName.AAPL).toMatchObject({ name: 'AAPL', size: 5000, pnl: 250 });
    expect(byName.TSLA).toMatchObject({ name: 'TSLA', size: 3000, pnl: -150 });
  });

  it('Test 2: green/red/gray fills scale with pnl sign and intensity', () => {
    useStore.setState({
      portfolio: {
        cash_balance: 1000,
        positions: [
          pos({ ticker: 'AAPL', market_value: 5000, unrealized_pnl: 250 }),
          pos({ ticker: 'TSLA', market_value: 3000, unrealized_pnl: -150 }),
          pos({ ticker: 'JPM', market_value: 2000, unrealized_pnl: 0 }),
        ],
        total_value: 10000,
        unrealized_pnl: 100,
      },
    });
    const { container } = render(<Heatmap />);

    const cell = (ticker: string) => container.querySelector(`rect[data-ticker="${ticker}"]`);
    expect(cell('AAPL')).toHaveAttribute('fill', 'rgba(16,185,129,1)'); // |250|/250 → full emerald
    expect(cell('TSLA')).toHaveAttribute('fill', 'rgba(239,68,68,0.6)'); // |−150|/250 → 0.6 red
    expect(cell('JPM')).toHaveAttribute('fill', '#30363d'); // zero pnl → gray

    // cells carry ticker + formatted market value labels
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('$5,000.00')).toBeInTheDocument();
    expect(screen.getByText('TSLA')).toBeInTheDocument();
  });

  it('Test 3: empty portfolio renders "No positions" and no Treemap', () => {
    // null portfolio
    const { container } = render(<Heatmap />);
    expect(screen.getByText('No positions')).toBeInTheDocument();
    expect(container.querySelector('.recharts-treemap')).toBeNull();
  });

  it('Test 3b: an empty positions array renders the same empty state (never crashes)', () => {
    useStore.setState({
      portfolio: { cash_balance: 1000, positions: [], total_value: 1000, unrealized_pnl: 0 },
    });
    const { container } = render(<Heatmap />);
    expect(screen.getByText('No positions')).toBeInTheDocument();
    expect(container.querySelector('.recharts-treemap')).toBeNull();
  });
});
