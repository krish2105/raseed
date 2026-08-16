/**
 * Regret rate — the difference between a ledger and a mirror.
 *
 * Of the money you rated in a category, what share did you mark "not worth it"? Weighted by
 * amount, not by count: ten regretted chais matter less than one regretted ₹8,000 dinner.
 */

export interface RatedTransaction {
  readonly id: string
  readonly categoryId: string
  /** Home-currency minor units, so categories are comparable across INR and AED. */
  readonly homeAmountMinor: number
  /** -1 not worth it · 0 neutral/skipped · 1 worth it. Null means unrated. */
  readonly score: -1 | 0 | 1 | null
}

export interface CategoryRegret {
  readonly categoryId: string
  /** Σ(amount where score = −1) ÷ Σ(amount rated). 0–1. */
  readonly regretRate: number
  readonly regrettedMinor: number
  readonly ratedMinor: number
  readonly ratedCount: number
  /** Share of the category's spend that has been rated — low coverage means low trust. */
  readonly coverage: number
}

export function regretRate(transactions: readonly RatedTransaction[]): CategoryRegret[] {
  interface Bucket {
    regretted: number
    rated: number
    ratedCount: number
    total: number
  }
  const buckets = new Map<string, Bucket>()

  for (const t of transactions) {
    const b = buckets.get(t.categoryId) ?? { regretted: 0, rated: 0, ratedCount: 0, total: 0 }
    const amount = Math.abs(t.homeAmountMinor)
    b.total += amount

    // A skipped rating is not evidence of satisfaction, so it stays out of the denominator.
    if (t.score !== null) {
      b.rated += amount
      b.ratedCount += 1
      if (t.score === -1) b.regretted += amount
    }
    buckets.set(t.categoryId, b)
  }

  return [...buckets.entries()]
    .map(([categoryId, b]) => ({
      categoryId,
      regretRate: b.rated === 0 ? 0 : round4(b.regretted / b.rated),
      regrettedMinor: b.regretted,
      ratedMinor: b.rated,
      ratedCount: b.ratedCount,
      coverage: b.total === 0 ? 0 : round4(b.rated / b.total),
    }))
    .sort((a, b) => b.regretRate - a.regretRate || b.regrettedMinor - a.regrettedMinor)
}

/** The categories worth surfacing in the Reckoning: most regretted money first. */
export function topRegretCategories(
  transactions: readonly RatedTransaction[],
  limit = 3,
  minRatedCount = 2,
): CategoryRegret[] {
  return regretRate(transactions)
    .filter((c) => c.ratedCount >= minRatedCount && c.regrettedMinor > 0)
    .sort((a, b) => b.regrettedMinor - a.regrettedMinor)
    .slice(0, limit)
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
