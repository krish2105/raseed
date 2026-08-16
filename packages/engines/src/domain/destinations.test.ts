import { describe, expect, it } from 'vitest'

import { PRICE_LEVELS, destinationIndex, priceLevel } from './destinations'

const india = priceLevel('India')!
const uae = priceLevel('UAE')!

describe('destinationIndex', () => {
  it('is 1 in every dimension when you travel to where you already live', () => {
    const same = destinationIndex(india, india)
    expect(same.mealMultiplier).toBe(1)
    expect(same.stayMultiplier).toBe(1)
    expect(same.transportMultiplier).toBe(1)
  })

  it('scales up going somewhere pricier and down going somewhere cheaper', () => {
    expect(destinationIndex(uae, india).mealMultiplier).toBeGreaterThan(1)
    expect(destinationIndex(india, uae).mealMultiplier).toBeLessThan(1)
  })

  /** The two directions must be reciprocal, or the same trip costs different amounts each way. */
  it('is reciprocal', () => {
    const there = destinationIndex(uae, india).mealMultiplier
    const back = destinationIndex(india, uae).mealMultiplier
    expect(there * back).toBeCloseTo(1, 10)
  })

  it('puts eating out in the UAE at roughly four times India', () => {
    expect(destinationIndex(uae, india).mealMultiplier).toBeCloseTo(4.05, 1)
  })
})

describe('PRICE_LEVELS', () => {
  it('has no duplicate names, so the picker cannot show the same place twice', () => {
    const names = PRICE_LEVELS.map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
  })

  /**
   * A zero or negative index would divide into an infinite or negative multiplier and the
   * plan would render as `NaN` or a refund. Cheap to assert, catastrophic to miss.
   */
  it('is strictly positive everywhere', () => {
    for (const p of PRICE_LEVELS) {
      expect(p.restaurant, p.name).toBeGreaterThan(0)
      expect(p.overall, p.name).toBeGreaterThan(0)
    }
  })

  it('includes both home markets, since the corridor is the point of the app', () => {
    expect(priceLevel('India')).toBeDefined()
    expect(priceLevel('UAE')).toBeDefined()
  })
})
