/**
 * Trips, inferred from the ledger rather than declared.
 *
 * Nobody remembers to press "I'm travelling". But a trip leaves an unmistakable shape in
 * spend: for a run of days, the money moves in the other country's currency and the spending
 * you'd normally do at home stops.
 *
 * That second half is the whole discriminator. Buying something online in AED is one foreign
 * transaction on an otherwise ordinary day; being in Dubai is a week where *most* of what you
 * spent was in dirhams. Without the share test, every cross-border online order becomes a
 * one-day "trip" and the feature is noise.
 */

export interface TripDay {
  /** ISO date, `YYYY-MM-DD`. Sorted ascending by the caller. */
  readonly day: string
  /** Spend that day in the away currency, in its own minor units. */
  readonly awayMinor: number
  /** Spend that day in the home currency, in home minor units. */
  readonly homeMinor: number
  /** The away spend converted at the rate frozen on those rows. Never recomputed. */
  readonly awayInHomeMinor: number
}

export interface Trip {
  readonly startDay: string
  readonly endDay: string
  /** Inclusive day count, so a Friday-to-Sunday trip is 3. */
  readonly days: number
  /** Total away-currency spend, in away minor units. */
  readonly awayMinor: number
  /** The same spend in home currency, at the rates frozen on the rows. */
  readonly awayInHomeMinor: number
  /** Home-currency spend that continued during the trip — rent, subscriptions, standing bills. */
  readonly homeMinor: number
  /** Away share of everything spent during the window, 0–1. */
  readonly awayShare: number
  /** Everything the trip cost, in home currency. */
  readonly totalInHomeMinor: number
}

export interface TripOptions {
  /** A run shorter than this is a purchase, not a trip. */
  readonly minDays?: number
  /** A day or two without a card swipe abroad does not end a trip. */
  readonly maxGapDays?: number
  /** Away spend must be at least this share of the window to count as being there. */
  readonly minAwayShare?: number
}

const DAY_MS = 86_400_000

/** Whole days between two ISO dates. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS)
}

export function detectTrips(
  days: readonly TripDay[],
  { minDays = 2, maxGapDays = 2, minAwayShare = 0.6 }: TripOptions = {},
): Trip[] {
  const active = days.filter((d) => d.awayMinor > 0)
  if (active.length === 0) return []

  // Group days with away spend into runs, tolerating a short gap.
  const runs: TripDay[][] = []
  let run: TripDay[] = [active[0]!]

  for (const day of active.slice(1)) {
    const gap = daysBetween(run[run.length - 1]!.day, day.day)
    if (gap <= maxGapDays + 1) run.push(day)
    else {
      runs.push(run)
      run = [day]
    }
  }
  runs.push(run)

  return runs
    .map((group): Trip => {
      const startDay = group[0]!.day
      const endDay = group[group.length - 1]!.day

      // Home spend is summed over the whole window, including the quiet days inside a gap —
      // rent does not stop because you are away, and pretending it did would flatter the trip.
      const inWindow = days.filter((d) => d.day >= startDay && d.day <= endDay)

      const awayMinor = group.reduce((a, d) => a + d.awayMinor, 0)
      const awayInHomeMinor = group.reduce((a, d) => a + d.awayInHomeMinor, 0)
      const homeMinor = inWindow.reduce((a, d) => a + d.homeMinor, 0)
      const total = awayInHomeMinor + homeMinor

      return {
        startDay,
        endDay,
        days: daysBetween(startDay, endDay) + 1,
        awayMinor,
        awayInHomeMinor,
        homeMinor,
        awayShare: total === 0 ? 0 : awayInHomeMinor / total,
        totalInHomeMinor: total,
      }
    })
    .filter((t) => t.days >= minDays && t.awayShare >= minAwayShare)
}

/**
 * What the trip cost beyond simply existing.
 *
 * You would have spent *something* those days anyway — the interesting number is the excess
 * over your ordinary daily rate, not the gross total. Reporting the gross is how travel
 * budgeting apps make every trip look ruinous.
 */
export function tripExcess(trip: Trip, baselineDailyHomeMinor: number): number {
  return Math.max(0, trip.totalInHomeMinor - baselineDailyHomeMinor * trip.days)
}
