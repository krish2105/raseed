import { money, type Money } from '@raseed/money'

/**
 * Cash reconciliation — the money every other app loses.
 *
 * Card spend records itself. Cash does not: you draw ₹5,000 from an ATM, and over three
 * weeks it leaves your wallet in autos, chai and a haircut, none of which you logged. The
 * ledger says you still have ₹5,000. Your wallet says ₹800.
 *
 * The fix is not to log the autos. It is to count your wallet occasionally and let the
 * difference become one honest transaction. Precise about the total, vague about the
 * detail, is strictly better than confident and wrong.
 */

export interface CashCount {
  /** What the ledger thinks is in your wallet. */
  readonly expected: Money
  /** What you just counted. */
  readonly counted: Money
}

export type CashOutcome =
  /** Counted less than expected: cash left the wallet unrecorded. Write it as spend. */
  | { readonly kind: 'unrecorded-spend'; readonly amount: Money }
  /** Counted more than expected: cash arrived unrecorded. Write it as income. */
  | { readonly kind: 'unrecorded-income'; readonly amount: Money }
  /** Exactly right. Write nothing. */
  | { readonly kind: 'balanced' }

export function reconcileCash({ expected, counted }: CashCount): CashOutcome {
  if (expected.currency !== counted.currency) {
    throw new TypeError(
      `cannot reconcile ${counted.currency} against ${expected.currency} — count each wallet in its own currency`,
    )
  }

  const delta = counted.minor - expected.minor

  // A zero delta writes nothing at all. A ₹0.00 "Uncategorised cash" row on the ledger is
  // noise that makes the honest rows harder to trust.
  if (delta === 0) return { kind: 'balanced' }

  return delta < 0
    ? { kind: 'unrecorded-spend', amount: money(-delta, expected.currency) }
    : { kind: 'unrecorded-income', amount: money(delta, expected.currency) }
}
