import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against a real production build.
 *
 * `next build && next start`, not `next dev` — the bugs worth catching here live in the
 * production path. The worker chunk is emitted by the production bundler, prerendering
 * exercises the Suspense boundaries, and a dev-only pass would have proved nothing about
 * either.
 *
 * DuckDB-WASM is roughly 3MB and the demo ingest runs after it, so the timeouts are
 * generous on purpose. A flaky suite is one nobody trusts, and one nobody trusts is one
 * that gets skipped.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one server, and every spec writes to the same localStorage origin
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:3801',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'pnpm build && pnpm start -p 3801',
    url: 'http://127.0.0.1:3801/overview',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
