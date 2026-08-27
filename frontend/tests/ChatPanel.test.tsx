// Component tests for ChatPanel (03-05 Task 2) — loading state, inline
// confirmations, the locked 503-with-ChatResponse contract, and text-only
// rendering. Tests 1-5 from 03-05-PLAN.md <behavior>:
//   1. send sets chatLoading (input disabled / spinner); 200 renders message +
//      executed trade/watchlist chips; store refetches portfolio + watchlist
//   2. 503 with a valid ChatResponse body renders the error inline, no
//      special-casing, no crash
//   3. per-action failed chip (status 'failed' + error) renders its error text
//   4. HTML-tag-shaped message renders as text: literal in the DOM, zero
//      elements parsed from it (XSS, T-03-01)
//   5. network failure (non-503 non-2xx) renders an inline error banner
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatPanel } from '../components/chat/ChatPanel';
import type { ChatResponse, PortfolioResponse, WatchlistResponse } from '../lib/types';
import { useStore } from '../store/useStore';

const PORTFOLIO: PortfolioResponse = {
  cash_balance: 5000,
  positions: [],
  total_value: 5000,
  unrealized_pnl: 0,
};

const WATCHLIST: WatchlistResponse = { tickers: [] };

const jsonResponse = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const chatResponse = (body: ChatResponse): Response =>
  jsonResponse(body.error ? 503 : 200, body);

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

/** Route chat POSTs to chatHandler; portfolio/watchlist GETs to canned 200s. */
const routeFetch = (chatHandler: (init?: RequestInit) => Promise<Response>) => {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/chat')) return chatHandler(init);
    if (url.includes('/api/portfolio')) return Promise.resolve(jsonResponse(200, PORTFOLIO));
    if (url.includes('/api/watchlist')) return Promise.resolve(jsonResponse(200, WATCHLIST));
    return Promise.resolve(jsonResponse(200, {}));
  });
};

const send = (message: string) => {
  render(<ChatPanel />);
  fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: message } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
};

beforeEach(() => {
  resetStore();
  vi.mocked(fetch).mockReset();
});

describe('ChatPanel', () => {
  it('Test 1: sets chatLoading while pending; on 200 renders message/chips and refetches portfolio+watchlist', async () => {
    let resolveChat!: (v: Response) => void;
    routeFetch(() => new Promise((resolve) => (resolveChat = resolve)));

    send('buy 10 AAPL');

    // loading state: input disabled + spinner visible
    expect(useStore.getState().chatLoading).toBe(true);
    expect(screen.getByLabelText('Chat message')).toBeDisabled();
    expect(screen.getByLabelText('loading')).toBeInTheDocument();

    await act(async () => {
      resolveChat(
        chatResponse({
          message: 'done',
          trades: [{ ticker: 'AAPL', side: 'buy', quantity: 10, status: 'executed', error: null }],
          watchlist_changes: [{ ticker: 'IBM', action: 'add', status: 'executed', error: null }],
          error: null,
        }),
      );
    });

    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.getByText('AAPL buy 10 — executed')).toBeInTheDocument();
    expect(screen.getByText('IBM add — executed')).toBeInTheDocument();
    expect(useStore.getState().chatLoading).toBe(false);
    expect(screen.getByLabelText('Chat message')).not.toBeDisabled();

    // the AI may have traded/edited — portfolio + watchlist are refetched
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('/api/portfolio'), expect.anything()),
    );
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('/api/watchlist'), expect.anything()),
    );
  });

  it('Test 2: a 503 with a valid ChatResponse body renders the error inline without special-casing', async () => {
    routeFetch(() =>
      Promise.resolve(
        chatResponse({
          message: 'could not complete',
          trades: [],
          watchlist_changes: [],
          error: 'LLM backend unavailable',
        }),
      ),
    );
    send('hello');

    expect(await screen.findByText('LLM backend unavailable')).toBeInTheDocument();
    expect(screen.getByText('could not complete')).toBeInTheDocument();
    // no crash, no generic network banner for the 503 contract
    expect(screen.queryByText('Chat request failed')).not.toBeInTheDocument();
  });

  it('Test 3: a per-action failed chip renders with its error text', async () => {
    routeFetch(() =>
      Promise.resolve(
        chatResponse({
          message: 'trade failed',
          trades: [{ ticker: 'AAPL', side: 'buy', quantity: 10, status: 'failed', error: 'insufficient funds' }],
          watchlist_changes: [],
          error: null,
        }),
      ),
    );
    send('buy 10 AAPL');

    expect(await screen.findByText('AAPL buy 10 — failed: insufficient funds')).toBeInTheDocument();
  });

  it('Test 4: HTML-tag-shaped message content renders as text with zero parsed elements (XSS)', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    routeFetch(() => Promise.resolve(chatResponse({ message: payload, trades: [], watchlist_changes: [], error: null })));
    const { container } = render(<ChatPanel />);
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'tell me about xss' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(payload)).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelectorAll('script')).toHaveLength(0);
    expect(container.querySelectorAll('[onerror]')).toHaveLength(0);
    expect(container.textContent).toContain(payload);
  });

  it('Test 5: a network failure (non-503 non-2xx) renders an inline error banner', async () => {
    routeFetch(() => Promise.resolve(jsonResponse(500, { detail: 'boom' })));
    send('hello');

    expect(await screen.findByText('Chat request failed')).toBeInTheDocument();
    expect(useStore.getState().chatLoading).toBe(false);
  });
});
