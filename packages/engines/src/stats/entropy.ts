/**
 * How concentrated is your spending, in one number?
 *
 * Gini and Pareto answer "is one merchant eating everything". Entropy answers a different
 * and more useful question: **how many things does your money genuinely go to?** Someone
 * spending across twelve categories evenly and someone spending 90% on rent both have
 * twelve categories on the pie chart, and the pie chart is lying to one of them.
 *
 * The perplexity is the number worth showing. Entropy in bits is correct and unreadable;
 * "your money effectively goes to 4.2 places" is the same fact in a sentence a person can
 * use. It is the exponential of Shannon entropy — the standard trick from ecology, where it
 * is the effective species count, and from language modelling, where it is perplexity.
 */

export interface Concentration {
  /** Shannon entropy in bits. 0 when everything goes to one place. */
  readonly entropy: number
  /**
   * Effective number of destinations, `2^entropy`. Spending split evenly across four
   * categories gives exactly 4; heavily skewed across twenty can give under 3.
   */
  readonly effectiveCount: number
  /** Actual non-zero destinations, for the contrast that makes the above land. */
  readonly nominalCount: number
  /** `effectiveCount / nominalCount`, 0–1. How evenly spread, independent of how many. */
  readonly evenness: number
}

export function concentrationOf(amounts: readonly number[]): Concentration {
  // Negative amounts are refunds; they are not a destination money went to.
  const positive = amounts.filter((a) => a > 0)
  const total = positive.reduce((a, b) => a + b, 0)

  if (total === 0 || positive.length === 0) {
    return { entropy: 0, effectiveCount: 0, nominalCount: 0, evenness: 0 }
  }

  // The `+ 0` is not decoration: a single destination gives -(1 × log2(1)) = -0, and -0
  // renders as "-0" and fails an equality check against 0.
  const entropy =
    -positive.map((a) => a / total).reduce((acc, p) => acc + p * Math.log2(p), 0) + 0

  const effectiveCount = 2 ** entropy

  return {
    entropy,
    effectiveCount,
    nominalCount: positive.length,
    evenness: positive.length <= 1 ? 1 : effectiveCount / positive.length,
  }
}
