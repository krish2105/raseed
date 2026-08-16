import { describe, expect, it } from 'vitest'
import { fromMajor, money } from '@raseed/money'
import { splitBill, splitEvenly } from './splitBill'
import { reconcileCash } from './reconcileCash'

describe('splitBill', () => {
  it('splits ₹100 three ways as 34/33/33, never 33.33 × 3', () => {
    const s = splitEvenly(money(10_000, 'INR'), 3)
    expect(s.shares.map((m) => m.minor)).toEqual([3334, 3333, 3333])
    expect(s.shares.reduce((a, m) => a + m.minor, 0)).toBe(10_000)
  })

  it('counts only your share as spend, and the rest as owed to you', () => {
    const s = splitEvenly(fromMajor('4000', 'INR'), 4)
    expect(s.yourShare.minor).toBe(100_000)
    expect(s.owedToYou.minor).toBe(300_000)
    // The whole point: the ₹4,000 you paid is not ₹4,000 of your spend.
    expect(s.yourShare.minor + s.owedToYou.minor).toBe(400_000)
  })

  it('honours weights — [2,1,1] gives you half', () => {
    const s = splitBill({ total: money(10_000, 'INR'), weights: [2, 1, 1] })
    expect(s.shares.map((m) => m.minor)).toEqual([5000, 2500, 2500])
    expect(s.yourShare.minor).toBe(5000)
  })

  it('reconciles for every split of every amount up to 200, 2 to 9 ways', () => {
    // The remainder is where splitting goes wrong, so walk every case rather than pick one.
    for (let minor = 1; minor <= 200; minor += 1) {
      for (let ways = 2; ways <= 9; ways += 1) {
        const s = splitEvenly(money(minor, 'INR'), ways)
        expect(s.shares.reduce((a, m) => a + m.minor, 0)).toBe(minor)
        expect(s.yourShare.minor + s.owedToYou.minor).toBe(minor)
        // No share may differ from another by more than one minor unit.
        const values = s.shares.map((m) => m.minor)
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('lets you be a participant other than the first', () => {
    const s = splitBill({ total: money(10_000, 'INR'), weights: [2, 1, 1], yourIndex: 2 })
    expect(s.yourShare.minor).toBe(2500)
    expect(s.owedToYou.minor).toBe(7500)
  })

  it('rejects an index outside the split rather than returning undefined', () => {
    expect(() => splitBill({ total: money(100, 'INR'), weights: [1, 1], yourIndex: 5 })).toThrow(
      /outside a split/,
    )
  })

  it('keeps AED splits in AED', () => {
    const s = splitEvenly(fromMajor('100', 'AED'), 3)
    expect(s.yourShare.currency).toBe('AED')
    expect(s.shares.reduce((a, m) => a + m.minor, 0)).toBe(10_000)
  })
})

describe('reconcileCash', () => {
  it('turns a short wallet into unrecorded spend', () => {
    const out = reconcileCash({
      expected: fromMajor('5000', 'INR'),
      counted: fromMajor('800', 'INR'),
    })
    expect(out).toEqual({ kind: 'unrecorded-spend', amount: money(420_000, 'INR') })
  })

  it('turns a fat wallet into unrecorded income', () => {
    const out = reconcileCash({
      expected: fromMajor('800', 'INR'),
      counted: fromMajor('1000', 'INR'),
    })
    expect(out).toEqual({ kind: 'unrecorded-income', amount: money(20_000, 'INR') })
  })

  it('writes nothing when the count is exact', () => {
    const out = reconcileCash({
      expected: money(80_000, 'INR'),
      counted: money(80_000, 'INR'),
    })
    expect(out).toEqual({ kind: 'balanced' })
  })

  it('refuses to reconcile across currencies instead of silently converting', () => {
    expect(() =>
      reconcileCash({ expected: money(100, 'INR'), counted: money(100, 'AED') }),
    ).toThrow(/count each wallet in its own currency/)
  })
})
