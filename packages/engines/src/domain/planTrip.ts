import { allocate, money, type Money } from '@raseed/money'

/**
 * Planning a trip from your own spending, not from a template.
 *
 * Every travel budgeter starts from a generic split — 40% accommodation, 30% food, and so
 * on — which describes nobody. The differentiator here is that **every figure comes from
 * this person's actual behaviour**: your real average per restaurant meal, your real hotel
 * tier, your real rate of unplanned shopping. No travel app has your ledger and no budgeting
 * app bothers to look.
 *
 * Everything is an estimate and is labelled as one. These are not live prices and must never
 * be shown as though they were.
 */

export type Intent = 'food' | 'culture' | 'beach' | 'adventure' | 'shopping' | 'family'

export interface TravelHabits {
  /** Your real average per restaurant meal, from the ledger. */
  readonly mealTypical: Money
  /** Your real average night of accommodation on past trips. */
  readonly nightTypical: Money
  /** Your real average day of local transport while away. */
  readonly transportDaily: Money
  /** What you actually spend on shopping per travelling day, historically. */
  readonly shoppingDaily: Money
  /** Meals a day you actually eat out while travelling. */
  readonly mealsPerDay: number
  /** How many past trips this rests on. Below 2, say so rather than imply precision. */
  readonly tripsObserved: number
}

/**
 * A destination cost multiplier against your home baseline. 1.0 means it costs what home
 * costs. Supplied by the caller — no engine hardcodes an economic series.
 */
export interface DestinationIndex {
  readonly name: string
  readonly mealMultiplier: number
  readonly stayMultiplier: number
  readonly transportMultiplier: number
}

export interface TripPlan {
  readonly lines: readonly { readonly label: string; readonly amount: Money; readonly share: number }[]
  readonly total: Money
  /** Your stated budget. */
  readonly budget: Money
  /** Positive means the plan fits. */
  readonly headroom: Money
  readonly fits: boolean
  /** Estimated meals out the food line actually buys, at your usual rate. */
  readonly mealsAfforded: number
  /**
   * False when there is too little travel history for these to mean much. The UI must say
   * so — an estimate presented with unearned confidence is worse than no estimate.
   */
  readonly confident: boolean
  /** What had to be trimmed, if anything, to fit the budget. */
  readonly notes: readonly string[]
}

/** Intents shift where the money goes. Weights, not rules — this only tilts the split. */
const TILT: Record<Intent, Partial<Record<'food' | 'stay' | 'activities' | 'shopping', number>>> = {
  food: { food: 1.5, activities: 0.8 },
  culture: { activities: 1.6, food: 1.1 },
  beach: { stay: 1.3, activities: 0.7 },
  adventure: { activities: 1.8, stay: 0.85 },
  shopping: { shopping: 2, activities: 0.7 },
  family: { stay: 1.25, activities: 1.2, shopping: 0.8 },
}

