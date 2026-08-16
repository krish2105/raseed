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

  return (
    <ul className="flex flex-col gap-3">
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
