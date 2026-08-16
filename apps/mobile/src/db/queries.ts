import { money, type Currency, type Money } from '@raseed/money'
import type { Scalar } from '@op-engineering/op-sqlite'
import { getConnection } from './client'

/**
 * Every read and write against the ledger.
 *
 * Spend totals go through `v_spend` — never an inline `txn_type = 'spend' AND ...`. Two
 * places disagreeing about what counts as spend is where every wrong number in every
 * finance dashboard comes from.
 */

const USER = 'local-user'

export interface TxnRow {
  id: string
  occurred_at: number
  direction: 'out' | 'in'
  amount_minor: number
  currency: Currency
  home_amount_minor: number
  fx_rate: number
  account_id: string
  merchant_id: string | null
  category_id: string | null
  raw_text: string | null
  source: string
  txn_type: string
  status: string
  note: string | null
}

export interface LedgerEntry {
  id: string
  merchant: string
  category: string
  amount: Money
  homeAmount: Money
  currency: Currency
  occurredAt: number
  note: string | null
}

function rows<T>(sql: string, params: Scalar[] = []): T[] {
  return getConnection().executeSync(sql, params).rows as T[]
}

// ── reads ───────────────────────────────────────────────────────────────────

const ENTRY_SELECT = `
  SELECT s.id, s.occurred_at, s.amount_minor, s.currency, s.home_amount_minor, s.note,
         COALESCE(m.canonical_name, s.raw_text, 'Unknown') AS merchant,
         COALESCE(c.name, 'Uncategorised')                 AS category
  FROM v_spend s
  LEFT JOIN merchants  m ON m.id = s.merchant_id
  LEFT JOIN categories c ON c.id = s.category_id
`

interface RawEntry {
  id: string
  occurred_at: number
  amount_minor: number
  currency: Currency
  home_amount_minor: number
  note: string | null
  merchant: string
  category: string
}

function toEntry(r: RawEntry): LedgerEntry {
  return {
    id: r.id,
    merchant: r.merchant,
    category: r.category,
    amount: money(r.amount_minor, r.currency),
    homeAmount: money(r.home_amount_minor, 'INR'),
    currency: r.currency,
    occurredAt: r.occurred_at,
    note: r.note,
  }
}

export function spendBetween(fromMs: number, toMs: number): LedgerEntry[] {
  return rows<RawEntry>(
    `${ENTRY_SELECT} WHERE s.occurred_at >= ? AND s.occurred_at < ? ORDER BY s.occurred_at DESC`,
    [fromMs, toMs],
  ).map(toEntry)
}

export function recentSpend(limit = 200): LedgerEntry[] {
  return rows<RawEntry>(`${ENTRY_SELECT} ORDER BY s.occurred_at DESC LIMIT ?`, [limit]).map(toEntry)
}

/** Home-currency total over `v_spend` in a window. */
export function spendTotal(fromMs: number, toMs: number): Money {
  const result = rows<{ total: number | null }>(
    'SELECT SUM(home_amount_minor) AS total FROM v_spend WHERE occurred_at >= ? AND occurred_at < ?',
    [fromMs, toMs],
  )
  return money(Math.round(result[0]?.total ?? 0), 'INR')
}

export function countSpend(): number {
  return rows<{ n: number }>('SELECT COUNT(*) AS n FROM v_spend')[0]?.n ?? 0
}

export interface AccountRow {
  id: string
  name: string
  kind: string
  currency: Currency
  opening_minor: number
}

export function listAccounts(): AccountRow[] {
  return rows<AccountRow>(
    'SELECT id, name, kind, currency, opening_minor FROM accounts WHERE deleted = 0 ORDER BY name',
  )
}

export interface CategoryRow {
  id: string
  name: string
  kind: string
}

export function listCategories(): CategoryRow[] {
  return rows<CategoryRow>(
    "SELECT id, name, kind FROM categories WHERE deleted = 0 AND kind <> 'income' ORDER BY name",
  )
}

// ── writes ──────────────────────────────────────────────────────────────────

export interface NewTransaction {
  amount: Money
  accountId: string
  categoryId: string
  merchantText: string
  occurredAt: number
  /** Frozen at write time and never recomputed. 1 when the amount is already home currency. */
  fxRate: number
  note?: string
}

/**
 * The only way a transaction enters the ledger.
 *
 * `home_amount_minor` and `fx_rate` are computed here and written once. Nothing recomputes
 * them later — changing your home currency must not rewrite history.
 */
export function insertTransaction(input: NewTransaction): string {
  const id = `txn-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  const homeMinor = Math.round(input.amount.minor * input.fxRate)

  getConnection().executeSync(
    `INSERT INTO transactions
       (id, occurred_at, direction, amount_minor, currency, home_amount_minor, fx_rate,
        account_id, merchant_id, category_id, raw_text, source, txn_type, transfer_group_id,
        reversal_of_id, trip_id, status, confidence, note, user_id, updated_at, deleted)
     VALUES (?, ?, 'out', ?, ?, ?, ?, ?, NULL, ?, ?, 'manual', 'spend', NULL,
             NULL, NULL, 'confirmed', 1.0, ?, ?, ?, 0)`,
    [
      id,
      input.occurredAt,
      input.amount.minor,
      input.amount.currency,
      homeMinor,
      input.fxRate,
      input.accountId,
      input.categoryId,
      input.merchantText,
      input.note ?? null,
      USER,
      Date.now(),
    ],
  )
  return id
}

export function updateTransactionNote(id: string, note: string): void {
  getConnection().executeSync('UPDATE transactions SET note = ?, updated_at = ? WHERE id = ?', [
    note,
    Date.now(),
    id,
  ])
}

/** Soft delete only — never hard-delete a row. */
export function softDeleteTransaction(id: string): void {
  getConnection().executeSync(
    'UPDATE transactions SET deleted = 1, updated_at = ? WHERE id = ?',
    [Date.now(), id],
  )
}
