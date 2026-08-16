import { generateLedger } from '@raseed/fixtures'
import { money, sum, type Money } from '@raseed/money'

/**
 * Demo data for the shell. Session 7 replaces this with op-sqlite + Drizzle reading the
 * device database; the shapes are the same so the screens will not change.
 *
 * `DEMO_NOW` is a constant, not Date.now() — the engines are pure and take time in, and a
 * fixed "now" keeps the screenshots reproducible.
 */
export const DEMO_NOW = 1_755_300_000_000

const ledger = generateLedger({ endAt: DEMO_NOW })

const DAY = 86_400_000
const startOfToday = DEMO_NOW - (DEMO_NOW % DAY)

const reversedIds = new Set(
  ledger.transactions.map((t) => t.reversal_of_id).filter((id): id is string => id !== null),
)

/** The spend predicate, matching packages/schema/src/contract.ts. Defined once. */
const spend = ledger.transactions.filter(
  (t) =>
    t.txn_type === 'spend' &&
    t.status === 'confirmed' &&
    t.reversal_of_id === null &&
    !t.deleted &&
    !reversedIds.has(t.id),
)

export interface LedgerRow {
  id: string
  merchant: string
  category: string
  amount: Money
  currency: 'INR' | 'AED'
  occurredAt: number
}

function toRow(t: (typeof ledger.transactions)[number]): LedgerRow {
  return {
    id: t.id,
    merchant: ledger.merchants.find((m) => m.id === t.merchant_id)?.canonical_name ?? 'Unknown',
    category: ledger.categories.find((c) => c.id === t.category_id)?.name ?? '—',
    amount: money(t.amount_minor, t.currency),
    currency: t.currency,
    occurredAt: t.occurred_at,
  }
}

export const todaysLedger: LedgerRow[] = spend
  .filter((t) => t.occurred_at >= startOfToday)
  .sort((a, b) => b.occurred_at - a.occurred_at)
  .map(toRow)

/** Today's spend in home currency, which is what safeToSpend subtracts. */
export const todaySpend: Money = sum(
  spend.filter((t) => t.occurred_at >= startOfToday).map((t) => money(t.home_amount_minor, 'INR')),
  'INR',
)

export const recentLedger: LedgerRow[] = spend
  .slice(-60)
  .sort((a, b) => b.occurred_at - a.occurred_at)
  .map(toRow)

export const totalRows = spend.length
export const months = ledger.meta.months
