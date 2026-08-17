import { defineConfig } from 'vitest/config'

/**
 * C3 — the coverage floor, over `packages/*` only.
 *
 * The shared packages are where the floor belongs and the apps are where it would lie. Every
 * money operation, every engine and the schema contract live here, they are pure, and a line
 * that is never executed by 900-odd tests is a line nobody has ever checked. The apps are
 * screens and SQL wiring: their real coverage is 67 Playwright specs driving a production
 * build and a simulator someone opens, neither of which a line counter can see. Setting a
 * number there would be measuring the wrong thing and then defending it.
 *
 * `apps/*` keep their own configs and run under turbo as before. This is a separate gate:
 *
 *   pnpm coverage
 *
 * The filename is deliberately not `vitest.config.ts`. Each package runs a bare `vitest run`
 * with no config of its own, so a root config would be auto-discovered and inherited — and
 * `projects: ['packages/*']` then resolves against that package's own directory and matches
 * nothing, which fails every package's tests with "No projects were found".
 *
 * Thresholds are set just under today's measured numbers, not at a round aspiration. A floor
 * you have to lower is not a floor.
 */
export default defineConfig({
  test: {
    projects: ['packages/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/__tests__/**',
        // A four-line placeholder holding a workspace slot (D-10). Counting it would move the
        // number without changing what is tested.
        'packages/ai/**',
        // Generated: DDL and RLS rendered from the contract, and proven by the parity test
        // and the RLS suite rather than by executing this file.
        'packages/schema/scripts/**',
      ],
      reporter: ['text-summary', 'json-summary'],
      // Measured 2026-08-17: 95.35 / 89.47 / 98.42 / 97.13. C3 asked for 80, which these
      // clear so comfortably that setting it there would gate nothing — a package could lose
      // a sixth of its coverage and still pass. Set a point or two under the real numbers so
      // the gate fires on a regression rather than on a catastrophe.
      thresholds: {
        statements: 94,
        branches: 88,
        functions: 97,
        lines: 96,
      },
    },
  },
})
