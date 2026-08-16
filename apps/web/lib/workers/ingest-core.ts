import * as arrow from 'apache-arrow'
import {
  generateLedger,
  type FixtureLedger,
  type FixtureTransaction,
} from '@raseed/fixtures'

/**
 * Ledger generation and Arrow encoding, in one place, off the main thread.
 *
 * This — not the forecast maths — is the expensive half of the app. Building the Arrow
 * vectors for 100,000 rows measured **837ms** on the main thread: a solid second where no
 * frame paints, no click registers and the theme toggle does nothing. The statistics that
 * `WEB_ARCHITECTURE.md` names run in about 10ms by comparison.
 *
 * The output is Arrow IPC bytes rather than an `arrow.Table`, because a Table is a graph of
 * typed-array views and structured clone would deep-copy every one of them. IPC bytes are a
 * single ArrayBuffer that transfers with zero copies.
 */

export const DEMO_END_AT = 1_755_300_000_000

export interface IngestRequest {
  /** Override the row count for the benchmark. Omit for the real 18-month demo. */
  rows?: number
  /**
   * Rows added in this browser. Passed in rather than read here — `localStorage` does not
   * exist in a worker, and that boundary is the reason this split is clean.
   */
  local: FixtureTransaction[]
}

export interface IngestPayload {
  transactions: Uint8Array
  categories: Uint8Array
  merchants: Uint8Array
  rows: number
  /** Generating and inflating the ledger. */
  generateMs: number
  /** Building the Arrow vectors and serialising them to IPC. */
  buildMs: number
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

/** Generate the ledger and encode all three tables to Arrow IPC. */
export function buildIngest({ rows, local }: IngestRequest): IngestPayload {
  const t0 = performance.now()
  const ledger = generateLedger({ endAt: DEMO_END_AT })

  // The benchmark path deliberately skips your added rows so the count it reports is
  // exactly what was asked for.
  const transactions = rows ? inflate(ledger, rows) : [...ledger.transactions, ...local]
  const t1 = performance.now()

  const payload = {
    transactions: arrow.tableToIPC(transactionsTable(transactions), 'stream'),
    categories: arrow.tableToIPC(
      arrow.tableFromArrays({
        id: ledger.categories.map((c) => c.id),
        name: ledger.categories.map((c) => c.name),
        kind: ledger.categories.map((c) => c.kind),
      }),
      'stream',
    ),
    merchants: arrow.tableToIPC(
      arrow.tableFromArrays({
        id: ledger.merchants.map((m) => m.id),
        canonical_name: ledger.merchants.map((m) => m.canonical_name),
        country: ledger.merchants.map((m) => m.country),
      }),
      'stream',
    ),
  }

  return {
    ...payload,
    rows: transactions.length,
    generateMs: Math.round(t1 - t0),
    buildMs: Math.round(performance.now() - t1),
  }
}
