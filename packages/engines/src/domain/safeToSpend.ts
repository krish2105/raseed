import { add, money, sub, sum, zero, type Currency, type Money } from '@raseed/money'

/**
 * Safe to Spend Today — the single job of the home screen.
 *
 * Pure: no I/O, no Date.now(). `today` and `nextIncomeAt` are passed in so the whole
 * thing is testable and so a midnight recompute is a call, not a side effect.
 */

export interface SafeToSpendInput {
  readonly liquidBalance: Money
  /** Bills already committed and due before the next income lands. */
  readonly committedBills: readonly Money[]
  /** Goal sweeps that have not left the account yet but are spoken for. */
  readonly pendingSweeps: readonly Money[]
  readonly safetyBuffer: Money
  /** Unspent allowance carried in from previous days, before capping. */
  readonly rawCarryover: Money
  readonly spentToday: Money
  /** Epoch ms. */
  readonly today: number
  /** Epoch ms of the next expected income. */
  readonly nextIncomeAt: number
}

export interface SafeToSpendResult {
  readonly amount: Money
  readonly pool: Money
  readonly baseDaily: Money
  readonly carryover: Money
  readonly daysUntilIncome: number
  /** True when the pool is exhausted — the UI shows this differently, not just a number. */
  readonly overspent: boolean
}

const MS_PER_DAY = 86_400_000

/** Whole days from `from` to `to`, today inclusive. Never less than 1. */
export function daysUntilIncome(from: number, to: number): number {
  const days = Math.ceil((to - from) / MS_PER_DAY)
  return Math.max(1, days)
}

export function safeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const currency: Currency = input.liquidBalance.currency

  const pool = sub(
    sub(sub(input.liquidBalance, sum(input.committedBills, currency)), sum(input.pendingSweeps, currency)),
    input.safetyBuffer,
  )

  const days = daysUntilIncome(input.today, input.nextIncomeAt)

  // A negative pool must not produce a positive allowance via integer division.
  const baseDaily = pool.minor <= 0 ? zero(currency) : money(Math.floor(pool.minor / days), currency)

  // The cap matters: without it a frugal week hands you a number that invites a blowout.
  const carryoverCap = money(baseDaily.minor * 3, currency)
  const carryover = money(
    Math.max(0, Math.min(input.rawCarryover.minor, carryoverCap.minor)),
    currency,
  )

  const amount = sub(add(baseDaily, carryover), input.spentToday)

  return {
    amount,
    pool,
    baseDaily,
    carryover,
    daysUntilIncome: days,
    overspent: amount.minor < 0,
  }
}
