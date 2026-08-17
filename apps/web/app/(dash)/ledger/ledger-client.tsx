'use client'

import { useMemo, useState } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { format } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { RowsSkeleton } from '@/components/ui/skeleton'
import { PanelError } from '@/components/ui/panel-error'
import { useDuck, useDuckQuery } from '@/lib/duck/provider'
import { useCurrencyLens } from '@/components/shell/currency-lens'
import { ledgerPage } from '@/lib/duck/analytics'
import { ExportPanel } from '@/components/ledger/export-panel'
import { isLocal, removeLocal, updateLocal } from '@/lib/store/local-ledger'
import { cn } from '@/lib/utils'

/**
 * The whole ledger, not a page of it.
 *
 * This was `250`, and the cap was quietly wrong in a way that looked fine: the search and the
 * category filter run over `rows.data`, so they were searching *the first 250 rows* rather
 * than the ledger. A merchant from four months ago returned "Nothing matches" — a correct
 * message about a subset, presented as a fact about your money.
 *
 * Fetching everything is cheap here: DuckDB is in this tab, the query is a scan of a view over
 * an in-memory Arrow table, and the alternative — pushing the filters into SQL and paginating
 * — is more code for a dataset a phone could hold. What is *not* cheap is rendering it, which
 * is what `content-visibility` below handles.
 */
const ALL_ROWS = 100_000

/**
 * The full ledger.
 *
 * Reads through `v_spend`, so a transfer, a pending row or a reversal pair never appears
 * here — the table and the totals cannot disagree about what counts.
 */
