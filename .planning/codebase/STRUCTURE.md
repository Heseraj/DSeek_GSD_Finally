# Codebase Structure

**Analysis Date:** 2026-08-25

## Directory Layout

```
finally/                          # FinAlly — AI Trading Workstation (repo root)
├── .github/
│   └── workflows/                # Claude Code CI automation
│       ├── claude.yml            # @claude issue/PR comment dispatch
│       └── claude-code-review.yml# Automated code review on PRs
├── .opencode/                    # GSD tooling (agent skills, commands, core workflows)
├── .planning/                    # GSD planning state (this codebase map lives here)
│   └── codebase/                 # Codebase map docs (ARCHITECTURE.md, STRUCTURE.md, …)
├── backend/                      # FastAPI uv project (Python) — the only app code
│   ├── app/
│   │   ├── __init__.py           # Package marker / docstring
│   │   └── market/               # Market data subsystem (complete)
│   ├── tests/                    # pytest suite (mirrors app/ layout)
│   │   ├── conftest.py
│   │   └── market/
│   ├── market_data_demo.py       # Rich terminal dashboard demo
│   ├── pyproject.toml            # uv project manifest + tool config
│   ├── uv.lock                   # Lockfile (committed)
│   ├── CLAUDE.md                 # Backend developer guide
│   └── README.md
├── planning/                     # Project-wide agent documentation (shared contract)
│   ├── PLAN.md                   # Master spec / architecture contract
│   ├── MARKET_DATA_SUMMARY.md    # Market subsystem completion summary
│   └── archive/                  # Design docs for the market data subsystem
│       ├── MARKET_DATA_DESIGN.md
│       ├── MARKET_INTERFACE.md
│       ├── MARKET_SIMULATOR.md
│       ├── MASSIVE_API.md
│       └── MARKET_DATA_REVIEW.md
├── .gitignore                    # Python/uv/editor ignores
├── LICENSE
└── README.md                     # Project overview + quick start
```

### Planned but NOT yet present

Per `planning/PLAN.md` §4, the following are part of the intended layout but have **no files on disk yet**:

```
finally/
├── frontend/                     # Next.js TypeScript static export (not built)
├── backend/db/                   # Schema SQL + seed logic (not built)
├── scripts/                      # start/stop Docker wrappers (not built)
├── test/                         # Playwright E2E + docker-compose.test.yml (not built)
├── db/                           # SQLite volume mount target (runtime, not created)
├── Dockerfile                    # Multi-stage Node → Python build (not built)
├── docker-compose.yml            # Optional convenience wrapper (not built)
└── .env / .env.example           # Env vars (not present; .env is gitignored)
```

## Directory Purposes

**`backend/`:**
- Purpose: Self-contained FastAPI uv project owning all server logic (market data now; portfolio, watchlist, chat, DB later).
- Contains: Python package `app/`, pytest suite `tests/`, demo script, `pyproject.toml`, `uv.lock`.
- Key files: `backend/pyproject.toml`, `backend/CLAUDE.md`, `backend/market_data_demo.py`.

**`backend/app/`:**
- Purpose: Application source package (hatch build target `packages = ["app"]`).
- Contains: `__init__.py` (docstring only) and the `market/` package.
- Key files: `backend/app/__init__.py`.

**`backend/app/market/`:**
- Purpose: The complete market data subsystem — price models, thread-safe cache, provider interface, simulator, API client, factory, SSE stream, seed data.
- Contains: 8 Python modules (listed below).
- Key files: `backend/app/market/__init__.py` (public API re-exports), `backend/app/market/factory.py`, `backend/app/market/stream.py`.

**`backend/tests/`:**
- Purpose: pytest suite mirroring the `app/` package structure.
- Contains: `conftest.py` (event loop policy fixture) and `market/` with 6 test modules.
- Key files: `backend/tests/conftest.py`.

