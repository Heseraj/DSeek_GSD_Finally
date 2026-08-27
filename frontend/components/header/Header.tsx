// Terminal header — connection dot + live total + cash (UI-07, 03-02 Task 2).
// readyState mapping: connected=green / reconnecting=yellow / closed=red
// (03-RESEARCH.md:29, 140). Live total = selectLiveTotal derived selector
// (cash + Σ(qty × live price)). Subscribes ONLY to its slices — connection,
// portfolio, and the derived total (Pitfall 6: never read the whole store).
'use client';

import { useStore, selectLiveTotal } from '../../store/useStore';
import { fmtCurrency } from '../../lib/format';
import type { ConnectionState } from '../../store/useStore';

const DOT_CLASS: Record<ConnectionState, string> = {
  connected: 'bg-emerald-500',
  reconnecting: 'bg-yellow-500',
  closed: 'bg-red-500',
};

const DOT_TITLE: Record<ConnectionState, string> = {
  connected: 'Live data connected',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected',
};

export function Header() {
  const connection = useStore((s) => s.connection);
  const portfolio = useStore((s) => s.portfolio);
  const liveTotal = useStore(selectLiveTotal);

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-panel px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold tracking-wide text-foreground">FinAlly</span>
        <span
          data-testid="connection-dot"
          aria-label={`connection: ${connection}`}
          title={DOT_TITLE[connection]}
          className={`inline-block h-2.5 w-2.5 rounded-full ${DOT_CLASS[connection]}`}
        />
      </div>
      <div className="flex items-center gap-6 font-mono text-sm">
        <span className="text-gray-400">
          Cash <span className="text-foreground">{fmtCurrency(portfolio?.cash_balance ?? 0)}</span>
        </span>
        <span className="text-gray-400">
          Total <span className="text-foreground">{fmtCurrency(liveTotal)}</span>
        </span>
      </div>
    </div>
  );
}
