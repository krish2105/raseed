import { IOS_LIBRARY_PATH, isSQLCipher, open, type DB } from '@op-engineering/op-sqlite'
import { drizzle, type OPSQLiteDatabase } from 'drizzle-orm/op-sqlite'
import * as schema from '@raseed/schema/sqlite'
import { databaseKey } from './encryption'
import { migrateToEncrypted, type MigrationResult } from './migrateToEncrypted'

/**
 * The device database. SQLite is the source of truth — sync is a background reconciler,
 * and the app is fully functional with Supabase unreachable. Airplane mode is a supported
 * state, not a degraded one.
 *
 * op-sqlite is JSI: queries are synchronous and do not cross the bridge, which matters
 * because every screen here runs analytics SQL.
 */
/**
 * The encrypted database, and the plaintext one it replaced.
 *
 * Two names rather than one file that changes format in place. A migration that writes over its
 * own source has no state in which both copies exist, which is precisely the state the
 * verification needs — count both sides, then remove the original.
 */
export const DB_NAME = 'raseed-enc.db'
export const PLAINTEXT_DB_NAME = 'raseed.db'

let connection: DB | null = null
let database: OPSQLiteDatabase<typeof schema> | null = null

/**
 * Whether this build actually encrypts.
 *
 * `isSQLCipher()` asks the native module which SQLite it was compiled against, rather than
 * trusting `package.json`. Those can disagree — a `pod install` that did not rerun after the
 * flag changed produces a binary that ignores `encryptionKey` entirely and writes a plaintext
 * file while the JavaScript believes otherwise. That is the worst possible failure for this
 * feature, and it is invisible unless something asks the binary directly.
 */
export function encryptionAvailable(): boolean {
  try {
    return isSQLCipher()
  } catch {
    return false
  }
}

export function getConnection(): DB {
  if (connection) return connection

  const key = encryptionAvailable() ? databaseKey() : null
  if (!key) {
    // No SQLCipher, or no keychain. Open the plaintext file under its original name so an
    // unencrypted build keeps working on a device that has one, rather than silently starting
    // an empty ledger next to the real one.
    connection = open({ name: PLAINTEXT_DB_NAME })
    return connection
  }

  connection = open({ name: DB_NAME, encryptionKey: key })
  return connection
}

/**
 * Move a pre-encryption ledger across, if there is one.
 *
 * Called before the first query. The check is *empirical* rather than a flag: open the old file
 * without a key and see whether it has tables. A stored "already migrated" boolean is a claim
 * about the filesystem that the filesystem never agreed to, and it goes wrong the first time
 * someone restores a backup.
 *
 * Returns what happened so the caller can log it and the privacy screen can report it.
 */
export function migratePlaintextIfPresent(): MigrationResult {
  const key = encryptionAvailable() ? databaseKey() : null
  if (!key) return { status: 'nothing-to-do', verified: {} }

  let plain: DB | null = null
  try {
    plain = open({ name: PLAINTEXT_DB_NAME })
    const tables = plain.executeSync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transactions'",
    ).rows
    if (tables.length === 0) {
      plain.close()
      return { status: 'nothing-to-do', verified: {} }
    }
  } catch {
    // Opening it unencrypted failed, which means it is not a plaintext database — either it
    // does not exist or it is already the encrypted one. Either way there is nothing to move.
    plain?.close()
    return { status: 'nothing-to-do', verified: {} }
  }

  const result = migrateToEncrypted({
    plain,
    /*
     * An absolute path, not a name.
     *
     * `open({ name })` resolves against op-sqlite's own directory, but `ATTACH DATABASE ?`
     * is plain SQLite and resolves against the process working directory — which on iOS is
     * the app bundle, not the Library folder. The first run of this created a perfectly
     * valid, perfectly encrypted, perfectly empty database somewhere nobody would look, while
     * the real ledger sat untouched next door. Verified by file size: 4KB against 176KB.
     */
    encryptedPath: `${IOS_LIBRARY_PATH}/${DB_NAME}`,
    key,
    removePlaintext: () => {
      // `moveAssetsDatabase` and friends are not the right tool; dropping every table empties
      // the plaintext file in place. The file remains, containing nothing, which is a strictly
      // better outcome than an orphaned readable copy if the unlink were to fail.
      const names = plain!
        .executeSync("SELECT name FROM sqlite_master WHERE type = 'table'")
        .rows.map((r) => (r as { name: string }).name)
      for (const name of names) {
        if (name.startsWith('sqlite_')) continue
        try {
          plain!.executeSync(`DROP TABLE IF EXISTS "${name}"`)
        } catch {
          // Best effort; the encrypted copy is already verified at this point.
        }
      }
      plain!.executeSync('VACUUM')
    },
  })

  plain.close()
  return result
}

/**
 * What the app can honestly claim about the file on disk.
 *
 * Three states, and the middle one is the reason this is not a boolean: the build supports
 * encryption but the keychain would not give up a key, so the database opened unencrypted. The
 * privacy screen says which of the three is true rather than a reassuring word that might not
 * be earned.
 */
export function encryptionState(): 'encrypted' | 'unavailable' | 'no-key' {
  if (!encryptionAvailable()) return 'unavailable'
  return databaseKey() === null ? 'no-key' : 'encrypted'
}

export function getDb(): OPSQLiteDatabase<typeof schema> {
  database ??= drizzle(getConnection(), { schema })
  return database
}

/** Test/reset helper: closes the handle so a fresh open re-reads from disk. */
export function closeDb(): void {
  connection?.close()
  connection = null
  database = null
}

export { schema }
