import { splitByItems, type ParsedReceipt } from '@raseed/engines'
import { money, type Money } from '@raseed/money'

/**
 * The decisions the receipt screen makes about a per-item split.
 *
 * `splitByItems` is tested and owns everything hard — dividing an item without losing a paisa,
 * and spreading tax, service and tip across people in proportion to what they actually ate.
 * What is *not* in the engine, and what decides the number that reaches the ledger, is the
 * handful of rules below. They live here rather than inline in the screen so they can be tested
 * without a simulator, the same way `lib/import.ts` does.
 */

/**
 * You, in the assignment map.
 *
 * `splitByItems` returns one entry per assigned person and does not know which of them is
 * holding the phone, so your share has to be identifiable by id. Deliberately not a row in
 * `people`: you are not someone who can owe you money, and putting yourself in that table would
 * put you in "who owes you" the moment anyone forgot to filter.
 */
export const YOU = 'you'

export interface ItemisedSplit {
  /** Your share — items you were assigned plus your proportion of tax and service. */
  readonly yours: Money
  readonly others: readonly { readonly personId: string; readonly owes: Money }[]
  readonly owedToYou: Money
  /**
   * Lines nobody was assigned.
   *
   * Reported rather than absorbed. `splitByItems` ignores them, so a half-assigned receipt
   * produces shares that quietly do not add up to the bill — and silently adding them to you
   * would be a guess presented as arithmetic.
   */
  readonly unassigned: Money
}

/** `null` when nothing has been assigned: the screen then behaves as it did before. */
export function itemisedSplit(
  receipt: ParsedReceipt,
  assignment: Readonly<Record<number, readonly string[]>>,
): ItemisedSplit | null {
  const anyAssigned = Object.values(assignment).some((people) => people.length > 0)
  if (!anyAssigned) return null

  const shares = splitByItems(receipt, assignment)
  const yours = shares.find((s) => s.personId === YOU)?.owes ?? money(0, receipt.currency)
  const others = shares.filter((s) => s.personId !== YOU)

  const unassignedMinor = receipt.lines.reduce(
    (total, line, i) => total + ((assignment[i]?.length ?? 0) === 0 ? line.amount.minor : 0),
    0,
  )

  return {
    yours,
    others,
    owedToYou: money(
      others.reduce((total, o) => total + o.owes.minor, 0),
      receipt.currency,
    ),
    unassigned: money(unassignedMinor, receipt.currency),
  }
}

/** Toggle one person on one line. Multi-select, because a shared starter is the ordinary case. */
export function toggleAssignment(
  assignment: Readonly<Record<number, readonly string[]>>,
  lineIndex: number,
  personId: string,
): Record<number, readonly string[]> {
  const current = assignment[lineIndex] ?? []
  const next = current.includes(personId)
    ? current.filter((p) => p !== personId)
    : [...current, personId]
  return { ...assignment, [lineIndex]: next }
}