export function planTrip({
  nights,
  budget,
  intents,
  habits,
  destination,
  flights,
}: {
  readonly nights: number
  readonly budget: Money
  readonly intents: readonly Intent[]
  readonly habits: TravelHabits
  readonly destination: DestinationIndex
  /** Known or estimated. Passed in because no engine calls an airline. */
  readonly flights: Money
}): TripPlan {
  const days = Math.max(1, nights)
  const notes: string[] = []

  const tilt = (key: 'food' | 'stay' | 'activities' | 'shopping') =>
    intents.reduce((acc, i) => acc * (TILT[i]?.[key] ?? 1), 1)

  // Each line is your own rate, adjusted for where you are going, then tilted by intent.
  const food = Math.round(
    habits.mealTypical.minor * habits.mealsPerDay * days * destination.mealMultiplier * tilt('food'),
  )
  const stay = Math.round(habits.nightTypical.minor * nights * destination.stayMultiplier * tilt('stay'))
  const transport = Math.round(habits.transportDaily.minor * days * destination.transportMultiplier)
  const shopping = Math.round(habits.shoppingDaily.minor * days * tilt('shopping'))

  // Activities are the one line with no history behind them, so they are derived from the
  // rest rather than invented — a fraction of the day's other spending, tilted by intent.
  const activities = Math.round(((food + transport) / days) * 0.45 * days * tilt('activities'))

  // A buffer that is a real line, not a rounding cushion. Trips overrun; a plan that
  // pretends otherwise sets someone up to feel they failed at it.
  const subtotal = flights.minor + stay + food + transport + shopping + activities
  const buffer = Math.round(subtotal * 0.08)

  let raw: { label: string; minor: number }[] = [
    { label: 'Flights', minor: flights.minor },
    { label: 'Stay', minor: stay },
    { label: 'Food', minor: food },
    { label: 'Activities', minor: activities },
    { label: 'Transport', minor: transport },
    { label: 'Shopping', minor: shopping },
    { label: 'Buffer', minor: buffer },
  ]

  let total = raw.reduce((a, l) => a + l.minor, 0)

  // If it does not fit, scale the discretionary lines rather than the fixed ones. Flights
  // and a booked room are not negotiable by an algorithm; how often you eat out is.
  if (total > budget.minor) {
    const fixed = flights.minor + stay
    const flexible = total - fixed
    const room = budget.minor - fixed

    if (room <= 0) {
      notes.push('Flights and accommodation alone exceed this budget.')
    } else {
      const scale = room / flexible
      raw = raw.map((l) =>
        l.label === 'Flights' || l.label === 'Stay'
          ? l
          : { ...l, minor: Math.round(l.minor * scale) },
      )
      total = raw.reduce((a, l) => a + l.minor, 0)
      notes.push(
        `Trimmed the flexible lines by ${Math.round((1 - scale) * 100)}% to fit — flights and stay were left alone.`,
      )
    }
  }

  // Allocate so the lines add to the total exactly, rather than to the total ± a rupee.
  const exact =
    total > 0
      ? allocate(money(total, budget.currency), raw.map((l) => Math.max(0, l.minor)))
      : raw.map(() => money(0, budget.currency))

  const lines = raw.map((l, i) => ({
    label: l.label,
    amount: exact[i] ?? money(0, budget.currency),
    share: total === 0 ? 0 : (exact[i]?.minor ?? 0) / total,
  }))

  const foodLine = lines.find((l) => l.label === 'Food')?.amount.minor ?? 0
  const perMeal = Math.max(1, Math.round(habits.mealTypical.minor * destination.mealMultiplier))

  if (habits.tripsObserved < 2) {
    notes.push('Based on very little travel history, so treat these as rough.')
  }

  return {
    lines,
    total: money(total, budget.currency),
    budget,
    headroom: money(budget.minor - total, budget.currency),
    fits: total <= budget.minor,
    mealsAfforded: Math.floor(foodLine / perMeal),
    confident: habits.tripsObserved >= 2,
    notes,
  }
}

/**
 * Turning a trip into a savings plan.
 *
 * Capacity, not instruction: how much per month reaches the number by the date. It states
 * arithmetic and takes no view on whether you should.
 */
export function savingsPlan({
  target,
  monthsAway,
  alreadySaved,
  monthlyCapacity,
}: {
  readonly target: Money
  readonly monthsAway: number
  readonly alreadySaved: Money
  /** Genuine monthly room, from actual spending rather than an ideal budget. */
  readonly monthlyCapacity: Money
}): {
  readonly perMonth: Money
  readonly withinCapacity: boolean
  /** Months it would take at your actual capacity, when the deadline does not fit. */
  readonly monthsNeeded: number
  readonly shortfall: Money
} {
  const remaining = Math.max(0, target.minor - alreadySaved.minor)
  const months = Math.max(1, Math.round(monthsAway))
  const perMonth = Math.ceil(remaining / months)

  return {
    perMonth: money(perMonth, target.currency),
    withinCapacity: perMonth <= monthlyCapacity.minor,
    monthsNeeded:
      monthlyCapacity.minor <= 0 ? Infinity : Math.ceil(remaining / monthlyCapacity.minor),
    shortfall: money(Math.max(0, perMonth - monthlyCapacity.minor), target.currency),
  }
}
