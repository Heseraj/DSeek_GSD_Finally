# Context Notes

## Market Data Backend
- source: planning/MARKET_DATA_SUMMARY.md

Status: Complete, tested, reviewed, all issues resolved.

A complete market data subsystem in backend/app/market/ (8 modules, ~500 lines) providing live price simulation and real market data via a unified interface.

Architecture:
MarketDataSource (ABC)
├── SimulatorDataSource → GBM simulator (default, no API key needed)
└── MassiveDataSource → Polygon.io REST poller (when MASSIVE_API_KEY set)
        │
        ▼
   PriceCache (thread-safe, in-memory)
        │
        ├──→ SSE stream endpoint (/api/stream/prices)
        ├──→ Portfolio valuation
        └──→ Trade execution

Modules:
- models.py: PriceUpdate immutable frozen dataclass (ticker, price, previous_price, timestamp, change, direction)
- interface.py: MarketDataSource abstract base class (start/stop/add_ticker/remove_ticker/get_tickers)
- cache.py: PriceCache thread-safe price store with version counter for SSE change detection
- seed_prices.py: realistic seed prices, per-ticker GBM params (drift/volatility), correlation groups
- simulator.py: GBMSimulator (Geometric Brownian Motion with Cholesky-correlated moves) + SimulatorDataSource
- massive_client.py: MassiveDataSource REST polling client for Polygon.io via the massive package
- factory.py: create_market_data_source() selects simulator or Massive based on MASSIVE_API_KEY env var
- stream.py: create_stream_router() FastAPI SSE endpoint factory using version-based change detection

Key design decisions:
- Strategy pattern — both data sources implement the same ABC; downstream code is source-agnostic
- PriceCache as single point of truth — producers write, consumers read; no direct coupling
- GBM with correlated moves — Cholesky decomposition of sector-based correlation matrix (tech 0.6, finance 0.5, cross-sector 0.3)
- Random shock events — ~0.1% chance per tick per ticker of a 2-5% move
- SSE over WebSockets — simpler, one-way push, universal browser support

Test suite: 73 tests passing, 6 test modules in backend/tests/market/, overall coverage 84%.

Code review: 7 issues identified, all resolved (pyproject build config, lazy imports, SSE return type, public get_tickers(), correlation constants cleanup, unused test imports, Massive test mocks).

Demo: backend/market_data_demo.py (Rich terminal dashboard — 10 tickers, sparklines, color-coded direction arrows, event log; runs 60s or until Ctrl+C).

Downstream usage: from app.market import PriceCache, create_market_data_source — cache = PriceCache(); source = create_market_data_source(cache); await source.start([...]); cache.get()/get_price()/get_all(); source.add_ticker()/remove_ticker()/stop().
