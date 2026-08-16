import type { FixtureTransaction } from '@raseed/fixtures'

/**
 * Transactions you add in the browser, persisted to localStorage and layered on top of the
 * seeded demo before ingest.
 *
 * localStorage rather than IndexedDB: this is a few hundred rows of small JSON, it must be
 * readable synchronously during ingest, and the whole point is that it survives a refresh
 * without a backend. IndexedDB would be the right call at CSV-import scale (S22) and is a
 * drop-in replacement behind this module.
 *
 * A visitor's additions live only in their own browser and never touch anyone else's data —
 * which is what makes a public demo with write access safe.
 */

const KEY = 'raseed.local-ledger.v1'

/** The wallet. Not a real account in the seeded demo — it exists so cash can be counted. */
export const CASH_ACCOUNT = 'acct-cash'

export interface LocalDraft {
  amountMinor: number
  currency: 'INR' | 'AED'
  merchant: string
  categoryId: string
  /** Defaults to now. The store stamps the clock, exactly as it already does for `updated_at`. */
  occurredAt?: number
  /** INR per AED, frozen at write time and never recomputed. */
  fxInrPerAed: number
  note?: string
  /**
   * Paid from your wallet rather than a card. Cash spend is what the wallet count on the
   * Reckoning tab reconciles against — without this flag there is nothing to expect.
   */
  paidInCash?: boolean
  /** 'in' for money arriving. Defaults to 'out', which is almost always what you mean. */
  direction?: 'in' | 'out'
}

function read(): FixtureTransaction[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as FixtureTransaction[]) : []
  } catch {
    // A corrupt or quota-blocked store must not take the dashboard down with it.
    return []
  }
}

function write(rows: FixtureTransaction[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows))
  } catch {
    // Quota exceeded or storage disabled (private mode). The row stays in memory for this
    // session; silently dropping it is better than throwing mid-save.
  }
}

export function localTransactions(): FixtureTransaction[] {
  return read()
}

export function localCount(): number {
  return read().length
}

/**
 * Append a transaction. `home_amount_minor` and both rates are computed once, here, and
 * never recomputed — changing your home currency must not rewrite history.
 */
export function addLocal(draft: LocalDraft): FixtureTransaction {
  const rows = read()
  const rate = draft.currency === 'AED' ? draft.fxInrPerAed : 1

  const row: FixtureTransaction = {
    id: `local-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    occurred_at: draft.occurredAt ?? Date.now(),
    direction: draft.direction ?? 'out',
    amount_minor: draft.amountMinor,
    currency: draft.currency,
    home_amount_minor: Math.round(draft.amountMinor * rate),
    fx_rate: rate,
    fx_inr_per_aed: draft.fxInrPerAed,
    account_id: draft.paidInCash
      ? CASH_ACCOUNT
      : draft.currency === 'AED'
        ? 'acct-enbd'
        : 'acct-hdfc',
    merchant_id: null,
    category_id: draft.categoryId,
    raw_text: draft.merchant,
    source: 'manual',
    txn_type: (draft.direction ?? 'out') === 'in' ? 'income' : 'spend',
    transfer_group_id: null,
    reversal_of_id: null,
    trip_id: null,
    status: 'confirmed',
    confidence: 1,
    note: draft.note ?? null,
    user_id: 'local-user',
    updated_at: Date.now(),
    deleted: false,
  }

  rows.push(row)
  write(rows)
  return row
}

export interface LocalEdit {
  amountMinor: number
  merchant: string
  /** Omit to keep the row's existing category. The ledger table shows a category name, not
   *  an id, so the inline editor has no id to send and must not blank the field. */
  categoryId?: string
  note?: string | null
}

/**
 * Correct a row you added in this browser.
 *
 * **`fx_rate` and `fx_inr_per_aed` are carried over untouched**; only `home_amount_minor` is
 * recomputed, and from the rate already on the row. `CLAUDE.md` freezes FX at transaction
 * date, so an edit must never re-price — fixing a merchant's spelling is not a currency event.
 *
 * Returns false when the id is not a local row. The seeded demo is shared and read-only: it is
 * the same ledger every visitor sees, and letting one browser edit it would make screenshots
 * irreproducible and the honest-limitations note on the landing page a lie.
 */
export function updateLocal(id: string, edit: LocalEdit): boolean {
  const rows = read()
  const idx = rows.findIndex((r) => r.id === id)
  if (idx === -1) return false

  const row = rows[idx]!
  rows[idx] = {
    ...row,
    amount_minor: edit.amountMinor,
    home_amount_minor: Math.round(edit.amountMinor * row.fx_rate),
    raw_text: edit.merchant,
    category_id: edit.categoryId ?? row.category_id,
    note: edit.note === undefined ? row.note : edit.note,
    updated_at: Date.now(),
  }
  write(rows)
  return true
}

/** True when this row was added in this browser, i.e. when it can be edited or removed. */
export function isLocal(id: string): boolean {
  return id.startsWith('local-')
}

/** Soft delete only — never hard-delete a row. */
export function removeLocal(id: string): void {
  write(read().map((r) => (r.id === id ? { ...r, deleted: true, updated_at: Date.now() } : r)))
}

export function clearLocal(): void {
  write([])
}

/** Cash spend since a moment, in home minor units — what a wallet count is measured against. */
export function cashSpentSince(at: number): number {
  return read()
    .filter(
      (r) =>
        !r.deleted &&
        r.account_id === CASH_ACCOUNT &&
        r.direction === 'out' &&
        r.occurred_at > at,
    )
    .reduce((total, r) => total + r.home_amount_minor, 0)
}
