/**
 * Remittance detection — the differentiator.
 *
 * Sending AED home to INR is not spend in AED and not income in INR. It is one movement of
 * your own money, and counting it twice is the single biggest reason cross-border users
 * abandon expense trackers.
 */

export interface RemittanceLeg {
  readonly id: string
  readonly direction: 'out' | 'in'
  readonly amountMinor: number
  readonly currency: 'INR' | 'AED'
  readonly occurredAt: number
}

export interface Remittance {
  readonly outflowId: string
  readonly inflowId: string
  readonly impliedRate: number
  readonly midMarketRate: number
  /**
   * Implied ÷ mid-market. Below 1 means the transfer cost you money; 0.97 means you lost
   * 3% to spread and fees. Nobody else computes this.
   */
  readonly efficiency: number
  /** What the spread cost, in the destination currency's minor units. */
  readonly costMinor: number
  readonly confidence: number
}

export interface RemittanceOptions {
  /** Legs must be within this window. Default 5 days. */
  readonly windowMs?: number
  /** Implied rate must be within this fraction of mid-market. Default 5%. */
  readonly rateTolerance?: number
  /** Ignore outflows below this, in minor units — a 20 AED coffee is not a remittance. */
  readonly minAmountMinor?: number
}

const DAY = 86_400_000

/**
 * @param midMarket Rate lookup: how many units of `quote` one unit of `base` buys, at a
 *   given time. Passed in rather than fetched — this package is pure.
 */
export function detectRemittance(
  legs: readonly RemittanceLeg[],
  midMarket: (base: 'INR' | 'AED', quote: 'INR' | 'AED', at: number) => number,
  options: RemittanceOptions = {},
): Remittance[] {
  const { windowMs = 5 * DAY, rateTolerance = 0.05, minAmountMinor = 10_000 } = options

  const outflows = legs
    .filter((l) => l.direction === 'out' && Math.abs(l.amountMinor) >= minAmountMinor)
    .sort((a, b) => a.occurredAt - b.occurredAt)
  const inflows = legs.filter((l) => l.direction === 'in')

  const used = new Set<string>()
  const found: Remittance[] = []

  for (const out of outflows) {
    let best: { leg: RemittanceLeg; rate: number; mid: number; drift: number } | null = null

    for (const inflow of inflows) {
      if (used.has(inflow.id)) continue
      // Same-currency movement is a transfer between your own accounts, not a remittance.
      if (inflow.currency === out.currency) continue
      if (Math.abs(inflow.occurredAt - out.occurredAt) > windowMs) continue
      if (out.amountMinor === 0) continue

      const implied = Math.abs(inflow.amountMinor) / Math.abs(out.amountMinor)
      const mid = midMarket(out.currency, inflow.currency, out.occurredAt)
      if (!Number.isFinite(mid) || mid <= 0) continue

      const drift = Math.abs(implied - mid) / mid
      if (drift > rateTolerance) continue

      if (!best || drift < best.drift) best = { leg: inflow, rate: implied, mid, drift }
    }

    if (!best) continue
    used.add(best.leg.id)

    const efficiency = best.rate / best.mid
    // What you would have received at mid-market, minus what you actually received.
    const expected = Math.abs(out.amountMinor) * best.mid
    const costMinor = Math.round(expected - Math.abs(best.leg.amountMinor))

    found.push({
      outflowId: out.id,
      inflowId: best.leg.id,
      impliedRate: round4(best.rate),
      midMarketRate: round4(best.mid),
      efficiency: round4(efficiency),
      costMinor,
      // Tight rate agreement and a small time gap both raise confidence.
      confidence: round2(
        (1 - best.drift / rateTolerance) * 0.7 +
          (1 - Math.abs(best.leg.occurredAt - out.occurredAt) / windowMs) * 0.3,
      ),
    })
  }

  return found
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
