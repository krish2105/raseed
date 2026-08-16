import { describe, expect, it } from 'vitest'
import { fromMajor, money } from '@raseed/money'
import {
  inflationBetween,
  powerRatio,
  purchasingPower,
  realChange,
  realValue,
  type PppRates,
  type PriceIndex,
} from './realValue'
import { breakEven } from './breakEven'

/** Synthetic: 4% over the year, so the arithmetic in the assertions is checkable by eye. */
const INDEX: PriceIndex = { '2025-03': 100, '2026-03': 104, '2026-08': 106 }

const RATES: PppRates = { perInternationalDollar: { INR: 24, AED: 2 } }

describe('realValue', () => {
  it('restates a later amount in earlier prices', () => {
    // ₹41,000 in 2026 prices is ₹41,000 × 100/104 ≈ ₹39,423 in 2025 prices.
    const real = realValue(fromMajor('41000', 'INR'), '2026-03', '2025-03', INDEX)
    expect(real!.minor).toBe(Math.round(4_100_000 * (100 / 104)))
    expect(real!.currency).toBe('INR')
  })

  it('returns null rather than guessing when a period is missing', () => {
    expect(realValue(money(100, 'INR'), '1999-01', '2025-03', INDEX)).toBeNull()
    expect(realValue(money(100, 'INR'), '2025-03', '1999-01', INDEX)).toBeNull()
  })

  it('is the identity when both periods are the same', () => {
    const m = fromMajor('1234.56', 'INR')
    expect(realValue(m, '2025-03', '2025-03', INDEX)!.minor).toBe(m.minor)
  })

  it('computes inflation between two periods', () => {
    expect(inflationBetween('2025-03', '2026-03', INDEX)).toBeCloseTo(0.04, 10)
    expect(inflationBetween('1999-01', '2026-03', INDEX)).toBeNull()
  })
})

describe('realChange', () => {
  /**
   * The error this exists to prevent: a 2.5% nominal rise against 4% inflation is a real
   * FALL, and every dashboard that skips this reports it as a rise.
   */
  it('turns a nominal rise into the real fall it actually was', () => {
    const change = realChange(
      fromMajor('40000', 'INR'),
      '2025-03',
      fromMajor('41000', 'INR'),
      '2026-03',
      INDEX,
    )!

    expect(change.nominal).toBeCloseTo(0.025, 6)
    expect(change.real).toBeLessThan(0)
    expect(change.inflation).toBeCloseTo(0.04, 10)
  })

  it('is null-safe on a zero baseline rather than dividing by it', () => {
    expect(
      realChange(money(0, 'INR'), '2025-03', money(100, 'INR'), '2026-03', INDEX),
    ).toBeNull()
  })
})

describe('purchasingPower', () => {
  it('converts through the international dollar, not the market rate', () => {
    // ₹2,400 ÷ 24 = 100 int$; × 2 = AED 200.
    const aed = purchasingPower(fromMajor('2400', 'INR'), 'AED', RATES)!
    expect(aed.currency).toBe('AED')
    expect(aed.minor).toBe(20_000)
  })

  it('round-trips back to where it started', () => {
    const start = fromMajor('2400', 'INR')
    const there = purchasingPower(start, 'AED', RATES)!
    expect(purchasingPower(there, 'INR', RATES)!.minor).toBe(start.minor)
  })

  it('is the identity within one currency', () => {
    const m = fromMajor('99.99', 'AED')
    expect(purchasingPower(m, 'AED', RATES)!.minor).toBe(m.minor)
  })
})

describe('powerRatio', () => {
  /**
   * PPP says one dirham needs 12 rupees to buy the same basket. The market gives 24. So a
   * dirham earned in the UAE and spent in India goes about twice as far — which is the
   * entire economic logic of the corridor this app is built for.
   */
  it('shows how much further money goes across the corridor', () => {
    expect(powerRatio('AED', 'INR', RATES, 24)).toBeCloseTo(2, 6)
  })

  it('is 1 when the market rate already equals the PPP rate', () => {
    expect(powerRatio('AED', 'INR', RATES, 12)).toBeCloseTo(1, 6)
  })

  it('refuses a nonsensical market rate instead of returning Infinity', () => {
    expect(powerRatio('AED', 'INR', RATES, 0)).toBeNull()
    expect(powerRatio('AED', 'INR', RATES, -3)).toBeNull()
  })
})

describe('breakEven', () => {
  const sub = fromMajor('499', 'INR')
  const perUse = fromMajor('120', 'INR')

  it('states the threshold and the actual, and takes no view', () => {
    const b = breakEven({ subscriptionCost: sub, unitCost: perUse, actualUses: 6, periods: 4 })

    expect(b.breakEvenUses).toBeCloseTo(499 / 120, 6)
    expect(b.actualUses).toBe(6)
    expect(b.surplusUses).toBeGreaterThan(0)
    expect(b.saving.minor).toBe(72_000 - 49_900)
    expect(b.confident).toBe(true)
  })

  it('reports a negative saving when the subscription is not earning its place', () => {
    const b = breakEven({ subscriptionCost: sub, unitCost: perUse, actualUses: 1, periods: 6 })
    expect(b.surplusUses).toBeLessThan(0)
    expect(b.saving.minor).toBeLessThan(0)
  })

  /** Zero uses is division by zero; "infinite cost per use" is not a number to render. */
  it('prices an unused month at the whole subscription, not Infinity', () => {
    const b = breakEven({ subscriptionCost: sub, unitCost: perUse, actualUses: 0, periods: 6 })
    expect(b.effectiveUnitCost.minor).toBe(sub.minor)
    expect(Number.isFinite(b.effectiveUnitCost.minor)).toBe(true)
  })

  it('withholds confidence until there is enough history', () => {
    expect(
      breakEven({ subscriptionCost: sub, unitCost: perUse, actualUses: 9, periods: 1 }).confident,
    ).toBe(false)
  })

  it('refuses to compare across currencies', () => {
    expect(() =>
      breakEven({
        subscriptionCost: sub,
        unitCost: fromMajor('20', 'AED'),
        actualUses: 3,
        periods: 5,
      }),
    ).toThrow(/convert first/)
  })

  it('refuses a zero pay-as-you-go price instead of dividing by it', () => {
    expect(() =>
      breakEven({ subscriptionCost: sub, unitCost: money(0, 'INR'), actualUses: 3, periods: 5 }),
    ).toThrow(/no break-even/)
  })
})
