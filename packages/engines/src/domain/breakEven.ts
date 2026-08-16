import { money, type Money } from '@raseed/money'

/**
 * Is the subscription worth it — arithmetically, not morally?
 *
 * Every app that finds your subscriptions then tells you to cancel them. That is not
 * analysis, it is a default opinion. The honest version is a threshold: **this costs the
 * same as N uses at the pay-as-you-go price. You used it M times. Here are both numbers.**
 *
 * Then the user decides, which is the correct division of labour — and it is also the only
 * version that survives the tone rules, because a threshold is an observation and "cancel
 * this" is a verdict.
 */

export interface BreakEven {
  /** Uses per period at which the subscription starts being the cheaper option. */
  readonly breakEvenUses: number
  /** What you actually used it, over the same period. */
  readonly actualUses: number
  /** Positive when the subscription is earning its place. */
  readonly surplusUses: number
  /** What each use has effectively cost you. */
  readonly effectiveUnitCost: Money
  /** The alternative: this many uses at the à la carte price. */
  readonly payGoCost: Money
  /** Signed. Positive means the subscription saved you money at your actual usage. */
  readonly saving: Money
  /**
   * True only when there is enough history to mean anything. One month of data cannot
   * distinguish a bad month from a bad subscription.
   */
  readonly confident: boolean
}

export interface BreakEvenInput {
  /** The recurring charge, per period. */
  readonly subscriptionCost: Money
  /** What one use would cost without the subscription. */
  readonly unitCost: Money
  /** Uses observed in the period. */
  readonly actualUses: number
  /** How many periods of history this rests on. */
  readonly periods: number
}

export function breakEven({
  subscriptionCost,
  unitCost,
  actualUses,
  periods,
}: BreakEvenInput): BreakEven {
  if (unitCost.currency !== subscriptionCost.currency) {
    throw new TypeError(
      `cannot compare ${subscriptionCost.currency} against ${unitCost.currency} — convert first`,
    )
  }
  if (unitCost.minor <= 0) {
    throw new RangeError('a pay-as-you-go price of zero has no break-even')
  }

  const breakEvenUses = subscriptionCost.minor / unitCost.minor
  const payGo = money(unitCost.minor * actualUses, unitCost.currency)

  return {
    breakEvenUses,
    actualUses,
    surplusUses: actualUses - breakEvenUses,
    // Zero uses is division by zero, and "infinite cost per use" is not a number to render.
    // The full subscription cost is the truthful answer: that is what the one non-use cost.
    effectiveUnitCost: money(
      actualUses === 0 ? subscriptionCost.minor : Math.round(subscriptionCost.minor / actualUses),
      subscriptionCost.currency,
    ),
    payGoCost: payGo,
    saving: money(payGo.minor - subscriptionCost.minor, subscriptionCost.currency),
    confident: periods >= 3,
  }
}
