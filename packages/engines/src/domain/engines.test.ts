import { describe, expect, it } from 'vitest'
import { normaliseMerchant, trigramSimilarity } from './normaliseMerchant'
import { pairReversals, shouldAutoPair, type ReversalCandidate } from './pairReversals'
import { coefficientOfVariation, detectRecurrence, median, type RecurrenceObservation } from './detectRecurrence'
import { detectRemittance, type RemittanceLeg } from './detectRemittance'
import { regretRate, topRegretCategories, type RatedTransaction } from './regretRate'
import { rankNudges, scoreNudge, type NudgeCandidate } from './rankNudges'

const DAY = 86_400_000
const T0 = 1_755_300_000_000

// ── normaliseMerchant ───────────────────────────────────────────────────────

describe('normaliseMerchant', () => {
  it('strips the UPI bank handle', () => {
    expect(normaliseMerchant('bigbazaar@ybl')).toBe('bigbazaar')
    expect(normaliseMerchant('swiggy@okhdfcbank')).toBe('swiggy')
  })

  it('keeps a non-bank handle rather than guessing', () => {
    expect(normaliseMerchant('someshop@unknownbank')).toContain('someshop')
  })

  it('collapses the three spellings of one merchant to one key', () => {
    const keys = new Set([
      normaliseMerchant('razorpay@hdfcbank'),
      normaliseMerchant('UPI/RAZORPAY@HDFCBANK/402913'),
      normaliseMerchant('  Razorpay@hdfcbank  '),
    ])
    expect(keys.size).toBe(1)
  })

  it('strips digits, separators and card noise from a UAE descriptor', () => {
    expect(normaliseMerchant('CARREF MALL EMIRT AE')).toBe('carref mall emirt')
    expect(normaliseMerchant('POS 4412*** TALABAT DXB')).toBe('talabat')
  })

  it('returns empty when nothing survives, rather than a junk key', () => {
    expect(normaliseMerchant('1234567')).toBe('')
    expect(normaliseMerchant('   ')).toBe('')
  })

  it('can keep geography when asked', () => {
    expect(normaliseMerchant('TALABAT DXB', { stripGeography: false })).toBe('talabat dxb')
  })
})

describe('trigramSimilarity', () => {
  it('is 1 for identical non-empty strings and 0 for empty', () => {
    expect(trigramSimilarity('swiggy', 'swiggy')).toBe(1)
    expect(trigramSimilarity('', '')).toBe(0)
  })

  it('scores a near-miss above a mismatch', () => {
    const near = trigramSimilarity('big bazaar', 'bigbazaar')
    const far = trigramSimilarity('big bazaar', 'talabat')
    expect(near).toBeGreaterThan(far)
    expect(near).toBeGreaterThan(0.4)
  })

  it('is symmetric', () => {
    expect(trigramSimilarity('swiggy', 'swigy')).toBeCloseTo(trigramSimilarity('swigy', 'swiggy'))
  })
})

// ── pairReversals ───────────────────────────────────────────────────────────

function txn(o: Partial<ReversalCandidate> & { id: string }): ReversalCandidate {
  return {
    accountId: 'acct-1',
    direction: 'out',
    amountMinor: 50_000,
    occurredAt: T0,
    merchantId: 'm1',
    reversalOfId: null,
    ...o,
  }
}

