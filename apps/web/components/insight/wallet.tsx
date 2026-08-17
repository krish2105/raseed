'use client'

import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { reconcileCash } from '@raseed/engines'
import { format, fromMajor, money, type Money } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { useDuck } from '@/lib/duck/provider'
import { addLocal, cashSpentSince } from '@/lib/store/local-ledger'
import { addCashCount, lastCashCount } from '@/lib/store/preferences'
import { cn } from '@/lib/utils'

/**
 * Count your wallet.
 *
 * This is the money every other tracker loses. Card spend records itself; cash does not.
 * ₹5,000 comes out of an ATM and leaves over three weeks in autos, chai and a haircut, none
 * of it logged — so the ledger is confidently wrong by a few thousand rupees a month and
 * every category total is quietly understated.
 *
 * Counting occasionally fixes it without logging a single auto. The first count is only a
 * baseline and writes nothing; after that, expected = last count − cash spend since, and
 * the difference becomes one honest `Uncategorised cash` row. Precise about the total and
 * vague about the detail beats confident and wrong.
 */
export function WalletCount() {
  const { reload } = useDuck()
  const [entry, setEntry] = useState('')
  const [outcome, setOutcome] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  // Read at render — cheap, and always current after a count. `version` re-runs it.
  void version
  const last = typeof window === 'undefined' ? null : lastCashCount()
  const spentSince = last ? cashSpentSince(last.at) : 0
  const expected = last ? money(Math.max(0, last.countedMinor - spentSince), 'INR') : null

  let counted: Money | null = null
  try {
    counted = entry.trim() ? fromMajor(entry.trim(), 'INR') : null
  } catch {
    // Mid-typing garbage. The button stays disabled; no error shouts at you.
    counted = null
  }

  function submit() {
    if (!counted) return
    // The store stamps the clock and hands it back, so the count and the row it produces
    // carry the same moment without a component ever reading `Date.now()`.
    const { at } = addCashCount(counted.minor)

    if (expected) {
      const result = reconcileCash({ expected, counted })

      if (result.kind === 'balanced') {
        setOutcome('Exactly right — nothing to record.')
      } else {
        const spend = result.kind === 'unrecorded-spend'
        addLocal({
          amountMinor: result.amount.minor,
          currency: 'INR',
          merchant: 'Uncategorised cash',
          categoryId: 'cat-cash',
          occurredAt: at,
          fxInrPerAed: 1,
          paidInCash: true,
          direction: spend ? 'out' : 'in',
          note: `Wallet count. Expected ${format(expected)}, counted ${format(counted)}.`,
        })
        setOutcome(
          spend
            ? `${format(result.amount)} left your wallet unrecorded. Logged as one row.`
            : `${format(result.amount)} more than expected. Logged as income.`,
        )
      }
    } else {
      setOutcome(`Baseline set at ${format(counted)}. Count again in a week or two.`)
    }

    setEntry('')
    setVersion((v) => v + 1)
    reload()
  }

  return (
    <Panel title="What's in your wallet?" hint="cash reconciliation">
      <div className="flex items-start gap-3">
        <Wallet aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-text-lo" />
        <p className="text-sm leading-relaxed text-text-lo">
          {expected ? (
            <>
              The ledger expects{' '}
              <span className="tabular font-mono text-text-hi">{format(expected)}</span> —
              your last count of{' '}
              <span className="tabular font-mono">
                {format(money(last!.countedMinor, 'INR'))}
              </span>{' '}
              minus{' '}
              <span className="tabular font-mono">{format(money(spentSince, 'INR'))}</span> of
              cash spend since. Count it and the difference gets recorded in one row.
            </>
          ) : (
            <>
              Count the notes in your wallet. The first one is only a baseline — nothing gets
              recorded. After that, the gap between what the ledger expects and what you
              actually have becomes a single honest row instead of vanishing.
            </>
          )}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        <label className="sr-only" htmlFor="wallet-count">
          Cash in your wallet, in rupees
        </label>
        <span aria-hidden className="font-mono text-sm text-text-lo">
          ₹
        </span>
        <input
          id="wallet-count"
          value={entry}
          onChange={(e) => {
            setEntry(e.target.value)
            setOutcome(null)
          }}
          inputMode="decimal"
          placeholder="800"
          className="tabular w-28 rounded-lg border border-line bg-surface-0 px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={!counted}
          className={cn(
            'rounded-lg bg-text-hi px-3 py-2 text-sm font-medium text-surface-0 transition-opacity',
            'hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
            'disabled:opacity-40',
          )}
        >
          {expected ? 'Reconcile' : 'Set baseline'}
        </button>
      </form>

      {outcome && (
        <p className="mt-3 text-sm text-text-hi" data-testid="wallet-outcome" role="status">
          {outcome}
        </p>
      )}
    </Panel>
  )
}