**`planning/`:**
- Purpose: Shared agent contract. All docs here describe WHAT and HOW the system should be built; `PLAN.md` is the authoritative spec.
- Contains: `PLAN.md`, `MARKET_DATA_SUMMARY.md`, `archive/`.
- Key files: `planning/PLAN.md`.

**`planning/archive/`:**
- Purpose: Design and review docs for the (now-complete) market data subsystem.
- Contains: `MARKET_DATA_DESIGN.md`, `MARKET_INTERFACE.md`, `MARKET_SIMULATOR.md`, `MASSIVE_API.md`, `MARKET_DATA_REVIEW.md`.
- Key files: `planning/archive/MARKET_DATA_DESIGN.md`.

**`.opencode/`:**
- Purpose: GSD development workflow tooling — agent skills, commands, core workflows, hooks, plugins. Not application code.
- Contains: `skills/`, `gsd-core/`, `commands/`, `agents/`, `hooks/`, `plugins/`, `scripts/`.
- Key files: `.opencode/skills/gsd-map-codebase/SKILL.md` (the command that produced this map).

**`.planning/`:**
- Purpose: GSD planning state directory (phase plans, roadmaps, and this `codebase/` map).
- Contains: `codebase/` (currently the only subdirectory).
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**`.github/workflows/`:**
- Purpose: Claude Code CI automation triggered on issues/PRs.
- Contains: `claude.yml`, `claude-code-review.yml`.
- Key files: `.github/workflows/claude-code-review.yml`.

## Key File Locations

**Entry Points:**
- `backend/market_data_demo.py`: Executable terminal demo (`if __name__ == "__main__": asyncio.run(run())` at line 271).
- FastAPI app entry (`main.py` / `app/main.py`): **not yet created** — planned per `planning/PLAN.md` §3.
- Test entry: `backend/pyproject.toml` (`testpaths = ["tests"]`).

