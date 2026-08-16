import { cpSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Copy the DuckDB-WASM bundles into `public/` at build time.
 *
 * Without this, `duckdb.getJsDelivrBundles()` points the worker and the .wasm at
 * cdn.jsdelivr.net — a third party that would then see the IP of everyone who opens a
 * personal finance dashboard, and whose outage would silently kill every figure on the site.
 *
 * They are copied rather than committed: ~75MB uncompressed across the two builds, which has
 * no business in git. Vercel compresses static assets, so the wire cost matches the CDN's
 * while the origin stays first-party.
 */
// The package does not export './package.json', so resolve the entry point and take its
// directory — the bundles sit alongside it in dist/.
const require = createRequire(import.meta.url)
const dist = dirname(require.resolve('@duckdb/duckdb-wasm'))
const out = join(import.meta.dirname, '..', 'public', 'duckdb')

const FILES = [
  'duckdb-browser-eh.worker.js',
  'duckdb-browser-mvp.worker.js',
  'duckdb-eh.wasm',
  'duckdb-mvp.wasm',
]

mkdirSync(out, { recursive: true })
for (const f of FILES) cpSync(join(dist, f), join(out, f))
console.log(`duckdb: copied ${FILES.length} bundle files into public/duckdb`)
