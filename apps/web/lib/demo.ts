import { generateLedger, type FixtureTransaction } from '@raseed/fixtures'
import { detectRecurrence, gini, madZScore, pareto, regretRate } from '@raseed/engines'
import { money, sum, zero, type Money } from '@raseed/money'

/**
 * The demo ledger, computed once per process.
 *
 * Session 8 replaces these reductions with DuckDB-WASM views over the same rows. Until
 * then this is plain TypeScript over the fixture output — same numbers, same predicate.
 *
 * `endAt` is a constant, not Date.now(), so every visitor sees identical data and a
 * screenshot taken today reproduces next year.
 */
export const DEMO_END_AT = 1_755_300_000_000

export const ledger = generateLedger({ endAt: DEMO_END_AT })

/**
 * The spend predicate. Mirrors packages/schema/src/contract.ts SPEND_PREDICATE exactly —
 * confirmed, not a reversal, not reversed by anything, not soft-deleted.
 *
 * Defined once here and imported everywhere. Never inline this filter in a component.
 */
const reversedIds = new Set(
  ledger.transactions.map((t) => t.reversal_of_id).filter((id): id is string => id !== null),
)

export const vSpend: FixtureTransaction[] = ledger.transactions.filter(
  (t) =>
    t.txn_type === 'spend' &&
    t.status === 'confirmed' &&
    t.reversal_of_id === null &&
    !t.deleted &&
    !reversedIds.has(t.id),
)

export const vIncome: FixtureTransaction[] = ledger.transactions.filter(
  (t) => t.txn_type === 'income' && t.status === 'confirmed' && !t.deleted,
)

const DAY = 86_400_000

export function homeMoney(minor: number): Money {
  return money(Math.round(minor), 'INR')
}

/** Rows in the trailing `days` window. */
function trailing(rows: readonly FixtureTransaction[], days: number): FixtureTransaction[] {
  const cutoff = DEMO_END_AT - days * DAY
  return rows.filter((t) => t.occurred_at >= cutoff)
}

function totalHome(rows: readonly FixtureTransaction[]): Money {
  return sum(rows.map((t) => homeMoney(t.home_amount_minor)), 'INR')
}

// ── headline figures ────────────────────────────────────────────────────────

export const spend30 = totalHome(trailing(vSpend, 30))
export const spend60to30 = totalHome(
  vSpend.filter(
    (t) => t.occurred_at >= DEMO_END_AT - 60 * DAY && t.occurred_at < DEMO_END_AT - 30 * DAY,
  ),
)
export const income30 = totalHome(trailing(vIncome, 30))

export const savingsRate =
  income30.minor === 0 ? 0 : (income30.minor - spend30.minor) / income30.minor

/** Median of the trailing three months' daily spend, annualised into a burn figure. */
export const dailyBurn: number[] = (() => {
  const byDay = new Map<number, number>()
  for (const t of trailing(vSpend, 90)) {
    const day = Math.floor(t.occurred_at / DAY)
    byDay.set(day, (byDay.get(day) ?? 0) + t.home_amount_minor)
  }
  return [...byDay.values()]
})()

// ── breakdowns ──────────────────────────────────────────────────────────────

export interface CategoryTotal {
  categoryId: string
  name: string
  kind: string
  total: Money
  share: number
}

export const byCategory: CategoryTotal[] = (() => {
  const rows = trailing(vSpend, 30)
  const totals = new Map<string, number>()
  for (const t of rows) totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + t.home_amount_minor)
  const grand = [...totals.values()].reduce((a, b) => a + b, 0)

  return [...totals.entries()]
    .map(([categoryId, minor]) => {
      const meta = ledger.categories.find((c) => c.id === categoryId)
      return {
        categoryId,
        name: meta?.name ?? categoryId,
        kind: meta?.kind ?? 'want',
        total: homeMoney(minor),
        share: grand === 0 ? 0 : minor / grand,
      }
    })
    .sort((a, b) => b.total.minor - a.total.minor)
})()

export interface MerchantTotal {
  merchantId: string
  name: string
  country: 'IN' | 'AE'
  total: Money
  count: number
}

export const byMerchant: MerchantTotal[] = (() => {
  const totals = new Map<string, { minor: number; count: number }>()
  for (const t of trailing(vSpend, 90)) {
    if (!t.merchant_id) continue
    const cur = totals.get(t.merchant_id) ?? { minor: 0, count: 0 }
    cur.minor += t.home_amount_minor
    cur.count += 1
    totals.set(t.merchant_id, cur)
  }
  return [...totals.entries()]
    .map(([merchantId, { minor, count }]) => {
      const meta = ledger.merchants.find((m) => m.id === merchantId)
      return {
        merchantId,
        name: meta?.canonical_name ?? merchantId,
        country: meta?.country ?? 'IN',
        total: homeMoney(minor),
        count,
      }
    })
    .sort((a, b) => b.total.minor - a.total.minor)
})()

/** Share of the last 30 days' spend that happened in each currency — drives the panel edge. */
export const currencyMix: { INR: number; AED: number } = (() => {
  const rows = trailing(vSpend, 30)
  const grand = rows.reduce((a, t) => a + t.home_amount_minor, 0)
  if (grand === 0) return { INR: 1, AED: 0 }
  const aed = rows.filter((t) => t.currency === 'AED').reduce((a, t) => a + t.home_amount_minor, 0)
  return { AED: aed / grand, INR: 1 - aed / grand }
})()

// ── engine outputs ──────────────────────────────────────────────────────────

export const subscriptions = detectRecurrence(
  vSpend
    .filter((t) => t.merchant_id !== null)
    .map((t) => ({
      merchantId: t.merchant_id!,
      amountMinor: t.amount_minor,
      currency: t.currency,
      occurredAt: t.occurred_at,
    })),
  { maxAmountCv: 0.2 },
)

export const concentration = gini(byMerchant.map((m) => m.total.minor))

export const paretoMerchants = pareto(byMerchant.map((m) => ({ item: m.name, value: m.total.minor })))

/** Days in the trailing 90 whose spend is a robust-z outlier. */
export const anomalyCount = madZScore(dailyBurn).filter((z) => Math.abs(z) > 3.5).length

export const regret = regretRate(
  // No worth-it ratings exist until S17, so this is empty by construction rather than faked.
  [],
)

export const remittanceCount = ledger.meta.planted.remittances
export const zeroMoney = zero('INR')
