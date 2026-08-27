// TEST-02 watchlist add/remove E2E (04-04 Task 1) — mirrors TerminalApp.test.tsx
// Test 6. Add PYPL via the add-ticker input + Add button (POST /api/watchlist ->
// 200/409); the new row + sparkline appear and PYPL streams (20Hz). Remove via
// the row's Remove PYPL button (DELETE -> 204 empty body, pruned locally; 404
// tolerated) and assert the sparkline is gone.
import { test, expect } from '@playwright/test';

test('watchlist: add PYPL streams then remove it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sparkline-AAPL')).toBeVisible({ timeout: 10_000 });

  // Add PYPL (aria-label on the add-ticker input + role button Add).
  await page.getByLabel('Add ticker').fill('PYPL');
  await page.getByRole('button', { name: 'Add' }).click();

  // The new row + sparkline appear and PYPL streams — price text non-empty and
  // changes within ~3s (prices stream at 20Hz from the simulator).
  const pyplRow = page.locator('[data-ticker="PYPL"]');
  await expect(pyplRow).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('sparkline-PYPL')).toBeVisible({ timeout: 10_000 });
  const pyplPrice = pyplRow.locator('span').filter({ hasText: /^\$?[0-9]+\./ }).first();
  await expect(pyplPrice).not.toHaveText('--', { timeout: 10_000 });
  const first = await pyplPrice.textContent();
  await expect(pyplPrice).not.toHaveText(first ?? '', { timeout: 5_000 });

  // Remove PYPL — the 204 empty-body DELETE prunes the row locally + refetches.
  await page.getByRole('button', { name: 'Remove PYPL' }).click();
  await expect(page.getByTestId('sparkline-PYPL')).toHaveCount(0, { timeout: 10_000 });
});
