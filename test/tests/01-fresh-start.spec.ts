// TEST-02 fresh-start E2E (04-04 Task 1) — mirrors TerminalApp.test.tsx Test 1-2.
// Numeric prefix 01- locks the mutation-safe serial order (Playwright discovers
// files alphabetically): the $10,000.00 fresh-DB assertion runs before any spec
// that trades. Determinism comes from run-e2e's leading `down -v` wiping
// finally-test-data (04-03).
import { test, expect } from '@playwright/test';

const SEED_TICKERS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'NFLX'];

test('fresh start: $10k cash, ten sparklines, connected dot, live prices', async ({ page }) => {
  await page.goto('/');

  // Header cash is $10,000.00 from the seeded fresh profile. Scoped to the
  // header "Cash" label span — "Total" also renders $10,000.00 with no positions.
  const cashValue = page
    .locator('span.text-gray-400')
    .filter({ hasText: 'Cash' })
    .locator('span.text-foreground');
  await expect(cashValue).toHaveText('$10,000.00', { timeout: 10_000 });

  // All ten seed tickers render their sparkline data-testid (WatchlistPanel rows).
  for (const ticker of SEED_TICKERS) {
    await expect(page.getByTestId(`sparkline-${ticker}`)).toBeVisible({ timeout: 10_000 });
  }

  // SSE connected — EventSource onopen maps to the green dot (Header.tsx:34-37).
  await expect(page.getByLabel('connection: connected')).toBeVisible({ timeout: 10_000 });

  // Streaming is live: the AAPL watchlist price cell changes within ~3s (20Hz
  // simulator). The row's price span is the one matching a $ prefix pattern.
  const aaplPrice = page
    .locator('[data-ticker="AAPL"] span')
    .filter({ hasText: /^\$?[0-9]+\./ })
    .first();
  await expect(aaplPrice).not.toHaveText('--');
  const first = await aaplPrice.textContent();
  await expect(aaplPrice).not.toHaveText(first ?? '', { timeout: 5_000 });
});
