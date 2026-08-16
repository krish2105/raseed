import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Vitest needs the same `@/*` alias Next resolves from tsconfig paths — without it the
 * suite cannot import anything that reaches lib/store or components.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    // Playwright specs are driven by `pnpm e2e`; Vitest must not try to run them.
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**'],
  },
})
