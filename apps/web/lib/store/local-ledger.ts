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

export interface LocalDraft {
  amountMinor: number
  currency: 'INR' | 'AED'
  merchant: string
  categoryId: string
  occurredAt: number
  /** INR per AED, frozen at write time and never recomputed. */
  fxInrPerAed: number
  note?: string
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
    occurred_at: draft.occurredAt,
    direction: 'out',
    amount_minor: draft.amountMinor,
    currency: draft.currency,
    home_amount_minor: Math.round(draft.amountMinor * rate),
    fx_rate: rate,
    fx_inr_per_aed: draft.fxInrPerAed,
    account_id: draft.currency === 'AED' ? 'acct-enbd' : 'acct-hdfc',
    merchant_id: null,
    category_id: draft.categoryId,
    raw_text: draft.merchant,
    source: 'manual',
    txn_type: 'spend',
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

/** Soft delete only — never hard-delete a row. */
export function removeLocal(id: string): void {
  write(read().map((r) => (r.id === id ? { ...r, deleted: true, updated_at: Date.now() } : r)))
}

export function clearLocal(): void {
  write([])
}