export function LedgerClient() {
  const [lens] = useCurrencyLens()
  const { reload } = useDuck()
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'all' | 'need' | 'want' | 'save'>('all')

  // Which row is open for editing, and its uncommitted values. Only rows added in this
  // browser are editable — the seeded demo is shared, and one visitor rewriting it would make
  // every screenshot irreproducible.
  const [editing, setEditing] = useState<string | null>(null)
  const [draftMerchant, setDraftMerchant] = useState('')
  const [draftAmount, setDraftAmount] = useState('')

  const rows = useDuckQuery(() => ledgerPage(ALL_ROWS, 0, lens), [lens])

  const filtered = useMemo(() => {
    if (!rows.data) return null
    const q = search.trim().toLowerCase()
    return rows.data.filter(
      (r) =>
        (kind === 'all' || r.kind === kind) &&
        (q === '' ||
          r.merchant.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)),
    )
  }, [rows.data, search, kind])

  const total = filtered?.reduce((a, r) => a + r.lensAmount.minor, 0) ?? 0

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Ledger</h1>
        <p className="mt-1.5 text-sm text-text-lo">
          Reads through <code className="font-mono">v_spend</code>, so transfers, pending rows
          and reversal pairs never appear — the table and the totals cannot disagree. Rows you
          added in this browser can be removed; the seeded demo is shared and read-only.
        </p>
      </header>

      <ExportPanel />

      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchant or category…"
            aria-label="Search the ledger"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
          />
          <div
            role="radiogroup"
            aria-label="Kind"
            className="flex gap-0.5 rounded-lg border border-line bg-surface-0 p-0.5"
          >
            {(['all', 'need', 'want', 'save'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs capitalize transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none',
                  kind === k ? 'bg-surface-2 text-text-hi' : 'text-text-lo hover:text-text-hi',
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {filtered && (
          <p className="tabular mt-3 font-mono text-xs text-text-lo">
            {filtered.length.toLocaleString('en-IN')} rows ·{' '}
            {filtered[0] ? format({ minor: total, currency: filtered[0].lensAmount.currency }) : '—'}
          </p>
        )}

        {/* Scrolls in both directions, so it needs to be keyboard-reachable in its own
            right — most of its rows contain nothing focusable to tab to. */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Transactions"
          className="mt-4 max-h-[62vh] overflow-auto rounded focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
        >
          {rows.error ? (
            <PanelError message={rows.error} />
          ) : !filtered ? (
            <RowsSkeleton rows={12} />
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-text-lo">
              Nothing matches. Clear the search or widen the filter.
            </p>
          ) : (
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="sticky top-0 bg-surface-1">
                <tr className="border-b border-line text-left">
                  {['Date', 'Merchant', 'Category', 'Native', 'Amount', ''].map((h, i) => (
                    <th key={h || i} className="pb-2 text-xs font-medium text-text-lo">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  /*
                   * Not virtualised, and that is a measurement rather than an omission.
                   *
                   * `content-visibility: auto` was the obvious answer — browser-native
                   * windowing, no library, no fixed row height (a row with a note is taller
                   * than one without, which every JS virtualiser wants not to be true). It is
                   * **inert on a table row**: size containment does not apply to internal
                   * table elements, so the property computes to `auto` while `contain` stays
                   * `none` and every row is laid out anyway. Checking the computed value
                   * would have shown "auto" and proved nothing; counting rows that actually
                   * laid out is what showed it — 951 of 951.
                   *
                   * At 951 rows the full ledger scrolls in ~8ms a frame, so nothing here
                   * needs windowing today. Making it work means leaving `<table>` for a
                   * grid of divs with ARIA table roles, which is a real change to the
                   * markup and the keyboard model — worth doing when the row count justifies
                   * it, not before. D-12 stays open, with a reason.
                   */
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="tabular py-2.5 pr-3 font-mono text-xs text-text-lo">
                      {new Date(r.occurredAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background: r.native.currency === 'AED' ? 'var(--aed)' : 'var(--inr)',
                          }}
                        />
                        <span className="min-w-0">
                          {editing === r.id ? (
                            <input
                              value={draftMerchant}
                              onChange={(e) => setDraftMerchant(e.target.value)}
                              aria-label={`Merchant for ${r.merchant}`}
                              autoFocus
                              className="w-full rounded border border-line bg-surface-0 px-1.5 py-0.5 text-sm text-text-hi focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
                            />
                          ) : (
                            <span className="block truncate">{r.merchant}</span>
                          )}
                          {r.note && editing !== r.id && (
                            <span className="block truncate text-xs text-text-lo">{r.note}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-text-lo">{r.category}</td>
                    <td className="tabular py-2.5 pr-3 font-mono text-xs text-text-lo">
                      {editing === r.id ? (
                        <input
                          value={draftAmount}
                          onChange={(e) => setDraftAmount(e.target.value)}
                          inputMode="decimal"
                          aria-label={`Amount for ${r.merchant}`}
                          className="w-24 rounded border border-line bg-surface-0 px-1.5 py-0.5 text-right font-mono text-xs text-text-hi focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
                        />
                      ) : (
                        format(r.native)
                      )}
                    </td>
                    <td className="tabular py-2.5 text-right font-mono">
                      {format(r.lensAmount)}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      {/* Only rows you added here can be removed. The seeded demo is shared
                          and read-only, so there is nothing to delete and no button to press. */}
                      {isLocal(r.id) ? (
                        <span className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            aria-label={
                              editing === r.id ? `Save ${r.merchant}` : `Edit ${r.merchant}`
                            }
                            onClick={() => {
                              if (editing === r.id) {
                                // Blank merchant or an unparseable amount leaves the row
                                // untouched rather than writing an empty label.
                                const minor = Math.round(Number(draftAmount) * 100)
                                if (draftMerchant.trim() && Number.isFinite(minor) && minor > 0) {
                                  updateLocal(r.id, {
                                    amountMinor: minor,
                                    merchant: draftMerchant.trim(),
                                  })
                                  reload()
                                }
                                setEditing(null)
                              } else {
                                setEditing(r.id)
                                setDraftMerchant(r.merchant)
                                setDraftAmount((r.native.minor / 100).toFixed(2))
                              }
                            }}
                            className="rounded p-1 text-text-lo transition-colors hover:text-inr focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
                          >
                            {editing === r.id ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Pencil className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${r.merchant}`}
                            onClick={() => {
                              removeLocal(r.id)
                              reload()
                            }}
                            className="rounded p-1 text-text-lo transition-colors hover:text-warn focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ) : (
                        <span className="sr-only">Seeded demo row</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  )
}
