import { describe, expect, it } from 'vitest'
import { fromMajor, money } from '@raseed/money'
import {
  balances,
  directDebts,
  positionOf,
  simplifyDebts,
  type GroupExpense,
} from './settle'

const even = (...ids: string[]) => ids.map((personId) => ({ personId, weight: 1 }))

const dinner: GroupExpense = {
  id: 'e1',
  payerId: 'me',
  amount: fromMajor('4000', 'INR'),
  shares: even('me', 'priya', 'arjun', 'sam'),
}

describe('balances', () => {
  it('nets the payer up and everyone down by their share', () => {
    const b = balances([dinner])
    expect(positionOf(b, 'me').minor).toBe(300_000) // paid 4,000, owes 1,000
    expect(positionOf(b, 'priya').minor).toBe(-100_000)
    expect(positionOf(b, 'sam').minor).toBe(-100_000)
  })

  /** The invariant that makes everything else trustworthy. */
  it('always sums to exactly zero', () => {
    for (const total of ['4000', '100', '0.03', '999.99', '1']) {
      const b = balances([{ ...dinner, amount: fromMajor(total, 'INR') }])
      expect(b.reduce((a, x) => a + x.net.minor, 0)).toBe(0)
    }
  })

  it('honours uneven weights', () => {
    const b = balances([
      { ...dinner, shares: [{ personId: 'me', weight: 2 }, ...even('priya', 'arjun')] },
    ])
    // Four shares total: me takes two of them.
    expect(positionOf(b, 'me').minor).toBe(400_000 - 200_000)
    expect(positionOf(b, 'priya').minor).toBe(-100_000)
  })

  it('splits an amount that does not divide evenly without losing a paisa', () => {
    const b = balances([{ ...dinner, amount: money(10, 'INR'), shares: even('a', 'b', 'c') }])
    expect(b.reduce((a, x) => a + x.net.minor, 0)).toBe(0)
  })

  it('refuses to net across currencies instead of silently converting', () => {
    expect(() =>
      balances([dinner, { ...dinner, id: 'e2', amount: fromMajor('50', 'AED') }]),
    ).toThrow(/settle each currency separately/)
  })

  it('is empty-safe', () => {
    expect(balances([])).toEqual([])
  })
})

describe('simplifyDebts', () => {
  it('settles a simple group in one payment per debtor', () => {
    const s = simplifyDebts(balances([dinner]))
    expect(s).toHaveLength(3)
    expect(s.every((x) => x.toId === 'me')).toBe(true)
    expect(s.reduce((a, x) => a + x.amount.minor, 0)).toBe(300_000)
  })

  /**
   * The property that matters more than the payment count: simplification must not move a
   * single paisa of anyone's net position. It reorganises who pays whom, nothing else.
   */
  it('preserves every net position exactly', () => {
    const expenses: GroupExpense[] = [
      dinner,
      { id: 'e2', payerId: 'priya', amount: fromMajor('1200', 'INR'), shares: even('me', 'priya', 'sam') },
      { id: 'e3', payerId: 'sam', amount: fromMajor('900', 'INR'), shares: even('me', 'arjun', 'sam') },
      { id: 'e4', payerId: 'arjun', amount: fromMajor('333', 'INR'), shares: even('me', 'priya', 'arjun', 'sam') },
    ]

    const before = balances(expenses)
    const settlements = simplifyDebts(before)

    // Apply the settlements and check everyone lands on zero.
    const after = new Map(before.map((b) => [b.personId, b.net.minor]))
    for (const s of settlements) {
      after.set(s.fromId, (after.get(s.fromId) ?? 0) + s.amount.minor)
      after.set(s.toId, (after.get(s.toId) ?? 0) - s.amount.minor)
    }
    for (const [person, remaining] of after) {
      expect(remaining, `${person} is not settled`).toBe(0)
    }
  })

  /** Splitwise's own bound, and the reason greedy is good enough. */
  it('never needs more than n − 1 payments', () => {
    const people = ['a', 'b', 'c', 'd', 'e', 'f']
    const expenses: GroupExpense[] = people.map((payer, i) => ({
      id: `e${i}`,
      payerId: payer,
      amount: money(1000 * (i + 1), 'INR'),
      shares: even(...people),
    }))
    expect(simplifyDebts(balances(expenses)).length).toBeLessThanOrEqual(people.length - 1)
  })

  it('settles to exactly zero across many random groups', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const people = ['a', 'b', 'c', 'd']
      const expenses: GroupExpense[] = Array.from({ length: 5 }, (_, k) => ({
        id: `e${k}`,
        payerId: people[(seed + k) % 4]!,
        amount: money(((seed * 977 + k * 131) % 9871) + 1, 'INR'),
        shares: even(...people.slice(0, 2 + ((seed + k) % 3))),
      }))

      const before = balances(expenses)
      expect(before.reduce((a, x) => a + x.net.minor, 0)).toBe(0)

      const after = new Map(before.map((b) => [b.personId, b.net.minor]))
      for (const s of simplifyDebts(before)) {
        after.set(s.fromId, (after.get(s.fromId) ?? 0) + s.amount.minor)
        after.set(s.toId, (after.get(s.toId) ?? 0) - s.amount.minor)
      }
      expect([...after.values()].every((v) => v === 0)).toBe(true)
    }
  })

  it('returns nothing when everyone is already square', () => {
    expect(simplifyDebts([{ personId: 'a', net: money(0, 'INR') }])).toEqual([])
  })
})

describe('directDebts', () => {
  it('keeps each debt attached to the pair that actually shared something', () => {
    const d = directDebts([dinner])
    expect(d).toHaveLength(3)
    expect(d.every((x) => x.toId === 'me' && x.amount.minor === 100_000)).toBe(true)
  })

  /** Two people who owe each other should net out, not appear twice facing each other. */
  it('nets a reciprocal pair into a single direction', () => {
    const d = directDebts([
      { id: 'a', payerId: 'me', amount: money(1000, 'INR'), shares: even('me', 'priya') },
      { id: 'b', payerId: 'priya', amount: money(400, 'INR'), shares: even('me', 'priya') },
    ])
    expect(d).toHaveLength(1)
    expect(d[0]!.fromId).toBe('priya')
    expect(d[0]!.amount.minor).toBe(500 - 200)
  })

  it('drops a pair that has settled itself out', () => {
    const d = directDebts([
      { id: 'a', payerId: 'me', amount: money(1000, 'INR'), shares: even('me', 'priya') },
      { id: 'b', payerId: 'priya', amount: money(1000, 'INR'), shares: even('me', 'priya') },
    ])
    expect(d).toEqual([])
  })

  /** The trade the two functions represent, made explicit. */
  it('needs at least as many payments as the simplified version', () => {
    const expenses: GroupExpense[] = [
      dinner,
      { id: 'e2', payerId: 'priya', amount: fromMajor('1200', 'INR'), shares: even('me', 'priya', 'sam') },
      { id: 'e3', payerId: 'sam', amount: fromMajor('900', 'INR'), shares: even('me', 'arjun', 'sam') },
    ]
    expect(directDebts(expenses).length).toBeGreaterThanOrEqual(
      simplifyDebts(balances(expenses)).length,
    )
  })
})