**Configuration:**
- `backend/pyproject.toml`: dependencies, `[project.optional-dependencies] dev`, hatch build config, pytest/ruff/coverage settings.
- `backend/uv.lock`: committed lockfile for reproducible installs.
- `.gitignore`: Python/uv/editor/coverage ignores; `.env`, `.venv`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/` all ignored.

**Core Logic (market data):**
- `backend/app/market/models.py`: `PriceUpdate` dataclass.
- `backend/app/market/cache.py`: `PriceCache`.
- `backend/app/market/interface.py`: `MarketDataSource` ABC.
- `backend/app/market/simulator.py`: `GBMSimulator` + `SimulatorDataSource`.
- `backend/app/market/massive_client.py`: `MassiveDataSource`.
- `backend/app/market/factory.py`: `create_market_data_source`.
- `backend/app/market/stream.py`: `create_stream_router` (SSE).
- `backend/app/market/seed_prices.py`: seed prices + GBM params + correlation constants.
- `backend/app/market/__init__.py`: public API surface (`__all__`).

**Testing:**
- `backend/tests/conftest.py`: shared fixtures (event loop policy).
- `backend/tests/market/test_models.py`, `test_cache.py`, `test_simulator.py`, `test_simulator_source.py`, `test_factory.py`, `test_massive.py`.

**Documentation:**
- `README.md` (root): overview, quick start, env vars, structure.
- `backend/README.md`: backend structure + run/test/lint commands.
- `backend/CLAUDE.md`: developer guide — public market API, core types, SSE, seed data.
- `planning/PLAN.md`: full project spec (the source of truth for intended architecture).

## Naming Conventions

**Files:**
- Python modules: `snake_case.py` (e.g., `massive_client.py`, `seed_prices.py`, `market_data_demo.py`).
- Test modules: `test_<module>.py` (e.g., `test_cache.py`, `test_factory.py`), with `test_simulator_source.py` used for the integration tests of `SimulatorDataSource`.
- Markdown docs: `UPPER_SNAKE_CASE.md` (e.g., `PLAN.md`, `MARKET_DATA_SUMMARY.md`, `CLAUDE.md`).

**Directories:**
- Package/module dirs: lowercase (e.g., `backend/app/market/`, `backend/tests/market/`).
- Doc dirs: lowercase (`planning/`, `planning/archive/`).

**Classes:** `PascalCase` — `PriceUpdate`, `PriceCache`, `MarketDataSource`, `GBMSimulator`, `SimulatorDataSource`, `MassiveDataSource`, `TestFactory`.

**Functions/methods:** `snake_case` — `create_market_data_source`, `create_stream_router`, `add_ticker`, `remove_ticker`, `get_all`, `to_dict`, `_run_loop`, `_poll_once`.

**Constants:** `UPPER_SNAKE_CASE` — `SEED_PRICES`, `TICKER_PARAMS`, `DEFAULT_PARAMS`, `CORRELATION_GROUPS`, `INTRA_TECH_CORR`, `CROSS_GROUP_CORR`, `TSLA_CORR`, `DEFAULT_DT`.

**Private members:** Leading underscore — `_prices`, `_lock`, `_version`, `_task`, `_sim`, `_cholesky`, `_add_ticker_internal`, `_rebuild_cholesky`.

**Type hints:** Full `from __future__ import annotations` style; PEP 604 unions (`float | None`, `dict[str, PriceUpdate]`); `slots=True` on dataclasses.

## Where to Add New Code

**New market-data provider:**
- Implement `MarketDataSource` (`backend/app/market/interface.py`) in a new `backend/app/market/<name>.py`, mirror `simulator.py`/`massive_client.py`. Add selection logic to `create_market_data_source` in `backend/app/market/factory.py`. Re-export from `backend/app/market/__init__.py` if it should be public. Add tests at `backend/tests/market/test_<name>.py`.

**New backend subsystem (portfolio, watchlist, chat, db):**
- Create a sibling package under `backend/app/` (e.g., `backend/app/portfolio/`, `backend/app/db/`), following the `market/` pattern (module-per-concern + `__init__.py` public surface + mirrored `backend/tests/<subsystem>/`). Per `planning/PLAN.md` §4, `backend/db/` (top-level) is the intended home for schema/seed SQL.
- Wire it into the FastAPI app entry point (`backend/main.py` or `backend/app/main.py`) once created.

**New utility/helper:**
- Shared helpers belong in their subsystem package, not a generic `utils/` (none exists). The market subsystem keeps its helpers co-located (e.g., `seed_prices.py`).

**New tests:**
- Unit/integration tests go in `backend/tests/<subsystem>/`, one file per source module using the `test_*.py` naming convention. Add async tests using `pytest.mark.asyncio` classes (asyncio_mode is `"auto"` per `backend/pyproject.toml`).

**New documentation for agents:**
- Project-wide agent docs go in `planning/` (live contracts) or `planning/archive/` (completed design/review docs).

## Special Directories

**`.opencode/`:**
- Purpose: GSD development tooling (skills, commands, workflows). 
- Generated: No (vendor tooling, committed).
- Committed: Yes.

**`.planning/`:**
- Purpose: GSD planning state and this codebase map.
- Generated: Yes (by GSD commands).
- Committed: Yes (tracked; it is the shared agent state).

**`.github/`:**
- Purpose: CI/CD workflow definitions.
- Generated: No.
- Committed: Yes.

**`planning/archive/`:**
- Purpose: Completed design/review docs for finished work.
- Generated: No (authored docs).
- Committed: Yes.

**`backend/app/market/`:**
- Purpose: The implemented application code (market data).
- Generated: No.
- Committed: Yes.

**`db/` (root) / `backend/db/`:**
- Purpose: SQLite runtime volume mount target (root `db/`) and schema/seed SQL (backend `db/`). Both **planned, not yet created**.
- Generated: Root `db/` is created at runtime by the backend; `finally.db` is gitignored.
- Committed: `finally.db` is gitignored; only a `.gitkeep` is planned.

---

*Structure analysis: 2026-08-25*
