// TEST-02 SSE reconnection E2E (04-04 Task 2) — RESEARCH skeleton
// (04-RESEARCH.md:337-348 / 04-PATTERNS.md:407-419) assertion sequence with a
// WORKING trigger (A3 RESOLVED — see below):
//
//   connected -> (socket dropped) -> reconnecting -> online -> connected + price change
//
// TRIGGER INVESTIGATION (recorded in 04-04-SUMMARY.md): BOTH context.setOffline
// AND CDP Network.emulateNetworkConditions (offline: true) leave the dot green —
// emulated offline kills NEW connections but does NOT tear down an established
// SSE socket in the pinned Chromium (verified: a page fetch fails while the dot
// stays 'connection: connected'). The socket must therefore be dropped at the
// connection level. This spec wraps window.EventSource in an init script: the
// real socket is closed (the backend's request.is_disconnected() loop breaks),
// and a fresh native EventSource is created with the SAME onopen/onerror/
// onmessage handlers while the context is offline — the failed connection fires
// the app's real onerror handler (reconnecting, never es.close()), and the
// browser's built-in retry (retry: 1000 from the stream, or the 3s default for
// a connection that never opened) reconnects once the network is restored. The
// frontend reconnect machinery under test is unchanged.
//
// Price probe deviation: the skeleton's page-wide `page.locator('span')
// .filter(...).first()` lands on the HEADER CASH cell (static between trades);
// scoped to the AAPL watchlist row price — the live-streaming cell.
import { test, expect } from '@playwright/test';

test('SSE reconnects after network loss', async ({ page, context }) => {
  // Stash the live EventSource instance; expose a reconnect() that drops the
  // real socket and re-establishes with the same handlers.
  await page.addInitScript(() => {
    const NativeES = window.EventSource;
    let current: EventSource | null = null;
    (window as unknown as { __esBridge: { reconnect(): void } }).__esBridge = {
      reconnect() {
        const old = current;
        if (!old) return;
        const fresh = new NativeES(old.url);
        fresh.onopen = old.onopen;
        fresh.onerror = old.onerror;
        fresh.onmessage = old.onmessage;
        old.close(); // server-side request.is_disconnected() breaks the stream
        current = fresh;
      },
    };
    window.EventSource = class extends NativeES {
      constructor(...args: ConstructorParameters<typeof NativeES>) {
        super(...args);
        current = this;
      }
    };
  });

  await page.goto('/');
  const dot = page.getByTestId('connection-dot');
  await expect(dot).toHaveAttribute('aria-label', 'connection: connected', { timeout: 15_000 });

  // AAPL watchlist row price — a live 20Hz cell, the right probe for "prices
  // resumed" (the header cash cell is static between trades).
  const price = page.locator('[data-ticker="AAPL"] span').filter({ hasText: /^\$?[0-9]+\./ }).first();
  const first = await price.textContent();

  // Drop the real socket while the network is down: the fresh connection fails,
  // the app's real onerror sets reconnecting (never closes).
  await context.setOffline(true);
  await page.evaluate('window.__esBridge.reconnect()');
  await expect(dot).toHaveAttribute('aria-label', /reconnecting|closed/, { timeout: 10_000 });

  // Back online -> the browser's EventSource retry reconnects (retry: 1000).
  await context.setOffline(false);
  await expect(dot).toHaveAttribute('aria-label', 'connection: connected', { timeout: 15_000 });
  await expect(price).not.toHaveText(first ?? '', { timeout: 10_000 });
});
