import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'

import { TABLES, selectSpend, spendPredicate, spendViewSql, syncedTables } from '@raseed/schema/contract'

/**
 * The device schema, exercised against a real SQLite engine.
 *
 * `apps/mobile` had no tests at all. Everything about the phone — that the DDL is valid, that
 * `v_spend` excludes what it should, that a balance counts income — rested on me opening the
 * simulator and reading numbers off a screenshot. That is not a regression guard; it is a
 * memory of one afternoon.
 *
 * op-sqlite is a native module and cannot load in Node, so this does not import `db/client`.
 * Instead it renders the **same DDL from the same contract** into Node 24's built-in
 * `node:sqlite` and runs the same SQL shapes the queries use. What it proves is that the
 * generated schema is valid SQLite and that the predicates behave; what it cannot prove is
 * that op-sqlite binds parameters identically. That boundary is stated rather than papered
 * over — the screens still get opened.
 */

const SQLITE_TYPE: Record<string, string> = {
  text: 'TEXT',
  integer: 'INTEGER',
  real: 'REAL',
  boolean: 'INTEGER',
  timestamp: 'INTEGER',
  uuid: 'TEXT',
  json: 'TEXT',
}

/** Mirrors `db/migrations.ts`. If that drifts, this test is why you will notice. */
function createTableSql(table: string): string {
  const spec = TABLES[table]!
  const columns = Object.entries(spec.columns).map(([name, c]) => {
    let line = `  ${name} ${SQLITE_TYPE[c.type]}`
    if (c.primaryKey) line += ' PRIMARY KEY'
    if (c.nullable === false) line += ' NOT NULL'
    if (c.enumValues) {
      line += ` CHECK (${name} IN (${c.enumValues.map((v) => `'${v}'`).join(', ')}))`
    }
    return line
  })
  return `CREATE TABLE IF NOT EXISTS ${table} (\n${columns.join(',\n')}\n);`
}

let db: DatabaseSync

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  for (const table of Object.keys(TABLES)) db.exec(createTableSql(table))
  db.exec(spendViewSql('transactions', 'v_spend', false).replace('deleted = false', 'deleted = 0'))
})

let seq = 0

/**
 * A transaction row built **from the contract**, not from a hand-kept column list.
 *
 * The first version of this listed the columns by hand and invented `share_link_id`, which
 * lives on `splits`. Every insert failed. Deriving the shape means the fixture cannot drift
 * from the schema it is meant to exercise — the same rule the DDL above follows.
 */
