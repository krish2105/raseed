import { open, type DB } from '@op-engineering/op-sqlite'
import { drizzle, type OPSQLiteDatabase } from 'drizzle-orm/op-sqlite'
import * as schema from '@raseed/schema/sqlite'

/**
 * The device database. SQLite is the source of truth — sync is a background reconciler,
 * and the app is fully functional with Supabase unreachable. Airplane mode is a supported
 * state, not a degraded one.
 *
 * op-sqlite is JSI: queries are synchronous and do not cross the bridge, which matters
 * because every screen here runs analytics SQL.
 */
export const DB_NAME = 'raseed.db'

let connection: DB | null = null
let database: OPSQLiteDatabase<typeof schema> | null = null

export function getConnection(): DB {
  connection ??= open({ name: DB_NAME })
  return connection
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
