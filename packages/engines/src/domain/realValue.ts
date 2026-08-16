import { money, type Currency, type Money } from '@raseed/money'

/**
 * Two lenses that a dual-country ledger needs and a single-country one never does.
 *
 * **Real value.** "You spent ₹40,000 in March 2025 and ₹41,000 in March 2026" is presented
 * everywhere as a 2.5% rise. If prices rose 4% over that year it is a 1.5% *fall*. Nominal
 * comparison across a long ledger is not a simplification, it is an error, and it always
 * errs in the direction of telling you that you are doing worse than you are.
 *
 * **Purchasing power.** ₹1,000 and the dirhams it converts to do not buy the same life.
 * The market rate says what a bank will give you; the PPP rate says what the money is
 * actually worth where you are standing. For someone earning in one country and spending in
 * another, that gap is the whole story, and no market-rate conversion will ever show it.
 *
 * Both functions take their index as an argument. No engine here fetches, guesses, or
 * hardcodes an economic series — same rule as `Date.now()`. The caller supplies the data
 * and owns its provenance.
 */

/** A price index: period key (`YYYY-MM` or `YYYY`) to index level. Base period is 100. */
export type PriceIndex = Readonly<Record<string, number>>

/**
 * Restate an amount in the prices of `basePeriod`.
 *
 * Returns null rather than guessing when either period is missing from the index. A silently
 * un-deflated figure sitting next to deflated ones is worse than a gap: the gap is visible.
 */
export function realValue(
  amount: Money,
  fromPeriod: string,
  basePeriod: string,
  index: PriceIndex,
): Money | null {
  const from = index[fromPeriod]
  const base = index[basePeriod]
  if (from === undefined || base === undefined || from <= 0) return null

  return money(Math.round(amount.minor * (base / from)), amount.currency)
}

/** Cumulative inflation between two periods, as a ratio. 0.04 is 4%. */
export function inflationBetween(
  fromPeriod: string,
  toPeriod: string,
  index: PriceIndex,
): number | null {
  const from = index[fromPeriod]
  const to = index[toPeriod]
  if (from === undefined || to === undefined || from <= 0) return null
  return to / from - 1
}

/**
 * What a nominal change really was, once prices are taken out of it.
 *
 * The number people mean when they ask "am I actually spending more?".
 */
export function realChange(
  earlier: Money,
  earlierPeriod: string,
  later: Money,
  laterPeriod: string,
  index: PriceIndex,
): { nominal: number; real: number; inflation: number } | null {
  if (earlier.minor === 0) return null
  const deflated = realValue(later, laterPeriod, earlierPeriod, index)
  const inflation = inflationBetween(earlierPeriod, laterPeriod, index)
  if (!deflated || inflation === null) return null

  return {
    nominal: (later.minor - earlier.minor) / earlier.minor,
    real: (deflated.minor - earlier.minor) / earlier.minor,
    inflation,
  }
}

// ── purchasing power ────────────────────────────────────────────────────────

export interface PppRates {
  /** Units of local currency per international dollar, for each currency. */
  readonly perInternationalDollar: Readonly<Record<Currency, number>>
}

/**
 * Convert at purchasing power rather than at the market rate.
 *
 * The result is deliberately **not** an amount you could obtain at a counter. It answers
 * "what would this standard of living cost there", which is the question someone splitting
 * their life across two countries is actually asking. Label it as such wherever it appears —
 * presenting a PPP figure where a market rate is expected is its own kind of lie.
 */
export function purchasingPower(amount: Money, to: Currency, rates: PppRates): Money | null {
  const from = rates.perInternationalDollar[amount.currency]
  const target = rates.perInternationalDollar[to]
  if (!from || !target || from <= 0) return null

  return money(Math.round((amount.minor / from) * target), to)
}

/**
 * How much further the same money goes in the other country, as a ratio.
 *
 * 1.6 means a dirham of spending buys about 1.6 dirhams' worth of life in India.
 */
export function powerRatio(from: Currency, to: Currency, rates: PppRates, marketRate: number): number | null {
  const a = rates.perInternationalDollar[from]
  const b = rates.perInternationalDollar[to]
  if (!a || !b || b <= 0 || marketRate <= 0) return null

  // Market rate says how many `to` units a `from` unit buys. PPP says how many it needs to
  // buy the same basket. The gap between them is the advantage.
  return marketRate / (b / a)
}
