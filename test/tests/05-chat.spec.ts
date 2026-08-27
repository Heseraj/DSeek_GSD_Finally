// TEST-02 mocked chat E2E (04-04 Task 2) — mock shape per backend/app/chat/
// service.py:55-59: message "[mock] Acknowledged: ..." + trades
// [{ticker AAPL, side buy, quantity 1}]. Send any message via the chat input
// (placeholder 'Ask the AI to trade…') + Send; assert the mock message text
// renders, the inline AAPL buy confirmation badge appears (confirmations render
// only from the structured trades field — never from message text, T-03-01),
// and cash decreased by the executed qty-1 AAPL buy.
// Runs 5th (05- prefix) — AFTER fresh-start (01-), so its deterministic AAPL
// buy never precedes the $10,000.00 assertion.
import { test, expect } from '@playwright/test';

const parseCash = (t: string | null) => parseFloat((t ?? '').replace(/[^0-9.]/g, ''));

test('chat: [mock] Acknowledged + inline AAPL buy confirmation', async ({ page }) => {
  await page.goto('/');
  const cashValue = page
    .locator('span.text-gray-400')
    .filter({ hasText: 'Cash' })
    .locator('span.text-foreground');
  await expect(cashValue).not.toHaveText('$0.00', { timeout: 10_000 });
  const cashBefore = parseCash(await cashValue.textContent());

  await page.getByPlaceholder('Ask the AI to trade…').fill('please buy a share of aapl');
  await page.getByRole('button', { name: 'Send' }).click();

  // Deterministic mock response renders as React text (never innerHTML).
  await expect(page.getByText(/\[mock\] Acknowledged/).first()).toBeVisible({ timeout: 15_000 });
  // Inline confirmation badge derives from the structured trades field:
  // `${t.ticker} ${t.side} ${t.quantity} — executed` (ChatPanel.tsx:92).
  await expect(page.getByText('AAPL buy 1 — executed')).toBeVisible({ timeout: 5_000 });

  // The executed qty-1 AAPL buy decreased cash (the chat refetch reconciles).
  await expect
    .poll(async () => parseCash(await cashValue.textContent()), { timeout: 10_000 })
    .toBeLessThan(cashBefore);
});