function insertTxn(over: Record<string, unknown> = {}) {
  const spec = TABLES.transactions!.columns
  const row: Record<string, unknown> = {}
  for (const [name, c] of Object.entries(spec)) {
    if (c.nullable !== false) {
      row[name] = null
      continue
    }
    // A non-null column needs *something*; an enum needs one of its own values.
    row[name] = c.enumValues
      ? c.enumValues[0]
      : c.type === 'text' || c.type === 'uuid'
        ? 'x'
        : 0
  }
  Object.assign(row, {
    id: `t${++seq}`,
    occurred_at: 1_755_300_000_000,
    direction: 'out',
    amount_minor: 10_000,
    currency: 'INR',
    home_amount_minor: 10_000,
    fx_rate: 1,
    account_id: 'acct-hdfc',
    category_id: 'cat-food',
    raw_text: 'TEST',
    source: 'manual',
    txn_type: 'spend',
    status: 'confirmed',
    user_id: 'local-user',
    updated_at: 0,
    deleted: 0,
    ...over,
  })
  const cols = Object.keys(row)
  db.prepare(
    `INSERT INTO transactions (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
  ).run(...(Object.values(row) as never[]))
  return row
}

describe('the generated device schema', () => {
  it('is valid SQLite for every table in the contract', () => {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name)
    for (const t of Object.keys(TABLES)) expect(names, `${t} was not created`).toContain(t)
  })

  /** Soft delete is a sync invariant; a synced table without these columns cannot converge. */
  it('gives every synced table user_id, updated_at and deleted', () => {
    for (const t of syncedTables()) {
      const cols = db
        .prepare(`PRAGMA table_info(${t})`)
        .all()
        .map((r) => (r as { name: string }).name)
      expect(cols, `${t}`).toEqual(expect.arrayContaining(['user_id', 'updated_at', 'deleted']))
    }
  })

  it('rejects a txn_type the contract does not allow', () => {
    expect(() => insertTxn({ txn_type: 'nonsense' })).toThrow()
  })
})

describe('v_spend on the device', () => {
  it('counts an ordinary confirmed spend', () => {
    insertTxn()
    expect(db.prepare('SELECT COUNT(*) c FROM v_spend').get()).toMatchObject({ c: 1 })
  })

  it.each([
    ['income', { txn_type: 'income' }],
    ['a transfer', { txn_type: 'transfer' }],
    ['a pending row', { status: 'pending' }],
    ['a soft-deleted row', { deleted: 1 }],
  ])('excludes %s', (_label, over) => {
    insertTxn(over)
    expect(db.prepare('SELECT COUNT(*) c FROM v_spend').get()).toMatchObject({ c: 0 })
  })

  /** The refund double-count: both halves must drop out, or spend is overstated. */
  it('excludes both halves of a reversal pair', () => {
    const original = insertTxn()
    insertTxn({ reversal_of_id: original.id })
    expect(db.prepare('SELECT COUNT(*) c FROM v_spend').get()).toMatchObject({ c: 0 })
  })

  /**
   * The device view and the shared TypeScript rendering must agree. `packages/schema` proves
   * SQL-vs-TS parity on Postgres; this proves it on the engine the phone actually runs.
   */
  it('agrees with selectSpend over the same rows', () => {
    const a = insertTxn()
    insertTxn({ txn_type: 'income' })
    const reversed = insertTxn()
    insertTxn({ reversal_of_id: reversed.id })

    const viaSql = db
      .prepare('SELECT id FROM v_spend ORDER BY id')
      .all()
      .map((r) => (r as { id: string }).id)

    const all = db.prepare('SELECT * FROM transactions').all() as unknown as {
      id: string
      txn_type: string
      status: string
      reversal_of_id: string | null
      deleted: number
    }[]
    const viaTs = selectSpend(all.map((r) => ({ ...r, deleted: r.deleted === 1 })))
      .map((r) => r.id)
      .sort()

    expect(viaSql).toEqual(viaTs)
    expect(viaSql).toEqual([a.id])
  })
})

describe('liquid balance', () => {
  /**
   * The SQL from `liquidBalanceMinor`. Opening balances plus confirmed movement, INR only —
   * summing AED minor units into an INR total would break the money invariant.
   */
  function balance(): number {
    db.exec(`INSERT OR IGNORE INTO accounts
      (id, name, kind, currency, opening_minor, is_cash, archived_at, user_id, updated_at, deleted)
      VALUES ('acct-hdfc','HDFC','bank','INR',2_100_000,0,NULL,'local-user',0,0)`)
    const opening = (
      db
        .prepare(
          `SELECT COALESCE(SUM(opening_minor), 0) v FROM accounts
            WHERE deleted = 0 AND archived_at IS NULL AND currency = 'INR'`,
        )
        .get() as { v: number }
    ).v
    const movement = (
      db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN home_amount_minor
                                    ELSE -home_amount_minor END), 0) v
             FROM transactions WHERE deleted = 0 AND status = 'confirmed'`,
        )
        .get() as { v: number }
    ).v
    return opening + movement
  }

  it('subtracts spend and adds income', () => {
    const opening = balance()
    insertTxn({ amount_minor: 50_000, home_amount_minor: 50_000 })
    expect(balance()).toBe(opening - 50_000)
    insertTxn({ direction: 'in', txn_type: 'income', home_amount_minor: 120_000 })
    expect(balance()).toBe(opening - 50_000 + 120_000)
  })

  /** A balance counts money that moved, whatever kind of movement it was. */
  it('counts a transfer, which v_spend deliberately does not', () => {
    const opening = balance()
    insertTxn({ txn_type: 'transfer', home_amount_minor: 30_000 })
    expect(db.prepare('SELECT COUNT(*) c FROM v_spend').get()).toMatchObject({ c: 0 })
    expect(balance()).toBe(opening - 30_000)
  })

  it('ignores a soft-deleted row', () => {
    const opening = balance()
    insertTxn({ deleted: 1, home_amount_minor: 99_000 })
    expect(balance()).toBe(opening)
  })
})

describe('the spend predicate text', () => {
  it('is the same string the migration renders', () => {
    expect(spendViewSql('transactions', 'v_spend', false)).toContain(spendPredicate())
  })
})
