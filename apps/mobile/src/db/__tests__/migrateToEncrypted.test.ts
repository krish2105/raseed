import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'

import { TABLES } from '@raseed/schema/contract'

import { migrateToEncrypted } from '../migrateToEncrypted'

/**
 * The plaintext-to-encrypted migration, against a real SQLite.
 *
 * `node:sqlite` is not SQLCipher, so `ATTACH ... KEY` and `sqlcipher_export()` do not exist
 * here. That is stated rather than papered over: what this proves is the **decision logic** —
 * that an empty database is left alone, that counts are compared on both sides before anything
 * is removed, and above all that a mismatch or a failure leaves the original file exactly where
 * it was. What it cannot prove is that SQLCipher's own export works, which is SQLCipher's job
 * and is verified on a device.
 *
 * The order is the whole point. Copy, verify, then delete. A migration that deletes first and
 * verifies after loses data exactly once — on the run where something goes wrong.
 */

const SQLITE_TYPE: Record<string, string> = {
  text: 'TEXT', integer: 'INTEGER', real: 'REAL', boolean: 'INTEGER',
  timestamp: 'INTEGER', uuid: 'TEXT', json: 'TEXT',
}

let plain: DatabaseSync
let removed: boolean

/** Stands in for the encrypted attachment, so the copy has somewhere real to land. */
function attachShadow(db: DatabaseSync) {
  db.exec('ATTACH DATABASE ":memory:" AS encrypted')
  for (const [name, spec] of Object.entries(TABLES)) {
    const cols = Object.entries(spec.columns).map(([c, def]) => `${c} ${SQLITE_TYPE[def.type]}`)
    db.exec(`CREATE TABLE encrypted.${name} (${cols.join(', ')})`)
  }
}

beforeEach(() => {
  plain = new DatabaseSync(':memory:')
  removed = false
  for (const [name, spec] of Object.entries(TABLES)) {
    const cols = Object.entries(spec.columns).map(([c, def]) => `${c} ${SQLITE_TYPE[def.type]}`)
    plain.exec(`CREATE TABLE ${name} (${cols.join(', ')})`)
  }
})

/** A handle shaped like op-sqlite's, with the two SQLCipher statements stubbed. */
function handle(options: { copy: 'faithful' | 'lossy' | 'throws' }) {
  return {
    executeSync: (sql: string, params?: unknown[]) => {
      if (sql.startsWith('ATTACH')) {
        expect(params, 'the key and path must be bound, never interpolated').toHaveLength(2)
        attachShadow(plain)
        return { rows: [] }
      }
      if (sql.includes('sqlcipher_export')) {
        if (options.copy === 'throws') throw new Error('disk full')
        const rows = plain.prepare('SELECT * FROM accounts').all() as Record<string, unknown>[]
        // A lossy copy drops the last row, which is what the verification has to catch.
        const toCopy = options.copy === 'lossy' ? rows.slice(0, -1) : rows
        for (const r of toCopy) {
          const keys = Object.keys(r)
          plain
            .prepare(
              `INSERT INTO encrypted.accounts (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
            )
            .run(...(Object.values(r) as never[]))
        }
        return { rows: [] }
      }
      if (sql.startsWith('DETACH')) return { rows: [] }
      return { rows: plain.prepare(sql).all() as unknown[] }
    },
  }
}

function seedAccounts(n: number) {
  for (let i = 0; i < n; i += 1) {
    plain
      .prepare(
        `INSERT INTO accounts (id, name, kind, currency, opening_minor, is_cash, user_id, updated_at, deleted)
         VALUES (?, ?, 'bank', 'INR', 0, 0, 'local-user', 0, 0)`,
      )
      .run(`a${i}`, `Account ${i}`)
  }
}

describe('migrating a plaintext ledger into an encrypted one', () => {
  it('leaves an empty database alone rather than risking it', () => {
    const result = migrateToEncrypted({
      plain: handle({ copy: 'faithful' }),
      encryptedPath: '/tmp/enc.db',
      key: 'k',
      removePlaintext: () => { removed = true },
    })
    expect(result.status).toBe('nothing-to-do')
    expect(removed, 'an empty file must not be deleted either').toBe(false)
  })

  it('copies, verifies every table, and only then removes the original', () => {
    seedAccounts(3)
    const result = migrateToEncrypted({
      plain: handle({ copy: 'faithful' }),
      encryptedPath: '/tmp/enc.db',
      key: 'k',
      removePlaintext: () => { removed = true },
    })

    expect(result.status).toBe('migrated')
    expect(result.verified.accounts).toEqual({ before: 3, after: 3 })
    // Every table in the contract was checked, not just the one with rows in it.
    expect(Object.keys(result.verified).sort()).toEqual(Object.keys(TABLES).sort())
    expect(removed).toBe(true)
  })

  /** The case this file exists for. */
  it('keeps the original when the copy loses a row', () => {
    seedAccounts(3)
    const result = migrateToEncrypted({
      plain: handle({ copy: 'lossy' }),
      encryptedPath: '/tmp/enc.db',
      key: 'k',
      removePlaintext: () => { removed = true },
    })

    expect(result.status).toBe('failed')
    expect(result.reason).toContain('accounts 3→2')
    expect(removed, 'a partial copy plus a deleted original is the worst outcome there is').toBe(false)
  })

  it('keeps the original when the copy throws', () => {
    seedAccounts(2)
    const result = migrateToEncrypted({
      plain: handle({ copy: 'throws' }),
      encryptedPath: '/tmp/enc.db',
      key: 'k',
      removePlaintext: () => { removed = true },
    })

    expect(result.status).toBe('failed')
    expect(result.reason).toContain('disk full')
    expect(removed).toBe(false)
  })
})
