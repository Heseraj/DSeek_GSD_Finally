// Component tests for WatchlistPanel (03-05 Task 3) — add (200/409) and remove
// (204/404) with store pruning. Tests 1-5 from 03-05-PLAN.md <behavior>:
//   1. adding a valid ticker POSTs {ticker: 'IBM'} to /api/watchlist; on 200
//      clears the input and refreshes the watchlist
//   2. a 409 duplicate renders the inline 'already on watchlist' message and
//      the watchlist is unchanged
//   3. removing a ticker DELETEs /api/watchlist/IBM; on 204 the store prunes
//      prices, histories, and tickSeq for that ticker (Pitfall 5)
//   4. a 404 on delete renders an inline error and state is unchanged
//   5. invalid ticker input (over 12 chars / whitespace) is blocked
//      client-side without a fetch call
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WatchlistPanel } from '../components/watchlist/WatchlistPanel';
import type { PriceUpdate, WatchlistResponse } from '../lib/types';
import { useStore } from '../store/useStore';

const WATCHLIST: WatchlistResponse = { tickers: [{ ticker: 'IBM' }, { ticker: 'MSFT' }] };

const frame = (ticker: string, price: number): PriceUpdate => ({
  ticker,
  price,
  previous_price: price - 1,
  timestamp: 1000,
  change: 1,
  change_percent: 0.01,
  direction: 'up',
});

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

  it('Test 3: removing a ticker DELETEs /api/watchlist/IBM; on 204 the store prunes that ticker', async () => {
    useStore.setState({
      prices: { IBM: frame('IBM', 150), MSFT: frame('MSFT', 300) },
      histories: { IBM: [149, 150], MSFT: [299, 300] },
      tickSeq: { IBM: 2, MSFT: 1 },
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(204, null)) // DELETE (no body)
      .mockResolvedValueOnce(jsonResponse(200, { tickers: [{ ticker: 'MSFT' }] })); // GET refetch
    render(<WatchlistPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove IBM' }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/watchlist/IBM'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    // Pitfall 5: prices/histories/tickSeq pruned for the removed ticker only
    await waitFor(() => {
      const s = useStore.getState();
      expect(s.prices.IBM).toBeUndefined();
      expect(s.histories.IBM).toBeUndefined();
      expect(s.tickSeq.IBM).toBeUndefined();
      expect(s.prices.MSFT).toBeDefined();
      expect(s.histories.MSFT).toEqual([299, 300]);
    });
  });

  it('Test 4: a 404 on delete renders an inline error and state is unchanged', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { detail: 'Ticker not on watchlist: IBM' }));
    render(<WatchlistPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove IBM' }));

    expect(await screen.findByText('Ticker not on watchlist: IBM')).toBeInTheDocument();
    expect(useStore.getState().watchlist).toEqual([{ ticker: 'IBM' }, { ticker: 'MSFT' }]);
  });

  it('Test 5: invalid ticker input (over 12 chars / whitespace) is blocked without a fetch', () => {
    render(<WatchlistPanel />);

    fireEvent.change(screen.getByLabelText('Add ticker'), { target: { value: 'TOOLONGTICKER12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Add ticker'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
