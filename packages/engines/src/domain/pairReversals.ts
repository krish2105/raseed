/**
 * Reversal pairing — a failed UPI debit and its refund 30 minutes later are ONE event that
 * nets to zero, not two transactions that inflate every total you look at.
 */

export interface ReversalCandidate {
  readonly id: string
  readonly accountId: string
  readonly direction: 'out' | 'in'
  readonly amountMinor: number
  readonly occurredAt: number
  readonly merchantId: string | null
  readonly reversalOfId: string | null
}

export interface ReversalPair {
  /** The original outflow. */
  readonly originalId: string
  /** The inflow that reverses it. */
  readonly reversalId: string
  readonly confidence: number
}

export interface PairOptions {
  /** Amounts must match within this fraction. Default 1%. */
  readonly amountTolerance?: number
  /** Maximum gap between the legs. Default 14 days. */
  readonly windowMs?: number
  /** At or above this, pair automatically; below goes to the Weekly Reckoning. */
  readonly autoPairThreshold?: number
}

const DAY = 86_400_000

/**
 * Greedy nearest-match pairing: each transaction is used at most once, and the closest
 * candidate in time wins. Greedy is correct here because a genuine reversal is close in
 * both amount and time, so ambiguity is rare and always surfaces as lower confidence.
 */
export function pairReversals(
  transactions: readonly ReversalCandidate[],
  options: PairOptions = {},
): ReversalPair[] {
  // autoPairThreshold is deliberately not applied here: this function returns every
  // credible pair with its confidence, and `shouldAutoPair` decides which write
  // themselves and which go into the Weekly Reckoning for review.
  const { amountTolerance = 0.01, windowMs = 14 * DAY } = options

  const unpaired = transactions.filter((t) => t.reversalOfId === null)
  const outflows = unpaired.filter((t) => t.direction === 'out')
  const inflows = unpaired.filter((t) => t.direction === 'in')

  const used = new Set<string>()
  const pairs: ReversalPair[] = []

  // Oldest first, so an earlier debit claims its refund before a later one can.
  for (const out of [...outflows].sort((a, b) => a.occurredAt - b.occurredAt)) {
    let best: { candidate: ReversalCandidate; confidence: number } | null = null

    for (const inflow of inflows) {
      if (used.has(inflow.id) || inflow.id === out.id) continue
      if (inflow.accountId !== out.accountId) continue

      const gap = inflow.occurredAt - out.occurredAt
      // A refund follows its debit. An inflow before the debit is not a reversal of it.
      if (gap < 0 || gap > windowMs) continue

      const delta = Math.abs(inflow.amountMinor - out.amountMinor)
      if (delta > Math.max(1, Math.abs(out.amountMinor) * amountTolerance)) continue

      // A merchant mismatch is disqualifying; a missing merchant on the refund is not,
      // because refunds frequently arrive with a bare bank descriptor.
      if (inflow.merchantId !== null && out.merchantId !== null && inflow.merchantId !== out.merchantId) {
        continue
      }

      const confidence = scorePair(out, inflow, delta, gap, windowMs)
      if (!best || confidence > best.confidence) best = { candidate: inflow, confidence }
    }

    if (best) {
      used.add(best.candidate.id)
      pairs.push({ originalId: out.id, reversalId: best.candidate.id, confidence: best.confidence })
    }
  }

  return pairs.filter((p) => p.confidence > 0).sort((a, b) => b.confidence - a.confidence)
}

function scorePair(
  out: ReversalCandidate,
  inflow: ReversalCandidate,
  delta: number,
  gap: number,
  windowMs: number,
): number {
  const exactAmount = delta === 0 ? 1 : 1 - delta / Math.max(1, Math.abs(out.amountMinor))
  const recency = 1 - gap / windowMs
  const merchantMatch = inflow.merchantId !== null && inflow.merchantId === out.merchantId ? 1 : 0.85

  // Amount is the strongest signal; a same-day exact-amount refund from the same merchant
  // should clear the auto-pair bar, a two-week-later approximate one should not.
  return round2(exactAmount * 0.5 + recency * 0.2 + merchantMatch * 0.3)
}

export function shouldAutoPair(pair: ReversalPair, options: PairOptions = {}): boolean {
  return pair.confidence >= (options.autoPairThreshold ?? 0.9)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
