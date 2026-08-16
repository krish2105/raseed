import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { TABLES, SYNC_COLUMNS, syncedTables, type ColumnType } from './contract'
import * as sqlite from './sqlite'
import * as pg from './pg'

/**
 * The whole point of this file. Two hand-maintained schemas drift silently; this fails the
 * moment sqlite.ts and pg.ts disagree with the contract or with each other.
 *
 * It introspects the real Drizzle column objects rather than re-reading the source, so a
 * wrong column helper (`text` where `integer` was meant) is caught, not just a typo.
 */

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

interface ColumnFacts {
  name: string
  notNull: boolean
  primary: boolean
  columnType: string
}

function factsFor(mod: Record<string, unknown>, table: string): Record<string, ColumnFacts> {
  const drizzleTable = mod[camel(table)]
  if (!drizzleTable) throw new Error(`no exported table for "${table}"`)
  const columns = getTableColumns(drizzleTable as never) as Record<
    string,
    { name: string; notNull: boolean; primary: boolean; columnType: string }
  >
  const out: Record<string, ColumnFacts> = {}
  for (const col of Object.values(columns)) {
    out[col.name] = {
      name: col.name,
      notNull: col.notNull,
      primary: col.primary,
      columnType: col.columnType,
    }
  }
  return out
}

// The one legitimate difference between the two dialects: how a contract type is stored.
const EXPECTED_TYPE: Record<ColumnType, { sqlite: string; pg: string }> = {
  text: { sqlite: 'SQLiteText', pg: 'PgText' },
  integer: { sqlite: 'SQLiteInteger', pg: 'PgBigInt53' },
  real: { sqlite: 'SQLiteReal', pg: 'PgDoublePrecision' },
  boolean: { sqlite: 'SQLiteBoolean', pg: 'PgBoolean' },
  timestamp: { sqlite: 'SQLiteTimestamp', pg: 'PgTimestamp' },
  uuid: { sqlite: 'SQLiteText', pg: 'PgUUID' },
  json: { sqlite: 'SQLiteTextJson', pg: 'PgJsonb' },
}

const tableNames = Object.keys(TABLES)

describe('contract coverage', () => {
  it('every contract table exists in both dialects', () => {
    for (const table of tableNames) {
      expect(sqlite[camel(table) as keyof typeof sqlite], `sqlite.ts missing ${table}`).toBeDefined()
      expect(pg[camel(table) as keyof typeof pg], `pg.ts missing ${table}`).toBeDefined()
    }
  })

  it('neither dialect exports a table the contract does not declare', () => {
    const expected = new Set(tableNames.map(camel))
    for (const [mod, name] of [
      [sqlite, 'sqlite.ts'],
      [pg, 'pg.ts'],
    ] as const) {
      for (const key of Object.keys(mod)) {
        expect(expected.has(key), `${name} exports "${key}", absent from contract.ts`).toBe(true)
      }
    }
  })
})

describe.each(tableNames)('%s', (table) => {
  const spec = TABLES[table]!
  const s = factsFor(sqlite as Record<string, unknown>, table)
  const p = factsFor(pg as Record<string, unknown>, table)
  const contractColumns = Object.keys(spec.columns)

  it('sqlite and pg expose identical column names', () => {
    expect(Object.keys(s).sort()).toEqual(Object.keys(p).sort())
  })

  it('columns match the contract exactly', () => {
    expect(Object.keys(s).sort()).toEqual([...contractColumns].sort())
  })

  it.each(contractColumns)('%s: nullability and key match the contract in both dialects', (col) => {
    const expectedNotNull = spec.columns[col]!.nullable === false
    const expectedPrimary = spec.columns[col]!.primaryKey === true

    expect(s[col]?.notNull, `sqlite ${table}.${col} nullability`).toBe(expectedNotNull)
    expect(p[col]?.notNull, `pg ${table}.${col} nullability`).toBe(expectedNotNull)
    expect(s[col]?.primary, `sqlite ${table}.${col} primary key`).toBe(expectedPrimary)
    expect(p[col]?.primary, `pg ${table}.${col} primary key`).toBe(expectedPrimary)
  })

  it.each(contractColumns)('%s: storage type is the right mapping of the contract type', (col) => {
    const expected = EXPECTED_TYPE[spec.columns[col]!.type]
    expect(s[col]?.columnType, `sqlite ${table}.${col}`).toBe(expected.sqlite)
    expect(p[col]?.columnType, `pg ${table}.${col}`).toBe(expected.pg)
  })
})

describe('sync invariants', () => {
  it.each(syncedTables())('%s carries user_id, updated_at and deleted', (table) => {
    for (const col of Object.keys(SYNC_COLUMNS)) {
      expect(TABLES[table]?.columns[col], `${table} is missing ${col}`).toBeDefined()
    }
  })

  it.each(syncedTables())('%s has all three sync columns NOT NULL', (table) => {
    const s = factsFor(sqlite as Record<string, unknown>, table)
    for (const col of Object.keys(SYNC_COLUMNS)) {
      expect(s[col]?.notNull, `${table}.${col} must be NOT NULL`).toBe(true)
    }
  })
})
