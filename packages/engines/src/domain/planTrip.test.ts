import { describe, expect, it } from 'vitest'
import { fromMajor, money } from '@raseed/money'
import { planTrip, savingsPlan, type DestinationIndex, type TravelHabits } from './planTrip'

const habits: TravelHabits = {
  mealTypical: fromMajor('95', 'INR'),
  nightTypical: fromMajor('3800', 'INR'),
  transportDaily: fromMajor('300', 'INR'),
  shoppingDaily: fromMajor('250', 'INR'),
  mealsPerDay: 2,
  tripsObserved: 6,
}

const istanbul: DestinationIndex = {
  name: 'Istanbul',
  mealMultiplier: 1.4,
  stayMultiplier: 1.2,
  transportMultiplier: 0.8,
}

const base = {
  nights: 5,
  budget: fromMajor('60000', 'INR'),
  intents: [] as const,
  habits,
  destination: istanbul,
  flights: fromMajor('17000', 'INR'),
}

describe('planTrip', () => {
  it('adds up to exactly its own total, with no stray paisa', () => {
    const p = planTrip({ ...base })
    expect(p.lines.reduce((a, l) => a + l.amount.minor, 0)).toBe(p.total.minor)
  })

  it('shares sum to 1', () => {
    const p = planTrip({ ...base })
    expect(p.lines.reduce((a, l) => a + l.share, 0)).toBeCloseTo(1, 6)
  })

  /** The whole differentiator: the food line is derived from YOUR per-meal rate. */
  it('derives food from your own per-meal rate and the destination', () => {
    const p = planTrip({ ...base })
    const food = p.lines.find((l) => l.label === 'Food')!.amount.minor
    // 95 x 1.4 x 2 meals x 5 days = 1,330
    expect(food).toBeGreaterThan(fromMajor('1200', 'INR').minor)
    expect(food).toBeLessThan(fromMajor('1500', 'INR').minor)
  })

  it('reports how many meals out that actually buys', () => {
    const p = planTrip({ ...base })
    expect(p.mealsAfforded).toBeGreaterThan(5)
    expect(p.mealsAfforded).toBeLessThan(20)
  })

  it('tilts toward food when food is the point of the trip', () => {
    const plain = planTrip({ ...base })
    const foodie = planTrip({ ...base, intents: ['food'] })
    const share = (p: typeof plain) => p.lines.find((l) => l.label === 'Food')!.share
    expect(share(foodie)).toBeGreaterThan(share(plain))
  })

  it('tilts toward activities for culture, and shopping for shopping', () => {
    const culture = planTrip({ ...base, intents: ['culture'] })
    const shopper = planTrip({ ...base, intents: ['shopping'] })
    const plain = planTrip({ ...base })
    const shareOf = (p: typeof plain, label: string) =>
      p.lines.find((l) => l.label === label)!.share
    expect(shareOf(culture, 'Activities')).toBeGreaterThan(shareOf(plain, 'Activities'))
    expect(shareOf(shopper, 'Shopping')).toBeGreaterThan(shareOf(plain, 'Shopping'))
  })

  it('always leaves a real buffer line rather than pretending trips run to plan', () => {
    expect(planTrip({ ...base }).lines.some((l) => l.label === 'Buffer')).toBe(true)
  })

  /**
   * Flights and a booked room are not negotiable by an algorithm; how often you eat out is.
   */
  it('trims only the flexible lines when the budget is tight', () => {
    // Fixed costs here are ~39,800 (17,000 flights + 22,800 stay), so 45,000 leaves room
    // to trim the flexible lines. Picking 30,000 lands in the *impossible* branch instead,
    // which is a different behaviour with its own test below.
    const tight = planTrip({ ...base, budget: fromMajor('45000', 'INR') })
    expect(tight.lines.find((l) => l.label === 'Flights')!.amount.minor).toBe(
      fromMajor('17000', 'INR').minor,
    )
    expect(tight.notes.join(' ')).toMatch(/flights and stay were left alone/i)
    expect(tight.total.minor).toBeLessThanOrEqual(fromMajor('45000', 'INR').minor)
  })

  it('says so plainly when the fixed costs alone break the budget', () => {
    const impossible = planTrip({ ...base, budget: fromMajor('5000', 'INR') })
    expect(impossible.fits).toBe(false)
    expect(impossible.notes.join(' ')).toMatch(/exceed this budget/i)
  })

  it('withholds confidence when there is barely any travel history', () => {
    const p = planTrip({ ...base, habits: { ...habits, tripsObserved: 1 } })
    expect(p.confident).toBe(false)
    expect(p.notes.join(' ')).toMatch(/rough/i)
  })

  it('reports headroom when the budget is comfortable', () => {
    const p = planTrip({ ...base, budget: fromMajor('200000', 'INR') })
    expect(p.fits).toBe(true)
    expect(p.headroom.minor).toBeGreaterThan(0)
  })
})

describe('savingsPlan', () => {
  it('states the monthly arithmetic and takes no view', () => {
    const s = savingsPlan({
      target: fromMajor('60000', 'INR'),
      monthsAway: 12,
      alreadySaved: fromMajor('0', 'INR'),
      monthlyCapacity: fromMajor('8000', 'INR'),
    })
    expect(s.perMonth.minor).toBe(fromMajor('5000', 'INR').minor)
    expect(s.withinCapacity).toBe(true)
    expect(s.shortfall.minor).toBe(0)
  })

  it('counts what is already put aside', () => {
    const s = savingsPlan({
      target: fromMajor('60000', 'INR'),
      monthsAway: 10,
      alreadySaved: fromMajor('10000', 'INR'),
      monthlyCapacity: fromMajor('8000', 'INR'),
    })
    expect(s.perMonth.minor).toBe(fromMajor('5000', 'INR').minor)
  })

  it('names the shortfall instead of insisting the deadline works', () => {
    const s = savingsPlan({
      target: fromMajor('60000', 'INR'),
      monthsAway: 3,
      alreadySaved: money(0, 'INR'),
      monthlyCapacity: fromMajor('8000', 'INR'),
    })
    expect(s.withinCapacity).toBe(false)
    expect(s.shortfall.minor).toBeGreaterThan(0)
    expect(s.monthsNeeded).toBe(8) // 60,000 at 8,000 a month
  })

  it('asks for nothing when the target is already met', () => {
    const s = savingsPlan({
      target: fromMajor('1000', 'INR'),
      monthsAway: 6,
      alreadySaved: fromMajor('1200', 'INR'),
      monthlyCapacity: fromMajor('500', 'INR'),
    })
    expect(s.perMonth.minor).toBe(0)
  })

  it('does not divide by zero when there is no capacity at all', () => {
    const s = savingsPlan({
      target: fromMajor('1000', 'INR'),
      monthsAway: 6,
      alreadySaved: money(0, 'INR'),
      monthlyCapacity: money(0, 'INR'),
    })
    expect(s.monthsNeeded).toBe(Infinity)
    expect(Number.isFinite(s.perMonth.minor)).toBe(true)
  })
})
