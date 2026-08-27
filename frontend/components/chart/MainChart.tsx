// Main chart (03-03 Task 1) — the selected ticker's live Area series.
// Subscribes per-slice ONLY (Pitfall 6): selectedTicker, its history array,
// and its latest PriceUpdate (the timestamp source). Re-seeds the series with
// setData on ticker switch (index-based time — stable for a full re-seed),
// then streams appended points via series.update({ time: Math.floor(ts), value })
// — never setData per tick (03-RESEARCH.md:248, Pitfall 3). A per-ticker
// last-time ref guards against non-monotonic update() (v5 throws — T-03-07).
'use client';

import { useEffect, useRef } from 'react';
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useStore } from '../../store/useStore';
import { useLightweightChart } from './useLightweightChart';

export function MainChart() {
  const selectedTicker = useStore((s) => s.selectedTicker);
  const history = useStore((s) => (s.selectedTicker ? s.histories[s.selectedTicker] : undefined));
  const lastUpdate = useStore((s) => (s.selectedTicker ? s.prices[s.selectedTicker] : undefined));

  const containerRef = useRef<HTMLDivElement>(null);
  const { chartRef, seriesRef } = useLightweightChart(containerRef, { height: 384 }); // h-96

  // Seed identity — re-seed when the ticker changes OR a StrictMode remount
  // swaps the series underneath (a fresh series has no bars; update() on it
  // would be invalid).
  const seededKeyRef = useRef<{ series: ISeriesApi<'Area'> | null; ticker: string | null }>({
    series: null,
    ticker: null,
  });
  // Last time written per ticker — monotonicity guard for update() (T-03-07).
  const lastTimeRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || !selectedTicker || !history || history.length === 0) return;

    const needsSeed =
      seededKeyRef.current.series !== series || seededKeyRef.current.ticker !== selectedTicker;

    if (needsSeed) {
      // Full re-seed on ticker switch — index-based time is stable (the store
      // history is a plain number[]; no float timestamps reach the series).
      series.setData(history.map((v, i) => ({ time: i as UTCTimestamp, value: v })));
      lastTimeRef.current[selectedTicker] = history.length - 1;
      seededKeyRef.current = { series, ticker: selectedTicker };
      chart.timeScale().fitContent();
      return;
    }

    // Same ticker: stream the newest point. Floor the backend's float Unix
    // seconds at this boundary (Pitfall 3); an equal time replaces the last
    // bar — correct v5 behavior.
    if (!lastUpdate) return;
    const time = Math.floor(lastUpdate.timestamp) as UTCTimestamp;
    const lastTime = lastTimeRef.current[selectedTicker] ?? -Infinity;
    if (time >= lastTime) {
      series.update({ time, value: history[history.length - 1] });
      lastTimeRef.current[selectedTicker] = time;
    }
  }, [selectedTicker, history, lastUpdate]);

  return <div ref={containerRef} className="h-96 w-full" />;
}
