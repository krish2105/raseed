import { mean, median } from './index'

/**
 * Change-point detection — when your spending *regime* changed.
 *
 * Not an outlier. An outlier is one strange Tuesday; a change point is the day after which
 * every Tuesday is different. A new flat, a new job, a new habit, a subscription you forgot
 * — these do not show up as spikes, they show up as a shift in the level of the whole
 * series, and a dashboard built only on averages and anomalies will never mention them.
 *
 * CUSUM rather than PELT. PELT is the better algorithm and finds multiple change points
 * optimally, but it needs a cost model and a penalty parameter that has to be tuned per
 * series, and an untuned penalty produces confident nonsense. CUSUM has one interpretable
 * knob — how many standard deviations of drift you will tolerate — and when it is wrong it
 * is wrong quietly.
 */

export interface ChangePoint {
  /** Index into the input series where the level shifted. */
  readonly index: number
  /** Mean of the segment before the shift. */
  readonly before: number
  /** Mean of the segment after. */
  readonly after: number
  /** Signed change, `after - before`. */
  readonly delta: number
  /** |delta| in standard deviations of the pre-shift segment. Bigger is more certain. */
  readonly magnitude: number
}

export interface ChangePointOptions {
  /**
   * Decision interval, in standard deviations of accumulated drift.
   *
   * The textbook pairing is slack k = 0.5σ with h = 5σ, which gives an in-control average
   * run length around 465 — roughly one false alarm per 465 quiet days. Lowering it to 3
   * finds a change point every few weeks on ordinary noise, which is indistinguishable from
   * finding none.
   */
  readonly decisionInterval?: number
  /** A segment shorter than this cannot hold a mean worth comparing. */
  readonly minSegment?: number
}

/**
 * Returns the change points in ascending order, or an empty array when the series is too
 * short or genuinely stationary. An empty array is a real answer, not a failure.
 */
/** Robust scale: MAD × 1.4826 matches σ for a normal, and ignores the shift we are hunting. */
function robustSigma(xs: readonly number[]): number {
  const m = median(xs)
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)))
}

export function changePoints(
  series: readonly number[],
  { decisionInterval = 5, minSegment = 7 }: ChangePointOptions = {},
): ChangePoint[] {
  if (series.length < minSegment * 2) return []

  // Scale is estimated once, robustly, over the whole series. Estimating it from the first
  // few points of each segment made every detection depend on whichever week happened to be
  // quietest — and a MAD is barely moved by the very step change being looked for, which a
  // plain standard deviation is.
  const sigma = robustSigma(series)
  if (sigma === 0) return []

  const SLACK = 0.5
  const found: ChangePoint[] = []
  let segmentStart = 0

  while (segmentStart + minSegment * 2 <= series.length) {
    const rest = series.slice(segmentStart)
    const mu = mean(rest.slice(0, minSegment))

    // Two one-sided cumulative sums, so an increase and a decrease are both detectable.
    let up = 0
    let down = 0
    let hit = -1

    for (let i = minSegment; i < rest.length; i += 1) {
      const z = ((rest[i] as number) - mu) / sigma
      up = Math.max(0, up + z - SLACK)
      down = Math.max(0, down - z - SLACK)
      if (Math.max(up, down) > decisionInterval) {
        hit = i
        break
      }
    }

    if (hit === -1 || segmentStart + hit + minSegment > series.length) break

    const before = mean(series.slice(segmentStart, segmentStart + hit))
    const after = mean(series.slice(segmentStart + hit))

    found.push({
      index: segmentStart + hit,
      before,
      after,
      delta: after - before,
      magnitude: Math.abs(after - before) / sigma,
    })

    segmentStart += hit
  }

  return found
}
