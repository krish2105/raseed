import {
  benford,
  lorenzCurve,
  budgetVariance,
  detectRemittance,
  detectTrips,
  gini,
  madZScore,
  pareto,
  tripExcess,
  type Trip,
} from '@raseed/engines'
import { money, type Currency, type Money } from '@raseed/money'
import { DEMO_END_AT, query } from './ingest'
import { runForecast } from '../workers/client'
import { Q, lensCurrency, type Lens } from './queries'

/**
 * Everything the dashboard reads.
 *
 * DuckDB does the aggregation it is good at; the statistics that need known-answer tests
 * stay in `@raseed/engines` where the tests can reach them. Every function takes the lens,
 * because a figure that ignores it is a figure that lies about which currency you are
 * looking at.
 */

const DAY = 86_400_000
export const NOW = DEMO_END_AT

const asMoney = (minor: number, lens: Lens): Money =>
  money(Math.round(minor), lensCurrency(lens))

// ── headline ────────────────────────────────────────────────────────────────

export interface Headline {
  spend30: Money
  spendPrior30: Money
  income30: Money
  net30: Money
  savingsRate: number
  spendDelta: number
  rowCount: number
  spendCount: number
  dailyAverage: Money
}

export async function headline(lens: Lens): Promise<Headline> {
  const [spend, prior, income, rows, spends] = await Promise.all([
    query<{ total: number }>(Q.spendSince(NOW - 30 * DAY, lens)),
    query<{ total: number }>(Q.spendBetween(NOW - 60 * DAY, NOW - 30 * DAY, lens)),
    query<{ total: number }>(Q.incomeSince(NOW - 30 * DAY, lens)),
    query<{ n: number }>(Q.rowCount),
    query<{ n: number }>(Q.spendCount),
  ])

  const spend30 = asMoney(spend[0]?.total ?? 0, lens)
  const spendPrior30 = asMoney(prior[0]?.total ?? 0, lens)
  const income30 = asMoney(income[0]?.total ?? 0, lens)

  return {
    spend30,
    spendPrior30,
    income30,
    net30: asMoney(income30.minor - spend30.minor, lens),
    savingsRate: income30.minor === 0 ? 0 : (income30.minor - spend30.minor) / income30.minor,
    spendDelta:
      spendPrior30.minor === 0 ? 0 : (spend30.minor - spendPrior30.minor) / spendPrior30.minor,
    rowCount: rows[0]?.n ?? 0,
    spendCount: spends[0]?.n ?? 0,
    dailyAverage: asMoney(spend30.minor / 30, lens),
  }
}

// ── breakdowns ──────────────────────────────────────────────────────────────

export interface CategoryTotal {
  categoryId: string
  name: string
  kind: string
  total: Money
  share: number
}

