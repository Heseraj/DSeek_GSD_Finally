// Component tests for PnlChart (03-04 Task 2) — a Recharts LineChart over
// GET /api/portfolio/history snapshots with a 30s re-poll matching the server
// snapshot cadence (A5, 03-RESEARCH.md:441; snapshots.py:46-48).
//
// Test 1 pins the mount-time fetch + one-line-point-per-snapshot rendering.
// Test 2 pins the 30s poll interval under fake timers.
// Test 3 pins the loading ('Loading…') and empty ('No history yet') states.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { PnlChart } from '../components/portfolio/PnlChart';
import type { HistoryResponse } from '../lib/types';

// Same jsdom ResizeObserver pattern as Heatmap.test.tsx: ResponsiveContainer
// renders its chart only once width/height are positive (recharts 3.10.1).
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

const HISTORY: HistoryResponse = {
  snapshots: [
    { recorded_at: '2026-08-26T10:00:00Z', total_value: 10000 },
    { recorded_at: '2026-08-26T10:30:00Z', total_value: 10500 },
  ],
};

const okResponse = (body: HistoryResponse) =>
  ({ ok: true, json: async () => body }) as Response;

beforeEach(() => {
  vi.mocked(fetch).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PnlChart', () => {
  it('Test 1: fetches /api/portfolio/history on mount and renders one line point per snapshot', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(HISTORY));
    const { container } = render(<PnlChart />);
    await act(async () => {});

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/portfolio/history',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    );

    // XAxis ticks render the formatted HH:MM (UTC) for each snapshot
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('10:30')).toBeInTheDocument();

    // the line curve exists and traces the snapshots (path opens with M)
    const curve = container.querySelector('.recharts-line-curve');
    expect(curve).not.toBeNull();
    const d = curve!.getAttribute('d') ?? '';
    expect(d.startsWith('M')).toBe(true);
  });

  it('Test 2: re-polls every 30s to match the server snapshot cadence', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(okResponse(HISTORY));
    render(<PnlChart />);
    await act(async () => {});
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);

    // a shorter advance does NOT refetch — the interval is fixed at 30s
    await act(async () => {
      vi.advanceTimersByTime(29_000);
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('Test 3: shows Loading… until data arrives and No history yet for an empty snapshots array', async () => {
    let resolveFetch!: (v: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    render(<PnlChart />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    await act(async () => {
      resolveFetch(okResponse({ snapshots: [] }));
    });
    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });
});
