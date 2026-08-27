// Component tests for TradeBar (03-05 Task 1) — buy/sell with instant fill and
// inline error handling. Tests 1-5 from 03-05-PLAN.md <behavior>:
//   1. POST /api/portfolio/trade {ticker, quantity, side} (uppercased, stripped)
//   2. 200 PortfolioResponse → store.portfolio updated (instant fill) + qty cleared
//   3. 400 (insufficient) / 404 (unknown ticker) → inline error message
//   4. invalid ticker / quantity <= 0 blocked client-side WITHOUT any fetch
//   5. selectedTicker from the store pre-fills the ticker input
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TradeBar } from '../components/trade/TradeBar';
import type { PortfolioResponse } from '../lib/types';
import { useStore } from '../store/useStore';

const PORTFOLIO: PortfolioResponse = {
  cash_balance: 9000,
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
  total_value: 10000,
  unrealized_pnl: 100,
};

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
    watchlist: [],
    chatMessages: [],
    chatLoading: false,
  });

const fillAndSubmit = (ticker: string, quantity: string, side: 'Buy' | 'Sell') => {
  render(<TradeBar />);
  fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: ticker } });
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: quantity } });
  fireEvent.click(screen.getByRole('button', { name: side }));
};

beforeEach(() => {
  resetStore();
  vi.mocked(fetch).mockReset();
});

describe('TradeBar', () => {
  it('Test 1: posts {ticker, quantity, side} to /api/portfolio/trade (uppercased, stripped)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, PORTFOLIO));
    fillAndSubmit('  aapl  ', '5', 'Buy');

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/portfolio/trade'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ ticker: 'AAPL', quantity: 5, side: 'buy' }),
        }),
      );
    });
  });

  it('Test 2: a 200 PortfolioResponse updates store.portfolio and clears the quantity input', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, PORTFOLIO));
    fillAndSubmit('AAPL', '5', 'Buy');

    await waitFor(() => expect(useStore.getState().portfolio).toEqual(PORTFOLIO));
    // type="number" inputs report empty as null to toHaveValue — assert the raw value
    await waitFor(() => {
      expect((screen.getByLabelText('Quantity') as HTMLInputElement).value).toBe('');
    });
  });

  it('Test 3a: a 400 (insufficient) renders an inline error message', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { detail: 'Insufficient cash' }));
    fillAndSubmit('AAPL', '5', 'Buy');

    expect(await screen.findByText('Trade rejected: insufficient funds/shares')).toBeInTheDocument();
  });

  it('Test 3b: a 404 (unknown ticker) renders an inline error message', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { detail: 'Unknown ticker' }));
    fillAndSubmit('NOPE', '5', 'Buy');

    expect(await screen.findByText('Unknown ticker')).toBeInTheDocument();
  });

  it('Test 4a: quantity <= 0 is blocked client-side WITHOUT any fetch call', () => {
    fillAndSubmit('AAPL', '0', 'Buy');

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(screen.getByText('Quantity must be positive')).toBeInTheDocument();
  });

  it('Test 4b: an invalid ticker (over 12 chars / non-matching pattern) is blocked WITHOUT any fetch', () => {
    fillAndSubmit('TOOLONGTICKER12', '5', 'Buy');

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(screen.getByText('Invalid ticker')).toBeInTheDocument();
  });

  it('Test 5: the selected ticker from the store pre-fills the ticker input', () => {
    useStore.setState({ selectedTicker: 'AAPL' });
    render(<TradeBar />);

    expect(screen.getByLabelText('Ticker')).toHaveValue('AAPL');
  });
});
