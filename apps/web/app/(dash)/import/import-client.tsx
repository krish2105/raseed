'use client'

import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, Check, FileUp, Upload } from 'lucide-react'
import {
  findDuplicates,
  parseStatement,
  type DateOrder,
  type ParsedStatement,
} from '@raseed/engines'
import { format, money } from '@raseed/money'
import { CATEGORIES } from '@raseed/fixtures'
import { Panel } from '@/components/ui/panel'
import { useDuck } from '@/lib/duck/provider'
import { addLocal, localTransactions } from '@/lib/store/local-ledger'
import { cn } from '@/lib/utils'

const AED_TO_INR = 24.86
const FALLBACK_CATEGORY = CATEGORIES.find((c) => c.id === 'cat-cash')?.id ?? CATEGORIES[0]!.id

/**
 * Importing a bank statement.
 *
 * The parser proposes; this screen commits. Nothing is written until you press the button,
 * and every row you can see is a row you can exclude — because the alternative is an import
 * that silently adds 300 transactions and a ledger you no longer trust.
 *
 * The date question is the important part of the design. `03/04/2026` is often genuinely
 * undecidable from the file, and a silent wrong guess misfiles a third of the rows into the
 * wrong month while nothing about the result looks wrong. So when the parser cannot tell,
 * this asks — and shows what each answer would mean, rather than asking an abstract question
 * about date formats.
 */
