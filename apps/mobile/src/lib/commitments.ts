import { money, type Currency, type Money } from '@raseed/money'

/**
 * Standing commitments and the two personal settings Safe-to-Spend needs.
 *
 * **Everything in this file is a placeholder, and that is the point.** These are the figures
 * the app cannot yet derive: recurring bills (until `detectRecurrence` runs over enough
 * history, or a settings screen exists), the buffer you want left untouched, and when you next
 * get paid. They used to be scattered — a `committedBills: [22000]` literal inside the
 * Safe-to-Spend call on Today, and a separate `UPCOMING` array on You listing rent, Netflix
 * and Jio.
 *
 * Those two disagreed. Today divided by ₹22,000 of commitments; You showed the user ₹23,198
 * of them. Neither screen was wrong about its own arithmetic and the totals still looked
 * plausible, which is exactly how this class of bug survives — the same failure `CLAUDE.md`
 * describes for the spend predicate, one level up.
 *
 * One definition now. When recurrence detection or a settings screen lands, this file is what
 * they replace, and there is exactly one place to delete.
 */
export interface Commitment {
  readonly label: string
  /** Human-relative, until these are real dated recurrences. */
  readonly when: string
  readonly currency: Currency
  readonly minor: number
}

export const COMMITMENTS: readonly Commitment[] = [
  { label: 'Rent', when: 'in 3 days', currency: 'INR', minor: 2_200_000 },
  { label: 'Netflix', when: 'in 11 days', currency: 'INR', minor: 79_900 },
  { label: 'Jio', when: 'in 14 days', currency: 'INR', minor: 39_900 },
]

/** What Safe-to-Spend must hold back, as `Money`. Same list the You screen renders. */
export function committedBills(): Money[] {
  return COMMITMENTS.map((c) => money(c.minor, c.currency))
}

/** Left untouched no matter what the daily arithmetic says. A preference, not a derivation. */
export const SAFETY_BUFFER = money(3_00_000, 'INR')

/** Days until income lands. Replaced by a real payday once recurrence detection covers income. */
export const DAYS_TO_PAYDAY = 9
