// Chart lifecycle owner (03-03 Task 1) — the official lightweight-charts v5
// lifecycle (03-RESEARCH.md:357-377, 03-PATTERNS.md:240-261) encapsulated as a
// hook so every canvas component shares one create/update/remove contract:
//   - createChart in useEffect with the dark-theme layout and an explicit
//     width read from the container ref (Pitfall 2 — containers carry fixed
//     Tailwind heights, never 0)
//   - window resize listener -> chart.applyOptions({ width }) (docs pattern)
//   - chart.remove() in cleanup (v5: chart.remove(), not remove() per series)
//   - returns refs (not values) so consumers' data effects run AFTER the
//     series exists; consumers call series.setData/update themselves
// Consumers seed with setData and stream with series.update — never setData
// per tick (03-RESEARCH.md:248). Timestamps are Math.floor'ed at the series
// boundary (Pitfall 3, T-03-07).
'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { AreaSeries, ColorType, createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';

export interface UseLightweightChartOptions {
  height: number;
  lineColor?: string;
  topColor?: string;
  bottomColor?: string;
}

export function useLightweightChart(
  containerRef: RefObject<HTMLDivElement | null>,
  {
    height,
    lineColor = '#209dd7',
    topColor = 'rgba(32,157,215,0.4)',
    bottomColor = 'rgba(32,157,215,0.02)',
  }: UseLightweightChartOptions,
) {
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d1117' },
        textColor: '#c9d1d9',
      },
      width: el.clientWidth, // explicit width from the ref — never a 0-measure (Pitfall 2)
      height,
    });
    const series = chart.addSeries(AreaSeries, { lineColor, topColor, bottomColor });

    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, lineColor, topColor, bottomColor]);

  return { chartRef, seriesRef };
}
