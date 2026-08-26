# External Integrations

**Analysis Date:** 2026-08-25

## APIs & External Services

**Market Data:**
- Massive (formerly Polygon.io) — real market data via REST snapshot polling
  - SDK/Client: `massive` 2.2.0 (`from massive import RESTClient` in `backend/app/market/massive_client.py`)
  - Auth: `MASSIVE_API_KEY` (optional; passed as `RESTClient(api_key=...)`)
  - Endpoint used: `get_snapshot_all(market_type=SnapshotMarketType.STOCKS, tickers=[...])` → `GET /v2/snapshot/locale/us/markets/stocks/tickers`
  - Base URL: `https://api.massive.com` (legacy `https://api.polygon.io`), documented in `planning/archive/MASSIVE_API.md`
  - Rate limits: free tier 5 req/min (poller defaults to 15s interval); paid tiers poll 2-5s (`backend/app/market/massive_client.py:23-26`)

**AI/LLM (planned — NOT yet implemented in code):**
- LiteLLM → OpenRouter → Cerebras inference — planned for the AI chat assistant (`README.md`, `planning/PLAN.md` §9)
  - Model: `openrouter/openai/gpt-oss-120b` with Cerebras as provider (per `planning/PLAN.md:284`)
  - Auth: `OPENROUTER_API_KEY` (referenced in `README.md` and `planning/PLAN.md`; **not read by any backend code today**)
  - No `litellm` dependency in `backend/pyproject.toml` — this integration does not exist in code yet

## Data Storage

**Databases:**
- SQLite (planned — **not yet implemented**)
  - Target file: `db/finally.db`, volume-mounted for persistence (`README.md`, `planning/PLAN.md` §7)
  - No ORM/client currently present; no `backend/db/` module, no schema code exists yet

**File Storage:**
- Local filesystem only (SQLite file). No object storage / S3.

**Caching:**
- In-memory `PriceCache` (`backend/app/market/cache.py`) — thread-safe dict keyed by ticker, guarded by `threading.Lock`, with a monotonic `version` counter for SSE change detection. Not an external service.

## Authentication & Identity

**Auth Provider:**
- None. Single-user app, no login/signup (`planning/PLAN.md` §2: "No login, no signup"). All `user_id` values default to `"default"` per the planned schema.

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/exception service).

**Logs:**
- Python stdlib `logging` (`logging.getLogger(__name__)`) throughout `backend/app/market/*.py`. No structured logging, no external log sink.

## CI/CD & Deployment

**Hosting:**
- Planned: single Docker container on port 8000 (`README.md`). No `Dockerfile`, `docker-compose.yml`, `scripts/`, or `deploy/` present in the repo yet.

**CI Pipeline:**
- GitHub Actions — two workflows present in `.github/workflows/`:
  - `claude-code-review.yml` — runs `anthropics/claude-code-action@v1` with the `code-review` plugin on PRs
  - `claude.yml` — triggers Claude Code via `anthropics/claude-code-action@v1` on `@claude` mentions/issues
  - These are AI code-review workflows, **not** build/test/lint pipelines. No CI runs pytest/ruff today.

## Environment Configuration

**Required env vars:**
- `OPENROUTER_API_KEY` (planned — required for AI chat; documented in `README.md`/`planning/PLAN.md`, not yet consumed by code)

**Optional env vars:**
- `MASSIVE_API_KEY` — the only env var actually read in code (`backend/app/market/factory.py:24`). Set & non-empty → `MassiveDataSource` (real data); absent/empty → `SimulatorDataSource` (GBM sim).
- `LLM_MOCK` (planned — set `true` for deterministic mock LLM responses; documented but not implemented)

**Secrets location:**
- `.env` file at project root (gitignored). No `.env` or `.env.example` file currently present in the repo. No `*.secret*`, `credentials.*`, or `serviceAccountKey.json` files detected.
- GitHub secret `CLAUDE_CODE_OAUTH_TOKEN` referenced in `.github/workflows/*.yml` (stored in GitHub Actions secrets, not in repo).

## Webhooks & Callbacks

**Incoming:**
- None.

**Outgoing (SSE — server→client push):**
- `GET /api/stream/prices` — Server-Sent Events stream (`backend/app/market/stream.py`). Media type `text/event-stream`; pushes all ticker prices ~every 500ms; includes `retry: 1000` directive for auto-reconnect.

---

*Integration audit: 2026-08-25*
