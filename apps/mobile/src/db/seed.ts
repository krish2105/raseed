import { ACCOUNTS, CATEGORIES, MERCHANTS } from '@raseed/fixtures'
import { normaliseMerchant } from '@raseed/engines'
import { getConnection } from './client'

/**
 * Seeds the reference data a fresh install needs: accounts, categories, and ~13 India/UAE
 * merchants with their raw statement descriptors as aliases.
 *
 * Idempotent — INSERT OR IGNORE on a primary key, so relaunching never duplicates.
 * Transactions are NOT seeded: the ledger starts empty and you fill it, which is the
 * honest first-run state.
 */
const USER = 'local-user'

export function seed(): void {
  const db = getConnection()
  const now = Date.now()

  db.executeSync('BEGIN')
  try {
    for (const a of ACCOUNTS) {
      db.executeSync(
        `INSERT OR IGNORE INTO accounts
           (id, name, kind, currency, opening_minor, is_cash, archived_at, user_id, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
        [a.id, a.name, a.kind, a.currency, a.opening_minor, a.is_cash ? 1 : 0, USER, now],
      )
    }

    for (const c of CATEGORIES) {
      db.executeSync(
        `INSERT OR IGNORE INTO categories
           (id, name, parent_id, icon, color, kind, user_id, updated_at, deleted)
         VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, 0)`,
        [c.id, c.name, c.kind, USER, now],
      )
    }

    for (const m of MERCHANTS) {
      db.executeSync(
        `INSERT OR IGNORE INTO merchants
           (id, canonical_name, category_id, country, logo_url, user_id, updated_at, deleted)
         VALUES (?, ?, ?, ?, NULL, ?, ?, 0)`,
        [m.id, m.canonical_name, m.category_id, m.country, USER, now],
      )

      // Every known descriptor becomes a seed alias, so the resolver starts with a
      // working table rather than learning from zero.
      for (const raw of m.descriptors) {
        const norm = normaliseMerchant(raw)
        if (!norm) continue
        db.executeSync(
          `INSERT OR IGNORE INTO merchant_aliases
             (id, merchant_id, alias_raw, alias_norm, source, hit_count, user_id, updated_at, deleted)
           VALUES (?, ?, ?, ?, 'seed', 0, ?, ?, 0)`,
          [`alias-${norm.replace(/\s+/g, '-')}`, m.id, raw, norm, USER, now],
        )
      }
    }
    db.executeSync('COMMIT')
  } catch (error) {
    db.executeSync('ROLLBACK')
    throw error
  }
}

export function isSeeded(): boolean {
  const db = getConnection()
  const rows = db.executeSync('SELECT COUNT(*) AS n FROM categories').rows as { n: number }[]
  return (rows[0]?.n ?? 0) > 0
}
