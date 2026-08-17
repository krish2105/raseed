import { compare, divide, mul, sub, zero, type Currency, type Money } from '@raseed/money'

/**
 * How a trip in progress is going.
 *
 * `MOBILE_ARCHITECTURE.md` F15 asks for "a trip envelope with its own budget, per-day burn rate,
 * and an iOS Live Activity showing remaining budget on the lock screen". This computes all three,
 * and it is the only place any of them is computed — the screen and the Live Activity render the
 * same object, so a lock screen can never disagree with the app that put it there.
 *
 * **Trip Mode is a toggle, not a detector.** That was settled in F15 and re-confirmed the hard
 * way: `detectTrips` filters `days >= minDays` with `minDays = 2`, so nothing is detected on day
 * one — and a lock-screen activity that appears on day three of a five-day trip is worse than
 * none. A person starting a trip also supplies the `name` and `country` the table requires and
 * the ledger cannot invent. So no detection rule appears here; there is nothing to detect.
 *
 * Time is a parameter, as it must be in this package. `today` is the caller's clock, sampled
 * where the ledger is sampled.
 */

/** Whether the trip is tracking under, over, or too early to say. */
export type TripPace = 'under' | 'over' | 'on-track' | 'no-budget' | 'too-early'

export interface TripProgress {
  /** 1 on the day you started. Never 0, and never negative. */
  readonly dayNumber: number
  /** Days the trip is planned to run, when an end is known. */
  readonly totalDays: number | null
  readonly daysRemaining: number | null
  readonly spent: Money
  readonly budget: Money | null
  /** Budget minus spend. Negative once the envelope is gone — that is not an error. */
  readonly remaining: Money | null
  /** Average spend per elapsed day. A description of the trip, never anybody's share. */
  readonly burnPerDay: Money
  /** Burn rate carried to the last day, when the length is known. */
  readonly projectedTotal: Money | null
  readonly pace: TripPace
}

export interface TripProgressInput {
  /** Epoch day the trip started, inclusive. */
  readonly startedDay: number
  /** Epoch day it is planned to end, inclusive. `null` for an open-ended trip. */
  readonly endsDay: number | null
  /** The caller's today, as an epoch day. */
  readonly today: number
  readonly spent: Money
  readonly budget: Money | null
  readonly currency: Currency
}

export function tripProgress({
  startedDay,
  endsDay,
  today,
  spent,
  budget,
  currency,
}: TripProgressInput): TripProgress {
  // Clamped at 1. A trip cannot be on day zero, and a clock that has drifted behind the start
  // date must not produce a negative divisor — that would flip the burn rate's sign and render
  // a *negative* daily spend, which reads as income.
  const dayNumber = Math.max(1, today - startedDay + 1)

  const totalDays = endsDay === null ? null : Math.max(1, endsDay - startedDay + 1)
  const daysRemaining = totalDays === null ? null : Math.max(0, totalDays - dayNumber)

  // `divide`, not `allocate`. This is a rate to display, not money handed to anyone — see the
  // comment on `divide`. `dayNumber` is guaranteed >= 1 above, so this cannot throw.
  const burnPerDay = divide(spent, dayNumber)

  const remaining = budget === null ? null : sub(budget, spent)
  const projectedTotal = totalDays === null ? null : mul(burnPerDay, totalDays)

  return {
    dayNumber,
    totalDays,
    daysRemaining,
    spent,
    budget,
    remaining,
    burnPerDay,
    projectedTotal,
    pace: pace({ budget, projectedTotal, dayNumber, currency }),
  }
}

/**
 * The verdict, and it is deliberately reluctant to give one.
 *
 * A single day is not a trend. Projecting from one day's spend produces "you will spend ₹90,000"
 * from one airport lunch, and a lock screen that says that on day one is a lock screen people
 * turn off. Two days is still thin, but it is the first point at which the number is an average
 * of anything, so that is the floor.
 *
 * `on-track` exists so the honest middle is sayable. Without it every trip is either failing or
 * winning, and most trips are neither.
 */
function pace({
  budget,
  projectedTotal,
  dayNumber,
  currency,
}: {
  budget: Money | null
  projectedTotal: Money | null
  dayNumber: number
  currency: Currency
}): TripPace {
  if (budget === null || projectedTotal === null) return 'no-budget'
  if (dayNumber < 2) return 'too-early'

  const overshoot = sub(projectedTotal, budget)
  if (compare(overshoot, zero(currency)) <= 0) {
    // Within 10% of the envelope is "on track", not "winning". Calling a 2% margin a success
    // invites a victory lap on the day before it is spent.
    const tenth = mul(budget, 0.1)
    return compare(sub(budget, projectedTotal), tenth) > 0 ? 'under' : 'on-track'
  }
  return 'over'
}
