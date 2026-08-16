'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { format } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { BarsSkeleton, Skeleton } from '@/components/ui/skeleton'
import { PanelError } from '@/components/ui/panel-error'
import { CategoryBars } from '@/components/charts/category-bars'
import { useDuckQuery } from '@/lib/duck/provider'
import { useCurrencyLens } from '@/components/shell/currency-lens'
import { byCategory, variance } from '@/lib/duck/analytics'
import { cn } from '@/lib/utils'

const WINDOWS = [30, 90, 180] as const

/**
 * Categories, plus the variance decomposition that answers the actual question: did you
 * buy more coffee, or did coffee get dearer?
 */
export function CategoriesClient() {
  const [lens] = useCurrencyLens()
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30)
  const reduceMotion = useReducedMotion()

  const cats = useDuckQuery(() => byCategory(days, lens), [lens, days])
  const vary = useDuckQuery(() => variance(lens), [lens])

  const treemapTotal = cats.data?.reduce((a, c) => a + c.total.minor, 0) ?? 0

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            Categories
          </h1>
          <p className="mt-1.5 text-sm text-text-lo">
            Area is proportional to spend. The variance table splits each change into price
            versus quantity.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Window"
          className="flex gap-0.5 rounded-lg border border-line bg-surface-1 p-0.5"
        >
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={days === w}
              onClick={() => setDays(w)}
              className={cn(
                'rounded-md px-2.5 py-1 font-mono text-xs transition-colors',
                'focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none',
                days === w ? 'bg-surface-2 text-text-hi' : 'text-text-lo hover:text-text-hi',
              )}
            >
              {w}d
            </button>
          ))}
        </div>
      </header>

      <Panel title="Treemap" hint={`last ${days} days`}>
        {cats.error ? (
          <PanelError message={cats.error} />
        ) : !cats.data ? (
          <Skeleton className="h-[300px] w-full" />
        ) : cats.data.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-lo">No spend in this window.</p>
        ) : (
          <div className="grid h-[300px] grid-cols-6 grid-rows-4 gap-1.5">
            {cats.data.slice(0, 8).map((c, i) => {
              // Squarified-ish: the largest gets a bigger tile. Deterministic, no layout
              // solver needed for eight cells.
              const span =
                i === 0
                  ? 'col-span-3 row-span-2'
                  : i === 1
                    ? 'col-span-3 row-span-2'
                    : i < 4
                      ? 'col-span-2 row-span-1'
                      : 'col-span-2 row-span-1'
              const share = treemapTotal === 0 ? 0 : c.total.minor / treemapTotal
              return (
                <motion.div
                  key={c.categoryId}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    'flex min-w-0 flex-col justify-between overflow-hidden rounded-lg border border-line p-3',
                    span,
                  )}
                  style={{
                    background: c.kind === 'need' ? 'var(--inr)' : 'var(--aed)',
                    opacity: 0.14 + share * 0.5,
                  }}
                >
                  <span className="truncate text-sm font-medium text-text-hi">{c.name}</span>
                  <span className="tabular font-mono text-xs text-text-hi">
                    {format(c.total, { compactZeroFraction: true })} · {(share * 100).toFixed(0)}%
                  </span>
                </motion.div>
              )
            })}
          </div>
        )}
      </Panel>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel title="Ranked" hint={`last ${days} days`}>
          {cats.data ? <CategoryBars data={cats.data.slice(0, 10)} /> : <BarsSkeleton rows={8} />}
        </Panel>

        <Panel title="Rate × volume" hint="last 30d vs prior 30d">
          {vary.error ? (
            <PanelError message={vary.error} />
          ) : !vary.data ? (
            <BarsSkeleton rows={6} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    {['Category', 'Change', 'Price', 'Volume'].map((h) => (
                      <th key={h} className="pb-2 text-xs font-medium text-text-lo">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vary.data.slice(0, 8).map((v) => (
                    <tr key={v.categoryId} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-2">{v.name}</td>
                      <td
                        className={cn(
                          'tabular py-2.5 pr-2 font-mono',
                          v.total.minor > 0 ? 'text-warn' : 'text-good',
                        )}
                      >
                        {v.total.minor > 0 ? '+' : ''}
                        {format(v.total, { compactZeroFraction: true })}
                      </td>
                      <td className="tabular py-2.5 pr-2 font-mono text-text-lo">
                        {format(v.rateEffect, { compactZeroFraction: true })}
                      </td>
                      <td className="tabular py-2.5 font-mono text-text-lo">
                        {format(v.volumeEffect, { compactZeroFraction: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-xs leading-relaxed text-text-lo">
                Price is the change in average ticket size; volume is the change in number of
                transactions. The interaction term is kept separate rather than folded into
                either — hiding that choice inside a number is how dashboards mislead.
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
