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

describe('recording a refund', () => {
  /**
   * The behaviour `recordRefund` exists for, expressed as SQL so it is testable without the
   * native module: writing the reversal leg with `reversal_of_id` already set removes BOTH
   * rows from spend on the same statement. There is no window in which the refund has landed
   * but the original still counts.
   */
  it('removes both the charge and its refund from v_spend at once', () => {
    const original = insertTxn({ amount_minor: 45_000, home_amount_minor: 45_000 })
    expect(db.prepare('SELECT COUNT(*) c FROM v_spend').get()).toMatchObject({ c: 1 })

    insertTxn({
      direction: 'in',
      amount_minor: 45_000,
      home_amount_minor: 45_000,
      reversal_of_id: original.id,
      raw_text: 'REFUND TEST',
      note: 'refund',
    })

    expect(db.prepare('SELECT COUNT(*) c FROM v_spend').get()).toMatchObject({ c: 0 })
  })

  /** A partial refund still nets the pair out; the amounts need not match. */
  it('nets out a partial refund too', () => {
    const original = insertTxn({ amount_minor: 100_000, home_amount_minor: 100_000 })
    insertTxn({
      direction: 'in',
      amount_minor: 30_000,
      home_amount_minor: 30_000,
      reversal_of_id: original.id,
    })
    expect(db.prepare('SELECT COUNT(*) c FROM v_spend').get()).toMatchObject({ c: 0 })
  })

  it('leaves other transactions alone', () => {
    const original = insertTxn()
    const untouched = insertTxn()
    insertTxn({ direction: 'in', reversal_of_id: original.id })
    const ids = db.prepare('SELECT id FROM v_spend').all().map((r) => (r as { id: string }).id)
    expect(ids).toEqual([untouched.id])
  })
})

describe('the spend predicate text', () => {
  it('is the same string the migration renders', () => {
    expect(spendViewSql('transactions', 'v_spend', false)).toContain(spendPredicate())
  })
})

/**
 * The two tables P6 turns on. Both were declared in the contract and created on every device
 * from the first launch, and neither had ever been written to.
 */
describe('rating a transaction', () => {
  const NOW = 1_755_300_000_000

  /** The SQL from `rateTransaction`, verbatim apart from the parameters. */
  function rate(transactionId: string, score: number, at: number) {
    db.prepare(
      `INSERT INTO worth_scores (transaction_id, score, rated_at, user_id, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(transaction_id) DO UPDATE SET
         score = excluded.score, rated_at = excluded.rated_at,
         updated_at = excluded.updated_at, deleted = 0`,
    ).run(transactionId, score, at, 'local-user', at)
  }

  function scores(): { transaction_id: string; score: number }[] {
    return db
      .prepare('SELECT transaction_id, score FROM worth_scores WHERE deleted = 0')
      .all() as unknown as { transaction_id: string; score: number }[]
  }

  it('records an answer', () => {
    const txn = insertTxn()
    rate(txn.id as string, -1, NOW)
    expect(scores()).toEqual([{ transaction_id: txn.id, score: -1 }])
  })

  it('lets you change your mind without leaving two answers behind', () => {
    const txn = insertTxn()
    rate(txn.id as string, -1, NOW)
    rate(txn.id as string, 1, NOW + 1000)
    expect(scores()).toEqual([{ transaction_id: txn.id, score: 1 }])
  })

  /** Undo is a soft delete, like every other removal in this schema. */
  it('clears a rating without dropping the row', () => {
    const txn = insertTxn()
    rate(txn.id as string, 0, NOW)
    db.prepare('UPDATE worth_scores SET deleted = 1, updated_at = ? WHERE transaction_id = ?').run(
      NOW + 1,
      txn.id as string,
    )

    expect(scores()).toEqual([])
    expect(db.prepare('SELECT COUNT(*) c FROM worth_scores').get()).toMatchObject({ c: 1 })
  })

  /**
   * The `deleted = 0` in the upsert's UPDATE clause. Without it a cleared rating can never be
   * given again — the row revives with its tombstone still set and stays invisible for ever.
   */
  it('revives a cleared rating when you answer again', () => {
    const txn = insertTxn()
    rate(txn.id as string, -1, NOW)
    db.prepare('UPDATE worth_scores SET deleted = 1 WHERE transaction_id = ?').run(txn.id as string)
    rate(txn.id as string, 1, NOW + 2000)
    expect(scores()).toEqual([{ transaction_id: txn.id, score: 1 }])
  })
})

