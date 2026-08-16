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
  // jsDelivr bundles are selected by feature detection — it picks the COI/EH/MVP build
  // that this browser can actually run rather than assuming threads are available.
  const bundles = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(bundles)

  // The worker has to come from a same-origin URL or the module worker is blocked, so the
  // CDN script is wrapped in a Blob.
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' }),
  )

  const worker = new Worker(workerUrl)
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING)
  const db = new duckdb.AsyncDuckDB(logger, worker)

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  URL.revokeObjectURL(workerUrl)

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
