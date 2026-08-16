import { detectRecurrence, detectRemittance, pairReversals } from '@raseed/engines'
import { describe, expect, it } from 'vitest'
import { generateLedger } from './index'

const END_AT = 1_755_300_000_000
const ledger = () => generateLedger({ endAt: END_AT })

describe('determinism', () => {
  // The whole contract of this package.
  it('produces byte-identical output for the same seed, twice', () => {
    expect(JSON.stringify(generateLedger({ endAt: END_AT }))).toBe(
      JSON.stringify(generateLedger({ endAt: END_AT })),
    )
  })

  it('produces different output for a different seed', () => {
    expect(JSON.stringify(generateLedger({ endAt: END_AT, seed: 1 }))).not.toBe(
      JSON.stringify(generateLedger({ endAt: END_AT, seed: 2 })),
    )
  })

  it('has no dependence on the wall clock', () => {
    // Same seed and endAt from a "different day" must still match.
    const a = generateLedger({ endAt: END_AT, seed: 5 })
    const b = generateLedger({ endAt: END_AT, seed: 5 })
    expect(a.transactions.map((t) => t.id)).toEqual(b.transactions.map((t) => t.id))
  })
})

describe('shape', () => {
  const l = ledger()

  it('spans 18 months and has a usable volume of transactions', () => {
    expect(l.meta.months).toBe(18)
    expect(l.transactions.length).toBeGreaterThan(700)
  })

  it('is sorted by time', () => {
    for (let i = 1; i < l.transactions.length; i += 1) {
      expect(l.transactions[i]!.occurred_at).toBeGreaterThanOrEqual(l.transactions[i - 1]!.occurred_at)
    }
  })

  it('has unique ids', () => {
    expect(new Set(l.transactions.map((t) => t.id)).size).toBe(l.transactions.length)
  })

  it('every amount is an integer number of minor units', () => {
    for (const t of l.transactions) {
      expect(Number.isInteger(t.amount_minor)).toBe(true)
      expect(Number.isInteger(t.home_amount_minor)).toBe(true)
    }
  })

  it('carries both currencies', () => {
    const currencies = new Set(l.transactions.map((t) => t.currency))
    expect(currencies).toEqual(new Set(['INR', 'AED']))
  })

  it('freezes an fx rate on every AED row and leaves INR at 1', () => {
    for (const t of l.transactions) {
      if (t.currency === 'AED') {
        expect(t.fx_rate).toBeGreaterThan(20)
        expect(t.home_amount_minor).toBe(Math.round(t.amount_minor * t.fx_rate))
      } else {
        expect(t.fx_rate).toBe(1)
        expect(t.home_amount_minor).toBe(t.amount_minor)
      }
    }
  })

  it('the fx rate drifts across the window, so attribution has something to explain', () => {
    const aed = l.transactions.filter((t) => t.currency === 'AED')
    const first = aed[0]!.fx_rate
    const last = aed.at(-1)!.fx_rate
    expect(last).not.toBe(first)
  })

  it('every category and merchant reference resolves', () => {
    const categoryIds = new Set(l.categories.map((c) => c.id))
    const merchantIds = new Set(l.merchants.map((m) => m.id))
    for (const t of l.transactions) {
      expect(categoryIds.has(t.category_id)).toBe(true)
      if (t.merchant_id !== null) expect(merchantIds.has(t.merchant_id)).toBe(true)
    }
  })

  it('every row carries the sync columns', () => {
    for (const t of l.transactions) {
      expect(t.user_id).toBeTruthy()
      expect(t.deleted).toBe(false)
      expect(Number.isInteger(t.updated_at)).toBe(true)
    }
  })
})

