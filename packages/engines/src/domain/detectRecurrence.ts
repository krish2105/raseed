/**
 * Recurrence radar — statistical, not regex.
 *
 * A subscription is a merchant whose transactions arrive at a consistent interval for a
 * consistent amount. "Consistent" is a coefficient of variation, so it survives a payment
 * landing a day late, which a fixed-period rule does not.
 */

export interface RecurrenceObservation {
  readonly merchantId: string
  readonly amountMinor: number
  readonly currency: 'INR' | 'AED'
  readonly occurredAt: number
}

export interface Recurrence {
  readonly merchantId: string
  readonly amountMinor: number
  readonly currency: 'INR' | 'AED'
  readonly periodDays: number
  readonly nextDue: number
  readonly confidence: number
  readonly occurrences: number
  /** Set when the latest amount deviates from the prior median by more than the threshold. */
  readonly priceChange: PriceChange | null
}

export interface PriceChange {
  readonly fromMinor: number
  readonly toMinor: number
  /** Annualised difference in minor units, at the detected period. */
  readonly annualDeltaMinor: number
}

export interface RecurrenceOptions {
  /** Minimum observations before a pattern is claimed. Default 3. */
  readonly minOccurrences?: number
  /** Interval CV must be below this. Default 0.15. */
  readonly maxIntervalCv?: number
  /** Amount CV must be below this. Default 0.10. */
  readonly maxAmountCv?: number
  /** Latest amount deviating from the prior median by more than this flags a hike. Default 5%. */
  readonly priceChangeThreshold?: number
}

const DAY = 86_400_000

export function detectRecurrence(
  observations: readonly RecurrenceObservation[],
  options: RecurrenceOptions = {},
): Recurrence[] {
  const {
    minOccurrences = 3,
    maxIntervalCv = 0.15,
    maxAmountCv = 0.1,
    priceChangeThreshold = 0.05,
  } = options

  const byMerchant = new Map<string, RecurrenceObservation[]>()
  for (const o of observations) {
    const list = byMerchant.get(o.merchantId)
    if (list) list.push(o)
    else byMerchant.set(o.merchantId, [o])
  }

  const found: Recurrence[] = []

  for (const [merchantId, group] of byMerchant) {
    if (group.length < minOccurrences) continue

    const ordered = [...group].sort((a, b) => a.occurredAt - b.occurredAt)
    const intervals = diff(ordered.map((o) => o.occurredAt))
    if (intervals.length === 0) continue

    const intervalCv = coefficientOfVariation(intervals)
    // A zero-variance interval is a perfect subscription, not a degenerate case.
    if (!Number.isFinite(intervalCv) || intervalCv >= maxIntervalCv) continue

    const amounts = ordered.map((o) => o.amountMinor)
    const amountCv = coefficientOfVariation(amounts)
    if (!Number.isFinite(amountCv) || amountCv >= maxAmountCv) continue

    const meanInterval = mean(intervals)
    const last = ordered[ordered.length - 1]!

    const priorAmounts = amounts.slice(0, -1)
    const priorMedian = median(priorAmounts)
    const latest = last.amountMinor
    const deviated =
      priorMedian > 0 && Math.abs(latest - priorMedian) / priorMedian > priceChangeThreshold

    const periodDays = meanInterval / DAY

    found.push({
      merchantId,
      amountMinor: latest,
      currency: last.currency,
      periodDays: round2(periodDays),
      nextDue: last.occurredAt + Math.round(meanInterval),
      confidence: round2(1 - intervalCv),
      occurrences: ordered.length,
      priceChange: deviated
        ? {
            fromMinor: Math.round(priorMedian),
            toMinor: latest,
            annualDeltaMinor: Math.round(((latest - priorMedian) * 365) / periodDays),
          }
        : null,
    })
  }

  return found.sort((a, b) => b.confidence - a.confidence)
}

// ── statistics ──────────────────────────────────────────────────────────────

export function diff(values: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < values.length; i += 1) out.push(values[i]! - values[i - 1]!)
  return out
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Population standard deviation. */
export function stdev(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const m = mean(values)
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length)
}

export function coefficientOfVariation(values: readonly number[]): number {
  const m = mean(values)
  if (m === 0) return Number.POSITIVE_INFINITY
  return stdev(values) / Math.abs(m)
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
