import * as arrow from 'apache-arrow'
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm'
import { generateLedger, type FixtureLedger, type FixtureTransaction } from '@raseed/fixtures'
import { localTransactions } from '@/lib/store/local-ledger'
import { getDuckDB } from './client'
import { ALL_VIEWS, RAW_TABLE } from './queries'

/**
 * Source → Arrow → `insertArrowTable`.
 *
 * Arrow rather than a stream of INSERTs because it is columnar on both ends: DuckDB reads
 * the buffers directly instead of parsing a hundred thousand statements.
 */

export const DEMO_END_AT = 1_755_300_000_000

export interface IngestTiming {
  rows: number
  /** Building the Arrow tables in JS. */
  buildMs: number
  /** Handing the buffers to DuckDB. */
  insertMs: number
  /** CREATE OR REPLACE for every view — the number the 400ms budget is about. */
  viewsMs: number
  totalMs: number
}

const utf8 = (values: readonly (string | null)[]) =>
  arrow.vectorFromArray(values as (string | null)[], new arrow.Utf8())

function transactionsTable(rows: readonly FixtureTransaction[]): arrow.Table {
  /**
   * Explicitly typed vectors, because NULL has to survive the trip.
   *
   * Coercing `null` to `''` here silently breaks the spend predicate:
   * `reversal_of_id IS NULL` then matches nothing, `v_spend` returns zero rows, and the
   * dashboard shows ₹0 spent with no error anywhere. `vectorFromArray` with an explicit
   * type keeps real nulls; `tableFromArrays` infers per column and does not.
   *
   * `deleted` is a real BOOL for the same reason — the predicate compares it to `false`.
   */
  return new arrow.Table({
    id: utf8(rows.map((t) => t.id)),
    occurred_at: arrow.vectorFromArray(
      rows.map((t) => BigInt(t.occurred_at)),
      new arrow.Int64(),
    ),
    direction: utf8(rows.map((t) => t.direction)),
    amount_minor: arrow.vectorFromArray(
      rows.map((t) => BigInt(t.amount_minor)),
      new arrow.Int64(),
    ),
    currency: utf8(rows.map((t) => t.currency)),
    home_amount_minor: arrow.vectorFromArray(
      rows.map((t) => BigInt(t.home_amount_minor)),
      new arrow.Int64(),
    ),
    fx_rate: arrow.vectorFromArray(
      rows.map((t) => t.fx_rate),
      new arrow.Float64(),
    ),
    fx_inr_per_aed: arrow.vectorFromArray(
      rows.map((t) => t.fx_inr_per_aed),
      new arrow.Float64(),
    ),
    account_id: utf8(rows.map((t) => t.account_id)),
    merchant_id: utf8(rows.map((t) => t.merchant_id)),
    category_id: utf8(rows.map((t) => t.category_id)),
    txn_type: utf8(rows.map((t) => t.txn_type)),
    status: utf8(rows.map((t) => t.status)),
    reversal_of_id: utf8(rows.map((t) => t.reversal_of_id)),
    transfer_group_id: utf8(rows.map((t) => t.transfer_group_id)),
    trip_id: utf8(rows.map((t) => t.trip_id)),
    deleted: arrow.vectorFromArray(
      rows.map((t) => t.deleted),
      new arrow.Bool(),
    ),
  })
}

/**
 * Scale the fixture ledger to an arbitrary row count for benchmarking.
 *
 * Rows are cloned with shifted dates and unique ids — the distribution is the real one, so
 * the timing reflects realistic cardinality rather than a single repeated value that DuckDB
 * would compress away.
 */
export function inflate(ledger: FixtureLedger, targetRows: number): FixtureTransaction[] {
  const base = ledger.transactions
  if (targetRows <= base.length) return base.slice(0, targetRows)

  const out: FixtureTransaction[] = []
  const YEAR = 365 * 86_400_000
  let cycle = 0

  while (out.length < targetRows) {
    for (const t of base) {
      if (out.length >= targetRows) break
      out.push(
        cycle === 0
          ? t
          : {
              ...t,
              id: `${t.id}-c${cycle}`,
              occurred_at: t.occurred_at - cycle * YEAR,
              reversal_of_id: t.reversal_of_id ? `${t.reversal_of_id}-c${cycle}` : null,
            },
      )
    }
    cycle += 1
  }
  return out
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
  const ledger = generateLedger({ endAt: DEMO_END_AT })

  // Anything you added in this browser is layered on top of the seeded demo. The benchmark
  // path deliberately skips it so the row count it reports is exactly what was asked for.
  const base = rows ? inflate(ledger, rows) : [...ledger.transactions, ...localTransactions()]
  const transactions = base

  const t0 = performance.now()
  const txnTable = transactionsTable(transactions)
  const categories = arrow.tableFromArrays({
    id: ledger.categories.map((c) => c.id),
    name: ledger.categories.map((c) => c.name),
    kind: ledger.categories.map((c) => c.kind),
  })
  const merchants = arrow.tableFromArrays({
    id: ledger.merchants.map((m) => m.id),
    canonical_name: ledger.merchants.map((m) => m.canonical_name),
    country: ledger.merchants.map((m) => m.country),
  })
  const t1 = performance.now()

  const conn = await db.connect()
  try {
    await conn.query(`DROP TABLE IF EXISTS ${RAW_TABLE};`)
    await conn.query('DROP TABLE IF EXISTS categories;')
    await conn.query('DROP TABLE IF EXISTS merchants;')
    await conn.insertArrowTable(txnTable, { name: RAW_TABLE, create: true })
    await conn.insertArrowTable(categories, { name: 'categories', create: true })
    await conn.insertArrowTable(merchants, { name: 'merchants', create: true })
  } finally {
    await conn.close()
  }
  const t2 = performance.now()

  for (const view of ALL_VIEWS) await run(db, view)
  const t3 = performance.now()

  return {
    rows: transactions.length,
    buildMs: Math.round(t1 - t0),
    insertMs: Math.round(t2 - t1),
    viewsMs: Math.round(t3 - t2),
    totalMs: Math.round(t3 - t0),
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
