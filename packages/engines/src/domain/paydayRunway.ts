import { money, type Money } from '@raseed/money'

/**
 * Payday Runway — does the money reach the money?
 *
 * Safe-to-Spend answers "what can I spend today". This answers the question underneath it:
 * **at the rate you are actually going, do you arrive at payday with anything left, and if not,
 * which day do you run out on.** A daily allowance can look healthy while the month is already
 * lost, because an allowance divides what remains and says nothing about what you keep doing.
 *
 * The burn rate is a *median*, not a mean. One rent day and one flight in the window pull a mean
 * up by a third and produce a runway that is wrong in the reassuring direction — the direction
 * that costs you money. The median asks what an ordinary day looks like and lets the outliers
 * be outliers.
 *
 * Pure. Time is passed in, and every amount is minor units.
 */

export interface RunwayInput {
  readonly liquidBalance: Money
  /** Bills already committed and due before the next income lands. */
  readonly committedBills: readonly Money[]
  /** Kept back whatever the arithmetic says. */
  readonly safetyBuffer: Money
  /** Home-currency spend per day, most recent last. Zero days included — a gap is information. */
  readonly dailySpend: readonly number[]
  /** Epoch ms. */
  readonly today: number
  readonly nextIncomeAt: number
}

export interface RunwayResult {
  /** What is genuinely available between now and payday. */
  readonly pool: Money
  /** The ordinary day, by median. */
  readonly burnPerDay: Money
  readonly daysUntilIncome: number
  /** How many days the pool covers at that rate. Infinity when nothing is being spent. */
  readonly daysCovered: number
  /** Epoch ms of the day the pool runs out, or null when it lasts past payday. */
  readonly runsOutAt: number | null
  /** True when the runway reaches payday. The headline. */
  readonly reachesPayday: boolean
  /** What you would have to hold to, per day, to make it. Zero when already fine. */
  readonly requiredPerDay: Money
  /** How confident the burn rate is: how many days of history it was computed from. */
  readonly observedDays: number
}

const DAY = 86_400_000

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!
}

export function paydayRunway(input: RunwayInput): RunwayResult {
  const currency = input.liquidBalance.currency

  const committed = input.committedBills.reduce((a, b) => a + b.minor, 0)
  const poolMinor = Math.max(
    0,
    input.liquidBalance.minor - committed - input.safetyBuffer.minor,
  )

  /**
   * Days with no spend stay in the sample.
   *
   * Dropping them measures "what a spending day costs", which is a different and much larger
   * number than "what a day costs" — and the runway is counting days, not spending days.
   */
  const burnMinor = Math.max(0, median(input.dailySpend))

  const msUntilIncome = input.nextIncomeAt - input.today
  const daysUntilIncome = Math.max(0, Math.ceil(msUntilIncome / DAY))

  /**
   * An empty pool covers nothing, whatever the burn rate is.
   *
   * Found on the simulator, and it is the kind of bug that only shows up in front of you: a
   * sparse ledger has a median daily spend of zero, zero burn divides into an infinite runway,
   * and the screen answered **"Yes"** over the words "₹0.00 of room". Arithmetically true and
   * completely wrong as an answer — "you will reach payday because you are spending nothing"
   * is the most dangerous kind of reassurance a finance app can offer.
   *
   * So the pool is checked first. With nothing left you have not reached payday; you have
   * arrived at today with nothing, which is a different sentence.
   */
  const daysCovered =
    poolMinor === 0 ? 0 : burnMinor === 0 ? Number.POSITIVE_INFINITY : poolMinor / burnMinor
  const reachesPayday = poolMinor > 0 && daysCovered >= daysUntilIncome

  const runsOutAt = reachesPayday ? null : input.today + Math.floor(daysCovered) * DAY

  // What it would take. Only meaningful when the answer is "not at this rate".
  const requiredMinor =
    reachesPayday || daysUntilIncome === 0 ? 0 : Math.floor(poolMinor / daysUntilIncome)

  return {
    pool: money(poolMinor, currency),
    burnPerDay: money(burnMinor, currency),
    daysUntilIncome,
    daysCovered,
    runsOutAt,
    reachesPayday,
    requiredPerDay: money(requiredMinor, currency),
    observedDays: input.dailySpend.length,
  }
}
