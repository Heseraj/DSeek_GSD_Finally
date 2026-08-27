// P&L line chart — Recharts LineChart over GET /api/portfolio/history snapshots
// with a 30s re-poll matching the server snapshot cadence (A5, 03-RESEARCH.md:441;
// snapshots.py:46-48). Leaf component: local state only, never touches page.tsx
// (wired in 03-06). Loading state while the first fetch is in flight; empty
// state when the server has no snapshots yet; errors keep the last data and the
// next poll retries (transient failures self-heal).
'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../../lib/api';
import type { HistoryResponse } from '../../lib/types';

export const POLL_INTERVAL_MS = 30_000;

/** HH:MM in UTC — deterministic across machines and timezones (backend emits ISO timestamps). */
function fmtHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PnlChart() {
  const [snapshots, setSnapshots] = useState<HistoryResponse['snapshots'] | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await apiFetch<HistoryResponse>('/api/portfolio/history');
        if (active) setSnapshots(data.snapshots);
      } catch {
        // keep last data — the next poll (30s) retries
      }
    };
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (snapshots === null) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500">
        No history yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={192}>
      <LineChart data={snapshots} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="#1a1a2e" />
        <XAxis
          dataKey="recorded_at"
          tickFormatter={fmtHHMM}
          stroke="#8b949e"
          fontSize={10}
          tickLine={false}
        />
        <YAxis domain={['auto', 'auto']} stroke="#8b949e" fontSize={10} width={56} tickLine={false} />
        <Line type="monotone" dataKey="total_value" stroke="#209dd7" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
