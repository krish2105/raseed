import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Root config, used by packages/*. Each app owns its own config:
//   apps/web    -> eslint-config-next
//   apps/mobile -> eslint-config-expo
export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.expo/**', 'apps/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,

  /**
   * The purity of `@raseed/engines`, enforced rather than promised.
   *
   * `CLAUDE.md` has always said this package is pure — no I/O, no React, no DB, no platform
   * API, no `Date.now()`. Until now nothing checked, so the rule held only for as long as
   * everyone remembered it. It is the most load-bearing invariant in the repo: both apps
   * import these functions, and the moment one of them reaches for a clock or a database,
   * a number on the phone and the same number on the dashboard can legitimately differ.
   *
   * `@raseed/money` is the single permitted dependency — it is equally pure and the engines
   * cannot do arithmetic on an amount without it.
   */
  {
    files: ['packages/engines/**/*.ts'],
    ignores: ['packages/engines/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'react-native*', '@react-*'],
              message: 'engines is pure: no React. Move this to the app that renders it.',
            },
            {
              group: ['node:*', 'fs', 'path', 'crypto', 'os', 'http', 'https'],
              message: 'engines is pure: no I/O. Pass the data in as an argument.',
            },
            {
              group: ['drizzle-orm*', '@duckdb/*', '@op-engineering/*', '@supabase/*', 'apache-arrow'],
              message: 'engines is pure: no database. Query in the app, compute here.',
            },
            {
              group: ['expo*', 'next*', '@raseed/schema', '@raseed/fixtures', '@raseed/ai'],
              message: 'engines may only depend on @raseed/money.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'engines is pure: no platform storage.' },
        { name: 'window', message: 'engines is pure: no DOM.' },
        { name: 'document', message: 'engines is pure: no DOM.' },
        { name: 'fetch', message: 'engines is pure: no network. Pass the data in.' },
      ],
      // `Date.now()` is the one that bites hardest: a function that reads the clock produces
      // a different answer depending on when it ran, which makes it untestable and makes
      // two devices disagree. Time is a parameter here, always.
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'engines takes time as a parameter. Pass `now` in.',
        },
        {
          object: 'Math',
          property: 'random',
          message: 'engines is deterministic. Use the seeded `mulberry32` rng.',
        },
      ],
    },
  },
])
