// Portfolio heatmap — Recharts Treemap sized by market_value and colored by
// unrealized_pnl sign/intensity (UI-03, 03-PATTERNS.md:263-273,
// 03-RESEARCH.md:392-400). Leaf component: reads store.portfolio only, renders
// an empty state when absent, and never touches page.tsx (wired in 03-06).
// The optional `content` prop exists for tests to inject a spy renderer that
// asserts the exact data mapping; production uses the internal HeatmapCell.
'use client';

import { Treemap, ResponsiveContainer } from 'recharts';
import { useStore } from '../../store/useStore';
import { fmtCurrency } from '../../lib/format';

// Node props Recharts hands a custom Treemap content renderer. Leaf nodes
// (depth 1) carry the mapped data fields {name, size, pnl} plus layout
// coordinates (Treemap.js computeNode: spreads the original data item).
export interface HeatmapNodeProps {
  name?: string;
  size?: number;
  pnl?: number;
  depth?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: HeatmapNodeProps[];
  [key: string]: unknown;
}

export type HeatmapContent =
  | React.ReactElement
  | ((props: HeatmapNodeProps) => React.ReactNode);

// Pnl color scale — emerald/red alpha-scaled by |pnl|/maxAbsPnl, gray for zero
// (03-PATTERNS.md:263-273). Alphas are injected into rgba() strings so the
// tests can assert exact fills.
const GREEN_RGB = '16,185,129'; // emerald-500
const RED_RGB = '239,68,68'; // red-500
const ZERO_FILL = '#30363d'; // zero-pnl cell — dark panel tone

function HeatmapCell({
  x,
  y,
  width,
  height,
  name,
  size,
  pnl = 0,
  maxAbsPnl = 0,
}: HeatmapNodeProps & { maxAbsPnl?: number }) {
  const alpha = maxAbsPnl > 0 ? Math.abs(pnl) / maxAbsPnl : 0;
  const fill =
    pnl > 0
      ? `rgba(${GREEN_RGB},${alpha})`
      : pnl < 0
        ? `rgba(${RED_RGB},${alpha})`
        : ZERO_FILL;

  return (
    <g data-testid={`heatmap-cell-${name ?? ''}`}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        data-ticker={name}
        data-pnl={pnl}
      />
      {typeof size === 'number' && (
        <>
          <text x={(x ?? 0) + 4} y={(y ?? 0) + 14} fill="#e6edf3" fontSize={11}>
            {name}
          </text>
          <text x={(x ?? 0) + 4} y={(y ?? 0) + 28} fill="#8b949e" fontSize={10}>
            {fmtCurrency(size)}
          </text>
        </>
      )}
    </g>
  );
}

export function Heatmap({ content }: { content?: HeatmapContent }) {
  const portfolio = useStore((s) => s.portfolio);

  if (!portfolio || portfolio.positions.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500">
        No positions
      </div>
    );
  }

  const positions = portfolio.positions;
  const maxAbsPnl = Math.max(...positions.map((p) => Math.abs(p.unrealized_pnl)), 0);
  const data = positions.map((p) => ({
    name: p.ticker,
    size: p.market_value,
    pnl: p.unrealized_pnl,
  }));

  return (
    <ResponsiveContainer width="100%" height={192}>
      <Treemap
        data={data}
        dataKey="size"
        nameKey="name"
        stroke="#1a1a2e"
        content={content ?? <HeatmapCell maxAbsPnl={maxAbsPnl} />}
      />
    </ResponsiveContainer>
  );
}
