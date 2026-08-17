'use client'

import { useId, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A bento tile: a summary you can read at a glance, and the detail one tap below.
 *
 * Progressive disclosure is what makes a dense grid survivable. Twenty panels of full
 * detail is a wall nobody parses; twenty panels of *headline* with the working underneath
 * is a control room. This is the Datadog/Linear pattern and it is the only reason a screen
 * this dense can also be calm.
 *
 * The expansion is a real `<button>` with `aria-expanded` and a labelled region, not a div
 * with a click handler — a tile that a keyboard cannot open is a tile whose data does not
 * exist for some of your users.
 */

export type TileSpan = 3 | 4 | 6 | 8 | 12
export type TileRows = 1 | 2 | 3

const SPAN: Record<TileSpan, string> = {
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  6: 'md:col-span-6',
  8: 'md:col-span-8',
  12: 'md:col-span-12',
}

const ROWS: Record<TileRows, string> = {
  1: 'md:row-span-1',
  2: 'md:row-span-2',
  3: 'md:row-span-3',
}

export function Tile({
  title,
  hint,
  span = 4,
  rows = 1,
  index = 0,
  detail,
  className,
  children,
}: {
  title?: string
  hint?: string
  span?: TileSpan
  rows?: TileRows
  /** Stagger position. Drives the entrance delay via a CSS variable, not a JS timer. */
  index?: number
  /** Rendered only once expanded, so a collapsed grid never pays for detail nobody opened. */
  detail?: ReactNode
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const regionId = useId()

  return (
    <section
      style={{ '--i': index } as React.CSSProperties}
      className={cn(
        'rise magnetic elev-1 group relative flex flex-col overflow-hidden rounded-xl',
        'border border-line bg-surface-1 p-3.5',
        'hover:elev-2 col-span-12',
        SPAN[span],
        ROWS[rows],
        className,
      )}
    >
      {(title || hint) && (
        <header className="mb-2 flex items-baseline justify-between gap-2">
          {title && (
            <h3 className="truncate text-[11px] font-medium tracking-[0.08em] text-text-lo uppercase">
              {title}
            </h3>
          )}
          {hint && <span className="truncate text-[11px] text-text-lo">{hint}</span>}
        </header>
      )}

      <div className="min-h-0 flex-1">{children}</div>

      {detail && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={regionId}
            className={cn(
              'mt-2 -mb-1 flex items-center gap-1 self-start rounded px-1 py-0.5',
              'text-[11px] text-text-lo transition-colors hover:text-text-hi',
              'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
            )}
          >
            <ChevronDown
              aria-hidden
              className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
            />
            {open ? 'Less' : 'Working'}
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                id={regionId}
                // Height IS animated here, deliberately and against the usual rule: this is
                // a discrete click, not a scroll-linked effect, so it cannot drop frames
                // during a scroll, and there is no honest way to reveal unknown-height
                // content with transform alone.
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-3 border-t border-line pt-3 text-xs text-text-lo">
                  {detail}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </section>
  )
}

/**
 * A tile whose entire job is one number.
 *
 * Tabular numerals and a fixed label height, so a row of these has its figures on the same
 * optical baseline even when one label wraps and another does not.
 */
export function Stat({
  label,
  value,
  delta,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  /** Signed change. Rendered with its own sign, never coloured red-for-negative alone. */
  delta?: { value: string; direction: 'up' | 'down' | 'flat' }
  hint?: string
  tone?: 'neutral' | 'inr' | 'aed' | 'good' | 'warn'
}) {
  const toneClass = {
    neutral: 'text-text-hi',
    inr: 'text-inr',
    aed: 'text-aed',
    good: 'text-good',
    warn: 'text-warn',
  }[tone]

  return (
    <div className="flex h-full flex-col justify-between">
      <p className="text-[11px] leading-tight text-text-lo">{label}</p>
      <p className={cn('tabular mt-1 font-mono text-xl leading-none font-semibold', toneClass)}>
        {value}
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-lo">
        {delta && (
          <span
            className={cn(
              'tabular font-mono',
              // Direction is carried by the arrow glyph as well as the colour, so the
              // meaning survives for anyone who cannot distinguish the two hues.
              delta.direction === 'up' && 'text-warn',
              delta.direction === 'down' && 'text-good',
            )}
          >
            {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '■'}{' '}
            {delta.value}
          </span>
        )}
        {hint && <span className="truncate">{hint}</span>}
      </p>
    </div>
  )
}
