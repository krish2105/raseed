/**
 * Downside risk on your own spending.
 *
 * Every budgeting app tells you the average month. The average month is not the one that
 * hurts — the bad month is, and "average plus a bit" is not how bad months behave. Value at
 * Risk asks the honest question: **how bad is the bad month, and how often is it?**
 *
 * Borrowed from market risk and pointed at personal cash flow, where it fits better than it
 * does at its origin: a household's monthly outgoings are far closer to a stable
 * distribution than an asset return series, and unlike a trader you cannot liquidate.
 */

export interface RiskProfile {
  /**
   * The threshold: you spend more than this in `(1 − confidence)` of months.
   * At 95%, one month in twenty.
   */
  readonly valueAtRisk: number
  /**
   * The average of *those* months — what a bad month actually costs, not merely where the
   * bad months begin. VaR alone is the famous flaw: it tells you the edge of the cliff and
   * nothing about the drop.
   */
  readonly conditionalValueAtRisk: number
  /** Median month, for the comparison that makes the other two mean something. */
  readonly typical: number
  /** `cvar − typical`. What one bad month costs you over an ordinary one. */
  readonly shortfall: number
  /** How many observations this rests on. Below ~12 the tail is a guess; say so. */
  readonly observations: number
  readonly confidence: number
}

/**
 * Historical (non-parametric) VaR. No distribution is assumed.
 *
 * Fitting a normal to spending would be quicker and wrong in the direction that matters:
 * spending is right-skewed — rent, a flight, a wedding — and a normal fit systematically
 * understates exactly the tail this function exists to measure.
 */
export function riskProfile(amounts: readonly number[], confidence = 0.95): RiskProfile {
  const sorted = [...amounts].sort((a, b) => a - b)
  const n = sorted.length

  if (n === 0) {
    return {
      valueAtRisk: 0,
      conditionalValueAtRisk: 0,
      typical: 0,
      shortfall: 0,
      observations: 0,
      confidence,
    }
  }

  // Nearest-rank, clamped. Interpolating between order statistics implies a precision the
  // sample size does not support.
  const rank = Math.min(n - 1, Math.max(0, Math.ceil(confidence * n) - 1))
  const varValue = sorted[rank] as number

  const tail = sorted.slice(rank)
  const cvar = tail.reduce((a, b) => a + b, 0) / tail.length

  const typical = sorted[Math.floor(n / 2)] as number

  return {
    valueAtRisk: varValue,
    conditionalValueAtRisk: cvar,
    typical,
    shortfall: Math.max(0, cvar - typical),
    observations: n,
    confidence,
  }
}
