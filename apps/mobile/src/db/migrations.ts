import { TABLES, spendPredicate } from '@raseed/schema/contract'
import { getConnection } from './client'

/**
 * Migrations, applied on first launch and idempotent thereafter.
 *
 * The DDL is generated from `@raseed/schema`'s contract rather than hand-written, so the
 * device schema cannot drift from the Postgres one — the parity test covers the Drizzle
 * definitions, and both dialects are emitted from the same source.
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

const DEFAULTS: Record<string, string> = {
  deleted: ' DEFAULT 0',
  updated_at: ' DEFAULT (unixepoch() * 1000)',
}

function createTableSql(table: string): string {
  const spec = TABLES[table]!
  const columns = Object.entries(spec.columns).map(([name, c]) => {
    let line = `  ${name} ${SQLITE_TYPE[c.type]}`
    if (c.primaryKey) line += ' PRIMARY KEY'
    if (c.nullable === false) line += ' NOT NULL'
    if (DEFAULTS[name]) line += DEFAULTS[name]
    // CHECK constraints mirror the pg migration so an invalid txn_type is rejected on
    // device too, not only on the server.
    if (c.enumValues) {
      line += ` CHECK (${name} IN (${c.enumValues.map((v) => `'${v}'`).join(', ')}))`
    }
    return line
  })
  return `CREATE TABLE IF NOT EXISTS ${table} (\n${columns.join(',\n')}\n);`
}

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_txn_time ON transactions(occurred_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_txn_type ON transactions(txn_type, status);',
  'CREATE INDEX IF NOT EXISTS idx_txn_merch ON transactions(merchant_id, occurred_at);',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_norm ON merchant_aliases(alias_norm);',
  'CREATE INDEX IF NOT EXISTS idx_fx_lookup ON fx_rates(base, quote, as_of DESC);',
]

/**
 * `v_spend` — the spend predicate, defined exactly once in the contract and rendered here
 * for SQLite. Never inline this filter in a screen or a query.
 *
 * SQLite has no security_invoker; there is one user per device, so there is nothing to
 * scope. The Postgres twin needs it and has it.
 */
const V_SPEND = `CREATE VIEW IF NOT EXISTS v_spend AS
SELECT * FROM transactions
WHERE ${spendPredicate('transactions').replaceAll('deleted = false', 'deleted = 0')};`

export function migrate(): void {
  const db = getConnection()

  db.executeSync('PRAGMA journal_mode = WAL;')
  db.executeSync('PRAGMA foreign_keys = ON;')

  for (const table of Object.keys(TABLES)) db.executeSync(createTableSql(table))
  for (const index of INDEXES) db.executeSync(index)
  db.executeSync(V_SPEND)
}

/** Drops everything. Used by the reset action and by tests. */
export function dropAll(): void {
  const db = getConnection()
  db.executeSync('DROP VIEW IF EXISTS v_spend;')
  for (const table of Object.keys(TABLES)) db.executeSync(`DROP TABLE IF EXISTS ${table};`)
}
