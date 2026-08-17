/**
 * The one place the app believes an exchange rate.
 *
 * This is a **placeholder constant**, and everything about how it is used depends on knowing
 * that. It was a literal inside `add.tsx`; the remittance detector needs the same number to
 * decide what a transfer *should* have cost, and two copies of a rate is how a corridor app
 * ends up telling you a transfer was efficient against one number and expensive against
 * another.
 *
 * Two distinct uses, and the difference matters:
 *
 * 1. **Freezing a rate onto a row at write time.** Written once, never recomputed —
 *    `CLAUDE.md` is explicit. Once written, that row's rate is history and this constant is
 *    irrelevant to it for ever.
 * 2. **Judging a past transfer against mid-market.** This is the one that is genuinely
 *    approximate: comparing a transfer from eight months ago against today's constant
 *    measures the constant as much as the transfer. `remittanceCaveat` exists so the screen
 *    says so instead of printing a confident efficiency figure.
 *
 * The real fix is a rate cache keyed by date — an `fx_rates` table already exists in the
 * contract and has never been written to. Until then, this is honest rather than accurate.
 */
export const AED_TO_INR = 23.45

/**
 * Mid-market rate for the engine, in the shape `detectRemittance` expects.
 *
 * The `at` timestamp is accepted and ignored, deliberately: pretending to vary by date while
 * returning a constant would be worse than plainly not varying.
 */
export function midMarket(base: 'INR' | 'AED', quote: 'INR' | 'AED'): number {
  if (base === quote) return 1
  return base === 'AED' ? AED_TO_INR : 1 / AED_TO_INR
}

export const remittanceCaveat =
  `Measured against a fixed ${AED_TO_INR} INR/AED, not the rate on the day — so treat the ` +
  `efficiency as a rough read. A dated rate cache is what makes this exact.`
