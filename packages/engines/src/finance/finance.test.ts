import { describe, expect, it } from 'vitest'
import {
  amortise,
  budgetVariance,
  fv,
  fxAttribution,
  npv,
  pmt,
  prepaymentSavings,
  requiredContribution,
  xirr,
} from './index'

const DAY = 86_400_000
const T0 = 1_700_000_000_000

describe('npv', () => {
  it('matches a hand-computed value', () => {
    // −1000 + 500/1.1 + 500/1.21 + 500/1.331
    expect(npv(0.1, [-1000, 500, 500, 500])).toBeCloseTo(243.4260, 3)
  })

  it('is the plain sum at a zero rate', () => {
    expect(npv(0, [-1000, 500, 500, 500])).toBe(500)
  })
})

describe('xirr', () => {
  // Known answer: -1000 today, +1100 in exactly one year, is 10%.
  it('recovers a 10% annual return', () => {
    const rate = xirr([
      { amountMinor: -1000, at: T0 },
      { amountMinor: 1100, at: T0 + 365 * DAY },
    ])
    expect(rate).toBeCloseTo(0.1, 4)
  })

  it('handles irregular spacing', () => {
    const rate = xirr([
      { amountMinor: -10_000, at: T0 },
      { amountMinor: 3_000, at: T0 + 90 * DAY },
      { amountMinor: 4_000, at: T0 + 250 * DAY },
      { amountMinor: 5_000, at: T0 + 400 * DAY },
    ])
    expect(rate).not.toBeNull()
    expect(rate!).toBeGreaterThan(0.1)
    expect(rate!).toBeLessThan(0.3)
  })

  it('recovers a loss as a negative rate', () => {
    const rate = xirr([
      { amountMinor: -1000, at: T0 },
      { amountMinor: 900, at: T0 + 365 * DAY },
    ])
    expect(rate).toBeCloseTo(-0.1, 4)
  })

  // Returns null rather than a confident wrong number.
  it('returns null without a sign change', () => {
    expect(xirr([{ amountMinor: 100, at: T0 }, { amountMinor: 100, at: T0 + DAY }])).toBeNull()
    expect(xirr([{ amountMinor: -100, at: T0 }, { amountMinor: -100, at: T0 + DAY }])).toBeNull()
  })

  it('returns null for fewer than two flows', () => {
    expect(xirr([{ amountMinor: -100, at: T0 }])).toBeNull()
  })
})

describe('pmt', () => {
  // ₹10,00,000 over 240 months at 8%/yr -> ₹8,364/month.
  it('matches a known EMI', () => {
    expect(pmt(0.08 / 12, 240, 100_000_000) / 100).toBeCloseTo(8364.4, 0)
  })

  it('is a straight division at a zero rate', () => {
    expect(pmt(0, 10, 1000)).toBe(100)
  })

  it('rejects a non-positive term', () => {
    expect(() => pmt(0.01, 0, 1000)).toThrow(/positive/)
  })
})

describe('fv and requiredContribution', () => {
  it('grows a present sum with no contribution', () => {
    expect(fv(0.1, 2, 0, 1000)).toBeCloseTo(1210, 6)
  })

  it('sums contributions at a zero rate', () => {
    expect(fv(0, 12, 500)).toBe(6000)
  })

  // The goal solver: round-trips against fv.
  it('finds a contribution that actually reaches the target', () => {
    const target = 1_000_000
    const contribution = requiredContribution(0.06 / 12, 24, target)
    expect(fv(0.06 / 12, 24, contribution)).toBeGreaterThanOrEqual(target)
  })

  it('rounds up so the goal is met, not just missed', () => {
    const c = requiredContribution(0, 3, 100)
    expect(c).toBe(34)
    expect(c * 3).toBeGreaterThanOrEqual(100)
  })
})

describe('amortise', () => {
  const principal = 100_000_000
  const rate = 0.08 / 12
  const periods = 240

  it('pays the loan off exactly', () => {
    const rows = amortise(principal, rate, periods)
    expect(rows.at(-1)!.balanceMinor).toBe(0)
  })

  it('repays exactly the principal borrowed', () => {
    const rows = amortise(principal, rate, periods)
    const repaid = rows.reduce((a, r) => a + r.principalMinor, 0)
    expect(repaid).toBe(principal)
  })

  it('every row is integer minor units', () => {
    for (const r of amortise(principal, rate, 12)) {
      expect(Number.isInteger(r.paymentMinor)).toBe(true)
      expect(Number.isInteger(r.interestMinor)).toBe(true)
      expect(Number.isInteger(r.balanceMinor)).toBe(true)
    }
  })

  it('shifts from interest to principal over time', () => {
    const rows = amortise(principal, rate, periods)
    expect(rows[0]!.interestMinor).toBeGreaterThan(rows[0]!.principalMinor)
    expect(rows.at(-1)!.interestMinor).toBeLessThan(rows.at(-1)!.principalMinor)
  })
})

describe('prepaymentSavings', () => {
  it('cuts both interest and tenure', () => {
    const s = prepaymentSavings(100_000_000, 0.08 / 12, 240, 500_000)
    expect(s.interestSavedMinor).toBeGreaterThan(0)
    expect(s.periodsSaved).toBeGreaterThan(0)
    expect(s.periodsWith).toBeLessThan(s.periodsWithout)
  })

  it('saves nothing when nothing extra is paid', () => {
    const s = prepaymentSavings(1_000_000, 0.01, 12, 0)
    expect(s.interestSavedMinor).toBe(0)
    expect(s.periodsSaved).toBe(0)
  })
})

describe('budgetVariance', () => {
  // Did you buy more coffee, or did coffee get dearer?
  it('separates a price rise from a volume rise', () => {
    const v = budgetVariance(100, 10, 120, 10)
    expect(v.rateEffectMinor).toBe(200)
    expect(v.volumeEffectMinor).toBe(0)
    expect(v.interactionMinor).toBe(0)

    const q = budgetVariance(100, 10, 100, 12)
    expect(q.rateEffectMinor).toBe(0)
    expect(q.volumeEffectMinor).toBe(200)
  })

  it('keeps the interaction term separate rather than folding it in', () => {
    const v = budgetVariance(100, 10, 120, 12)
    expect(v.rateEffectMinor).toBe(200)
    expect(v.volumeEffectMinor).toBe(200)
    expect(v.interactionMinor).toBe(40)
  })

  it('the three terms reconcile to the total change', () => {
    const v = budgetVariance(100, 10, 120, 12)
    expect(v.totalMinor).toBe(120 * 12 - 100 * 10)
  })
})

describe('fxAttribution', () => {
  it('attributes a pure rate move entirely to fx', () => {
    const a = fxAttribution(100_000, 0, 23.0, 23.5)
    expect(a.flowEffectMinor).toBe(0)
    expect(a.fxEffectMinor).toBe(50_000)
    expect(a.interactionMinor).toBe(0)
  })

  it('attributes a pure flow entirely to flow', () => {
    const a = fxAttribution(100_000, 10_000, 23.0, 23.0)
    expect(a.fxEffectMinor).toBe(0)
    expect(a.flowEffectMinor).toBe(230_000)
  })

  it('the three terms reconcile to the total change', () => {
    const opening = 100_000
    const flow = 10_000
    const a = fxAttribution(opening, flow, 23.0, 23.5)
    const actual = (opening + flow) * 23.5 - opening * 23.0
    expect(a.totalMinor).toBeCloseTo(actual, 0)
  })
})
