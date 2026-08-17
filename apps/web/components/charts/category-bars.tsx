'use client'

import { motion, useReducedMotion } from 'motion/react'
import { format, type Money } from '@raseed/money'

export interface CategoryBar {
  categoryId: string
  name: string
  kind: string
  total: Money
  share: number
}

/**
 * Hand-built, no chart library. The bar is one element whose width is its share of the
 * largest category; the reveal animates `transform` only, never width.
 *
 * Colour resolves from CSS variables at render, so a theme change re-resolves it. A
 * hardcoded chart palette is the single most common way theme toggles break.
 */
export function CategoryBars({ data }: { data: readonly CategoryBar[] }) {
  const reduceMotion = useReducedMotion()
  const max = Math.max(...data.map((d) => d.share), 0.0001)
  const largest = data.find((d) => d.share === max)

  return (
    <ul className="flex flex-col gap-3">
      {/*
        The scale, which a labelled bar list still needs.

        Every bar already carries its own figure, so there is no axis to read a value off —
        but the bars are drawn *relative to the largest*, and without saying so a full-width
        bar reads as "all of it" rather than "the biggest of these". One line, at the top,
        rather than an axis that would repeat what each row already says.
      */}
      {largest && (
        <li className="flex items-baseline justify-between text-[11px] text-text-lo">
          <span>share of the period</span>
          <span className="tabular font-mono">
            full width = {format(largest.total)} ({(max * 100).toFixed(0)}%)
          </span>
        </li>
      )}
      {data.map((d, i) => (
        <li key={d.categoryId} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
          <span className="truncate text-sm">{d.name}</span>
          <span className="tabular font-mono text-sm text-text-lo">{format(d.total)}</span>

          <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full origin-left rounded-full"
              style={{
                width: `${(d.share / max) * 100}%`,
                // `need` reads warm, `want` cool — the distinction the budget model turns
                // on, encoded in the bar itself rather than in a legend.
                background: d.kind === 'need' ? 'var(--inr)' : 'var(--aed)',
              }}
              initial={reduceMotion ? false : { scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{
                duration: 0.6,
                delay: reduceMotion ? 0 : i * 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
