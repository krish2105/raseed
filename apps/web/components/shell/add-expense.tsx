'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Plus, X } from 'lucide-react'
import { fromMajor, type Currency, type Money } from '@raseed/money'
import { CATEGORIES } from '@raseed/fixtures'
import { useDuck } from '@/lib/duck/provider'
import { addLocal } from '@/lib/store/local-ledger'
import { addCategory, customCategories } from '@/lib/store/preferences'
import { cn } from '@/lib/utils'

/** INR per AED used for rows you add now. Frozen onto the row; never recomputed. */
const AED_TO_INR = 24.86

const SEEDED = CATEGORIES.filter((c) => c.kind !== 'income')

/**
 * Add an expense from the dashboard.
 *
 * Writes to localStorage and re-ingests, so the figure updates immediately and survives a
 * refresh — with no backend at all. Your additions live only in your browser.
 */
export function AddExpense() {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [currency, setCurrency] = useState<Currency>('INR')
  const [categoryId, setCategoryId] = useState(SEEDED[0]!.id)
  const [newCategory, setNewCategory] = useState('')

  // Read during render, with no memo and no version counter.
  //
  // localStorage is unavailable during SSR, but this dialog only mounts after a click —
  // always post-hydration — so the read is safe. It re-runs on every keystroke, which for a
  // handful of category names is nothing, and it means adding one shows up immediately
  // without a cache-busting counter that `exhaustive-deps` correctly cannot make sense of.
  const custom = open ? customCategories() : []
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const { reload, status } = useDuck()
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Parsed on every keystroke so the button state is honest; the error only shows on submit.
  const parsed = useMemo((): Money | null => {
    try {
      const m = fromMajor(amount.trim(), currency)
      return m.minor > 0 ? m : null
    } catch {
      return null
    }
  }, [amount, currency])

  const canSave = parsed !== null && merchant.trim().length > 0

  function save() {
    if (!parsed) return setError('Enter an amount, like 240 or 240.50')
    if (!merchant.trim()) return setError('Who did you pay?')

    addLocal({
      amountMinor: parsed.minor,
      currency,
      merchant: merchant.trim(),
      categoryId,
      occurredAt: Date.now(),
      fxInrPerAed: AED_TO_INR,
    })

    setAmount('')
    setMerchant('')
    setError(null)
    setSaved(true)
    reload() // re-ingest so every figure on the page updates
    window.setTimeout(() => setSaved(false), 1800)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={status !== 'ready'}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-text-hi px-2.5 py-1.5 text-sm font-medium text-surface-0 transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none disabled:opacity-50"
      >
        <Plus aria-hidden className="h-4 w-4" />
        <span className="hidden sm:inline">Add</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <button
              aria-label="Close"
              className="absolute inset-0 bg-surface-0/70 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Add an expense"
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface-1 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="text-sm font-medium">Add an expense</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-md p-1 text-text-lo hover:text-text-hi focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  save()
                }}
                className="p-4"
              >
                <div className="flex gap-2">
                  {(['INR', 'AED'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={currency === c}
                      onClick={() => setCurrency(c)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 font-mono text-xs transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none',
                        currency === c
                          ? c === 'INR'
                            ? 'border-inr bg-surface-2 text-inr'
                            : 'border-aed bg-surface-2 text-aed'
                          : 'border-line text-text-lo hover:text-text-hi',
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <input
                  ref={inputRef}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    setError(null)
                  }}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label="Amount"
                  className={cn(
                    'tabular mt-3 w-full bg-transparent font-mono text-4xl font-semibold tracking-tight outline-none',
                    currency === 'INR' ? 'text-inr' : 'text-aed',
                  )}
                />

                <label className="mt-4 block text-xs text-text-lo" htmlFor="ax-merchant">
                  Paid to
                </label>
                <input
                  id="ax-merchant"
                  value={merchant}
                  onChange={(e) => {
                    setMerchant(e.target.value)
                    setError(null)
                  }}
                  placeholder="BigBasket, Careem, the chai guy…"
                  className="mt-1 w-full rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
                />

                <p className="mt-4 text-xs text-text-lo">Category</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[...SEEDED, ...custom].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={categoryId === c.id}
                      onClick={() => setCategoryId(c.id)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none',
                        categoryId === c.id
                          ? 'border-inr bg-surface-2 text-text-hi'
                          : 'border-line text-text-lo hover:text-text-hi',
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                <div className="mt-2 flex gap-1.5">
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || !newCategory.trim()) return
                      e.preventDefault()
                      const created = addCategory(newCategory, 'want')
                      setCategoryId(created.id) // re-renders, so the new chip appears

                      setNewCategory('')
                    }}
                    placeholder="New category, then Enter"
                    aria-label="New category name"
                    className="min-w-0 flex-1 rounded-full border border-dashed border-line bg-transparent px-2.5 py-1 text-xs focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
                  />
                </div>

                {error && <p className="mt-3 text-sm text-warn">{error}</p>}

                {currency === 'AED' && parsed && (
                  <p className="mt-3 text-xs leading-relaxed text-text-lo">
                    Stored at {AED_TO_INR} INR/AED, frozen to this row. Switching the lens later
                    reads a different column — it will not rewrite this.
                  </p>
                )}

                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-xs text-text-lo">
                    Saved in this browser only. Never leaves your device.
                  </p>
                  <button
                    type="submit"
                    disabled={!canSave}
                    className="rounded-lg bg-text-hi px-3 py-1.5 text-sm font-medium text-surface-0 transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none disabled:opacity-40"
                  >
                    {saved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
