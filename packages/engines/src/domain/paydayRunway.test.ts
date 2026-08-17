import { describe, expect, it } from 'vitest'
import { money } from '@raseed/money'
import { paydayRunway } from './paydayRunway'

const inr = (major: number) => money(Math.round(major * 100), 'INR')
const NOW = 1_755_300_000_000
const DAY = 86_400_000

const base = {
  liquidBalance: inr(30_000),
  committedBills: [inr(5_000)],
  safetyBuffer: inr(3_000),
  dailySpend: Array.from({ length: 30 }, () => 100_000), // ₹1,000 a day
  today: NOW,
  nextIncomeAt: NOW + 10 * DAY,
}

describe('payday runway', () => {
  it('holds back commitments and the buffer before counting anything', () => {
    expect(paydayRunway(base).pool).toEqual(inr(22_000))
  })

  it('reaches payday when the pool covers the days', () => {
    const r = paydayRunway(base)
    expect(r.burnPerDay).toEqual(inr(1_000))
    expect(r.daysUntilIncome).toBe(10)
    expect(r.reachesPayday).toBe(true)
    expect(r.runsOutAt).toBeNull()
    expect(r.requiredPerDay).toEqual(inr(0))
  })

  it('names the day it runs out, and what it would take to avoid that', () => {
    const r = paydayRunway({ ...base, dailySpend: Array.from({ length: 30 }, () => 300_000) })
    expect(r.reachesPayday).toBe(false)
    // ₹22,000 at ₹3,000 a day is 7 days.
    expect(r.runsOutAt).toBe(NOW + 7 * DAY)
    expect(r.requiredPerDay).toEqual(inr(2_200))
  })

  /**
   * The reason the burn is a median. One rent day in thirty pulls a mean up by a third and
   * produces a runway that is wrong in the reassuring direction — the direction that costs you
   * money.
   */
  it('is not fooled by one rent day', () => {
    const ordinary = Array.from({ length: 29 }, () => 100_000)
    const withRent = [...ordinary, 2_200_000]
    expect(paydayRunway({ ...base, dailySpend: withRent }).burnPerDay).toEqual(inr(1_000))

    const mean = withRent.reduce((a, b) => a + b, 0) / withRent.length
    expect(mean, 'a mean would have claimed a much higher burn').toBeGreaterThan(130_000)
  })

  /** Zero-spend days stay in the sample: the runway counts days, not spending days. */
  it('counts quiet days as days', () => {
    const halfQuiet = [...Array.from({ length: 15 }, () => 0), ...Array.from({ length: 15 }, () => 200_000)]
    // Median of fifteen 0s and fifteen 200_000s is the midpoint of the two middle values.
    expect(paydayRunway({ ...base, dailySpend: halfQuiet }).burnPerDay).toEqual(inr(1_000))
  })

  it('never reports a negative pool', () => {
    const broke = paydayRunway({ ...base, liquidBalance: inr(1_000) })
    expect(broke.pool).toEqual(inr(0))
    expect(broke.reachesPayday).toBe(false)
  })

  it('lasts for ever when nothing is being spent and there is something to spend', () => {
    const r = paydayRunway({ ...base, dailySpend: Array.from({ length: 30 }, () => 0) })
    expect(r.daysCovered).toBe(Number.POSITIVE_INFINITY)
    expect(r.reachesPayday).toBe(true)
  })

  /**
   * The simulator bug. A sparse ledger medians to zero spend, zero burn divides into an
   * infinite runway, and the screen answered "Yes" directly above the words "₹0.00 of room".
   * "You will reach payday because you are spending nothing" is the most dangerous kind of
   * reassurance a finance app can offer.
   */
  it('does not claim an empty pool reaches payday just because the burn is zero', () => {
    const nothing = paydayRunway({
      ...base,
      liquidBalance: inr(0),
      dailySpend: Array.from({ length: 30 }, () => 0),
    })
    expect(nothing.pool).toEqual(inr(0))
    expect(nothing.daysCovered).toBe(0)
    expect(nothing.reachesPayday).toBe(false)
  })

  it('reports how much history the burn rate rests on', () => {
    expect(paydayRunway({ ...base, dailySpend: [100_000, 100_000] }).observedDays).toBe(2)
  })
})
