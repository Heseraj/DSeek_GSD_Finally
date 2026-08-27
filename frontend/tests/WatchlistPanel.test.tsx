// Component tests for WatchlistPanel (03-05 Task 3 + 03-06 Task 1) — the ADD
// flow (200/409) with exact backend semantics. The REMOVE flow (raw DELETE
// 204-prune / 404-tolerate) moved to the real TickerRow in 03-06 Task 1 and is
// asserted at the composed-page level in TerminalApp.test.tsx (Remove
// click-through on 204 and 404). Tests from 03-05-PLAN.md <behavior>:
//   1. adding a valid ticker POSTs {ticker: 'IBM'} to /api/watchlist; on 200
//      clears the input and refreshes the watchlist
//   2. a 409 duplicate renders the inline 'already on watchlist' message and
//      the watchlist is unchanged
//   5. invalid ticker input (over 12 chars / whitespace) is blocked
//      client-side without a fetch call
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WatchlistPanel } from '../components/watchlist/WatchlistPanel';
import type { WatchlistResponse } from '../lib/types';
import { useStore } from '../store/useStore';

const WATCHLIST: WatchlistResponse = { tickers: [{ ticker: 'IBM' }, { ticker: 'MSFT' }] };

const jsonResponse = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const resetStore = () =>
  useStore.setState({
    prices: {},
    histories: {},
    tickSeq: {},
    connection: 'closed',
    selectedTicker: null,
    portfolio: null,
    watchlist: [{ ticker: 'IBM' }, { ticker: 'MSFT' }],
    chatMessages: [],
    chatLoading: false,
  });

beforeEach(() => {
  resetStore();
  vi.mocked(fetch).mockReset();
});

describe('WatchlistPanel', () => {
  it('Test 1: adding a valid ticker POSTs {ticker: IBM} and on 200 clears the input and refreshes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, { ticker: 'IBM' })) // POST /api/watchlist
      .mockResolvedValueOnce(jsonResponse(200, WATCHLIST)); // GET refetch
    render(<WatchlistPanel />);

    fireEvent.change(screen.getByLabelText('Add ticker'), { target: { value: '  ibm  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/watchlist'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ ticker: 'IBM' }) }),
      );
    });
    await waitFor(() => expect(screen.getByLabelText('Add ticker')).toHaveValue(''));
  });

  it('Test 2: a 409 duplicate renders the inline message and the watchlist is unchanged', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { detail: 'Ticker already on watchlist: IBM' }));
    render(<WatchlistPanel />);

    fireEvent.change(screen.getByLabelText('Add ticker'), { target: { value: 'IBM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('already on watchlist')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1); // no refetch fired
    expect(useStore.getState().watchlist).toEqual([{ ticker: 'IBM' }, { ticker: 'MSFT' }]);
  });

  it('Test 3: renders a real TickerRow per watchlist entry (row composition swap)', async () => {
    render(<WatchlistPanel />);

    // TickerRow per entry: ticker text, per-row sparkline slot, remove button
    expect(screen.getByText('IBM')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByTestId('sparkline-IBM')).toBeInTheDocument();
    expect(screen.getByTestId('sparkline-MSFT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove IBM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove MSFT' })).toBeInTheDocument();
  });

  it('Test 4: invalid ticker input (over 12 chars / whitespace) is blocked without a fetch', () => {
    render(<WatchlistPanel />);

    fireEvent.change(screen.getByLabelText('Add ticker'), { target: { value: 'TOOLONGTICKER12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Add ticker'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
