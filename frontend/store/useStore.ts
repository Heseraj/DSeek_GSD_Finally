// Client state store — zustand 5 (03-RESEARCH.md:196-215, 03-PATTERNS.md:161-187).
// SSE frames merge via functional set(); histories are capped at 100 points (A4);
// tickSeq drives the flash key-remount animation; pruneTicker clears every slice
// on watchlist removal (Pitfall 5).
import { create } from 'zustand';
import { apiFetch } from '../lib/api';
import type { PortfolioResponse, PriceUpdate, WatchlistResponse } from '../lib/types';

export type ConnectionState = 'connected' | 'reconnecting' | 'closed';

export interface WatchlistTicker {
  ticker: string;
  price?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  trades?: TradeResultShape[];
  watchlist_changes?: WatchlistChangeShape[];
  error?: string | null;
}

// Local aliases so ChatMessage stays self-contained (mirror the backend contract).
export type TradeResultShape = import('../lib/types').TradeActionResult;
export type WatchlistChangeShape = import('../lib/types').WatchlistChangeResult;

export const HISTORY_CAP = 100;

/** Type guard — defensive second line of defense (threat T-03-02): a malformed
 *  frame entry never reaches state. Direction must be exactly one of the three
 *  backend values and price numeric. */
function isPriceUpdate(v: unknown): v is PriceUpdate {
  if (typeof v !== 'object' || v === null) return false;
  const u = v as Record<string, unknown>;
  return (
    typeof u.ticker === 'string' &&
    typeof u.price === 'number' &&
    Number.isFinite(u.price) &&
    (u.direction === 'up' || u.direction === 'down' || u.direction === 'flat')
  );
}

interface Store {
  prices: Record<string, PriceUpdate>;
  histories: Record<string, number[]>;
  tickSeq: Record<string, number>;
  connection: ConnectionState;
  selectedTicker: string | null;
  portfolio: PortfolioResponse | null;
  watchlist: WatchlistTicker[];
  chatMessages: ChatMessage[];
  chatLoading: boolean;

  applyPrices: (data: Record<string, PriceUpdate>) => void;
  setConnection: (connection: ConnectionState) => void;
  selectTicker: (ticker: string | null) => void;
  pruneTicker: (ticker: string) => void;
  refetchPortfolio: () => Promise<void>;
  refetchWatchlist: () => Promise<void>;
  appendChatMessage: (message: ChatMessage) => void;
  setChatLoading: (loading: boolean) => void;
}

export const useStore = create<Store>()((set) => ({
  prices: {},
  histories: {},
  tickSeq: {},
  connection: 'closed',
  selectedTicker: null,
  portfolio: null,
  watchlist: [],
  chatMessages: [],
  chatLoading: false,

  applyPrices: (data) =>
    set((state) => {
      const prices = { ...state.prices };
      const histories = { ...state.histories };
      const tickSeq = { ...state.tickSeq };

      for (const [ticker, update] of Object.entries(data)) {
        if (!isPriceUpdate(update)) continue; // skip malformed entries (T-03-02)

        const prevDirection = state.prices[ticker]?.direction;
        if (prevDirection !== undefined && prevDirection !== update.direction) {
          tickSeq[ticker] = (tickSeq[ticker] ?? 0) + 1;
        } else {
          tickSeq[ticker] = tickSeq[ticker] ?? 0; // first sight initializes the flash seq
        }

        const history = histories[ticker] ?? [];
        histories[ticker] = [...history, update.price].slice(-HISTORY_CAP);
        prices[ticker] = update;
      }

      return { prices, histories, tickSeq };
    }),

  setConnection: (connection) => set({ connection }),

  selectTicker: (selectedTicker) => set({ selectedTicker }),

  pruneTicker: (ticker) =>
    set((state) => {
      const prices = { ...state.prices };
      const histories = { ...state.histories };
      const tickSeq = { ...state.tickSeq };
      delete prices[ticker];
      delete histories[ticker];
      delete tickSeq[ticker];
      return { prices, histories, tickSeq };
    }),

  refetchPortfolio: async () => {
    const portfolio = await apiFetch<PortfolioResponse>('/api/portfolio');
    set({ portfolio });
  },

  refetchWatchlist: async () => {
    const resp = await apiFetch<WatchlistResponse>('/api/watchlist');
    const watchlist: WatchlistTicker[] = resp.tickers.map((t) =>
      'price' in t ? { ticker: t.ticker, price: t.price } : { ticker: t.ticker },
    );
    set({ watchlist });
  },

  appendChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),

  setChatLoading: (chatLoading) => set({ chatLoading }),
}));

/** Derived selector: live total value = cash + Σ(quantity × live price), with
 *  SSE price superseding the position's current_price when present (UI-07). */
export function selectLiveTotal(state: Store): number {
  if (!state.portfolio) return 0;
  const { cash_balance, positions } = state.portfolio;
  const positionsValue = positions.reduce((sum, pos) => {
    const livePrice = state.prices[pos.ticker]?.price ?? pos.current_price;
    return sum + pos.quantity * livePrice;
  }, 0);
  return cash_balance + positionsValue;
}

export default useStore;
