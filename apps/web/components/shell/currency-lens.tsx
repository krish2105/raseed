'use client'

import { useQueryState, parseAsStringLiteral } from 'nuqs'
import { cn } from '@/lib/utils'

export const LENSES = ['INR', 'AED', 'native'] as const
export type Lens = (typeof LENSES)[number]

const lensParser = parseAsStringLiteral(LENSES).withDefault('INR')

/**
 * The currency lens lives in the URL, so a view can be pasted into Slack and reproduce
 * exactly — including which currency it was being read in.
 *
 * It swaps which column the charts read (home_amount_minor vs amount_minor). It does not
 * recompute history: fx_rate is frozen at transaction date and is immutable.
 */
export function useCurrencyLens() {
  return useQueryState('lens', lensParser)
}

export function CurrencyLens() {
  const [lens, setLens] = useCurrencyLens()

  return (
    <div
      role="radiogroup"
      aria-label="Currency lens"
      className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-1 p-0.5"
    >
      {LENSES.map((value) => {
        const active = lens === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => void setLens(value)}
            className={cn(
              'inline-flex h-7 items-center rounded-md px-2 font-mono text-[11px] tracking-tight transition-colors',
              'focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none',
              active ? 'bg-surface-2 text-text-hi' : 'text-text-lo hover:bg-surface-2 hover:text-text-hi',
              active && value === 'INR' && 'text-inr',
              active && value === 'AED' && 'text-aed',
            )}
          >
            {value === 'native' ? 'Native' : value}
          </button>
        )
      })}
    </div>
  )
}