describe('the nudge budget on the device', () => {
  const NOW = 1_755_300_000_000
  const DAY = 86_400_000
  let n = 0

  function show(kind: string, sentAt: number) {
    db.prepare(
      `INSERT INTO nudges
         (id, kind, payload, score, created_at, sent_at, acted, user_id, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0)`,
    ).run(`n${++n}`, kind, '{"title":"t","body":"b"}', 0.5, sentAt, sentAt, 'local-user', sentAt)
  }

  function sentSince(since: number): number {
    return (
      db
        .prepare(
          'SELECT COUNT(*) c FROM nudges WHERE deleted = 0 AND sent_at IS NOT NULL AND sent_at >= ?',
        )
        .get(since) as { c: number }
    ).c
  }

  /**
   * The count the cap is computed from. A rolling window, not a calendar week — four on Sunday
   * and four on Monday is eight in two days and satisfies "four a week" on both counts.
   */
  it('counts only what was shown inside the rolling window', () => {
    show('corridor', NOW - 8 * DAY)
    show('runway', NOW - 6 * DAY)
    show('regret:cat-food', NOW - DAY)
    expect(sentSince(NOW - 7 * DAY)).toBe(2)
  })

  it('reports when each kind last appeared, which is what silences a repeat', () => {
    show('corridor', NOW - 20 * DAY)
    show('corridor', NOW - 3 * DAY)
    show('runway', NOW - 5 * DAY)

    const last = new Map(
      (
        db
          .prepare(
            `SELECT kind, MAX(sent_at) AS last FROM nudges
              WHERE deleted = 0 AND sent_at IS NOT NULL AND sent_at >= ?
              GROUP BY kind`,
          )
          .all(NOW - 30 * DAY) as unknown as { kind: string; last: number }[]
      ).map((r) => [r.kind, r.last]),
    )

    expect(last.get('corridor')).toBe(NOW - 3 * DAY)
    expect(last.get('runway')).toBe(NOW - 5 * DAY)
  })

  /** Acting marks the one you were looking at, not every corridor nudge you have ever seen. */
  it('marks only the most recent of a kind as acted on', () => {
    show('corridor', NOW - 20 * DAY)
    show('corridor', NOW - 3 * DAY)

    db.prepare(
      `UPDATE nudges SET acted = 1, updated_at = ?
        WHERE kind = ? AND deleted = 0 AND sent_at IS NOT NULL
        AND sent_at = (SELECT MAX(sent_at) FROM nudges WHERE kind = ? AND deleted = 0)`,
    ).run(NOW, 'corridor', 'corridor')

    const acted = db
      .prepare('SELECT sent_at FROM nudges WHERE acted = 1')
      .all() as unknown as { sent_at: number }[]
    expect(acted).toEqual([{ sent_at: NOW - 3 * DAY }])
  })
})

/**
 * Splits that run both ways.
 *
 * The sign on `owed_minor` carries the direction: positive means they owe you, negative means
 * you owe them. Everything else — the grouping, the `<> 0` filter, settlement — was already
 * written to handle a signed number, which is why this direction cost a sign rather than a
 * schema change.
 */
describe('splits in both directions', () => {
  const NOW = 1_755_300_000_000

  function person(id: string, name: string) {
    db.prepare(
      `INSERT INTO people (id, name, currency, user_id, updated_at, deleted)
       VALUES (?, ?, 'INR', 'local-user', 0, 0)`,
    ).run(id, name)
  }

  function split(id: string, txnId: string, personId: string, owedMinor: number) {
    db.prepare(
      `INSERT INTO splits (id, transaction_id, method, share_link_id, user_id, updated_at, deleted)
       VALUES (?, ?, 'share', NULL, 'local-user', ?, 0)`,
    ).run(id, txnId, NOW)
    db.prepare(
      `INSERT INTO split_participants
         (id, split_id, person_id, owed_minor, currency, settled_txn_id, user_id, updated_at, deleted)
       VALUES (?, ?, ?, ?, 'INR', NULL, 'local-user', ?, 0)`,
    ).run(`${id}-p`, id, personId, owedMinor, NOW)
  }

  /** The SQL from `outstandingByPerson`, verbatim. */
  function outstanding(): { person_id: string; owed: number }[] {
    return db
      .prepare(
        `SELECT sp.person_id, SUM(sp.owed_minor) AS owed
           FROM split_participants sp
           JOIN people p ON p.id = sp.person_id
          WHERE sp.deleted = 0 AND sp.settled_txn_id IS NULL AND p.deleted = 0
          GROUP BY sp.person_id, sp.currency
         HAVING SUM(sp.owed_minor) <> 0
          ORDER BY owed DESC`,
      )
      .all() as unknown as { person_id: string; owed: number }[]
  }

  it('shows a debt you owe as a negative balance', () => {
    person('p-rahul', 'Rahul')
    const txn = insertTxn({ amount_minor: 100_000, home_amount_minor: 100_000 })
    split('s1', txn.id as string, 'p-rahul', -100_000)

    expect(outstanding()).toEqual([{ person_id: 'p-rahul', owed: -100_000 }])
  })

  /** Your share is spend the moment it happens, whoever handed over the card. */
  it('counts your share as spend even though someone else paid', () => {
    person('p-rahul', 'Rahul')
    const txn = insertTxn({ amount_minor: 100_000, home_amount_minor: 100_000 })
    split('s1', txn.id as string, 'p-rahul', -100_000)

    expect(db.prepare('SELECT COUNT(*) c FROM v_spend').get()).toMatchObject({ c: 1 })
  })

  /** Two debts in opposite directions with one person net off, rather than listing twice. */
  it('nets opposite directions with the same person', () => {
    person('p-asha', 'Asha')
    const a = insertTxn()
    const b = insertTxn()
    split('s1', a.id as string, 'p-asha', 60_000) // she owes you
    split('s2', b.id as string, 'p-asha', -25_000) // you owe her

    expect(outstanding()).toEqual([{ person_id: 'p-asha', owed: 35_000 }])
  })

  /** And when they cancel exactly, nobody owes anybody and the row disappears. */
  it('drops a person whose debts cancel out', () => {
    person('p-asha', 'Asha')
    const a = insertTxn()
    const b = insertTxn()
    split('s1', a.id as string, 'p-asha', 40_000)
    split('s2', b.id as string, 'p-asha', -40_000)

    expect(outstanding()).toEqual([])
  })

  it('settles a debt you owe the same way as one owed to you', () => {
    person('p-rahul', 'Rahul')
    const txn = insertTxn()
    split('s1', txn.id as string, 'p-rahul', -100_000)

    db.prepare(
      `UPDATE split_participants SET settled_txn_id = 'settled-by-hand', updated_at = ?
        WHERE person_id = ? AND settled_txn_id IS NULL AND deleted = 0`,
    ).run(NOW, 'p-rahul')

    expect(outstanding()).toEqual([])
  })
})
