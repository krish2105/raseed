import { describe, expect, it } from 'vitest'

import { money } from '@raseed/money'

import { tripProgress } from './tripProgress'

const AED = (minor: number) => money(minor, 'AED')

/** A five-day Dubai trip starting on epoch day 20_000, ₹ irrelevant — the ledger is in AED. */
const base = {
  startedDay: 20_000,
  endsDay: 20_004,
  today: 20_000,
  spent: AED(0),
  budget: AED(300_000), // AED 3,000
  currency: 'AED' as const,
}

describe('tripProgress', () => {
  it('is day 1 on the day it starts, not day 0', () => {
    expect(tripProgress(base).dayNumber).toBe(1)
  })

  it('counts the last day as part of the trip', () => {
    // 20_000 to 20_004 inclusive is five days, not four.
    expect(tripProgress(base).totalDays).toBe(5)
    expect(tripProgress({ ...base, today: 20_004 }).daysRemaining).toBe(0)
  })

  it('averages spend over elapsed days', () => {
    // AED 1,000 over two days.
    const p = tripProgress({ ...base, today: 20_001, spent: AED(100_000) })
    expect(p.dayNumber).toBe(2)
    expect(p.burnPerDay).toEqual(AED(50_000))
  })

  it('projects the burn rate across the whole trip', () => {
    const p = tripProgress({ ...base, today: 20_001, spent: AED(100_000) })
    expect(p.projectedTotal).toEqual(AED(250_000)) // 500 x 5 days
  })

  it('lets remaining go negative rather than clamping — that is the point', () => {
    const p = tripProgress({ ...base, today: 20_002, spent: AED(400_000) })
    expect(p.remaining).toEqual(AED(-100_000))
  })

  describe('the clock', () => {
    it('never divides by zero, so a burn rate always exists on day one', () => {
      expect(() => tripProgress(base)).not.toThrow()
      expect(tripProgress(base).burnPerDay).toEqual(AED(0))
    })

    it('survives a clock that has drifted behind the start date', () => {
      // Without the clamp this is a negative divisor, which flips the sign and renders a
      // negative daily spend — money coming in, on a trip.
      const p = tripProgress({ ...base, today: 19_998, spent: AED(100_000) })
      expect(p.dayNumber).toBe(1)
      expect(p.burnPerDay).toEqual(AED(100_000))
      expect(p.burnPerDay.minor).toBeGreaterThan(0)
    })
  })

  describe('pace', () => {
    it('refuses to judge on day one', () => {
      // One airport lunch would otherwise project to a catastrophe.
      const p = tripProgress({ ...base, spent: AED(18_000) })
      expect(p.pace).toBe('too-early')
    })

    it('says over when the projection exceeds the envelope', () => {
      const p = tripProgress({ ...base, today: 20_001, spent: AED(160_000) })
      expect(p.projectedTotal).toEqual(AED(400_000))
      expect(p.pace).toBe('over')
    })

    it('says under only with real headroom', () => {
      // Projects to 1,250 against a 3,000 budget.
      const p = tripProgress({ ...base, today: 20_001, spent: AED(50_000) })
      expect(p.pace).toBe('under')
    })

    it('calls a thin margin on-track rather than a win', () => {
      // Projects to 2,900 against 3,000 — inside the envelope by 100, which is under a tenth.
      const p = tripProgress({ ...base, today: 20_001, spent: AED(116_000) })
      expect(p.projectedTotal).toEqual(AED(290_000))
      expect(p.pace).toBe('on-track')
    })

    it('says exactly on budget is on-track, not under', () => {
      const p = tripProgress({ ...base, today: 20_001, spent: AED(120_000) })
      expect(p.projectedTotal).toEqual(AED(300_000))
      expect(p.pace).toBe('on-track')
    })

    it('has no verdict without a budget, and says so rather than inventing one', () => {
      const p = tripProgress({ ...base, today: 20_002, budget: null, spent: AED(90_000) })
      expect(p.pace).toBe('no-budget')
      expect(p.remaining).toBeNull()
      expect(p.burnPerDay).toEqual(AED(30_000)) // the rate is still real and still shown
    })
  })

  describe('an open-ended trip', () => {
    const open = { ...base, endsDay: null, today: 20_003, spent: AED(120_000) }

    it('has a burn rate but no projection', () => {
      const p = tripProgress(open)
      expect(p.burnPerDay).toEqual(AED(30_000))
      expect(p.projectedTotal).toBeNull()
      expect(p.totalDays).toBeNull()
      expect(p.daysRemaining).toBeNull()
    })

    it('cannot have a pace verdict, because there is nothing to project onto', () => {
      expect(tripProgress(open).pace).toBe('no-budget')
    })

    it('still reports remaining, which does not need an end date', () => {
      expect(tripProgress(open).remaining).toEqual(AED(180_000))
    })
  })

  it('is pure — the same input twice gives the same answer', () => {
    const input = { ...base, today: 20_002, spent: AED(77_777) }
    expect(tripProgress(input)).toEqual(tripProgress(input))
  })

  it('never produces a fractional minor unit', () => {
    for (let day = 20_000; day <= 20_010; day++) {
      const p = tripProgress({ ...base, endsDay: null, today: day, spent: AED(100_003) })
      expect(Number.isInteger(p.burnPerDay.minor)).toBe(true)
    }
  })
})