describe('pairReversals', () => {
  it('pairs a failed debit with its refund 30 minutes later', () => {
    const pairs = pairReversals([
      txn({ id: 'debit' }),
      txn({ id: 'refund', direction: 'in', occurredAt: T0 + 30 * 60_000 }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({ originalId: 'debit', reversalId: 'refund' })
    expect(shouldAutoPair(pairs[0]!)).toBe(true)
  })

  it('tolerates a 1% amount difference but not 10%', () => {
    const within = pairReversals([
      txn({ id: 'd' }),
      txn({ id: 'r', direction: 'in', amountMinor: 50_400, occurredAt: T0 + 60_000 }),
    ])
    expect(within).toHaveLength(1)

    const outside = pairReversals([
      txn({ id: 'd' }),
      txn({ id: 'r', direction: 'in', amountMinor: 55_000, occurredAt: T0 + 60_000 }),
    ])
    expect(outside).toHaveLength(0)
  })

  it('will not pair across accounts', () => {
    expect(
      pairReversals([
        txn({ id: 'd' }),
        txn({ id: 'r', direction: 'in', accountId: 'acct-2', occurredAt: T0 + 60_000 }),
      ]),
    ).toHaveLength(0)
  })

  it('will not pair beyond the 14-day window', () => {
    expect(
      pairReversals([txn({ id: 'd' }), txn({ id: 'r', direction: 'in', occurredAt: T0 + 15 * DAY })]),
    ).toHaveLength(0)
  })

  it('will not treat an inflow BEFORE the debit as its reversal', () => {
    expect(
      pairReversals([txn({ id: 'd' }), txn({ id: 'r', direction: 'in', occurredAt: T0 - DAY })]),
    ).toHaveLength(0)
  })

  it('accepts a refund with no merchant, refuses one with a different merchant', () => {
    expect(
      pairReversals([
        txn({ id: 'd' }),
        txn({ id: 'r', direction: 'in', merchantId: null, occurredAt: T0 + 60_000 }),
      ]),
    ).toHaveLength(1)

    expect(
      pairReversals([
        txn({ id: 'd' }),
        txn({ id: 'r', direction: 'in', merchantId: 'other', occurredAt: T0 + 60_000 }),
      ]),
    ).toHaveLength(0)
  })

  it('uses each transaction at most once', () => {
    const pairs = pairReversals([
      txn({ id: 'd1' }),
      txn({ id: 'd2', occurredAt: T0 + 1000 }),
      txn({ id: 'r', direction: 'in', occurredAt: T0 + 60_000 }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.originalId).toBe('d1') // oldest debit claims the refund
  })

  it('ignores rows already marked as a reversal', () => {
    expect(
      pairReversals([
        txn({ id: 'd', reversalOfId: 'something' }),
        txn({ id: 'r', direction: 'in', occurredAt: T0 + 60_000 }),
      ]),
    ).toHaveLength(0)
  })

  it('scores a same-day exact match above a two-week approximate one', () => {
    const tight = pairReversals([
      txn({ id: 'd' }),
      txn({ id: 'r', direction: 'in', occurredAt: T0 + 60_000 }),
    ])[0]!
    const loose = pairReversals([
      txn({ id: 'd' }),
      txn({ id: 'r', direction: 'in', amountMinor: 50_400, occurredAt: T0 + 13 * DAY, merchantId: null }),
    ])[0]!
    expect(tight.confidence).toBeGreaterThan(loose.confidence)
    expect(shouldAutoPair(loose)).toBe(false)
  })
})

// ── detectRecurrence ────────────────────────────────────────────────────────

function monthly(id: string, amounts: number[], startAt = T0): RecurrenceObservation[] {
  return amounts.map((amountMinor, i) => ({
    merchantId: id,
    amountMinor,
    currency: 'INR' as const,
    occurredAt: startAt + i * 30 * DAY,
  }))
}

describe('detectRecurrence', () => {
  it('detects a clean monthly subscription', () => {
    const [r] = detectRecurrence(monthly('netflix', [64_900, 64_900, 64_900, 64_900]))
    expect(r?.merchantId).toBe('netflix')
    expect(r?.periodDays).toBe(30)
    expect(r?.occurrences).toBe(4)
    expect(r?.confidence).toBeGreaterThan(0.95)
    expect(r?.nextDue).toBe(T0 + 4 * 30 * DAY)
  })

  it('needs at least three observations', () => {
    expect(detectRecurrence(monthly('x', [100, 100]))).toHaveLength(0)
  })

  it('tolerates a payment landing a day late', () => {
    const obs: RecurrenceObservation[] = [
      { merchantId: 'x', amountMinor: 64_900, currency: 'INR', occurredAt: T0 },
      { merchantId: 'x', amountMinor: 64_900, currency: 'INR', occurredAt: T0 + 30 * DAY },
      { merchantId: 'x', amountMinor: 64_900, currency: 'INR', occurredAt: T0 + 61 * DAY },
      { merchantId: 'x', amountMinor: 64_900, currency: 'INR', occurredAt: T0 + 90 * DAY },
    ]
    expect(detectRecurrence(obs)).toHaveLength(1)
  })

  it('rejects irregular intervals', () => {
    const obs: RecurrenceObservation[] = [
      { merchantId: 'x', amountMinor: 100, currency: 'INR', occurredAt: T0 },
      { merchantId: 'x', amountMinor: 100, currency: 'INR', occurredAt: T0 + 3 * DAY },
      { merchantId: 'x', amountMinor: 100, currency: 'INR', occurredAt: T0 + 40 * DAY },
      { merchantId: 'x', amountMinor: 100, currency: 'INR', occurredAt: T0 + 44 * DAY },
    ]
    expect(detectRecurrence(obs)).toHaveLength(0)
  })

  it('rejects regular intervals with wildly varying amounts', () => {
    expect(detectRecurrence(monthly('groceries', [10_000, 90_000, 30_000, 70_000]))).toHaveLength(0)
  })

  // Netflix ₹649 → ₹799 is ₹1,800/year.
  it('flags a price hike and annualises it', () => {
    const [r] = detectRecurrence(monthly('netflix', [64_900, 64_900, 64_900, 79_900]))
    expect(r?.priceChange).not.toBeNull()
    expect(r?.priceChange?.fromMinor).toBe(64_900)
    expect(r?.priceChange?.toMinor).toBe(79_900)
    expect(r?.priceChange?.annualDeltaMinor).toBe(Math.round((15_000 * 365) / 30))
  })

  it('does not flag a hike when the amount is stable', () => {
    const [r] = detectRecurrence(monthly('netflix', [64_900, 64_900, 64_900, 64_900]))
    expect(r?.priceChange).toBeNull()
  })

  it('separates merchants', () => {
    const found = detectRecurrence([...monthly('a', [100, 100, 100]), ...monthly('b', [200, 200, 200])])
    expect(found.map((r) => r.merchantId).sort()).toEqual(['a', 'b'])
  })
})

describe('recurrence statistics', () => {
  it('median handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('coefficientOfVariation is zero for a constant series', () => {
    expect(coefficientOfVariation([5, 5, 5])).toBe(0)
  })

  it('coefficientOfVariation is infinite when the mean is zero', () => {
    expect(coefficientOfVariation([-1, 1])).toBe(Number.POSITIVE_INFINITY)
  })
})

// ── detectRemittance ────────────────────────────────────────────────────────

// 1 AED ≈ 23.45 INR
const mid = () => 23.45

describe('detectRemittance', () => {
  const outflow: RemittanceLeg = {
    id: 'out',
    direction: 'out',
    amountMinor: 100_000, // 1000.00 AED
    currency: 'AED',
    occurredAt: T0,
  }

  it('links an AED outflow to the INR inflow that follows', () => {
    const inflow: RemittanceLeg = {
      id: 'in',
      direction: 'in',
      amountMinor: 2_345_000, // 23,450.00 INR — exactly mid-market
      currency: 'INR',
      occurredAt: T0 + 2 * DAY,
    }
    const [r] = detectRemittance([outflow, inflow], mid)
    expect(r).toMatchObject({ outflowId: 'out', inflowId: 'in' })
    expect(r?.efficiency).toBeCloseTo(1, 3)
    expect(r?.costMinor).toBe(0)
  })

  // The metric nobody else computes.
  it('computes what the spread actually cost', () => {
    const inflow: RemittanceLeg = {
      id: 'in',
      direction: 'in',
      amountMinor: 2_298_100, // 2% worse than mid-market
      currency: 'INR',
      occurredAt: T0 + DAY,
    }
    const [r] = detectRemittance([outflow, inflow], mid)
    expect(r?.efficiency).toBeLessThan(1)
    expect(r?.efficiency).toBeGreaterThan(0.97)
    expect(r?.costMinor).toBe(2_345_000 - 2_298_100)
  })

  it('refuses a rate outside the 5% band', () => {
    const inflow: RemittanceLeg = {
      id: 'in',
      direction: 'in',
      amountMinor: 1_800_000,
      currency: 'INR',
      occurredAt: T0 + DAY,
    }
    expect(detectRemittance([outflow, inflow], mid)).toHaveLength(0)
  })

  it('refuses legs more than 5 days apart', () => {
    const inflow: RemittanceLeg = {
      id: 'in',
      direction: 'in',
      amountMinor: 2_345_000,
      currency: 'INR',
      occurredAt: T0 + 6 * DAY,
    }
    expect(detectRemittance([outflow, inflow], mid)).toHaveLength(0)
  })

  it('ignores same-currency movement — that is an internal transfer', () => {
    const inflow: RemittanceLeg = {
      id: 'in',
      direction: 'in',
      amountMinor: 100_000,
      currency: 'AED',
      occurredAt: T0 + DAY,
    }
    expect(detectRemittance([outflow, inflow], mid)).toHaveLength(0)
  })

  it('ignores outflows below the threshold — a coffee is not a remittance', () => {
    const small: RemittanceLeg = { ...outflow, amountMinor: 2_000 }
    const inflow: RemittanceLeg = {
      id: 'in',
      direction: 'in',
      amountMinor: 46_900,
      currency: 'INR',
      occurredAt: T0 + DAY,
    }
    expect(detectRemittance([small, inflow], mid)).toHaveLength(0)
  })

  it('uses each inflow once when two outflows compete', () => {
    const inflow: RemittanceLeg = {
      id: 'in',
      direction: 'in',
      amountMinor: 2_345_000,
      currency: 'INR',
      occurredAt: T0 + DAY,
    }
    const found = detectRemittance([outflow, { ...outflow, id: 'out2', occurredAt: T0 + 1000 }, inflow], mid)
    expect(found).toHaveLength(1)
  })
})

// ── regretRate ──────────────────────────────────────────────────────────────

describe('regretRate', () => {
  // "₹4,200 of your ₹6,800 food delivery last month, you marked not worth it."
  const food: RatedTransaction[] = [
    { id: '1', categoryId: 'food', homeAmountMinor: 420_000, score: -1 },
    { id: '2', categoryId: 'food', homeAmountMinor: 260_000, score: 1 },
  ]

  it('weights by amount, not by count', () => {
    const [r] = regretRate(food)
    expect(r?.ratedMinor).toBe(680_000)
    expect(r?.regrettedMinor).toBe(420_000)
    expect(r?.regretRate).toBeCloseTo(420_000 / 680_000, 4)
  })

  it('excludes unrated transactions from the denominator', () => {
    const [r] = regretRate([...food, { id: '3', categoryId: 'food', homeAmountMinor: 1_000_000, score: null }])
    expect(r?.ratedMinor).toBe(680_000)
    expect(r?.regretRate).toBeCloseTo(420_000 / 680_000, 4)
  })

  it('counts a neutral rating as rated but not regretted', () => {
    const [r] = regretRate([{ id: '1', categoryId: 'x', homeAmountMinor: 100, score: 0 }])
    expect(r?.ratedMinor).toBe(100)
    expect(r?.regretRate).toBe(0)
  })

  it('reports coverage so low-confidence categories are visible', () => {
    const [r] = regretRate([...food, { id: '3', categoryId: 'food', homeAmountMinor: 680_000, score: null }])
    expect(r?.coverage).toBeCloseTo(0.5, 4)
  })

  it('is zero, not NaN, when nothing in a category is rated', () => {
    const [r] = regretRate([{ id: '1', categoryId: 'x', homeAmountMinor: 100, score: null }])
    expect(r?.regretRate).toBe(0)
    expect(r?.coverage).toBe(0)
  })

  it('ranks top categories by regretted money, not rate', () => {
    const top = topRegretCategories([
      { id: '1', categoryId: 'tiny', homeAmountMinor: 100, score: -1 },
      { id: '2', categoryId: 'tiny', homeAmountMinor: 100, score: -1 },
      { id: '3', categoryId: 'big', homeAmountMinor: 500_000, score: -1 },
      { id: '4', categoryId: 'big', homeAmountMinor: 500_000, score: 1 },
    ])
    expect(top[0]?.categoryId).toBe('big')
  })
})

// ── rankNudges ──────────────────────────────────────────────────────────────

function nudge(o: Partial<NudgeCandidate> & { id: string }): NudgeCandidate {
  return { kind: 'generic', impactHomeMinor: 500_000, urgency: 1, novelty: 1, createdAt: T0, ...o }
}

describe('rankNudges', () => {
  // The hard cap: 20 candidates in a simulated week ship exactly 4.
  it('ships exactly four from twenty candidates', () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      nudge({ id: `n${i}`, impactHomeMinor: (i + 1) * 20_000 }),
    )
    const { ship, suppressed } = rankNudges(candidates)
    expect(ship).toHaveLength(4)
    expect(suppressed).toHaveLength(16)
  })

  it('ships the highest-scoring candidates', () => {
    const { ship } = rankNudges([
      nudge({ id: 'low', impactHomeMinor: 1_000 }),
      nudge({ id: 'high', impactHomeMinor: 500_000 }),
      nudge({ id: 'mid', impactHomeMinor: 100_000 }),
    ])
    expect(ship[0]?.id).toBe('high')
  })

  it('respects nudges already sent this week', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => nudge({ id: `n${i}` }))
    expect(rankNudges(candidates, { sentThisWeek: 3 }).ship).toHaveLength(1)
    expect(rankNudges(candidates, { sentThisWeek: 4 }).ship).toHaveLength(0)
    expect(rankNudges(candidates, { sentThisWeek: 9 }).ship).toHaveLength(0)
  })

  it('suppresses everything at full fatigue', () => {
    const { ship } = rankNudges([nudge({ id: 'a' })], { fatigue7d: 1 })
    expect(ship).toHaveLength(0)
  })

  it('never ships a zero-score candidate even with free slots', () => {
    expect(rankNudges([nudge({ id: 'stale', novelty: 0 })]).ship).toHaveLength(0)
    expect(rankNudges([nudge({ id: 'noturgent', urgency: 0 })]).ship).toHaveLength(0)
  })

  it('saturates impact so one huge number cannot monopolise the week', () => {
    const huge = scoreNudge(nudge({ id: 'a', impactHomeMinor: 100_000_000 }))
    const large = scoreNudge(nudge({ id: 'b', impactHomeMinor: 500_000 }))
    expect(huge).toBe(large)
  })

  it('scores on magnitude, so a large saving ranks like a large overspend', () => {
    expect(scoreNudge(nudge({ id: 'a', impactHomeMinor: -300_000 }))).toBe(
      scoreNudge(nudge({ id: 'b', impactHomeMinor: 300_000 })),
    )
  })

  it('breaks ties toward the fresher candidate', () => {
    const { ship } = rankNudges([
      nudge({ id: 'old', createdAt: T0 }),
      nudge({ id: 'new', createdAt: T0 + DAY }),
    ])
    expect(ship[0]?.id).toBe('new')
  })

  it('clamps out-of-range inputs rather than producing a wild score', () => {
    expect(scoreNudge(nudge({ id: 'a', urgency: 5, novelty: 5 }))).toBeLessThanOrEqual(1)
    expect(scoreNudge(nudge({ id: 'b', urgency: -3 }))).toBe(0)
  })
})
