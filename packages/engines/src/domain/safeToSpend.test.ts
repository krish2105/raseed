import { fromMajor, money, zero } from '@raseed/money'
import { describe, expect, it } from 'vitest'
import { daysUntilIncome, safeToSpend, type SafeToSpendInput } from './safeToSpend'

const DAY = 86_400_000
const TODAY = 1_755_300_000_000

function input(overrides: Partial<SafeToSpendInput> = {}): SafeToSpendInput {
  return {
    liquidBalance: fromMajor('30000.00', 'INR'),
    committedBills: [],
    pendingSweeps: [],
    safetyBuffer: zero('INR'),
    rawCarryover: zero('INR'),
    spentToday: zero('INR'),
    today: TODAY,
    nextIncomeAt: TODAY + 10 * DAY,
    ...overrides,
  }
}

describe('daysUntilIncome', () => {
  it('counts today inclusive', () => {
    expect(daysUntilIncome(TODAY, TODAY + 10 * DAY)).toBe(10)
  })

  it('never returns less than one, even on or after payday', () => {
    expect(daysUntilIncome(TODAY, TODAY)).toBe(1)
    expect(daysUntilIncome(TODAY, TODAY - 5 * DAY)).toBe(1)
  })
})

describe('safeToSpend', () => {
  it('divides the pool across the remaining days', () => {
    const r = safeToSpend(input())
    expect(r.pool.minor).toBe(3_000_000)
    expect(r.daysUntilIncome).toBe(10)
    expect(r.baseDaily.minor).toBe(300_000) // ₹3,000/day
    expect(r.amount.minor).toBe(300_000)
  })

  it('subtracts bills, sweeps and the buffer from the pool', () => {
    const r = safeToSpend(
      input({
        committedBills: [fromMajor('12000.00', 'INR'), fromMajor('3000.00', 'INR')],
        pendingSweeps: [fromMajor('2000.00', 'INR')],
        safetyBuffer: fromMajor('3000.00', 'INR'),
      }),
    )
    // 30000 − 15000 − 2000 − 3000 = 10000 over 10 days
    expect(r.pool.minor).toBe(1_000_000)
    expect(r.baseDaily.minor).toBe(100_000)
  })

  it('subtracts what has already been spent today', () => {
    const r = safeToSpend(input({ spentToday: fromMajor('1200.00', 'INR') }))
    expect(r.amount.minor).toBe(300_000 - 120_000)
    expect(r.overspent).toBe(false)
  })

  it('reports overspent rather than clamping to zero', () => {
    const r = safeToSpend(input({ spentToday: fromMajor('5000.00', 'INR') }))
    expect(r.amount.minor).toBeLessThan(0)
    expect(r.overspent).toBe(true)
  })

  // The cap that stops a frugal week inviting a blowout.
  it('caps carryover at 3× the base daily allowance', () => {
    const r = safeToSpend(input({ rawCarryover: fromMajor('50000.00', 'INR') }))
    expect(r.carryover.minor).toBe(300_000 * 3)
    expect(r.amount.minor).toBe(300_000 + 900_000)
  })

  it('passes carryover through untouched when it is under the cap', () => {
    const r = safeToSpend(input({ rawCarryover: fromMajor('500.00', 'INR') }))
    expect(r.carryover.minor).toBe(50_000)
  })

  it('never treats negative carryover as a debt against today', () => {
    const r = safeToSpend(input({ rawCarryover: money(-100_000, 'INR') }))
    expect(r.carryover.minor).toBe(0)
  })

  it('yields zero allowance when the pool is negative, not a negative daily', () => {
    const r = safeToSpend(
      input({ liquidBalance: fromMajor('1000.00', 'INR'), safetyBuffer: fromMajor('5000.00', 'INR') }),
    )
    expect(r.pool.minor).toBeLessThan(0)
    expect(r.baseDaily.minor).toBe(0)
    expect(r.amount.minor).toBe(0)
  })

  it('handles payday today without dividing by zero', () => {
    const r = safeToSpend(input({ nextIncomeAt: TODAY }))
    expect(r.daysUntilIncome).toBe(1)
    expect(r.baseDaily.minor).toBe(3_000_000)
  })

  it('reacts to the income date moving mid-month', () => {
    const near = safeToSpend(input({ nextIncomeAt: TODAY + 5 * DAY }))
    const far = safeToSpend(input({ nextIncomeAt: TODAY + 20 * DAY }))
    expect(near.baseDaily.minor).toBeGreaterThan(far.baseDaily.minor)
  })

  it('works in AED as well as INR', () => {
    const r = safeToSpend({
      ...input(),
      liquidBalance: fromMajor('3000.00', 'AED'),
      safetyBuffer: zero('AED'),
      rawCarryover: zero('AED'),
      spentToday: zero('AED'),
      committedBills: [],
      pendingSweeps: [],
    })
    expect(r.amount.currency).toBe('AED')
    expect(r.baseDaily.minor).toBe(30_000)
  })

  it('never loses a minor unit to rounding', () => {
    // 1000.07 over 3 days: floor gives 33335 paise/day, never 33335.67
    const r = safeToSpend(
      input({ liquidBalance: fromMajor('1000.07', 'INR'), nextIncomeAt: TODAY + 3 * DAY }),
    )
    expect(Number.isInteger(r.baseDaily.minor)).toBe(true)
    expect(r.baseDaily.minor).toBe(Math.floor(100_007 / 3))
  })
})