export async function byCategory(days: number, lens: Lens): Promise<CategoryTotal[]> {
  const rows = await query<{ category_id: string; name: string; kind: string; home_minor: number }>(
    Q.byCategorySince(NOW - days * DAY, lens),
  )
  const grand = rows.reduce((a, r) => a + r.home_minor, 0)
  return rows.map((r) => ({
    categoryId: r.category_id,
    name: r.name,
    kind: r.kind,
    total: asMoney(r.home_minor, lens),
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

export async function byMerchant(days: number, lens: Lens): Promise<MerchantTotal[]> {
  const rows = await query<{
    merchant_id: string
    name: string
    country: string
    home_minor: number
    txn_count: number
  }>(Q.byMerchantSince(NOW - days * DAY, lens))

  return rows.map((r) => ({
    merchantId: r.merchant_id,
    name: r.name,
    country: r.country === 'AE' ? 'AE' : 'IN',
    total: asMoney(r.home_minor, lens),
    count: r.txn_count,
  }))
}

export interface DailyPoint {
  day: string
  total: Money
  count: number
}

export async function dailySeries(days: number, lens: Lens): Promise<DailyPoint[]> {
  const rows = await query<{ day: string; home_minor: number; txn_count: number }>(
    Q.dailyTotalsSince(NOW - days * DAY, lens),
  )
  return rows.map((r) => ({
    day: String(r.day).slice(0, 10),
    total: asMoney(r.home_minor, lens),
    count: r.txn_count,
  }))
}

// ── engine-backed ───────────────────────────────────────────────────────────

export interface Concentration {
  gini: number
  vitalFew: number
  total: number
}

export async function concentration(lens: Lens): Promise<Concentration> {
  const merchants = await byMerchant(90, lens)
  const ranked = pareto(merchants.map((m) => ({ item: m.name, value: m.total.minor })))
  const index = ranked.findIndex((p) => p.cumulativeShare >= 0.8)
  return {
    gini: gini(merchants.map((m) => m.total.minor)),
    vitalFew: index === -1 ? ranked.length : index + 1,
    total: merchants.length,
  }
}

export interface Anomaly {
  day: string
  total: Money
  z: number
}

export async function anomalies(days: number, lens: Lens, threshold = 3.5): Promise<Anomaly[]> {
  const series = await dailySeries(days, lens)
  const z = madZScore(series.map((p) => p.total.minor))
  return series
    .map((p, i) => ({ day: p.day, total: p.total, z: z[i] ?? 0 }))
    .filter((p) => Math.abs(p.z) > threshold)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
}

export async function currencyMix(days: number): Promise<{ INR: number; AED: number }> {
  const rows = await query<{ currency: Currency; home_minor: number }>(
    Q.currencyMixSince(NOW - days * DAY),
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

// ── flows (Sankey) ──────────────────────────────────────────────────────────

export interface FlowEdge {
  kind: string
  category: string
  value: Money
}

export async function flows(days: number, lens: Lens): Promise<FlowEdge[]> {
  const rows = await query<{ kind: string; category: string; value_minor: number }>(
    Q.flowEdges(NOW - days * DAY, lens),
  )
  return rows.map((r) => ({
    kind: r.kind,
    category: r.category,
    value: asMoney(r.value_minor, lens),
  }))
}

// ── variance (rate × volume) ────────────────────────────────────────────────

export interface CategoryVariance {
  categoryId: string
  name: string
  before: Money
  after: Money
  rateEffect: Money
  volumeEffect: Money
  interaction: Money
  total: Money
}

/**
 * Did you buy more coffee, or did coffee get dearer?
 *
 * Unit price is spend ÷ count for the window, so "rate" here means average ticket size.
 * The interaction term stays separate — folding it into either side is a choice, and
 * hiding a choice inside a number is how dashboards mislead.
 */
export async function variance(lens: Lens): Promise<CategoryVariance[]> {
  const rows = await query<{
    category_id: string
    name: string
    before_minor: number
    before_n: number
    after_minor: number
    after_n: number
  }>(Q.categoryVariance(NOW - 60 * DAY, NOW - 30 * DAY, NOW - 30 * DAY, NOW, lens))

  return rows
    .map((r) => {
      const p0 = r.before_n === 0 ? 0 : r.before_minor / r.before_n
      const p1 = r.after_n === 0 ? 0 : r.after_minor / r.after_n
      const v = budgetVariance(p0, r.before_n, p1, r.after_n)
      return {
        categoryId: r.category_id,
        name: r.name,
        before: asMoney(r.before_minor, lens),
        after: asMoney(r.after_minor, lens),
        rateEffect: asMoney(v.rateEffectMinor, lens),
        volumeEffect: asMoney(v.volumeEffectMinor, lens),
        interaction: asMoney(v.interactionMinor, lens),
        total: asMoney(v.totalMinor, lens),
      }
    })
    .sort((a, b) => Math.abs(b.total.minor) - Math.abs(a.total.minor))
}

// ── forecast ────────────────────────────────────────────────────────────────

export interface Forecast {
  history: { day: string; minor: number }[]
  fitted: number[]
  forecast: number[]
  /**
   * Holdout symmetric MAPE on WEEKLY totals.
   *
   * Two deliberate choices. Symmetric, because plain MAPE divides by the actual and a
   * near-zero spend day sends it to thousands of percent — which is what daily personal
   * spend looks like. Weekly, because "what will next week cost" is the question anyone
   * actually asks, and a day-level error on spiky data is not decision-useful.
   */
  accuracy: number
  p10: Money
  p50: Money
  p90: Money
  probabilityWithinPool: number
  /** True when there was not enough history and this is a trailing median instead. */
  fellBack: boolean
  /** How many bootstrap paths the fan was drawn from. Shown, not assumed. */
  paths: number
  /** Wall-clock of the statistics alone, measured inside the worker. */
  computeMs: number
  /** False only if this browser refused to spawn the worker and the maths ran inline. */
  offMainThread: boolean
}

/**
 * The forecast, assembled.
 *
 * DuckDB aggregates the daily series; the statistics run in a worker (`lib/workers`); this
 * function only joins the two and puts the currency back on. Splitting it that way is what
 * lets a 10,000-path bootstrap happen without the page stuttering.
 */
export async function forecast(lens: Lens, horizon = 14, poolMinor?: number): Promise<Forecast> {
  const series = await dailySeries(180, lens)
  const history = series.map((p) => ({ day: p.day, minor: p.total.minor }))

  const out = await runForecast({
    values: series.map((p) => p.total.minor),
    horizon,
    poolMinor,
  })

  return {
    history,
    fitted: out.fitted,
    forecast: out.forecast,
    accuracy: out.accuracy,
    p10: asMoney(out.p10, lens),
    p50: asMoney(out.p50, lens),
    p90: asMoney(out.p90, lens),
    probabilityWithinPool: out.probabilityWithinPool,
    fellBack: out.fellBack,
    paths: out.paths,
    computeMs: out.computeMs,
    offMainThread: out.offMainThread,
  }
}

// ── currency: remittance efficiency + FX attribution ────────────────────────

export interface RemittanceRow {
  outflowId: string
  inflowId: string
  sentAed: Money
  receivedInr: Money
  impliedRate: number
  midMarketRate: number
  efficiency: number
  cost: Money
  occurredAt: number
}

export async function remittances(): Promise<RemittanceRow[]> {
  const legs = await query<{
    id: string
    occurred_at: number
    direction: 'out' | 'in'
    currency: Currency
    amount_minor: number
    fx_inr_per_aed: number
    transfer_group_id: string
  }>(Q.remittances)

  const rateAt = new Map(legs.map((l) => [l.id, l.fx_inr_per_aed]))

  const found = detectRemittance(
    legs.map((l) => ({
      id: l.id,
      direction: l.direction,
      amountMinor: l.amount_minor,
      currency: l.currency,
      occurredAt: l.occurred_at,
    })),
    (base, _quote, at) => {
      if (base !== 'AED') return 0
      const leg = legs.find((l) => l.occurred_at === at && l.currency === 'AED')
      return leg ? (rateAt.get(leg.id) ?? 0) : 0
    },
  )

  return found.map((r) => {
    const out = legs.find((l) => l.id === r.outflowId)!
    const inflow = legs.find((l) => l.id === r.inflowId)!
    return {
      outflowId: r.outflowId,
      inflowId: r.inflowId,
      sentAed: money(Math.abs(out.amount_minor), 'AED'),
      receivedInr: money(Math.abs(inflow.amount_minor), 'INR'),
      impliedRate: r.impliedRate,
      midMarketRate: r.midMarketRate,
      efficiency: r.efficiency,
      cost: money(r.costMinor, 'INR'),
      occurredAt: out.occurred_at,
    }
  })
}

export interface FxMonth {
  month: string
  rate: number
  aedExposure: Money
}

export async function fxSeries(): Promise<FxMonth[]> {
  const rows = await query<{ month: string; aed_minor: number; rate: number }>(
    Q.fxAttributionInput,
  )
  return rows.map((r) => ({
    month: String(r.month).slice(0, 10),
    rate: r.rate,
    aedExposure: money(Math.round(r.aed_minor), 'AED'),
  }))
}

// ── ledger ──────────────────────────────────────────────────────────────────

export interface LedgerRow {
  id: string
  occurredAt: number
  merchant: string
  /** Why this number is what it is — a split share, or a wallet reconciliation. */
  note: string
  category: string
  kind: string
  native: Money
  lensAmount: Money
}

export async function ledgerPage(limit: number, offset: number, lens: Lens): Promise<LedgerRow[]> {
  const rows = await query<{
    id: string
    occurred_at: number
    currency: Currency
    amount_minor: number
    lens_minor: number
    merchant: string
    note: string
    category: string
    kind: string
  }>(Q.ledgerPage(limit, offset, lens))

  return rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    merchant: r.merchant,
    note: r.note,
    category: r.category,
    kind: r.kind,
    native: money(r.amount_minor, r.currency),
    lensAmount: asMoney(r.lens_minor, lens),
  }))
}

// ── audit / concentration lab ───────────────────────────────────────────────

export interface AuditReport {
  benford: { observed: number[]; expected: number[]; chiSquare: number; n: number }
  lorenz: ReturnType<typeof lorenzCurve>
  gini: number
  pareto: { item: string; value: Money; cumulativeShare: number }[]
}

/**
 * The forensic tab: Benford's first-digit test, the Lorenz curve, and Pareto by merchant.
 *
 * All three engines are unit-tested against known answers in `@raseed/engines`; this only
 * feeds them real rows and shapes the output for the charts.
 */
export async function audit(lens: Lens): Promise<AuditReport> {
  const [rows, merchants] = await Promise.all([
    query<{ lens_minor: number }>(Q.ledgerPage(2000, 0, lens)),
    byMerchant(365, lens),
  ])

  const amounts = rows.map((r) => r.lens_minor / 100) // major units: Benford reads leading digits
  const values = merchants.map((m) => m.total.minor)

  return {
    benford: benford(amounts),
    lorenz: lorenzCurve(values),
    gini: gini(values),
    pareto: pareto(merchants.map((m) => ({ item: m.name, value: m.total.minor }))).map((p) => ({
      item: p.item,
      value: asMoney(p.value, lens),
      cumulativeShare: p.cumulativeShare,
    })),
  }
}

// ── trips ───────────────────────────────────────────────────────────────────

export interface TripRow extends Trip {
  /** The trip's away spend, as money you can format. */
  away: Money
  /** Everything it cost, in home currency. */
  total: Money
  /** What it cost beyond an ordinary stretch of days at your usual rate. */
  excess: Money
  /** Home-currency-per-day during the trip. */
  burn: Money
}

/**
 * Trips, inferred rather than declared, and priced against your ordinary days.
 *
 * The baseline is the median of NON-trip daily spend, not the mean of everything. Including
 * the trip days in the baseline is circular — a big trip raises the bar it is measured
 * against — and the mean lets one rent day set the standard for a Tuesday.
 */
export async function trips(days = 540): Promise<{ trips: TripRow[]; baselineDaily: Money }> {
  const rows = await query<{
    day: string
    away_minor: number
    away_in_home_minor: number
    home_minor: number
  }>(Q.tripDays(NOW - days * DAY))

  const observations = rows.map((r) => ({
    day: String(r.day).slice(0, 10),
    awayMinor: r.away_minor,
    awayInHomeMinor: r.away_in_home_minor,
    homeMinor: r.home_minor,
  }))

  const found = detectTrips(observations)
  const onTrip = new Set(
    found.flatMap((t) => observations.filter((o) => o.day >= t.startDay && o.day <= t.endDay))
      .map((o) => o.day),
  )

  const ordinary = observations
    .filter((o) => !onTrip.has(o.day))
    .map((o) => o.homeMinor + o.awayInHomeMinor)
    .sort((a, b) => a - b)
  const baseline = ordinary.length === 0 ? 0 : ordinary[Math.floor(ordinary.length / 2)]!

  return {
    baselineDaily: money(Math.round(baseline), 'INR'),
    trips: found
      .map((t) => ({
        ...t,
        away: money(t.awayMinor, 'AED'),
        total: money(t.totalInHomeMinor, 'INR'),
        excess: money(tripExcess(t, baseline), 'INR'),
        burn: money(Math.round(t.totalInHomeMinor / t.days), 'INR'),
      }))
      .reverse(), // most recent first
  }
}
