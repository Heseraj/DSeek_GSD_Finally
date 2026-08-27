// Per-row sparkline (03-03 Task 2) — a small Area series fed ONLY its ticker's
// history array (Pitfall 6, 03-RESEARCH.md:298): no whole-store reads, no
// cross-ticker data. Index-based time points (the store history is a plain
// number[] — no float timestamps reach this series); seeds once, then streams
// appended points via series.update. Lifecycle (create/remove) is owned by
// useLightweightChart (03-03 Task 1).
'use client';

import { useEffect, useRef } from 'react';
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useLightweightChart } from '../chart/useLightweightChart';

export function Sparkline({ ticker, data = [] }: { ticker: string; data?: number[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { seriesRef } = useLightweightChart(containerRef, { height: 32 }); // h-8

  // Seed identity — seed when the series changes (e.g. a StrictMode remount
  // swaps the underlying chart); afterwards only append via update().
  const seededSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || data.length === 0) return;

    if (seededSeriesRef.current !== series) {
      series.setData(data.map((v, i) => ({ time: i as UTCTimestamp, value: v })));
      seededSeriesRef.current = series;
      return;
    }

    // appended point — its index is data.length - 1
    series.update({ time: (data.length - 1) as UTCTimestamp, value: data[data.length - 1] });
  }, [data, seriesRef]);

  return <div ref={containerRef} data-testid={`sparkline-${ticker}`} className="h-8" />;
}
