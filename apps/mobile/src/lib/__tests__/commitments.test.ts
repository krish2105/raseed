import { describe, expect, it } from 'vitest'

import { COMMITMENTS, DAYS_TO_PAYDAY, SAFETY_BUFFER, committedBills } from '../commitments'

/**
 * The bug this file exists to prevent recurring.
 *
 * Today divided Safe-to-Spend by one hardcoded commitment of ₹22,000. You rendered a separate
 * array totalling ₹23,198. Two screens, one concept, different numbers, and both totals looked
 * plausible — which is why it survived. There is one list now, and these assert that the list
 * the arithmetic uses is the list the user is shown.
 */
describe('commitments', () => {
  it('gives the arithmetic exactly what the You screen renders', () => {
    const bills = committedBills()
    expect(bills).toHaveLength(COMMITMENTS.length)
    expect(bills.map((b) => b.minor)).toEqual(COMMITMENTS.map((c) => c.minor))
    expect(bills.map((b) => b.currency)).toEqual(COMMITMENTS.map((c) => c.currency))
  })

  it('is money, not raw numbers — so nothing downstream can do float arithmetic on it', () => {
    for (const b of committedBills()) {
      expect(Number.isInteger(b.minor)).toBe(true)
      expect(b).toHaveProperty('currency')
    }
  })

  it('has a positive amount for every commitment', () => {
    for (const c of COMMITMENTS) {
      expect(c.minor, c.label).toBeGreaterThan(0)
    }
  })

  it('has no duplicate labels, which would read as a double charge', () => {
    const labels = COMMITMENTS.map((c) => c.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  /** A zero or negative payday horizon would divide the daily allowance by zero. */
  it('has a payday horizon of at least one day', () => {
    expect(DAYS_TO_PAYDAY).toBeGreaterThan(0)
  })

  it('keeps a non-negative safety buffer in home currency', () => {
    expect(SAFETY_BUFFER.minor).toBeGreaterThanOrEqual(0)
    expect(SAFETY_BUFFER.currency).toBe('INR')
  })
})
