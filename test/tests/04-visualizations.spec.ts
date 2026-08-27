// TEST-02 visualizations E2E (04-04 Task 2) — mirrors TerminalApp.test.tsx Test 4.
// Heatmap cells, P&L chart, positions table. The fresh seed has NO positions
// (database.py:92-105), so this spec first buys 1 TSLA — guaranteeing a second
// heatmap cell deterministically (AAPL comes from 03-trading). Existence plus
// one live-data assertion only; the snapshot loop records at app boot, so the
// P&L chart curve renders from the first history fetch.
import { test, expect } from '@playwright/test';

test('visualizations: heatmap cells, P&L chart, positions table', async ({ page }) => {
  await page.goto('/');

  // Deterministic second position — the fresh seed has none.
  await page.getByLabel('Ticker', { exact: true }).fill('TSLA');
  await page.getByLabel('Quantity', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Buy' }).click();

  // Heatmap renders one cell per position — AAPL (03-trading) + TSLA (this spec).
  await expect(page.getByTestId('heatmap-cell-AAPL')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('heatmap-cell-TSLA')).toBeVisible({ timeout: 10_000 });

  // P&L chart: start_snapshot_loop records a snapshot on boot, so /history
  // returns data and the Recharts chart renders (PnlChart initial fetch).
  // nth(1): the Heatmap Treemap also renders a .recharts-wrapper (first in DOM);
  // the P&L LineChart wrapper is second. The curve is asserted attached —
  // Playwright's toBeVisible on the SVG <path> reports "hidden" despite real
  // geometry (stroke-dasharray render quirk).
  await expect(page.locator('.recharts-wrapper').nth(1)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.recharts-line-curve')).toBeAttached();

  // Positions table renders live data (rows + the seven-column header).
  await expect(page.locator('tr[data-ticker="AAPL"]')).toBeVisible();
  await expect(page.locator('tr[data-ticker="TSLA"]')).toBeVisible();
  await expect(page.getByText('Unrealized P&L')).toBeVisible();
});
