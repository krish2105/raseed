/**
 * Finance primitives. Pure, integer-minor-unit in and out where money is involved.
 *
 * Rates are per-period decimals (0.08 = 8%), never percentages, so nobody has to remember
 * which one a given function wants.
 */

export interface CashFlow {
  /** Signed minor units: negative is money out. */
  readonly amountMinor: number
  /** Epoch ms. */
  readonly at: number
}

const DAY = 86_400_000
const YEAR_DAYS = 365

// ── time value of money ─────────────────────────────────────────────────────

/** Net present value at a per-period rate. */
export function npv(rate: number, cashFlows: readonly number[]): number {
  return cashFlows.reduce((acc, cf, i) => acc + cf / (1 + rate) ** i, 0)
}

/**
 * Extended internal rate of return — the annualised rate that discounts irregularly
 * spaced cash flows to zero.
 *
 * Bisection rather than Newton-Raphson: slower, but it cannot diverge, and a financial
 * figure that silently fails to converge is worse than one that takes 200 iterations.
 */
export function xirr(
  cashFlows: readonly CashFlow[],
  options: { tolerance?: number; maxIterations?: number } = {},
): number | null {
  const { tolerance = 1e-7, maxIterations = 200 } = options
  if (cashFlows.length < 2) return null

  const hasPositive = cashFlows.some((c) => c.amountMinor > 0)
  const hasNegative = cashFlows.some((c) => c.amountMinor < 0)
  // Without a sign change there is no root to find.
  if (!hasPositive || !hasNegative) return null

  const sorted = [...cashFlows].sort((a, b) => a.at - b.at)
  const start = sorted[0]!.at

  const value = (rate: number): number =>
    sorted.reduce((acc, cf) => {
      const years = (cf.at - start) / DAY / YEAR_DAYS
      return acc + cf.amountMinor / (1 + rate) ** years
    }, 0)

  let low = -0.9999
  let high = 10
  let fLow = value(low)
  let fHigh = value(high)

  // Widen once if the root is outside the default bracket.
  for (let i = 0; i < 60 && fLow * fHigh > 0; i += 1) {
    high *= 2
    fHigh = value(high)
    if (high > 1e6) return null
  }
  if (fLow * fHigh > 0) return null

  for (let i = 0; i < maxIterations; i += 1) {
    const midRate = (low + high) / 2
    const fMid = value(midRate)
    if (Math.abs(fMid) < tolerance || (high - low) / 2 < tolerance) return midRate
    if (fLow * fMid < 0) {
      high = midRate
      fHigh = fMid
    } else {
      low = midRate
      fLow = fMid
    }
  }
  return (low + high) / 2
}

/** Level payment for a loan: `principal` over `periods` at per-period `rate`. */
export function pmt(rate: number, periods: number, principalMinor: number): number {
  if (periods <= 0) throw new Error('periods must be positive')
  if (rate === 0) return principalMinor / periods
  return (principalMinor * rate) / (1 - (1 + rate) ** -periods)
}

/** Future value of a present sum plus a recurring contribution. */
export function fv(rate: number, periods: number, contributionMinor: number, presentMinor = 0): number {
  if (rate === 0) return presentMinor + contributionMinor * periods
  const growth = (1 + rate) ** periods
  return presentMinor * growth + contributionMinor * ((growth - 1) / rate)
}

/**
 * Contribution needed to reach `targetMinor` in `periods` — the goal solver.
 * Returns minor units, rounded up so the goal is met rather than just missed.
 */
export function requiredContribution(
  rate: number,
  periods: number,
  targetMinor: number,
  presentMinor = 0,
): number {
  if (periods <= 0) throw new Error('periods must be positive')
  if (rate === 0) return Math.ceil((targetMinor - presentMinor) / periods)
  const growth = (1 + rate) ** periods
  return Math.ceil(((targetMinor - presentMinor * growth) * rate) / (growth - 1))
}

// ── amortisation ────────────────────────────────────────────────────────────

export interface AmortisationRow {
  readonly period: number
  readonly paymentMinor: number
  readonly interestMinor: number
  readonly principalMinor: number
  readonly balanceMinor: number
}

/**
 * Standard amortisation schedule. Every row is integer minor units, and the final payment
 * absorbs accumulated rounding so the balance lands exactly on zero.
 */
