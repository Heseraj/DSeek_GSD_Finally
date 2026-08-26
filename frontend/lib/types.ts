// Backend contract types — verbatim transcription of backend Pydantic/to_dict()
// shapes. Source: .planning/phases/03-frontend-trading-terminal/03-RESEARCH.md:303-336
// (quoted from backend/app/market/models.py, portfolio/schemas.py,
// portfolio/service.py, watchlist/service.py, chat/schemas.py).

// Source: backend/app/market/models.py:39-48 (PriceUpdate.to_dict), quoted verbatim
// { "ticker": ..., "price": ..., "previous_price": ..., "timestamp": ...,
//   "change": ..., "change_percent": ..., "direction": "up"|"down"|"flat" }
export interface PriceUpdate {
  ticker: string;
  price: number;
  previous_price: number;
  timestamp: number;
  change: number;
  change_percent: number;
  direction: 'up' | 'down' | 'flat';
}

// Source: backend/app/portfolio/schemas.py:24-42 (PositionResponse/PortfolioResponse)
export interface Position {
  ticker: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
}

export interface PortfolioResponse {
  cash_balance: number;
  positions: Position[];
  total_value: number;
  unrealized_pnl: number;
}

// Source: backend/app/portfolio/service.py:190-195 (get_history)
export interface HistoryResponse {
  snapshots: { recorded_at: string; total_value: number }[];
}

// Source: backend/app/watchlist/service.py:25-31 — tickers carry PriceUpdate OR just {ticker}
export interface WatchlistResponse {
  tickers: (PriceUpdate | { ticker: string })[];
}

// Source: backend/app/chat/schemas.py:37-70 (TradeActionResult/WatchlistChangeResult/ChatResponse)
export interface TradeActionResult {
  ticker: string;
  side: 'buy' | 'sell';
  quantity: number;
  status: 'executed' | 'failed';
  error?: string | null;
}

export interface WatchlistChangeResult {
  ticker: string;
  action: 'add' | 'remove';
  status: 'executed' | 'failed';
  error?: string | null;
}

export interface ChatResponse {
  message: string;
  trades: TradeActionResult[];
  watchlist_changes: WatchlistChangeResult[];
  error?: string | null;
}
