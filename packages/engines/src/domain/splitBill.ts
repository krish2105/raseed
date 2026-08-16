import { allocate, money, type Money } from '@raseed/money'

/**
 * Splitting a bill you paid.
 *
 * The finance-correct rule, and the reason this is a function rather than a division in a
 * component: **when you pay for four people, your spend is one share.** The other three
 * shares are money owed to you. An app that counts the whole ₹4,000 as your spend tells you
 * you overspent on a night you did not, and every category, budget and forecast downstream
 * inherits the lie.
 *
 * Shares come from `allocate`, so they sum to exactly the total. ₹1,000 three ways is
 * 334/333/333 — never 333.33 × 3, which loses a paisa and eventually loses a rupee.
 */

export interface Split {
  /** Every participant's share, in order. Sums to exactly the total. */
  readonly shares: Money[]
  /** What actually counts as your spend. */
  readonly yourShare: Money
  /** What the others owe you. `total − yourShare`, never recomputed from percentages. */
  readonly owedToYou: Money
}

export interface SplitRequest {
  readonly total: Money
  /**
   * One weight per participant, you included. `[1, 1, 1]` is an even three-way split;
   * `[2, 1, 1]` gives you half. Weights are relative — they do not need to sum to anything.
   */
  readonly weights: readonly number[]
  /** Which weight is yours. Defaults to the first. */
  readonly yourIndex?: number
}

export function splitBill({ total, weights, yourIndex = 0 }: SplitRequest): Split {
  const shares = allocate(total, weights)
  const yours = shares[yourIndex]

  if (!yours) {
    throw new RangeError(
      `yourIndex ${yourIndex} is outside a split of ${shares.length} participants`,
    )
  }

  // Subtraction, not a second allocate. Deriving what you are owed from the shares
  // guarantees the two numbers reconcile no matter how the remainder fell.
  return {
    shares,
    yourShare: yours,
    owedToYou: money(total.minor - yours.minor, total.currency),
  }
}

/** An even split N ways, which is the case almost everyone actually has. */
export function splitEvenly(total: Money, ways: number): Split {
  return splitBill({ total, weights: Array.from({ length: ways }, () => 1) })
}