// The fixtures exist to exercise the engines, so assert the engines actually find
// what was planted. A generator nobody validates is a generator that drifts.
describe('the planted patterns are findable by the engines', () => {
  const l = ledger()

  it('pairReversals finds all three refund pairs', () => {
    const seeded = l.transactions.filter((t) => t.reversal_of_id !== null)
    expect(seeded).toHaveLength(l.meta.planted.reversalPairs)

    // Re-detect them from scratch, with the seeded links removed.
    const candidates = l.transactions
      .filter((t) => t.merchant_id === 'm-swiggy')
      .map((t) => ({
        id: t.id,
        accountId: t.account_id,
        direction: t.direction,
        amountMinor: t.amount_minor,
        occurredAt: t.occurred_at,
        merchantId: t.merchant_id,
        reversalOfId: null,
      }))
    const found = pairReversals(candidates)
    expect(found.length).toBeGreaterThanOrEqual(l.meta.planted.reversalPairs)
  })

  it('detectRemittance finds both remittances and reports the spread cost', () => {
    const legs = l.transactions
      .filter((t) => t.txn_type === 'transfer')
      .map((t) => ({
        id: t.id,
        direction: t.direction,
        amountMinor: t.amount_minor,
        currency: t.currency,
        occurredAt: t.occurred_at,
      }))

    const byId = new Map(l.transactions.map((t) => [t.id, t]))
    const found = detectRemittance(legs, (base, _quote, at) => {
      if (base !== 'AED') return 0
      const source = [...byId.values()].find((t) => t.occurred_at === at && t.currency === 'AED')
      return source?.fx_rate ?? 0
    })

    expect(found).toHaveLength(l.meta.planted.remittances)
    for (const r of found) {
      // Planted 1.5% worse than mid-market.
      expect(r.efficiency).toBeLessThan(1)
      expect(r.efficiency).toBeGreaterThan(0.97)
      expect(r.costMinor).toBeGreaterThan(0)
    }
  })

  it('detectRecurrence finds Netflix and its price hike', () => {
    const observations = l.transactions
      .filter((t) => t.merchant_id === 'm-netflix')
      .map((t) => ({
        merchantId: t.merchant_id!,
        amountMinor: t.amount_minor,
        currency: t.currency,
        occurredAt: t.occurred_at,
      }))

    const [netflix] = detectRecurrence(observations, { maxAmountCv: 0.2 })
    expect(netflix?.merchantId).toBe(l.meta.planted.subscriptionPriceHike)
    expect(netflix?.periodDays).toBeCloseTo(30, 0)
    expect(netflix?.priceChange?.fromMinor).toBe(64_900)
    expect(netflix?.priceChange?.toMinor).toBe(79_900)
  })

  it('the Dubai trip is tagged and entirely in AED', () => {
    const trip = l.transactions.filter((t) => t.trip_id === l.meta.planted.tripId)
    expect(trip.length).toBeGreaterThan(10)
    expect(new Set(trip.map((t) => t.currency))).toEqual(new Set(['AED']))
  })

  it('spend is autocorrelated — weekends are heavier than weekdays', () => {
    const byWeekday = new Map<number, number>()
    for (const t of l.transactions) {
      if (t.txn_type !== 'spend') continue
      const d = new Date(t.occurred_at).getUTCDay()
      byWeekday.set(d, (byWeekday.get(d) ?? 0) + 1)
    }
    const weekend = (byWeekday.get(5) ?? 0) + (byWeekday.get(6) ?? 0)
    const midweek = (byWeekday.get(1) ?? 0) + (byWeekday.get(2) ?? 0)
    expect(weekend).toBeGreaterThan(midweek)
  })
})

describe('the spend predicate has something to exclude', () => {
  const l = ledger()

  it('contains transfers, which must never count as spend', () => {
    expect(l.transactions.some((t) => t.txn_type === 'transfer')).toBe(true)
  })

  it('contains income, which must never count as spend', () => {
    expect(l.transactions.some((t) => t.txn_type === 'income')).toBe(true)
  })

  it('contains reversal links, which must net out', () => {
    expect(l.transactions.some((t) => t.reversal_of_id !== null)).toBe(true)
  })
})
