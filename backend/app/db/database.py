"""SQLite schema, seed data, and connection management for FinAlly."""

from __future__ import annotations

import os
import sqlite3
import uuid
from datetime import datetime, timezone

from app.market.seed_prices import SEED_PRICES

# Default location of the SQLite database file (relative to the working directory).
DEFAULT_DB_PATH: str = "db/finally.db"

# Full six-table schema. All user-scoped tables carry user_id TEXT DEFAULT 'default'
# so a future multi-user migration requires no schema changes.
SCHEMA_SQL: str = """
CREATE TABLE IF NOT EXISTS users_profile (
    id TEXT PRIMARY KEY,
    cash_balance REAL DEFAULT 10000.0,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS watchlist (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default',
    ticker TEXT,
    added_at TEXT,
    UNIQUE(user_id, ticker)
);

CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default',
    ticker TEXT,
    quantity REAL,
    avg_cost REAL,
    updated_at TEXT,
    UNIQUE(user_id, ticker)
);

CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default',
    ticker TEXT,
    side TEXT,
    quantity REAL,
    price REAL,
    executed_at TEXT
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default',
    total_value REAL,
    recorded_at TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default',
    role TEXT,
    content TEXT,
    actions TEXT,
    created_at TEXT
);
"""


def init_db(path: str = DEFAULT_DB_PATH) -> None:
    """Create the schema on the given SQLite file and seed it when fresh.

    Seeding happens only when the default profile row is absent, so an existing
    or partially-initialized database is never double-seeded.
    """
    parent = os.path.dirname(os.path.abspath(path))
    os.makedirs(parent, exist_ok=True)

    conn = sqlite3.connect(path)
    try:
        conn.executescript(SCHEMA_SQL)
        conn.commit()

        profile = conn.execute("SELECT id FROM users_profile WHERE id = ?", ("default",)).fetchone()
        if profile is None:
            _seed_defaults(conn)
        conn.commit()
    finally:
        conn.close()


def _seed_defaults(conn: sqlite3.Connection) -> None:
    """Insert the default $10k profile and the ten default watchlist tickers."""
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?)",
        ("default", 10000.0, now),
    )
    # Tickers come from SEED_PRICES keys so the DB seed stays in lockstep with
    # the market data source's default ticker list.
    for ticker in SEED_PRICES:
        conn.execute(
            "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), "default", ticker, now),
        )


def get_connection(path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    """Open a SQLite connection configured for the application layer.

    row_factory makes rows accessible by column name; check_same_thread=False
    allows the connection to be shared across FastAPI worker threads.
    """
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn
