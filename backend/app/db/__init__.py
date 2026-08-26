"""Persistence layer for FinAlly: SQLite schema, seed data, and connections."""

from __future__ import annotations

from .database import get_connection, init_db

__all__ = ["get_connection", "init_db"]
