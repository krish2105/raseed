'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

import { ledger } from '@/lib/demo'
import { localTransactions } from '@/lib/store/local-ledger'
import { filename, toBundle, toCsv } from '@/lib/export'

/**
 * Taking everything out, in one click.
 *
 * Deliberately **not** filtered through `v_spend`. The table above it is, because a spend
 * table showing transfers would be wrong — but an export is not a view, it is your data. An
 * export that quietly dropped your income, transfers and reversed rows would be worse than
 * none, because you would not know it had.
 *
 * Both formats, because they answer different questions: CSV opens in a spreadsheet and is
 * what people actually want; JSON keeps the exact types and carries the caveats a reader needs
 * to interpret minor units and frozen rates.
 */
export function ExportPanel() {
  const [done, setDone] = useState<'csv' | 'json' | null>(null)

  function download(kind: 'csv' | 'json') {
    // Everything: the seeded demo plus anything added in this browser.
    const rows = [...ledger.transactions, ...localTransactions()]
    const at = Date.now()
    const body =
      kind === 'csv' ? toCsv(rows) : JSON.stringify(toBundle(rows, at), null, 2)

    const blob = new Blob([body], {
      type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename(kind, at)
    // Attached before clicking. Measured: a detached anchor downloads fine in Chromium, so
    // this is defensive for the engines the e2e suite does not cover, not a fix for anything
    // observed. (The spec's first red run was a stale reused prod server, not this.)
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoking immediately can cancel the download in some browsers; a tick is enough.
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setDone(kind)
  }

  const count = ledger.transactions.length + localTransactions().length

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-prose">
          <h2 className="font-display text-sm font-semibold">Take your data with you</h2>
          <p className="mt-1 text-xs leading-relaxed text-text-lo">
            Every row — {count.toLocaleString('en-IN')} of them, including income, transfers and
            reversals that the table above hides. Amounts are integer minor units and exchange
            rates are the ones frozen on each row, not today&apos;s. Nothing leaves your browser
            to produce this file.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => download('csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inr"
          >
            <Download aria-hidden className="size-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => download('json')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inr"
          >
            <Download aria-hidden className="size-3.5" />
            JSON
          </button>
        </div>
      </div>

      {/* Announced rather than merely coloured, so a screen reader hears that it worked. */}
      <p role="status" className="mt-2 text-xs text-good">
        {done ? `${done.toUpperCase()} downloaded.` : ''}
      </p>
    </div>
  )
}
