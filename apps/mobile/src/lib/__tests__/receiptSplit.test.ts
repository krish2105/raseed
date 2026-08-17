import { describe, expect, it } from 'vitest'

import type { ParsedReceipt } from '@raseed/engines'
import { money } from '@raseed/money'

import { YOU, itemisedSplit, toggleAssignment } from '@/lib/receiptSplit'

/**
 * The per-item split, as arithmetic.
 *
 * `splitByItems` shipped with the receipt parser and was imported by **no screen** — the engine
 * that makes "three people at dinner, one had the wine" fair existed and could not be reached.
 * These tests cover the wiring the engine deliberately does not contain: which share is yours,
 * what is still unassigned, and the fact that the parts have to add back up to the bill.
 */

const inr = (major: number) => money(Math.round(major * 100), 'INR')

/** Dinner: two mains, one bottle of wine, 10% service on top. */
function dinner(): ParsedReceipt {
  return {
    merchant: 'Toit',
    currency: 'INR',
    occurredAt: null,
    lines: [
      { description: 'Biryani', quantity: 1, amount: inr(400), confidence: 1 },
      { description: 'Paneer tikka', quantity: 1, amount: inr(300), confidence: 1 },
      { description: 'Wine', quantity: 1, amount: inr(1300), confidence: 1 },
    ],
    subtotal: inr(2000),
    tax: null,
    serviceCharge: inr(200),
    tip: null,
    total: inr(2200),
    discrepancy: inr(0),
    reconciles: true,
    confidence: 1,
    warnings: [],
  }
}

describe('the per-item split', () => {
  it('says nothing until something is assigned', () => {
    expect(itemisedSplit(dinner(), {})).toBeNull()
    expect(itemisedSplit(dinner(), { 0: [] })).toBeNull()
  })

  /**
   * The case the engine exists for. Splitting ₹2,200 evenly between two people is ₹1,100 each;
   * the person who did not drink the wine actually owes ₹440.
   */
  it('charges the wine to whoever drank it, service included', () => {
    const split = itemisedSplit(dinner(), {
      0: [YOU],
      1: ['p-rahul'],
      2: [YOU],
    })!

    // You: 400 + 1300 = 1700 of items, so 1700/2000 of the 200 service = 170.
    expect(split.yours).toEqual(inr(1870))
    expect(split.others).toEqual([{ personId: 'p-rahul', owes: inr(330) }])
    expect(split.owedToYou).toEqual(inr(330))

    // An even split would have been 1100 each. The difference is the whole feature.
    expect(split.yours.minor).toBeGreaterThan(110_000)
  })

  it('divides a shared item without losing a paisa', () => {
    const receipt: ParsedReceipt = {
      ...dinner(),
      lines: [{ description: 'Platter', quantity: 1, amount: inr(10), confidence: 1 }],
      subtotal: inr(10),
      serviceCharge: null,
      total: inr(10),
    }
    const split = itemisedSplit(receipt, { 0: [YOU, 'p-a', 'p-b'] })!
    const total = split.yours.minor + split.others.reduce((a, o) => a + o.owes.minor, 0)
    expect(total, '₹10 three ways lost a paisa').toBe(1000)
  })

  /** Every part of an assigned bill has to add back up to the bill. */
  it('adds back up to the total when everything is assigned', () => {
    const receipt = dinner()
    const split = itemisedSplit(receipt, { 0: [YOU], 1: ['p-rahul'], 2: ['p-rahul', YOU] })!
    const parts = split.yours.minor + split.others.reduce((a, o) => a + o.owes.minor, 0)
    expect(parts).toBe(receipt.total!.minor)
    expect(split.unassigned).toEqual(inr(0))
  })

  /**
   * The honest half. A half-assigned receipt produces shares that do not add up, and the
   * screen has to be able to say so — silently adding the remainder to you would be a guess
   * presented as arithmetic.
   */
  it('reports what nobody was assigned rather than absorbing it', () => {
    const split = itemisedSplit(dinner(), { 0: [YOU] })!
    expect(split.unassigned).toEqual(inr(1600))
    const parts = split.yours.minor + split.others.reduce((a, o) => a + o.owes.minor, 0)
    expect(parts).toBeLessThan(dinner().total!.minor)
  })

  it('leaves you out of who owes you', () => {
    const split = itemisedSplit(dinner(), { 0: [YOU], 1: [YOU], 2: [YOU] })!
    expect(split.others).toEqual([])
    expect(split.owedToYou).toEqual(inr(0))
    expect(split.yours).toEqual(inr(2200))
  })
})

describe('assigning people to lines', () => {
  it('adds, removes, and lets two people share one line', () => {
    let a: Record<number, readonly string[]> = {}
    a = toggleAssignment(a, 0, YOU)
    a = toggleAssignment(a, 0, 'p-rahul')
    expect(a[0]).toEqual([YOU, 'p-rahul'])

    a = toggleAssignment(a, 0, YOU)
    expect(a[0]).toEqual(['p-rahul'])
  })

  it('does not disturb the other lines', () => {
    const before = { 0: [YOU], 1: ['p-rahul'] } as Record<number, readonly string[]>
    const after = toggleAssignment(before, 1, 'p-asha')
    expect(after[0]).toEqual([YOU])
    expect(after[1]).toEqual(['p-rahul', 'p-asha'])
  })
})
