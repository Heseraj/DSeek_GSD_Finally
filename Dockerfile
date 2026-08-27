# FinAlly single-container deployment (3 stages)
# Source: uv Docker guide + FastAPI container guide (04-RESEARCH.md:255-284)

# Stage 1 - frontend build (node:22 LTS; assumption A1, user-confirmed)
FROM node:22-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2 - backend deps (uv + python 3.12, two-phase sync)
FROM ghcr.io/astral-sh/uv:0.12.6-python3.12-trixie-slim AS backend-deps
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-install-project --no-editable
COPY backend/ .
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-editable

# Stage 3 - runtime: venv + static export only; no uv, no source, no node
FROM ghcr.io/astral-sh/uv:0.12.6-python3.12-trixie-slim
WORKDIR /app
COPY --from=backend-deps /app/.venv /app/.venv
COPY --from=frontend-build /build/out /app/static
ENV PATH="/app/.venv/bin:$PATH"
RUN useradd --create-home --uid 1000 app && mkdir -p /app/db && chown -R app:app /app/db
USER app
EXPOSE 8000
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
