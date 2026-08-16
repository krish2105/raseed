import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import { selectSpend, spendPredicate, type SpendRow } from './contract'

/**
 * The spend predicate has two renderings. This proves they cannot disagree.
 *
 * `CLAUDE.md` requires the predicate be "defined exactly once" because two places disagreeing
 * about what counts as spend is where every wrong number in a finance dashboard comes from.
 * One rule genuinely needs two expressions — SQL for DuckDB and SQLite, TypeScript for the web
 * demo path that renders before DuckDB has loaded — so the invariant is enforced here instead
 * of asserted in a comment: both run over the same adversarial rows and must select the same
 * ids, exactly.
 *
 * Postgres stands in for the SQL side. The predicate text is dialect-neutral (no Postgres-only
 * syntax), and it is the same string `spendViewSql` hands to all three engines.
 */

/**
 * Every clause of the predicate gets a row that violates it and nothing else, so a dropped
 * clause fails on exactly one id rather than sliding through.
 */
const ROWS: (SpendRow & { note: string })[] = [
  { id: 'keep-1', txn_type: 'spend', status: 'confirmed', reversal_of_id: null, deleted: false, note: 'ordinary spend' },
  { id: 'keep-2', txn_type: 'spend', status: 'confirmed', reversal_of_id: null, deleted: false, note: 'second ordinary spend' },
  { id: 'drop-type', txn_type: 'income', status: 'confirmed', reversal_of_id: null, deleted: false, note: 'income is not spend' },
  { id: 'drop-transfer', txn_type: 'transfer', status: 'confirmed', reversal_of_id: null, deleted: false, note: 'a transfer moves money, it does not spend it' },
  { id: 'drop-pending', txn_type: 'spend', status: 'pending', reversal_of_id: null, deleted: false, note: 'unconfirmed' },
  { id: 'drop-void', txn_type: 'spend', status: 'void', reversal_of_id: null, deleted: false, note: 'voided' },
  { id: 'drop-deleted', txn_type: 'spend', status: 'confirmed', reversal_of_id: null, deleted: true, note: 'soft-deleted' },
  // The reversal pair: the refund itself is not spend, and the row it reverses stops being
  // spend too. Counting either is the classic refund double-count.
  { id: 'drop-reversed', txn_type: 'spend', status: 'confirmed', reversal_of_id: null, deleted: false, note: 'a failed debit, later refunded' },
  { id: 'drop-reversal', txn_type: 'spend', status: 'confirmed', reversal_of_id: 'drop-reversed', deleted: false, note: 'the refund' },
]

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table transactions (
      id text primary key,
      txn_type text not null,
      status text not null,
      reversal_of_id text,
      deleted boolean not null
    );
  `)
  for (const r of ROWS) {
    await db.query(
      'insert into transactions (id, txn_type, status, reversal_of_id, deleted) values ($1,$2,$3,$4,$5)',
      [r.id, r.txn_type, r.status, r.reversal_of_id, r.deleted],
    )
  }
}, 60_000)

async function viaSql(): Promise<string[]> {
  const res = await db.query<{ id: string }>(
    `select id from transactions where ${spendPredicate()} order by id`,
  )
  return res.rows.map((r) => r.id)
}

function viaTypeScript(): string[] {
  return selectSpend(ROWS)
    .map((r) => r.id)
    .sort()
}

describe('spend predicate parity', () => {
  it('selects the same rows in SQL and in TypeScript', async () => {
    expect(await viaSql()).toEqual(viaTypeScript())
  })

  it('selects exactly the two ordinary spends', async () => {
    expect(await viaSql()).toEqual(['keep-1', 'keep-2'])
  })

  /**
   * The one that matters most. A refund and the debit it reverses net to zero, so counting
   * either inflates spend — and it is the failure people notice last, because the total still
   * looks plausible.
   */
  it('excludes both halves of a reversal pair', async () => {
    const ids = viaTypeScript()
    expect(ids).not.toContain('drop-reversed')
    expect(ids).not.toContain('drop-reversal')
  })

  it('drops each excluded row for its own reason, not by accident', async () => {
    const kept = new Set(viaTypeScript())
    for (const r of ROWS.filter((x) => x.id.startsWith('drop-'))) {
      expect(kept.has(r.id), `${r.id} (${r.note}) should not count as spend`).toBe(false)
    }
  })

  /** An empty ledger is a real state on first launch, not an edge case. */
  it('handles an empty ledger', () => {
    expect(selectSpend([])).toEqual([])
  })
})
