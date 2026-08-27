// TEST-02 buy/sell E2E (04-04 Task 1) — mirrors TerminalApp.test.tsx Test 5
// (trade POST body {ticker, quantity, side}). Buy 10 AAPL -> cash drops below
// $10,000.00 and an AAPL position row appears; sell 5 AAPL -> cash increases
// from the post-buy value and the position quantity shows 5. Runs AFTER
// 01-fresh-start serially; determinism comes from run-e2e's down -v reset, not
// within-suite isolation (the suite shares one mutable SQLite DB).
import { test, expect } from '@playwright/test';

test('trading: buy 10 AAPL then sell 5', async ({ page }) => {
  await page.goto('/');
  const cashValue = page
    .locator('span.text-gray-400')
    .filter({ hasText: 'Cash' })
    .locator('span.text-foreground');
  await expect(cashValue).toHaveText('$10,000.00', { timeout: 10_000 });

  // Buy 10 AAPL via the trade bar (labels Ticker/Quantity + role button Buy).
  // exact:true — getByLabel does substring matching, and "Add ticker" (watchlist
  // input) contains "Ticker".
  await page.getByLabel('Ticker', { exact: true }).fill('AAPL');
  await page.getByLabel('Quantity', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Buy' }).click();

  // Instant fill: the position row appears and cash drops below $10,000.00.
  await expect(page.locator('tr[data-ticker="AAPL"]')).toBeVisible({ timeout: 10_000 });
  await expect(cashValue).not.toHaveText('$10,000.00', { timeout: 5_000 });
  const afterBuy = await cashValue.textContent();

  // Sell 5 AAPL — the quantity input clears after a fill; re-fill qty only
  // (the ticker stays pre-filled with AAPL).
  await page.getByLabel('Quantity', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Sell' }).click();

  // Position quantity 5 and cash increased from the post-buy value.
  await expect(page.locator('tr[data-ticker="AAPL"] td').nth(1)).toHaveText('5', { timeout: 10_000 });
  await expect(cashValue).not.toHaveText(afterBuy ?? '', { timeout: 5_000 });
});
