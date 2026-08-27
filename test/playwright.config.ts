// RESEARCH.md:439 (locked properties) + 04-PATTERNS.md:268-282
// workers: 1 + fullyParallel: false are MANDATORY (A7) — the six specs share
// one mutable SQLite DB; determinism comes from `down -v` in run-e2e, not
// test isolation.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8000',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
