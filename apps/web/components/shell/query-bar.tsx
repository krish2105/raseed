'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Search, X } from 'lucide-react'
import { format, money } from '@raseed/money'
import { useDuck } from '@/lib/duck/provider'
import { useCurrencyLens } from '@/components/shell/currency-lens'
import { query } from '@/lib/duck/ingest'
import { lensCurrency } from '@/lib/duck/queries'
import { EXAMPLES, isSafe, parseQuestion, type ParsedQuery } from '@/lib/duck/nl'
import { cn } from '@/lib/utils'

interface Row {
  label: string
  value: number
}

/**
 * ⌘K — ask the ledger a question, get a chart.
 *
 * The parser is deterministic rules, not a model: it cannot answer everything, but it never
 * invents a number, and it needs no API key. The generated SQL is always on screen, and the
 * sandbox rejects anything that is not a single SELECT.
 */
export function QueryBar() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedQuery | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const { status } = useDuck()
  const [lens] = useCurrencyLens()
  const reduceMotion = useReducedMotion()
  const currency = lensCurrency(lens)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const run = useCallback(
    async (question: string) => {
      setError(null)
      setRows(null)

      const plan = parseQuestion(question, lens)
      setParsed(plan)
      if (!plan) {
        setError(
          'I could not parse that. Try naming a period ("last 90 days"), a category ("food"), or a shape ("by merchant").',
        )
        return
      }

      const safe = isSafe(plan.sql)
      if (!safe.ok) {
        setError(safe.reason)
        return
      }

      setRunning(true)
      try {
        setRows(await query<Row>(plan.sql))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setRunning(false)
      }
    },
    [lens],
  )

  const max = rows ? Math.max(...rows.map((r) => Math.abs(r.value)), 1) : 1

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={status !== 'ready'}
        className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-0 px-3 py-1.5 text-left text-sm text-text-lo transition-colors hover:border-text-lo focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:flex"
      >
        <Search aria-hidden className="h-4 w-4 shrink-0" />
        <span className="truncate">Ask your ledger…</span>
        <kbd className="ml-auto shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[11px]">
          ⌘K
        </kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* backdrop-filter is used here and nowhere else: it costs 15-30% FPS on
                mid-tier Android, so it earns its place on one transient overlay only. */}
            <button
              aria-label="Close"
              className="absolute inset-0 bg-surface-0/70 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Ask your ledger"
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-surface-1 shadow-2xl"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(text)
                }}
                className="flex items-center gap-2 border-b border-line px-4 py-3"
              >
                <Search aria-hidden className="h-4 w-4 shrink-0 text-text-lo" />
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="how much on food last 90 days"
                  aria-label="Your question"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-lo"
                />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-md p-1 text-text-lo hover:text-text-hi focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {!parsed && !error && (
                  <>
                    <p className="text-xs text-text-lo">Try one of these</p>
                    <ul className="mt-2 flex flex-col gap-1">
                      {EXAMPLES.map((ex) => (
                        <li key={ex}>
                          <button
                            type="button"
                            onClick={() => {
                              setText(ex)
                              void run(ex)
                            }}
                            className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-text-lo transition-colors hover:bg-surface-2 hover:text-text-hi focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
                          >
                            {ex}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {error && (
                  <div className="rounded-lg border border-line bg-surface-0 p-3">
                    <p className="text-sm text-warn">{error}</p>
                  </div>
                )}

                {parsed && !error && (
                  <>
                    <p className="text-sm">{parsed.interpretation}</p>
                    <p className="mt-1 text-xs text-text-lo">
                      Understood: {parsed.matched.join(', ') || 'defaults only'}
                    </p>

                    {running && <p className="mt-4 text-sm text-text-lo">Running…</p>}

                    {rows && rows.length > 0 && (
                      <div className="mt-4">
                        {parsed.chart === 'value' ? (
                          <p className="tabular font-mono text-3xl font-semibold text-inr">
                            {rows[0]!.label === 'transactions'
                              ? rows[0]!.value.toLocaleString('en-IN')
                              : format(money(Math.round(rows[0]!.value), currency))}
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-2">
                            {rows.slice(0, 12).map((r) => (
                              <li key={r.label} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                                <span className="truncate text-sm">{r.label}</span>
                                <span className="tabular font-mono text-sm text-text-lo">
                                  {format(money(Math.round(r.value), currency), {
                                    compactZeroFraction: true,
                                  })}
                                </span>
                                <span className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-2">
                                  <span
                                    className="block h-full rounded-full bg-inr"
                                    style={{ width: `${(Math.abs(r.value) / max) * 100}%` }}
                                  />
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {rows && rows.length === 0 && (
                      <p className="mt-4 text-sm text-text-lo">No rows matched that question.</p>
                    )}

                    <details className="mt-5">
                      <summary className="cursor-pointer text-xs text-text-lo hover:text-text-hi">
                        The SQL that ran
                      </summary>
                      <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-surface-0 p-3 font-mono text-[11px] leading-relaxed">
                        {parsed.sql}
                      </pre>
                      <p className="mt-2 text-xs text-text-lo">
                        Rules-based, not a model — so it cannot answer everything, but it never
                        invents a number. Sandbox: single statement, SELECT only.
                      </p>
                    </details>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export function useOpenQueryBar() {
  return useCallback(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
  }, [])
}

export { cn }
