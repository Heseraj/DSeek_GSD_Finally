// SSE consumer hook — Pattern 1 (03-RESEARCH.md:196-198, 338-355; verbatim shape).
// One EventSource opens GET /api/stream/prices inside useEffect only (never the
// component body — StrictMode double-open guard); onmessage parses backend-shaped
// {TICKER: PriceUpdate} frames defensively and merges them into the store.
// Uses useStore.getState() — the hook must NOT subscribe to the store (Pitfall 6).
'use client';

import { useEffect } from 'react';
import { apiUrl } from '../lib/api';
import type { PriceUpdate } from '../lib/types';
import { useStore } from '../store/useStore';

export function usePriceStream() {
  useEffect(() => {
    const es = new EventSource(apiUrl('/api/stream/prices')); // retry: 1000 honored
    es.onopen = () => useStore.getState().setConnection('connected');
    es.onerror = () => useStore.getState().setConnection('reconnecting'); // do NOT close() — auto-reconnect
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as Record<string, PriceUpdate>;
        useStore.getState().applyPrices(data); // functional set; caps histories; type-guard per entry (T-03-02)
      } catch {
        /* skip malformed frame silently — never crash the handler (T-03-02) */
      }
    };
    return () => es.close(); // unmount only — readyState CLOSED(2)
  }, []);
}
