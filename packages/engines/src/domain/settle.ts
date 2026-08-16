import { allocate, money, type Currency, type Money } from '@raseed/money'

/**
 * Group expenses, balances, and settling up in the fewest payments.
 *
 * The interesting part is not splitting a bill — `allocate` already does that exactly. It is
 * **simplification**: four people, eleven shared expenses, everyone owing everyone a little.
 * Naively that is a dozen transfers. Restructured, it is usually two or three, and nobody's
 * net position changes by a paisa.
 *
 * One honest caveat, stated because Splitwise's marketing does not make it obvious: the
 * greedy algorithm can produce a payment between two people who never shared an expense.
 * It is still the same money and the same net for everyone, but "why do I owe Sam, I was
 * never at that dinner" is a real reaction. `simplifyDebts` returns the minimal set;
 * `directDebts` returns the un-simplified one for anybody who would rather see the truth of
 * who ate with whom. Both are offered rather than one being chosen for you.
 */

export interface Share {
  readonly personId: string
  /** Relative weight. `1` each is an even split; `2` is a double share. */
  readonly weight: number
}

export interface GroupExpense {
  readonly id: string
  /** Who actually paid the whole bill. */
  readonly payerId: string
  readonly amount: Money
  readonly shares: readonly Share[]
}

export interface Balance {
  readonly personId: string
  /** Positive: the group owes them. Negative: they owe the group. Sums to zero. */
  readonly net: Money
}

export interface Settlement {
  readonly fromId: string
  readonly toId: string
  readonly amount: Money
}

/**
 * Net position per person.
 *
 * Splitting uses `allocate`, so ₹100 three ways is 34/33/33 and the shares add back to
 * exactly ₹100. Three lots of ₹33.33 would leave a paisa unaccounted for on every expense,
 * and across a holiday that is a real, visible discrepancy that nobody can explain.
 */
export function balances(expenses: readonly GroupExpense[]): Balance[] {
  const net = new Map<string, number>()
  let currency: Currency | null = null

  for (const expense of expenses) {
    if (currency === null) currency = expense.amount.currency
    else if (currency !== expense.amount.currency) {
      throw new TypeError(
        `cannot net ${expense.amount.currency} against ${currency} — settle each currency separately`,
      )
    }

    const weights = expense.shares.map((s) => s.weight)
    const owed = allocate(expense.amount, weights)

    // The payer put the whole amount in; everyone takes their share out.
    net.set(expense.payerId, (net.get(expense.payerId) ?? 0) + expense.amount.minor)
    expense.shares.forEach((share, i) => {
      net.set(share.personId, (net.get(share.personId) ?? 0) - (owed[i]?.minor ?? 0))
    })
  }

  const ccy = currency ?? 'INR'
  return [...net.entries()]
    .map(([personId, minor]) => ({ personId, net: money(minor, ccy) }))
    .sort((a, b) => b.net.minor - a.net.minor)
}

/**
 * The fewest payments that settle everyone.
 *
 * Greedy: repeatedly match the largest debtor to the largest creditor. Finding the true
 * minimum is NP-hard, and greedy is what Splitwise uses — it never needs more than n−1
 * payments for n people, which is the bound that matters, and the search for a provably
 * optimal answer would cost more compute than it ever saves anyone in transfers.
 *
 * Every payment is a whole number of minor units, so nothing is lost to rounding and the
 * settlements sum to exactly zero.
 */
export function simplifyDebts(positions: readonly Balance[]): Settlement[] {
  const currency = positions[0]?.net.currency ?? 'INR'

  // Copies, because this consumes the balances as it goes.
  const creditors = positions
    .filter((b) => b.net.minor > 0)
    .map((b) => ({ id: b.personId, amount: b.net.minor }))
    .sort((a, b) => b.amount - a.amount)

  const debtors = positions
    .filter((b) => b.net.minor < 0)
    .map((b) => ({ id: b.personId, amount: -b.net.minor }))
    .sort((a, b) => b.amount - a.amount)

  const settlements: Settlement[] = []

  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!
    const creditor = creditors[j]!
    const pay = Math.min(debtor.amount, creditor.amount)

    if (pay > 0) {
      settlements.push({
        fromId: debtor.id,
        toId: creditor.id,
        amount: money(pay, currency),
      })
    }

    debtor.amount -= pay
    creditor.amount -= pay
    if (debtor.amount === 0) i += 1
    if (creditor.amount === 0) j += 1
  }

  return settlements
}

/**
 * Who owes whom, without restructuring — every pair that actually shared something.
 *
 * More payments, but each one is explicable: "you were at that dinner, I paid, you owe me."
 * For a group of friends that legibility is often worth more than the saved transfers.
 */
export function directDebts(expenses: readonly GroupExpense[]): Settlement[] {
  const pairs = new Map<string, number>()
  const currency = expenses[0]?.amount.currency ?? 'INR'

  for (const expense of expenses) {
    const owed = allocate(
      expense.amount,
      expense.shares.map((s) => s.weight),
    )
    expense.shares.forEach((share, i) => {
      if (share.personId === expense.payerId) return
      // One key per unordered pair, signed by direction, so A→B and B→A net out.
      const [a, b] = [share.personId, expense.payerId].sort() as [string, string]
      const sign = share.personId === a ? 1 : -1
      pairs.set(`${a}|${b}`, (pairs.get(`${a}|${b}`) ?? 0) + sign * (owed[i]?.minor ?? 0))
    })
  }

  return [...pairs.entries()]
    .filter(([, minor]) => minor !== 0)
    .map(([key, minor]) => {
      const [a, b] = key.split('|') as [string, string]
      return minor > 0
        ? { fromId: a, toId: b, amount: money(minor, currency) }
        : { fromId: b, toId: a, amount: money(-minor, currency) }
    })
    .sort((x, y) => y.amount.minor - x.amount.minor)
}

/** What one person owes or is owed, for the line at the top of their card. */
export function positionOf(positions: readonly Balance[], personId: string): Money {
  return (
    positions.find((b) => b.personId === personId)?.net ??
    money(0, positions[0]?.net.currency ?? 'INR')
  )
}