export function amortise(
  principalMinor: number,
  rate: number,
  periods: number,
  extraPerPeriodMinor = 0,
): AmortisationRow[] {
  if (periods <= 0) throw new Error('periods must be positive')
  const payment = Math.round(pmt(rate, periods, principalMinor))
  const rows: AmortisationRow[] = []

  let balance = principalMinor
  for (let period = 1; period <= periods && balance > 0; period += 1) {
    const interest = Math.round(balance * rate)
    let principalPart = payment - interest + extraPerPeriodMinor

    // The level payment is rounded to whole minor units, so over a long term the
    // rounding accumulates and the schedule would otherwise end with a few paise
    // outstanding. The final period settles whatever is left.
    if (principalPart > balance || period === periods) principalPart = balance

    balance -= principalPart
    rows.push({
      period,
      paymentMinor: principalPart + interest,
      interestMinor: interest,
      principalMinor: principalPart,
      balanceMinor: balance,
    })
  }
  return rows
}

export interface PrepaymentSaving {
  readonly interestWithoutMinor: number
  readonly interestWithMinor: number
  readonly interestSavedMinor: number
  readonly periodsWithout: number
  readonly periodsWith: number
  readonly periodsSaved: number
}

/** What paying a bit extra every month actually buys you. */
export function prepaymentSavings(
  principalMinor: number,
  rate: number,
  periods: number,
  extraPerPeriodMinor: number,
): PrepaymentSaving {
  const without = amortise(principalMinor, rate, periods)
  const with_ = amortise(principalMinor, rate, periods, extraPerPeriodMinor)
  const totalInterest = (rows: AmortisationRow[]) => rows.reduce((a, r) => a + r.interestMinor, 0)

  return {
    interestWithoutMinor: totalInterest(without),
    interestWithMinor: totalInterest(with_),
    interestSavedMinor: totalInterest(without) - totalInterest(with_),
    periodsWithout: without.length,
    periodsWith: with_.length,
    periodsSaved: without.length - with_.length,
  }
}

// ── variance decomposition ──────────────────────────────────────────────────

export interface VarianceDecomposition {
  /** (p₁−p₀)·q₀ — you paid more per unit. */
  readonly rateEffectMinor: number
  /** (q₁−q₀)·p₀ — you bought more units. */
  readonly volumeEffectMinor: number
  /** (p₁−p₀)(q₁−q₀) — the cross term, reported rather than silently folded in. */
  readonly interactionMinor: number
  readonly totalMinor: number
}

/**
 * Budget variance split into rate × volume: did you buy more coffee, or did coffee get
 * dearer? The interaction term is kept separate because folding it into one of the other
 * two is a choice, and hiding a choice inside a number is how dashboards mislead.
 */
export function budgetVariance(
  priceBefore: number,
  quantityBefore: number,
  priceAfter: number,
  quantityAfter: number,
): VarianceDecomposition {
  const dp = priceAfter - priceBefore
  const dq = quantityAfter - quantityBefore

  const rateEffect = Math.round(dp * quantityBefore)
  const volumeEffect = Math.round(dq * priceBefore)
  const interaction = Math.round(dp * dq)

  return {
    rateEffectMinor: rateEffect,
    volumeEffectMinor: volumeEffect,
    interactionMinor: interaction,
    totalMinor: rateEffect + volumeEffect + interaction,
  }
}

export interface FxAttribution {
  /** Change explained by your own flows, at the old rate. */
  readonly flowEffectMinor: number
  /** Change explained by the rupee moving, on the old balance. */
  readonly fxEffectMinor: number
  readonly interactionMinor: number
  readonly totalMinor: number
}

/**
 * Brinson-style decomposition: how much of your net-worth change was you, and how much was
 * the currency? Δ = flow + fx + interaction.
 */
export function fxAttribution(
  openingForeignMinor: number,
  netFlowForeignMinor: number,
  rateBefore: number,
  rateAfter: number,
): FxAttribution {
  const dRate = rateAfter - rateBefore

  const flowEffect = Math.round(netFlowForeignMinor * rateBefore)
  const fxEffect = Math.round(openingForeignMinor * dRate)
  const interaction = Math.round(netFlowForeignMinor * dRate)

  return {
    flowEffectMinor: flowEffect,
    fxEffectMinor: fxEffect,
    interactionMinor: interaction,
    totalMinor: flowEffect + fxEffect + interaction,
  }
}