export function ImportClient() {
  const { reload } = useDuck()
  const inputRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [raw, setRaw] = useState<string | null>(null)
  const [order, setOrder] = useState<DateOrder | undefined>(undefined)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [imported, setImported] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parsed: ParsedStatement | null = raw
    ? parseStatement(raw, { dateOrder: order })
    : null

  // Whether the FILE is ambiguous, independent of whether it has been answered. Keying the
  // control on `parsed.needsDateConfirmation` made it vanish the moment you chose, so a
  // wrong pick could only be undone by re-uploading — and the whole point of asking is that
  // the answer is not obvious.
  const fileIsAmbiguous = raw ? parseStatement(raw).needsDateConfirmation : false

  const duplicates = parsed
    ? findDuplicates(
        parsed.rows,
        localTransactions().map((t) => ({
          occurredAt: t.occurred_at,
          amountMinor: t.amount_minor,
          description: t.raw_text ?? '',
        })),
      )
    : new Set<number>()

  async function onFile(file: File) {
    setError(null)
    setImported(null)
    setExcluded(new Set())
    setOrder(undefined)

    if (file.size > 8_000_000) {
      setError('That file is over 8MB. Statements are text — this is probably a PDF.')
      return
    }
    setFileName(file.name)
    setRaw(await file.text())
  }

  function commit() {
    if (!parsed) return
    let added = 0

    parsed.rows.forEach((row, i) => {
      if (excluded.has(i) || duplicates.has(i)) return
      addLocal({
        // Only money going out becomes a spend row. An income line would need a different
        // txn_type, and quietly filing salary as an expense is a worse bug than skipping it.
        amountMinor: Math.abs(row.amountMinor),
        currency: row.currency,
        merchant: row.description || 'Imported',
        categoryId: FALLBACK_CATEGORY,
        occurredAt: row.occurredAt,
        fxInrPerAed: AED_TO_INR,
        direction: row.amountMinor > 0 ? 'in' : 'out',
        note: `Imported from ${fileName ?? 'a statement'}`,
      })
      added += 1
    })

    setImported(added)
    reload()
  }

  const willImport = parsed
    ? parsed.rows.filter((_, i) => !excluded.has(i) && !duplicates.has(i)).length
    : 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 pb-28 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Import a statement
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-lo">
          Drop a CSV from any bank. There is no standard, so the columns and the date format
          are worked out from the file itself and shown to you before anything is written.
          Nothing is imported until you press the button, and your file never leaves this
          browser.
        </p>
      </header>

      {/* ── the drop zone ─────────────────────────────────────────────────── */}
      <Panel>
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) void onFile(file)
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg',
            'border-2 border-dashed border-line px-6 py-10 text-center transition-colors',
            'hover:border-accent focus-within:border-accent',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onFile(file)
            }}
          />
          <FileUp aria-hidden className="h-6 w-6 text-text-lo" />
          <span className="text-sm font-medium">
            {fileName ?? 'Choose a CSV, or drop one here'}
          </span>
          <span className="text-xs text-text-lo">
            HDFC, ICICI, Emirates NBD, Wise, or anything else that exports CSV
          </span>
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-warn">
            {error}
          </p>
        )}
      </Panel>

      {parsed && (
        <>
          {/* ── what it worked out ──────────────────────────────────────── */}
          <Panel title="What I read" className="mt-3">
            <dl className="grid gap-3 sm:grid-cols-4">
              {[
                { k: 'Rows found', v: String(parsed.rows.length) },
                { k: 'Currency', v: parsed.currency },
                {
                  k: 'Delimiter',
                  v: parsed.delimiter === '\t' ? 'tab' : parsed.delimiter,
                },
                {
                  k: 'Date column',
                  v: parsed.columns.date?.header ?? 'first column (guessed)',
                },
              ].map((x) => (
                <div key={x.k}>
                  <dt className="text-[11px] text-text-lo">{x.k}</dt>
                  <dd className="tabular mt-0.5 font-mono text-sm">{x.v}</dd>
                </div>
              ))}
            </dl>

            {parsed.skipped.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-warn">
                  {parsed.skipped.length} line
                  {parsed.skipped.length === 1 ? '' : 's'} could not be read
                </summary>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-text-lo">
                  {parsed.skipped.slice(0, 12).map((s) => (
                    <li key={s.line} className="tabular font-mono">
                      line {s.line}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Panel>

          {/* ── the date question ───────────────────────────────────────── */}
          {fileIsAmbiguous && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Panel className="mt-3 border-warn/40">
                <div className="flex items-start gap-3">
                  <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium">
                      {order ? 'Dates are read as' : 'Which way round are the dates?'}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-text-lo">
                      Every date in this file falls in the first twelve days of its month, so
                      the file genuinely does not say. Picking wrong would put a third of
                      these rows in the wrong month, and nothing about the result would look
                      wrong — so I would rather ask. Change it below and the preview updates;
                      the choice stays available right up until you import.
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(
                        [
                          { o: 'dmy' as const, label: 'Day first', eg: '03/04 = 3 April' },
                          { o: 'mdy' as const, label: 'Month first', eg: '03/04 = 4 March' },
                        ]
                      ).map((choice) => (
                        <button
                          key={choice.o}
                          type="button"
                          onClick={() => setOrder(choice.o)}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-left transition-colors',
                            'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
                            order === choice.o
                              ? 'border-accent bg-accent/10'
                              : 'border-line hover:border-text-lo',
                          )}
                        >
                          <span className="block text-sm font-medium">{choice.label}</span>
                          <span className="tabular block font-mono text-[11px] text-text-lo">
                            {choice.eg}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>
            </motion.div>
          )}

          {/* ── the rows ────────────────────────────────────────────────── */}
          <Panel
            title="Preview"
            hint={`${willImport} of ${parsed.rows.length} will be imported`}
            className="mt-3"
          >
            <div
              tabIndex={0}
              role="region"
              aria-label="Rows to import"
              className="max-h-[46vh] overflow-auto rounded focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead className="sticky top-0 bg-surface-1">
                  <tr className="border-b border-line text-left">
                    {['', 'Date', 'Description', 'Amount'].map((h, i) => (
                      <th key={h || i} className="pb-2 text-xs font-medium text-text-lo">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 300).map((row, i) => {
                    const isDupe = duplicates.has(i)
                    const off = excluded.has(i) || isDupe
                    return (
                      <tr
                        key={`${row.raw}-${i}`}
                        className={cn('border-b border-line last:border-0', off && 'opacity-45')}
                      >
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={!off}
                            disabled={isDupe}
                            aria-label={`Import ${row.description || 'row'} ${format(money(Math.abs(row.amountMinor), row.currency))}`}
                            onChange={() =>
                              setExcluded((prev) => {
                                const next = new Set(prev)
                                if (next.has(i)) next.delete(i)
                                else next.add(i)
                                return next
                              })
                            }
                          />
                        </td>
                        <td className="tabular py-2 pr-3 font-mono text-xs text-text-lo">
                          {new Date(row.occurredAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit',
                          })}
                        </td>
                        <td className="max-w-0 py-2 pr-3">
                          <span className="block truncate">{row.description || '—'}</span>
                          {isDupe && (
                            <span className="text-[11px] text-warn">
                              already in your ledger
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            'tabular py-2 text-right font-mono',
                            row.amountMinor > 0 ? 'text-good' : '',
                          )}
                        >
                          {row.amountMinor > 0 ? '+' : ''}
                          {format(money(row.amountMinor, row.currency))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-text-lo">
                {duplicates.size > 0 && (
                  <>
                    {duplicates.size} row{duplicates.size === 1 ? '' : 's'} already in your
                    ledger {duplicates.size === 1 ? 'was' : 'were'} excluded. Deduplication
                    ships with import, not after it — the same transaction arriving twice
                    makes every figure afterwards wrong.
                  </>
                )}
              </p>

              <button
                type="button"
                onClick={commit}
                disabled={willImport === 0 || parsed.needsDateConfirmation}
                className={cn(
                  'rounded-lg bg-text-hi px-4 py-2 text-sm font-medium text-surface-0',
                  'transition-opacity hover:opacity-90 disabled:opacity-40',
                  'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
                )}
              >
                <Upload aria-hidden className="mr-1.5 -mt-0.5 inline h-4 w-4" />
                Import {willImport} row{willImport === 1 ? '' : 's'}
              </button>
            </div>

            {imported !== null && (
              <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-good">
                <Check aria-hidden className="h-4 w-4" />
                {imported} row{imported === 1 ? '' : 's'} imported. Every figure on every tab
                has already re-derived.
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
