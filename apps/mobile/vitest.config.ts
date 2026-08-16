import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Node-side tests for the phone.
 *
 * Only what can run without a native module: the generated schema against `node:sqlite`, and
 * the pure modules under `src/lib`. Screens and anything touching op-sqlite are still verified
 * on the simulator — this does not pretend otherwise.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
