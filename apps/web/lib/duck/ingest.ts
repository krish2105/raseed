import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { localTransactions } from '@/lib/store/local-ledger'
import { runIngest } from '@/lib/workers/client'
import { getDuckDB } from './client'
import { ALL_VIEWS, RAW_TABLE } from './queries'

/**
 * Source → Arrow IPC (in a worker) → `insertArrowFromIPCStream`.
 *
 * Arrow rather than a stream of INSERTs because it is columnar on both ends: DuckDB reads
 * the buffers directly instead of parsing a hundred thousand statements. The encoding runs
 * in `lib/workers` — measured at 837ms on the main thread for 100k rows, which is a full
 * second of dropped frames and dead clicks.
 */

export { DEMO_END_AT } from '@/lib/workers/ingest-core'

export interface IngestTiming {
  rows: number
  /** Generating the ledger, in the worker. */
  generateMs: number
  /** Building the Arrow vectors and serialising to IPC, in the worker. */
  buildMs: number
  /** Handing the buffers to DuckDB — the only part that must be on the main thread. */
  insertMs: number
  /** CREATE OR REPLACE for every view — the number the 400ms budget is about. */
  viewsMs: number
  totalMs: number
  /** False only if this browser refused a worker and the encoding ran inline. */
  offMainThread: boolean
}

async function run(db: AsyncDuckDB, sql: string): Promise<void> {
  const conn = await db.connect()
  try {
    await conn.query(sql)
  } finally {
    await conn.close()
  }
}

/**
 * Load a ledger and (re)build every view.
 *
 * `rows` overrides the fixture size — used by the benchmark to prove the 400ms view-rebuild
 * budget at 100k rows rather than claiming it.
 */
export async function ingestDemo(rows?: number): Promise<IngestTiming> {
  const db = await getDuckDB()

  // localStorage cannot be read from a worker, so the added rows are collected here and
  // passed in. That boundary is the reason the split is clean.
  const t0 = performance.now()
  const built = await runIngest({ rows, local: rows ? [] : localTransactions() })
  const t1 = performance.now()

  const conn = await db.connect()
  try {
    await conn.query(`DROP TABLE IF EXISTS ${RAW_TABLE};`)
    await conn.query('DROP TABLE IF EXISTS categories;')
    await conn.query('DROP TABLE IF EXISTS merchants;')
    await conn.insertArrowFromIPCStream(built.transactions, { name: RAW_TABLE, create: true })
    await conn.insertArrowFromIPCStream(built.categories, { name: 'categories', create: true })
    await conn.insertArrowFromIPCStream(built.merchants, { name: 'merchants', create: true })
  } finally {
    await conn.close()
  }
  const t2 = performance.now()

  for (const view of ALL_VIEWS) await run(db, view)
  const t3 = performance.now()

  return {
    rows: built.rows,
    generateMs: built.generateMs,
    buildMs: built.buildMs,
    insertMs: Math.round(t2 - t1),
    viewsMs: Math.round(t3 - t2),
    totalMs: Math.round(t3 - t0),
    offMainThread: built.offMainThread,
  }
}

/** Re-run only the view DDL. This is what the <400ms budget is measured against. */
export async function rebuildViews(): Promise<number> {
  const db = await getDuckDB()
  const start = performance.now()
  for (const view of ALL_VIEWS) await run(db, view)
  return Math.round(performance.now() - start)
}

/** Run a query and return plain JS rows. Charts that need zero-copy read the Arrow directly. */
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const db = await getDuckDB()
  const conn = await db.connect()
  try {
    const result = await conn.query(sql)
    return result.toArray().map((row) => {
      const plain: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(row.toJSON())) {
        // DuckDB returns BIGINT as JS BigInt; every amount here is minor units well inside
        // Number.MAX_SAFE_INTEGER, and Money wants a number.
        plain[key] = typeof value === 'bigint' ? Number(value) : value
      }
      return plain as T
    })
  } finally {
    await conn.close()
  }
}
