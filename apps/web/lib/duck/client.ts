import * as duckdb from '@duckdb/duckdb-wasm'

/**
 * DuckDB-WASM, lazy-loaded after first paint.
 *
 * The bundle is ~3MB. That is not free and the docs say so — but the whole analytical
 * feature list is impossible without it, and loading it eagerly would blow the 250KB
 * initial-JS budget on a page that mostly shows a headline.
 *
 * One instance per tab, created on first use and reused. Analytics never touch Postgres:
 * the browser pulls rows once and every query after that is local.
 */

let instance: Promise<duckdb.AsyncDuckDB> | null = null

async function create(): Promise<duckdb.AsyncDuckDB> {
  // Served from our own origin, not jsDelivr.
  //
  // `getJsDelivrBundles()` is the documented path and it was what this used. It also means a
  // third party sees the IP of everyone who opens a personal finance dashboard, and that a
  // CDN outage silently empties every figure on the site. Neither is acceptable for this app,
  // and the strict CSP added in S6 blocked it outright — which is how it was found.
  //
  // `scripts/copy-duckdb.mjs` puts these in public/ at build time. Feature detection is
  // unchanged: `selectBundle` still picks EH or MVP based on what the browser can run.
  // Absolute URLs, not root-relative. `instantiate` resolves `mainModule` *inside the worker*,
  // where a bare "/duckdb/…" has no base to resolve against — it fails with "Failed to parse
  // URL", and only after the worker has already started, so the page looks like it is loading
  // rather than broken.
  const at = (p: string) => new URL(p, location.origin).href
  const bundle = await duckdb.selectBundle({
    mvp: {
      mainModule: at('/duckdb/duckdb-mvp.wasm'),
      mainWorker: at('/duckdb/duckdb-browser-mvp.worker.js'),
    },
    eh: {
      mainModule: at('/duckdb/duckdb-eh.wasm'),
      mainWorker: at('/duckdb/duckdb-browser-eh.worker.js'),
    },
  })

  // The worker script is loaded directly, NOT wrapped in a Blob.
  //
  // The blob wrapper existed only because the script used to come from jsDelivr and a
  // cross-origin script cannot be a Worker. Now that it is self-hosted the wrapper is
  // unnecessary — and actively harmful under a CSP: a blob-URL worker inherits the document's
  // policy but its own origin does not resolve to `'self'`, so `connect-src 'self'` blocked
  // the worker's fetch of the .wasm. No error surfaced; the dashboard simply never finished
  // loading. Removing the blob is what let the strict policy ship.
  const worker = new Worker(bundle.mainWorker!)
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING)
  const db = new duckdb.AsyncDuckDB(logger, worker)

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

  return db
}

export function getDuckDB(): Promise<duckdb.AsyncDuckDB> {
  instance ??= create()
  return instance
}

export async function resetDuckDB(): Promise<void> {
  if (!instance) return
  const db = await instance
  await db.terminate()
  instance = null
}
