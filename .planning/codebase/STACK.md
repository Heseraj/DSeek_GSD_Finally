# Technology Stack

**Analysis Date:** 2026-08-25

## Languages

**Primary:**
- Python >=3.12 - Entire backend; `backend/` is the only code present in the repo today

**Planned (not yet built):**
- TypeScript - Frontend (Next.js static export), per `README.md` and `planning/PLAN.md`

## Runtime

**Environment:**
- Python 3.12+ (`requires-python = ">=3.12"` in `backend/pyproject.toml`)
- Async-first: `asyncio` is the concurrency model (`asyncio.create_task`, `asyncio.to_thread`, `StreamingResponse` in `backend/app/market/*.py`)

**Package Manager:**
- `uv` (project-managed; `uv.lock` present at `backend/uv.lock`)
- Lockfile: present (`backend/uv.lock`, lockfile `version = 1`, `revision = 3`)
- Build backend: `hatchling` (`[build-system]` in `backend/pyproject.toml`)

## Frameworks

**Core:**
- FastAPI 0.128.7 (declared `>=0.115.0`) - Web framework; ASGI app, `APIRouter`, `StreamingResponse`
- Uvicorn 0.40.0 (declared `>=0.32.0`, `[standard]` extra) - ASGI server

**Testing:**
- pytest 9.0.2 (`>=8.3.0`)
- pytest-asyncio 1.3.0 (`>=0.24.0`) - `asyncio_mode = "auto"`
- pytest-cov 7.0.0 (`>=5.0.0`) - coverage

**Build/Dev:**
- ruff 0.15.0 (`>=0.7.0`) - linter + formatter
- Rich 14.3.2 (`>=13.0.0`) - terminal UI (used by the demo dashboard `backend/market_data_demo.py`)

## Key Dependencies

**Critical (direct, from `backend/pyproject.toml`):**

| Package | Locked Version | Why it matters |
|---------|----------------|----------------|
| fastapi | 0.128.7 | Web framework for REST + SSE endpoints |
| uvicorn | 0.40.0 | ASGI server; `[standard]` extra pulls `uvloop`, `httptools`, `websockets`, `watchfiles`, `python-dotenv`, `pyyaml` |
| numpy | 2.4.2 | GBM simulator math + Cholesky decomposition (`backend/app/market/simulator.py`) |
| massive | 2.2.0 | Polygon.io (formerly Massive) REST client (`backend/app/market/massive_client.py`) |
| rich | 14.3.2 | Live terminal dashboard (`backend/market_data_demo.py`) |

**Infrastructure / transitive (locked in `backend/uv.lock`):**

| Package | Locked Version | Purpose |
|---------|----------------|---------|
| pydantic | 2.12.5 | FastAPI data validation (not yet used directly by market code, pulled by FastAPI) |
| pydantic-core | 2.41.5 | Pydantic Rust core |
| starlette | 0.52.1 | ASGI toolkit underlying FastAPI |
| anyio | 4.12.1 | Async I/O abstraction |
| urllib3 | 2.6.3 | HTTP client (transitive of `massive`) |
| websockets | 16.0 | WebSocket client (transitive of `massive` + uvicorn) |
| python-dotenv | 1.2.1 | `.env` loading (transitive of uvicorn `[standard]`) |
| pyyaml | 6.0.3 | YAML parsing (transitive of uvicorn `[standard]`) |
| httptools | 0.7.1 | High-performance HTTP parsing (uvicorn standard) |
| uvloop | 0.22.1 | Fast event loop (uvicorn standard; Linux only) |
| watchfiles | 1.1.1 | File-watch reload (uvicorn standard) |
| certifi | 2026.1.4 | CA bundle (transitive of `massive`) |
| typing-extensions | 4.15.0 | Backported typing (FastAPI/pydantic) |
| coverage | 7.13.4 | Coverage engine (transitive of `pytest-cov`) |

## Configuration

**Environment:**
- Env vars read directly via `os.environ` (no config framework). See `backend/app/market/factory.py:24` which reads `MASSIVE_API_KEY`.
- `.env` is gitignored (`backend/../.gitignore`); the app reads env from the process environment (Docker `--env-file` per `README.md`). `python-dotenv` is present as a transitive dep but is not explicitly called in code yet.

**Build / tool config** (all in `backend/pyproject.toml`):
- `[tool.hatch.build.targets.wheel]` → `packages = ["app"]`
- `[tool.pytest.ini_options]` → `testpaths = ["tests"]`, `python_files = ["test_*.py"]`, `asyncio_mode = "auto"`, `asyncio_default_fixture_loop_scope = "function"`
- `[tool.ruff]` → `line-length = 100`, `target-version = "py312"`
- `[tool.ruff.lint]` → `select = ["E", "F", "I", "N", "W"]`, `ignore = ["E501"]`
- `[tool.coverage.run]` → `source = ["app"]`, `omit = ["tests/*"]`
- `[tool.coverage.report]` → `exclude_lines` for `pragma: no cover`, `__repr__`, `NotImplementedError`, etc.

## Platform Requirements

**Development:**
- Python 3.12 + `uv` (see `backend/CLAUDE.md`: `uv sync --extra dev`)
- No frontend toolchain required yet (no `frontend/` directory exists)

**Production (planned, not yet built):**
- Single Docker container serving FastAPI on port 8000 (per `README.md` and `planning/PLAN.md` §11)
- Multi-stage Dockerfile (Node 20 → Python 3.12 slim) — **not yet present in repo**
- SQLite volume-mounted at `db/finally.db` — **not yet implemented**

---

*Stack analysis: 2026-08-25*
