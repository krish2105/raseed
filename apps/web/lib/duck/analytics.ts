import { gini, madZScore, pareto } from '@raseed/engines'
import { money, type Currency, type Money } from '@raseed/money'
import { query } from './ingest'
import { Q } from './queries'
import { DEMO_END_AT } from './ingest'

/**
 * Everything the dashboard reads. Each function is one SQL round-trip plus, where it
 * matters, a pure engine from `@raseed/engines`.
 *
 * The split is deliberate: DuckDB does the aggregation it is good at, and the statistics
 * that need to be unit-tested against known answers stay in the engines package where
 * tests can reach them.
 */

const DAY = 86_400_000
const home = (minor: number): Money => money(Math.round(minor), 'INR')

export interface Headline {
  spend30: Money
  spendPrior30: Money
  income30: Money
  savingsRate: number
  spendDelta: number
  rowCount: number
  spendCount: number
}

export async function headline(): Promise<Headline> {
  const [spend, prior, income, rows, spends] = await Promise.all([
    query<{ total: number }>(Q.spendSince(DEMO_END_AT - 30 * DAY)),
    query<{ total: number }>(Q.spendBetween(DEMO_END_AT - 60 * DAY, DEMO_END_AT - 30 * DAY)),
    query<{ total: number }>(Q.incomeSince(DEMO_END_AT - 30 * DAY)),
    query<{ n: number }>(Q.rowCount),
    query<{ n: number }>(Q.spendCount),
  ])

  const spend30 = home(spend[0]?.total ?? 0)
  const spendPrior30 = home(prior[0]?.total ?? 0)
  const income30 = home(income[0]?.total ?? 0)

  return {
    spend30,
    spendPrior30,
    income30,
    savingsRate:
      income30.minor === 0 ? 0 : (income30.minor - spend30.minor) / income30.minor,
    spendDelta:
      spendPrior30.minor === 0 ? 0 : (spend30.minor - spendPrior30.minor) / spendPrior30.minor,
    rowCount: rows[0]?.n ?? 0,
    spendCount: spends[0]?.n ?? 0,
  }
}

export interface CategoryTotal {
  categoryId: string
  name: string
  kind: string
  total: Money
  share: number
}

export async function byCategory(days = 30): Promise<CategoryTotal[]> {
  const rows = await query<{
    category_id: string
    name: string
    kind: string
    home_minor: number
  }>(Q.byCategorySince(DEMO_END_AT - days * DAY))

  const grand = rows.reduce((a, r) => a + r.home_minor, 0)
  return rows.map((r) => ({
    categoryId: r.category_id,
    name: r.name,
    kind: r.kind,
    total: home(r.home_minor),
    share: grand === 0 ? 0 : r.home_minor / grand,
  }))
}

export interface MerchantTotal {
  merchantId: string
  name: string
  country: 'IN' | 'AE'
  total: Money
  count: number
}

export async function byMerchant(days = 90): Promise<MerchantTotal[]> {
  const rows = await query<{
    merchant_id: string
    name: string
    country: string
    home_minor: number
    txn_count: number
  }>(Q.byMerchantSince(DEMO_END_AT - days * DAY))

  return rows.map((r) => ({
    merchantId: r.merchant_id,
    name: r.name,
    country: r.country === 'AE' ? 'AE' : 'IN',
    total: home(r.home_minor),
    count: r.txn_count,
  }))
}

export interface Concentration {
  gini: number
  /** How many merchants make up 80% of spend. */
  vitalFew: number
}

export async function concentration(): Promise<Concentration> {
  const merchants = await byMerchant(90)
  const values = merchants.map((m) => m.total.minor)
  const ranked = pareto(merchants.map((m) => ({ item: m.name, value: m.total.minor })))
  const index = ranked.findIndex((p) => p.cumulativeShare >= 0.8)

  return { gini: gini(values), vitalFew: index === -1 ? ranked.length : index + 1 }
}

/** Days in the trailing window whose spend is a robust-z outlier. */
export async function anomalies(days = 90, threshold = 3.5): Promise<number> {
  const rows = await query<{ home_minor: number }>(Q.dailyTotalsSince(DEMO_END_AT - days * DAY))
  return madZScore(rows.map((r) => r.home_minor)).filter((z) => Math.abs(z) > threshold).length
}

/** Share of the window's spend denominated in AED. Drives the panel edge colour. */
export async function currencyMix(days = 30): Promise<{ INR: number; AED: number }> {
  const rows = await query<{ currency: Currency; home_minor: number }>(
    Q.currencyMixSince(DEMO_END_AT - days * DAY),
  )
  const grand = rows.reduce((a, r) => a + r.home_minor, 0)
  if (grand === 0) return { INR: 1, AED: 0 }
  const aed = rows.find((r) => r.currency === 'AED')?.home_minor ?? 0
  return { AED: aed / grand, INR: 1 - aed / grand }
}

export interface RecurringCandidate {
  merchantId: string
  name: string
  observations: number
  meanPeriodDays: number
  intervalCv: number
}

export async function recurring(): Promise<RecurringCandidate[]> {
  const rows = await query<{
    merchant_id: string
    name: string
    observations: number
    mean_period_days: number
    interval_cv: number
  }>(Q.recurringCandidates)

  return rows.map((r) => ({
    merchantId: r.merchant_id,
    name: r.name,
    observations: r.observations,
    meanPeriodDays: r.mean_period_days,
    intervalCv: r.interval_cv,
  }))
}
