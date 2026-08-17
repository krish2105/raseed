import { TABLES } from '@raseed/schema/contract'

/**
 * Move an existing plaintext ledger into an encrypted database, or refuse to.
 *
 * Turning SQLCipher on changes the file format, so a phone that already has `raseed.db` written
 * by the unencrypted build cannot simply open it with a key. The alternative to this file is
 * wiping on upgrade, and there is no flag that tells you whether the ledger you are about to
 * delete is seeded demo data or eight months of somebody's actual spending.
 *
 * **Nothing is deleted until the copy is verified.** The sequence is copy → count every table on
 * both sides → only then remove the original. A migration that deletes first and verifies after
 * is a migration that loses data exactly once, on the run where something goes wrong.
 *
 * SQLCipher provides `sqlcipher_export()` for precisely this, and using it rather than reading
 * rows into JS and writing them back matters: it runs inside SQLite, it copies the schema and
 * every row as one unit, and it cannot mangle a value on the way through a JavaScript number.
 */

export interface MigrationResult {
  readonly status: 'migrated' | 'nothing-to-do' | 'failed'
  /** Rows counted on each side, per table. Empty unless a migration ran. */
  readonly verified: Readonly<Record<string, { before: number; after: number }>>
  readonly reason?: string
}

/**
 * The slice of a database handle this needs.
 *
 * Params are `readonly (string | number | null)[]` rather than `unknown[]` so that op-sqlite's
 * own handle satisfies it structurally — a wider parameter type would make `DB` *not* assignable,
 * which is the contravariance rule doing exactly its job. The test's fake satisfies the same
 * shape, which is the whole point of taking a handle rather than opening one.
 */
interface MinimalDb {
  executeSync: (sql: string, params?: (string | number | null)[]) => { rows: unknown[] }
}

/**
 * Run the migration.
 *
 * Takes the two handles rather than opening them, so this is testable against any SQLite that
 * speaks the same interface — which is how it is tested at all, given SQLCipher itself needs a
 * device.
 */
export function migrateToEncrypted(input: {
  /** An open handle on the plaintext file. */
  readonly plain: MinimalDb
  /** The path SQLCipher should write to. */
  readonly encryptedPath: string
  readonly key: string
  /** Injected so the test can assert the exact statements rather than mock a filesystem. */
  readonly removePlaintext: () => void
}): MigrationResult {
  const tables = Object.keys(TABLES)

  const count = (db: MinimalDb, table: string, prefix = ''): number => {
    const rows = db.executeSync(`SELECT COUNT(*) AS n FROM ${prefix}${table}`).rows as {
      n: number
    }[]
    return rows[0]?.n ?? 0
  }

  const before: Record<string, number> = {}
  try {
    for (const table of tables) before[table] = count(input.plain, table)
  } catch (cause) {
    return {
      status: 'failed',
      verified: {},
      reason: `could not read the existing database: ${String(cause)}`,
    }
  }

  const rowsInTotal = Object.values(before).reduce((a, b) => a + b, 0)
  if (rowsInTotal === 0) {
    // An empty file is not worth migrating and not worth risking. The encrypted database will
    // be created fresh and the migrations will seed it, which is the same outcome with fewer
    // moving parts.
    return { status: 'nothing-to-do', verified: {} }
  }

  try {
    // ATTACH the destination with its key, then let SQLCipher copy itself across. The key is
    // bound rather than interpolated: a passphrase with a quote in it would otherwise end the
    // statement early and produce a database encrypted with a truncated key.
    input.plain.executeSync('ATTACH DATABASE ? AS encrypted KEY ?', [input.encryptedPath, input.key])
    input.plain.executeSync("SELECT sqlcipher_export('encrypted')")
  } catch (cause) {
    return { status: 'failed', verified: {}, reason: `the copy failed: ${String(cause)}` }
  }

  // Verify before destroying. Every table, both sides, exact counts.
  const verified: Record<string, { before: number; after: number }> = {}
  try {
    for (const table of tables) {
      verified[table] = { before: before[table] ?? 0, after: count(input.plain, table, 'encrypted.') }
    }
  } catch (cause) {
    return { status: 'failed', verified, reason: `could not verify the copy: ${String(cause)}` }
  }

  const mismatched = Object.entries(verified).filter(([, v]) => v.before !== v.after)
  if (mismatched.length > 0) {
    // The plaintext file is deliberately left alone. A partial copy plus a deleted original is
    // the one outcome worse than not migrating at all.
    return {
      status: 'failed',
      verified,
      reason: `row counts differ after the copy: ${mismatched
        .map(([t, v]) => `${t} ${v.before}→${v.after}`)
        .join(', ')}`,
    }
  }

  input.plain.executeSync('DETACH DATABASE encrypted')
  input.removePlaintext()

  return { status: 'migrated', verified }
}
