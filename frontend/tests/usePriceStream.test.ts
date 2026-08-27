// Unit tests for the usePriceStream hook (03-02 Task 1 TRACER) — five behaviors
// from 03-02-PLAN.md <behavior>. Drives the captured EventSource mock instance
// from tests/setup.ts (constructor registry + __emit) and asserts against the
// zustand store, which the hook updates through the real JSON.parse path.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PriceUpdate } from '../lib/types';
import { apiUrl } from '../lib/api';
import { useStore } from '../store/useStore';
import { usePriceStream } from '../hooks/usePriceStream';
import { MockEventSource } from './setup';

const frame = (overrides: Partial<PriceUpdate> = {}): PriceUpdate => ({
  ticker: 'AAPL',
  price: 150.25,
  previous_price: 149.8,
  timestamp: 1756000000.5, // float seconds exactly as the backend sends them
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
  MockEventSource.instances = [];
  vi.mocked(fetch).mockReset();
});

describe('usePriceStream', () => {
  it('Test 1: opens an EventSource at apiUrl() and writes frames into the store', () => {
    const { unmount } = renderHook(() => usePriceStream());
    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();
    expect(es.url).toBe(apiUrl('/api/stream/prices'));

    act(() => es.__emit('message', { data: JSON.stringify({ AAPL: frame() }) }));

    const s = useStore.getState();
    expect(s.prices.AAPL).toEqual(frame());
    expect(s.histories.AAPL).toEqual([150.25]);
    unmount();
  });

  it('Test 2: a malformed frame is skipped without crashing or changing state', () => {
    const { unmount } = renderHook(() => usePriceStream());
    const es = MockEventSource.instances[0];

    expect(() => act(() => es.__emit('message', { data: 'not json' }))).not.toThrow();

    const s = useStore.getState();
    expect(s.prices).toEqual({});
    expect(s.histories).toEqual({});
    unmount();
  });

  it('Test 3: open/error map to connection states; unmount closes exactly once', () => {
    const { unmount } = renderHook(() => usePriceStream());
    const es = MockEventSource.instances[0];

    act(() => es.__emit('open'));
    expect(useStore.getState().connection).toBe('connected');

    act(() => es.__emit('error'));
    expect(useStore.getState().connection).toBe('reconnecting');

    const closeSpy = vi.spyOn(es, 'close');
    unmount();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(es.closed).toBe(true);
  });
});
